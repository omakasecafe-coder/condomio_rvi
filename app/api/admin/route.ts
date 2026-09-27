import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { commissionCents } from "@/lib/commerce";
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
        .select("id,kind,name,version,status,pass_percentage,allowed_attempts,questions_per_attempt,randomize_questions,published_at,created_at,updated_at,assessment_questions(id,position,prompt,options,correct_option,is_knockout)")
        .order("version", { ascending: false }),
      context.client.from("buildings")
        .select("id,seller_id,building_name,apartments,district,seller_profiles!inner(id,first_name,paternal_surname),opportunities(id,plan,unit_price_cents,status,seller_state,final_price_cents,confirmed_apartments,potential_commission_cents,commission_cents,payment_status,contract_generated_at,opportunity_demos(id,result,contact_attended,seller_attended,information_sent_at),contracts(id,status,signed_document_path),onboardings(id,status),first_installments(id,status,amount_cents),commissions(id,status,amount_cents))")
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
  action: z.enum(["recordDemo", "markInformationSent", "generateContract", "sendContract", "validateContract", "completeOnboarding", "confirmFirstPayment", "markPaid"]),
  opportunityId: z.string().uuid(),
  demoResult: z.enum(["QUALIFIED", "NOT_QUALIFIED", "RESCHEDULE"]).optional(),
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
  questionsPerAttempt: z.number().int().min(1).max(50),
  randomizeQuestions: z.boolean(),
  questions: z.array(questionInput).min(1).max(50),
}).refine(value => value.questionsPerAttempt <= value.questions.length, {
  message: "Las preguntas por examen no pueden superar el tamaño del banco",
});

const publishSetAction = z.object({
  action: z.literal("publishAssessmentSet"),
  setId: z.string().uuid(),
});

