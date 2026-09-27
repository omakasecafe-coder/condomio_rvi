import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serviceClient } from "@/lib/auth-config";
import { commissionCents, normalizeAddress, opportunityUnitPriceCents } from "@/lib/commerce";
import { requestSession } from "@/lib/request-session";

export const dynamic = "force-dynamic";

const contactFields = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(30),
  email: z.union([z.string().email().max(254), z.literal("")]).optional(),
  contactType: z.enum(["ADMINISTRADOR", "PRESIDENTE_JUNTA", "PROPIETARIO", "OTRO"]).default("OTRO"),
  isPrimary: z.boolean().default(false),
  isAuthorizedSigner: z.boolean().default(false),
});

const buildingFields = z.object({
  streetType: z.enum(["Avenida", "Jirón", "Calle", "Pasaje", "Otro"]),
  streetName: z.string().trim().min(1).max(120), streetNumber: z.string().trim().min(1).max(20),
  district: z.string().trim().min(1).max(80), province: z.string().trim().min(1).max(80), department: z.string().trim().min(1).max(80),
  buildingName: z.string().trim().min(1).max(120), apartments: z.number().int().min(1).max(10000),
  administrationType: z.enum(["PROPIA", "TERCERA"]), administrationCompany: z.string().trim().max(120).optional(),
  contact: contactFields.optional(),
});

const addContactFields = contactFields.extend({ buildingId: z.string().uuid() });
const choosePlanFields = z.object({ opportunityId: z.string().uuid(), plan: z.enum(["BASICO", "PRO"]), autonomyDiscount: z.boolean(), confirmedApartments: z.number().int().min(1).max(10000) });
const opportunityIdFields = z.object({ opportunityId: z.string().uuid() });
const contractUploadFields = opportunityIdFields.extend({ fileName: z.string().trim().min(1).max(180), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]), base64: z.string().min(1).max(12_000_000) });
const lostFields = opportunityIdFields.extend({ reason: z.enum(["SIN_RESPUESTA", "SIN_INTERES", "PRECIO", "OTRA_SOLUCION", "NO_PRIORIDAD", "NO_HAY_AUTORIDAD", "SIN_PRESUPUESTO", "DATOS_INCORRECTOS", "OTRO"]) });
const discardBuildingFields = z.object({ buildingId: z.string().uuid(), reason: z.string().trim().min(3).max(300).default("Descartado por el vendedor") });

async function sellerContext(request: NextRequest) {
  const session = requestSession(request);
  const { data: auth, error: authError } = await session.client.auth.getUser();
  if (authError || !auth.user) return { ...session, profile: null };
  const { data: profile, error } = await session.client.from("seller_profiles")
    .select("id,first_name,paternal_surname,maternal_surname,document_type,document_number,email,phone,status")
    .eq("auth_user_id", auth.user.id).maybeSingle();
  if (error) throw error;
  return { ...session, profile: profile?.status === "ACTIVE" ? profile : null };
}

