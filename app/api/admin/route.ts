import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/auth-config";
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
    const { data, error } = await serviceClient().from("buildings")
      .select("id,building_name,apartments,district,seller_profiles!inner(first_name,paternal_surname),opportunities(id,plan,unit_price_cents,status,commission_cents,payment_status,contract_validated_at,paid_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return context.respond({ buildings: data ?? [] });
  } catch (error) {
    console.error("Admin load failed", error);
    return NextResponse.json({ error: "No se pudo cargar administración." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }
  try {
    const context = await adminContext(request);
    if (!context.user) return context.respond({ error: "Acceso no autorizado." }, 401);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = z.object({
      action: z.enum(["markWon", "markPaid"]),
      opportunityId: z.string().uuid(),
      contractSigned: z.boolean().optional(),
    }).safeParse(body);
    if (!parsed.success) return context.respond({ error: "Solicitud inválida." }, 400);
    const db = serviceClient();
    const { data: opportunity, error: lookupError } = await db.from("opportunities")
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
      const { data: changed, error } = await db.from("opportunities")
        .update({
          status: "GANADO",
          contract_validated_at: new Date().toISOString(),
          commission_cents: amount,
          payment_status: "PENDIENTE_DE_PAGO",
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id)
        .eq("status", "NEGOCIACIÓN")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!changed) return context.respond({ error: "El estado cambió. Actualiza la página." }, 409);
      return context.respond({ ok: true });
    }

    try { validatePaid(opportunity.status as OpportunityStatus, opportunity.payment_status as PaymentStatus); }
    catch { return context.respond({ error: "La comisión no está pendiente de pago." }, 409); }
    const { data: changed, error } = await db.from("opportunities")
      .update({ payment_status: "PAGADO", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", opportunity.id)
      .eq("status", "GANADO")
      .eq("payment_status", "PENDIENTE_DE_PAGO")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!changed) return context.respond({ error: "El estado cambió. Actualiza la página." }, 409);
    return context.respond({ ok: true });
  } catch (error) {
    console.error("Admin update failed", error);
    return NextResponse.json({ error: "No se pudo guardar el cambio." }, { status: 503 });
  }
}