const sellerStatusAction = z.object({
  action: z.literal("setSellerStatus"),
  sellerId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
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
        p_questions_per_attempt: data.questionsPerAttempt,
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

    const sellerStatus = sellerStatusAction.safeParse(body);
    if (sellerStatus.success) {
      const { error } = await context.client.rpc("admin_set_seller_status", {
        p_seller_id: sellerStatus.data.sellerId,
        p_status: sellerStatus.data.status,
      });
      if (error) throw error;
      return context.respond({ ok: true });
    }

    const parsed = commercialAction.safeParse(body);
    if (!parsed.success) return context.respond({ error: "Solicitud inválida." }, 400);
    const { data: opportunity, error: lookupError } = await context.client.from("opportunities")
      .select("id,status,seller_state,final_price_cents,confirmed_apartments,commercial_version_id,buildings!inner(apartments,seller_id)")
      .eq("id", parsed.data.opportunityId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!opportunity) return context.respond({ error: "Oportunidad no encontrada." }, 404);

    const now = new Date().toISOString();
    const setState = async (expected: string, sellerState: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await context.client.from("opportunities").update({ seller_state: sellerState, updated_at: now, ...extra }).eq("id", opportunity.id).eq("seller_state", expected).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return context.respond({ error: "El estado cambió. Actualiza la página." }, 409);
      return context.respond({ ok: true });
    };

    if (parsed.data.action === "recordDemo") {
      if (opportunity.seller_state !== "DEMO_AGENDADA" || !parsed.data.demoResult) return context.respond({ error: "La demo no está lista para registrar." }, 409);
      const qualified = parsed.data.demoResult === "QUALIFIED";
      const { error } = await context.client.from("opportunity_demos").update({ result: parsed.data.demoResult, booking_status: "COMPLETED", contact_attended: true, seller_attended: true, completed_at: now, updated_at: now }).eq("opportunity_id", opportunity.id);
      if (error) throw error;
      return setState("DEMO_AGENDADA", qualified ? "DEMO_REALIZADA" : parsed.data.demoResult === "RESCHEDULE" ? "CONTACTO_REGISTRADO" : "NO_CONCRETADA", qualified ? {} : { active: parsed.data.demoResult === "RESCHEDULE", status: parsed.data.demoResult === "RESCHEDULE" ? "DEMO" : "PERDIDO", lost_reason: parsed.data.demoResult === "RESCHEDULE" ? null : "SIN_INTERES" });
    }

    if (parsed.data.action === "markInformationSent") {
      const { error } = await context.client.from("opportunity_demos").update({ information_sent_at: now, updated_at: now }).eq("opportunity_id", opportunity.id);
      if (error) throw error;
      return setState("DEMO_REALIZADA", "INFORMACION_ENVIADA");
    }

    if (parsed.data.action === "generateContract") {
      const { error } = await context.client.from("contracts").update({ status: "GENERATED", approved_at: now, generated_at: now, updated_at: now }).eq("opportunity_id", opportunity.id).eq("status", "REQUESTED");
      if (error) throw error;
      return context.respond({ ok: true });
    }

    if (parsed.data.action === "sendContract") {
      const { error } = await context.client.from("contracts").update({ status: "SENT", sent_at: now, updated_at: now }).eq("opportunity_id", opportunity.id).eq("status", "GENERATED");
      if (error) throw error;
      return setState("CONTRATO_SOLICITADO", "CONTRATO_ENVIADO", { contract_generated_at: now, contract_sent: true });
    }

    if (parsed.data.action === "validateContract") {
      const { error } = await context.client.from("contracts").update({ status: "VALIDATED", validated_at: now, updated_at: now }).eq("opportunity_id", opportunity.id).eq("status", "IN_VALIDATION");
      if (error) throw error;
      await context.client.from("onboardings").insert({ opportunity_id: opportunity.id, status: "IN_PROGRESS", started_at: now });
      return setState("CONTRATO_EN_VALIDACION", "ONBOARDING", { contract_validated_at: now });
    }

    if (parsed.data.action === "completeOnboarding") {
      const { error } = await context.client.from("onboardings").update({ status: "COMPLETED", completed_at: now }).eq("opportunity_id", opportunity.id);
      if (error) throw error;
      const amount = Number(opportunity.final_price_cents) * Number(opportunity.confirmed_apartments);
      await context.client.from("first_installments").insert({ opportunity_id: opportunity.id, amount_cents: amount, status: "PENDING" });
      return setState("ONBOARDING", "PRIMERA_CUOTA_PENDIENTE");
    }

    if (parsed.data.action === "confirmFirstPayment") {
      if (opportunity.seller_state !== "PRIMERA_CUOTA_PENDIENTE") return context.respond({ error: "La primera cuota no está pendiente." }, 409);
      const building = opportunity.buildings as unknown as { apartments: number; seller_id: string };
      const amount = commissionCents(Number(opportunity.final_price_cents), Number(opportunity.confirmed_apartments || building.apartments));
      await context.client.from("first_installments").update({ status: "CONFIRMED", confirmed_at: now, confirmed_by: context.user.id }).eq("opportunity_id", opportunity.id);
      const { error } = await context.client.from("commissions").insert({ opportunity_id: opportunity.id, seller_id: building.seller_id, base_amount_cents: Number(opportunity.final_price_cents) * Number(opportunity.confirmed_apartments || building.apartments), commission_percentage: 100, amount_cents: amount, status: "PENDING", generated_at: now });
      if (error) throw error;
      return setState("PRIMERA_CUOTA_PENDIENTE", "CONCRETADA", { active: false, status: "GANADO", commission_cents: amount, payment_status: "PENDIENTE_DE_PAGO" });
    }

    const { data: commission, error: commissionError } = await context.client.from("commissions").update({ status: "PAID", paid_at: now }).eq("opportunity_id", opportunity.id).eq("status", "PENDING").select("id").maybeSingle();
    if (commissionError) throw commissionError;
    if (!commission) return context.respond({ error: "La comisión no está pendiente." }, 409);
    await context.client.from("opportunities").update({ payment_status: "PAGADO", paid_at: now, updated_at: now }).eq("id", opportunity.id);
    return context.respond({ ok: true });
  } catch (error) {
    console.error("Admin update failed", error);
    return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 503 });
  }
}
