import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/auth-config";
import { transitionAsSeller, type OpportunityStatus } from "@/lib/commerce";
import { requestSession } from "@/lib/request-session";

export const dynamic = "force-dynamic";

const buildingFields = z.object({
  streetType: z.enum(["Avenida", "Jirón", "Calle", "Pasaje", "Otro"]),
  streetName: z.string().trim().min(1).max(120),
  streetNumber: z.string().trim().min(1).max(20),
  district: z.string().trim().min(1).max(80),
  province: z.string().trim().min(1).max(80),
  department: z.string().trim().min(1).max(80),
  buildingName: z.string().trim().min(1).max(120),
  apartments: z.number().int().min(1).max(10000),
  administrationType: z.enum(["PROPIA", "TERCERA"]),
  administrationCompany: z.string().trim().max(120).optional(),
  contactName: z.string().trim().min(1).max(120),
  contactRole: z.string().trim().min(1).max(80),
  contactPhone: z.string().trim().min(5).max(30),
  contactEmail: z.string().email().max(254),
});

const opportunityFields = z.object({
  buildingId: z.string().uuid(),
  plan: z.enum(["BASICO", "PRO", "PERSONALIZADO"]),
  unitPrice: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/),
  observations: z.string().trim().max(2000).optional(),
});

const transitionFields = z.object({
  opportunityId: z.string().uuid(),
  next: z.enum(["DEMO", "NEGOCIACIÓN", "PERDIDO"]),
});

async function sellerContext(request: NextRequest) {
  const session = requestSession(request);
  const { data: auth, error: authError } = await session.client.auth.getUser();
  if (authError || !auth.user) return { ...session, profile: null };
  const { data: profile, error: profileError } = await session.client
    .from("seller_profiles")
    .select("id,first_name,paternal_surname,maternal_surname,document_type,document_number,email,phone,status")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  return { ...session, profile: profile?.status === "ACTIVE" ? profile : null };
}

export async function GET(request: NextRequest) {
  try {
    const context = await sellerContext(request);
    if (!context.profile) return context.respond({ error: "Acceso no autorizado." }, 401);
    const { data: buildings, error } = await context.client
      .from("buildings")
      .select("id,street_type,street_name,street_number,district,province,department,building_name,apartments,administration_type,administration_company,contact_name,contact_role,contact_phone,contact_email,opportunities(id,plan,unit_price_cents,observations,status,commission_cents,payment_status)")
      .eq("seller_id", context.profile.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return context.respond({ profile: context.profile, buildings: buildings ?? [] });
  } catch (error) {
    console.error("Portal load failed", error);
    return NextResponse.json({ error: "No se pudo cargar el portal." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }
  try {
    const context = await sellerContext(request);
    if (!context.profile) return context.respond({ error: "Acceso no autorizado." }, 401);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return context.respond({ error: "Solicitud inválida." }, 400);
    const db = serviceClient();

    if (body.action === "createBuilding") {
      const parsed = buildingFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Revisa los datos del edificio." }, 400);
      const data = parsed.data;
      if (data.administrationType === "TERCERA" && !data.administrationCompany) {
        return context.respond({ error: "Indica la empresa administradora." }, 400);
      }
      const { error } = await db.from("buildings").insert({
        seller_id: context.profile.id,
        street_type: data.streetType,
        street_name: data.streetName,
        street_number: data.streetNumber,
        district: data.district,
        province: data.province,
        department: data.department,
        building_name: data.buildingName,
        apartments: data.apartments,
        administration_type: data.administrationType,
        administration_company: data.administrationCompany || null,
        contact_name: data.contactName,
        contact_role: data.contactRole,
        contact_phone: data.contactPhone,
        contact_email: data.contactEmail,
      });
      if (error) throw error;
      return context.respond({ ok: true }, 201);
    }

    if (body.action === "createOpportunity") {
      const parsed = opportunityFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Revisa los datos de la oportunidad." }, 400);
      const data = parsed.data;
      const { data: building, error: buildingError } = await db.from("buildings")
        .select("id")
        .eq("id", data.buildingId)
        .eq("seller_id", context.profile.id)
        .maybeSingle();
      if (buildingError) throw buildingError;
      if (!building) return context.respond({ error: "Edificio no encontrado." }, 404);
      const [whole, fraction = ""] = data.unitPrice.split(".");
      const unitPriceCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      const { error } = await db.from("opportunities").insert({
        building_id: building.id,
        plan: data.plan,
        unit_price_cents: unitPriceCents,
        observations: data.observations || "",
        status: "CONTACTO",
      });
      if (error) throw error;
      return context.respond({ ok: true }, 201);
    }

    if (body.action === "advanceOpportunity") {
      const parsed = transitionFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Estado inválido." }, 400);
      const { data: opportunity, error: lookupError } = await db.from("opportunities")
        .select("id,status,building_id,buildings!inner(seller_id)")
        .eq("id", parsed.data.opportunityId)
        .eq("buildings.seller_id", context.profile.id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!opportunity) return context.respond({ error: "Oportunidad no encontrada." }, 404);
      let next: OpportunityStatus;
      try { next = transitionAsSeller(opportunity.status as OpportunityStatus, parsed.data.next); }
      catch { return context.respond({ error: "Transición no permitida para el vendedor." }, 403); }
      const { data: changed, error } = await db.from("opportunities")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", opportunity.id)
        .eq("status", opportunity.status)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!changed) return context.respond({ error: "El estado cambió. Actualiza la página." }, 409);
      return context.respond({ ok: true });
    }
    return context.respond({ error: "Acción no reconocida." }, 400);
  } catch (error) {
    console.error("Portal update failed", error);
    return NextResponse.json({ error: "No se pudieron guardar los cambios." }, { status: 503 });
  }
}
