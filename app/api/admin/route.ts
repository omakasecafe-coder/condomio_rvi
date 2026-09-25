import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { commissionCents, validatePaid, validateWin, type OpportunityStatus, type PaymentStatus } from "@/lib/commerce";
import { requestSession } from "@/lib/request-session";

export const dynamic = "force-dynamic";

async function adminContext(request: NextRequest) {
  const session = requestSession(request);
  const { data, error } = await session.client.auth.getUser();
  const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const allowed = !error && !!data.user && !!allowedEmail &&
    data.user.email?.toLowerCase() === allowedEmail && !!data.user.email_confirmed_at;
  return { ...session, user: allowed ? data.user : null };
}

export async function GET(request: NextRequest) {
  try {
    const context = await adminContext(request);
    if (!context.user) return context.respond({ error: "Acceso no autorizado." }, 401);

    const [profilesResult, setsResult, buildingsResult] = await Promise.all([
      context.client.from("seller_profiles")
        .select("id,document_type,document_number,email,first_name,paternal_surname,maternal_surname,birth_date,phone,status,application_stage,attitude_score,aptitude_score,identity_document_path,terms_accepted_at,created_at,updated_at,assessment_attempts(id,kind,attempt_number,score,max_score,percentage,passed,knockout_failed,completed_at,assessment_sets(name,version))")
        .order("created_at", { ascending: false }),
      context.client.from("assessment_sets")
        .select("id,kind,name,version,status,pass_percentage,allowed_attempts,randomize_questions,published_at,created_at,updated_at,assessment_questions(id,position,prompt,options,correct_option,is_knockout)")
        .order("version", { ascending: false }),
      context.client.from("buildings")
        .select("id,building_name,apartments,district,seller_profiles!inner(first_name,paternal_surname),opportunities(id,plan,unit_price_cents,status,commission_cents,payment_status)")
        .order("created_at", { ascending: false }),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (setsResult.error) throw setsResult.error;
    if (buildingsResult.error) throw buildingsResult.error;
    return context.respond({
      applicants: profilesResult.data ?? [],
      assessmentSets: setsResult.data ?? [],
      buildings: buildingsResult.data ?? [],
    });
  } catch (error) {
    console.error("Admin load failed", error);
    return NextResponse.json({ error: "No se pudo cargar la administración." }, { status: 503 });
  }
}

const commercialAction = z.object({
  action: z.enum(["markWon", "markPaid"]),
  opportunityId: z.string().uuid(),
  contractSigned: z.boolean().optional(),
});

const createVersionAction = z.object({
  action: z.literal("createAssessmentVersion"),
  kind: z.enum(["ATTITUDINAL", "APTITUDINAL"]),
});

const questionInput = z.object({
  position: z.number().int().min(1).max(50),
  prompt: z.string().trim().min(5).max(1000),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
  correctOption: z.number().int().min(0).max(5),
  isKnockout: z.boolean(),
}).refine(value => value.correctOption < value.options.length, { message: "Respuesta correcta inválida" });

const saveSetAction = z.object({
  action: z.literal("saveAssessmentSet"),
  setId: z.string().uuid(),
  name: z.string().trim().min(3).max(120),
  passPercentage: z.number().int().min(1).max(100),
  allowedAttempts: z.number().int().min(1).max(5),
  randomizeQuestions: z.boolean(),
  questions: z.array(questionInput).min(1).max(50),
});

const publishSetAction = z.object({
  action: z.literal("publishAssessmentSet"),
  setId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }
  try {
    const context = await adminContext(request);
    if (!context.user) return context.respond({ error: "Acceso no autorizado." }, 401);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return context.respond({ error: "Solicitud inválida." }, 400);

    const createVersion = createVersionAction.safeParse(body);
    if (createVersion.success) {
      const { data, error } = await context.client.rpc("admin_create_assessment_version", { p_kind: createVersion.data.kind });
      if (error) throw error;
      return context.respond({ ok: true, setId: data });
    }

    const saveSet = saveSetAction.safeParse(body);
    if (saveSet.success) {
      const data = saveSet.data;
      const { error } = await context.client.rpc("admin_save_assessment_set", {
        p_set_id: data.setId,
        p_name: data.name,
        p_pass_percentage: data.passPercentage,
        p_allowed_attempts: data.allowedAttempts,
        p_randomize_questions: data.randomizeQuestions,
        p_questions: data.questions.map(question => ({
          position: question.position,
          prompt: question.prompt,
          options: question.options,
          correct_option: question.correctOption,
          is_knockout: question.isKnockout,
        })),
      });
      if (error) throw error;
      return context.respond({ ok: true });
    }

    const publishSet = publishSetAction.safeParse(body);
    if (publishSet.success) {
      const { error } = await context.client.rpc("admin_publish_assessment_set", { p_set_id: publishSet.data.setId });
      if (error) throw error;
      return context.respond({ ok: true });
    }

    const parsed = commercialAction.safeParse(body);
    if (!parsed.success) return context.respond({ error: "Solicitud inválida." }, 400);
    const { data: opportunity, error: lookupError } = await context.client.from("opportunities")
      .select("id,status,unit_price_cents,commission_cents,payment_status,buildings!inner(apartments)")
      .eq("id", parsed.data.opportunityId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!opportunity) return context.respond({ error: "Oportunidad no encontrada." }, 404);

    if (parsed.data.action === "markWon") {
      if (!parsed.data.contractSigned) return context.respond({ error: "Confirma que el contrato está firmado." }, 400);
      try { validateWin(opportunity.status as OpportunityStatus, true); }
      catch { return context.respond({ error: "La oportunidad no está en negociación." }, 409); }
      const building = opportunity.buildings as unknown as { apartments: number };
      const amount = commissionCents(Number(opportunity.unit_price_cents), Number(building.apartments));
      const { data: changed, error } = await context.client.from("opportunities")
        .update({
          status: "GANADO", contract_validated_at: new Date().toISOString(),
          commission_cents: amount, payment_status: "PENDIENTE_DE_PAGO", updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id).eq("status", "NEGOCIACIÓN").select("id").maybeSingle();
      if (error) throw error;
      if (!changed) return context.respond({ error: "El estado cambió. Actualiza la página." }, 409);
      return context.respond({ ok: true });
    }

    try { validatePaid(opportunity.status as OpportunityStatus, opportunity.payment_status as PaymentStatus); }
    catch { return context.respond({ error: "La comisión no está pendiente de pago." }, 409); }
    const { data: changed, error } = await context.client.from("opportunities")
      .update({ payment_status: "PAGADO", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", opportunity.id).eq("status", "GANADO").eq("payment_status", "PENDIENTE_DE_PAGO")
      .select("id").maybeSingle();
    if (error) throw error;
    if (!changed) return context.respond({ error: "El estado cambió. Actualiza la página." }, 409);
    return context.respond({ ok: true });
  } catch (error) {
    console.error("Admin update failed", error);
    return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 503 });
  }
}