export async function GET(request: NextRequest) {
  try {
    const context = await sellerContext(request);
    if (!context.profile) return context.respond({ error: "Acceso no autorizado." }, 401);
    const { data: buildings, error } = await context.client.from("buildings")
      .select("id,street_type,street_name,street_number,district,province,department,building_name,apartments,administration_type,administration_company,lead_status,created_at,building_contacts(id,name,role,phone,email,contact_type,is_primary,is_authorized_signer),opportunities(id,plan,unit_price_cents,seller_state,list_price_cents,autonomy_discount_applied,discount_cents,final_price_cents,confirmed_apartments,recurring_total_cents,potential_commission_cents,observations,lost_reason,created_at,opportunity_demos(id,starts_at,ends_at,booking_status,result,information_sent_at,contact_attended,seller_attended),contracts(id,status,signed_document_path),commissions(id,amount_cents,status,generated_at,paid_at))")
      .eq("seller_id", context.profile.id).order("created_at", { ascending: false });
    if (error) throw error;
    return context.respond({ profile: context.profile, buildings: buildings ?? [] });
  } catch (error) {
    console.error("Portal load failed", error);
    return NextResponse.json({ error: "No se pudo cargar el portal." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
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
      if (data.administrationType === "TERCERA" && !data.administrationCompany) return context.respond({ error: "Indica la empresa administradora." }, 400);
      const normalizedAddress = normalizeAddress([data.streetType, data.streetName, data.streetNumber, data.district, data.province, data.department]);
      const { data: duplicate, error: duplicateError } = await db.from("buildings").select("id,building_name").eq("normalized_address", normalizedAddress).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) return context.respond({ error: `Este edificio ya fue registrado como ${duplicate.building_name}. Condomio revisará la atribución.`, code: "DUPLICATE_BUILDING" }, 409);
      const { data: building, error } = await db.from("buildings").insert({
        seller_id: context.profile.id, street_type: data.streetType, street_name: data.streetName, street_number: data.streetNumber,
        district: data.district, province: data.province, department: data.department, normalized_address: normalizedAddress,
        building_name: data.buildingName, apartments: data.apartments, administration_type: data.administrationType,
        administration_company: data.administrationCompany || null,
      }).select("id").single();
      if (error) throw error;
      if (data.contact) {
        const { error: contactError } = await db.from("building_contacts").insert({
          building_id: building.id, name: data.contact.name, role: data.contact.role, phone: data.contact.phone,
          email: data.contact.email || null, contact_type: data.contact.contactType,
          is_primary: true, is_authorized_signer: data.contact.isAuthorizedSigner,
        });
        if (contactError) throw contactError;
      }
      return context.respond({ ok: true, buildingId: building.id }, 201);
    }

    if (body.action === "addContact") {
      const parsed = addContactFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Revisa los datos del contacto." }, 400);
      const data = parsed.data;
      const { data: building } = await db.from("buildings").select("id").eq("id", data.buildingId).eq("seller_id", context.profile.id).maybeSingle();
      if (!building) return context.respond({ error: "Edificio no encontrado." }, 404);
      if (data.isPrimary) await db.from("building_contacts").update({ is_primary: false }).eq("building_id", building.id);
      const { error } = await db.from("building_contacts").insert({ building_id: building.id, name: data.name, role: data.role, phone: data.phone, email: data.email || null, contact_type: data.contactType, is_primary: data.isPrimary, is_authorized_signer: data.isAuthorizedSigner });
      if (error) throw error;
      return context.respond({ ok: true }, 201);
    }

    if (body.action === "discardBuilding") {
      const parsed = discardBuildingFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Solicitud inválida." }, 400);
      const { data: active } = await db.from("opportunities").select("id,buildings!inner(seller_id)").eq("building_id", parsed.data.buildingId).eq("active", true).eq("buildings.seller_id", context.profile.id).maybeSingle();
      if (active) return context.respond({ error: "Cierra primero la oportunidad activa de este edificio." }, 409);
      const { data: changed, error } = await db.from("buildings").update({ lead_status: "DISCARDED", discarded_at: new Date().toISOString(), discard_reason: parsed.data.reason, updated_at: new Date().toISOString() }).eq("id", parsed.data.buildingId).eq("seller_id", context.profile.id).eq("lead_status", "ACTIVE").select("id").maybeSingle();
      if (error) throw error;
      if (!changed) return context.respond({ error: "Edificio no encontrado o ya descartado." }, 404);
      return context.respond({ ok: true });
    }

    if (body.action === "choosePlan") {
      const parsed = choosePlanFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Revisa el plan y la cantidad de departamentos." }, 400);
      const data = parsed.data;
      const { data: opportunity } = await db.from("opportunities").select("id,seller_state,buildings!inner(seller_id)").eq("id", data.opportunityId).eq("buildings.seller_id", context.profile.id).maybeSingle();
      if (!opportunity) return context.respond({ error: "Oportunidad no encontrada." }, 404);
      if (!["INFORMACION_ENVIADA", "PLAN_PENDIENTE"].includes(opportunity.seller_state)) return context.respond({ error: "El plan se habilita después de la demo y del envío de información." }, 409);
      const unitPrice = opportunityUnitPriceCents(data.plan, data.autonomyDiscount);
      const recurringTotal = unitPrice * data.confirmedApartments;
      const { error } = await db.from("opportunities").update({ plan: data.plan, list_price_cents: opportunityUnitPriceCents(data.plan, false), autonomy_discount_applied: data.autonomyDiscount, discount_cents: data.autonomyDiscount ? 50 : 0, unit_price_cents: unitPrice, final_price_cents: unitPrice, confirmed_apartments: data.confirmedApartments, recurring_total_cents: recurringTotal, potential_commission_cents: commissionCents(unitPrice, data.confirmedApartments), seller_state: "PLAN_SELECCIONADO", updated_at: new Date().toISOString() }).eq("id", opportunity.id);
      if (error) throw error;
      return context.respond({ ok: true });
    }

    if (body.action === "requestContract") {
      const parsed = opportunityIdFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Solicitud inválida." }, 400);
      const { data: opportunity } = await db.from("opportunities").select("id,seller_state,buildings!inner(seller_id)").eq("id", parsed.data.opportunityId).eq("buildings.seller_id", context.profile.id).maybeSingle();
      if (!opportunity) return context.respond({ error: "Oportunidad no encontrada." }, 404);
      if (opportunity.seller_state !== "PLAN_SELECCIONADO") return context.respond({ error: "Primero debes seleccionar el plan." }, 409);
      const now = new Date().toISOString();
      const { error: contractError } = await db.from("contracts").insert({ opportunity_id: opportunity.id, status: "REQUESTED", requested_at: now });
      if (contractError) throw contractError;
      const { error } = await db.from("opportunities").update({ seller_state: "CONTRATO_SOLICITADO", updated_at: now }).eq("id", opportunity.id);
      if (error) throw error;
      return context.respond({ ok: true });
    }

    if (body.action === "uploadSignedContract") {
      const parsed = contractUploadFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Adjunta un PDF, JPG o PNG de hasta 8 MB." }, 400);
      const { data: opportunity } = await db.from("opportunities").select("id,seller_state,buildings!inner(seller_id)").eq("id", parsed.data.opportunityId).eq("buildings.seller_id", context.profile.id).maybeSingle();
      if (!opportunity) return context.respond({ error: "Oportunidad no encontrada." }, 404);
      if (opportunity.seller_state !== "CONTRATO_ENVIADO") return context.respond({ error: "El contrato aún no está listo para ser cargado." }, 409);
      const extension = parsed.data.mimeType === "application/pdf" ? "pdf" : parsed.data.mimeType === "image/png" ? "png" : "jpg";
      const bytes = Uint8Array.from(atob(parsed.data.base64), character => character.charCodeAt(0));
      if (bytes.byteLength > 8 * 1024 * 1024) return context.respond({ error: "El archivo supera los 8 MB." }, 413);
      const path = `${context.profile.id}/${opportunity.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await db.storage.from("signed-contracts").upload(path, bytes, { contentType: parsed.data.mimeType, upsert: false });
      if (uploadError) throw uploadError;
      const now = new Date().toISOString();
      const { error: contractError } = await db.from("contracts").update({ status: "IN_VALIDATION", signed_document_path: path, signed_document_uploaded_at: now, updated_at: now }).eq("opportunity_id", opportunity.id).eq("status", "SENT");
      if (contractError) { await db.storage.from("signed-contracts").remove([path]); throw contractError; }
      const { error } = await db.from("opportunities").update({ seller_state: "CONTRATO_EN_VALIDACION", updated_at: now }).eq("id", opportunity.id).eq("seller_state", "CONTRATO_ENVIADO");
      if (error) throw error;
      return context.respond({ ok: true });
    }

    if (body.action === "loseOpportunity") {
      const parsed = lostFields.safeParse(body.data);
      if (!parsed.success) return context.respond({ error: "Selecciona un motivo de pérdida." }, 400);
      const { data: opportunity } = await db.from("opportunities").select("id,active,buildings!inner(seller_id)").eq("id", parsed.data.opportunityId).eq("buildings.seller_id", context.profile.id).maybeSingle();
      if (!opportunity?.active) return context.respond({ error: "La oportunidad ya está cerrada." }, 409);
      const { error } = await db.from("opportunities").update({ seller_state: "NO_CONCRETADA", status: "PERDIDO", lost_reason: parsed.data.reason, active: false, updated_at: new Date().toISOString() }).eq("id", opportunity.id).eq("active", true);
      if (error) throw error;
      return context.respond({ ok: true });
    }

    return context.respond({ error: "Acción no reconocida." }, 400);
  } catch (error) {
    console.error("Portal update failed", error);
    return NextResponse.json({ error: "No se pudieron guardar los cambios." }, { status: 503 });
  }
}
