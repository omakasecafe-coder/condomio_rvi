import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

type CalPayload = {
  triggerEvent?: string;
  payload?: {
    uid?: string;
    startTime?: string;
    endTime?: string;
    start?: string;
    end?: string;
    metadata?: Record<string, unknown>;
  };
};

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function validSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
  const received = signature.replace(/^sha256=/i, "").toLowerCase();
  if (received.length !== digest.length) return false;
  let difference = 0;
  for (let index = 0; index < digest.length; index += 1) difference |= digest.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CAL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook no configurado." }, { status: 503 });
  const rawBody = await request.text();
  if (!(await validSignature(rawBody, request.headers.get("x-cal-signature-256"), secret))) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as CalPayload;
  if (!body.triggerEvent || !body.payload) return NextResponse.json({ ok: true });
  const metadata = body.payload.metadata ?? {};
  const db = serviceClient();
  const event = body.triggerEvent;
  const cancelled = event === "BOOKING_CANCELLED";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const requestedOpportunityId = String(metadata.opportunityId ?? metadata.opportunity_id ?? "");
  const buildingId = String(metadata.buildingId ?? metadata.building_id ?? "");
  const contactId = String(metadata.contactId ?? metadata.contact_id ?? "");
  let opportunityId = requestedOpportunityId;

  if (!uuid.test(opportunityId) && uuid.test(buildingId) && uuid.test(contactId) && !cancelled) {
    const { data: contact, error: contactError } = await db.from("building_contacts")
      .select("id,building_id").eq("id", contactId).eq("building_id", buildingId).maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return NextResponse.json({ ok: true, ignored: "unknown_contact" });
    const { data: active, error: activeError } = await db.from("opportunities")
      .select("id").eq("building_id", buildingId).eq("active", true).maybeSingle();
    if (activeError) throw activeError;
    if (active) opportunityId = active.id;
    else {
      const { data: version, error: versionError } = await db.from("commercial_versions").select("id").eq("active", true).single();
      if (versionError) throw versionError;
      const { data: created, error: createError } = await db.from("opportunities").insert({
        building_id: buildingId, primary_contact_id: contactId, commercial_version_id: version.id,
        plan: null, unit_price_cents: null, status: "DEMO", seller_state: "DEMO_AGENDADA",
        active: true, observations: "",
      }).select("id").single();
      if (createError) throw createError;
      opportunityId = created.id;
    }
  }

  if (!uuid.test(opportunityId)) return NextResponse.json({ ok: true, ignored: "missing_opportunity_reference" });

  const update: Record<string, unknown> = {
    cal_booking_uid: body.payload.uid ?? null,
    demo_starts_at: body.payload.startTime ?? body.payload.start ?? null,
    demo_ends_at: body.payload.endTime ?? body.payload.end ?? null,
    demo_booking_status: cancelled ? "CANCELLED" : event === "BOOKING_RESCHEDULED" ? "RESCHEDULED" : "CREATED",
    demo_scheduled: !cancelled,
    updated_at: new Date().toISOString(),
  };
  const { data: opportunity, error: lookupError } = await db.from("opportunities").select("id,status,seller_state,primary_contact_id").eq("id", opportunityId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!opportunity) return NextResponse.json({ ok: true, ignored: "unknown_opportunity" });
  if (!cancelled) {
    update.status = "DEMO";
    update.seller_state = "DEMO_AGENDADA";
  } else if (opportunity.seller_state === "DEMO_AGENDADA") {
    update.seller_state = "CONTACTO_REGISTRADO";
  }
  const { error } = await db.from("opportunities").update(update).eq("id", opportunity.id);
  if (error) throw error;
  if (!cancelled) {
    const demo = {
      opportunity_id: opportunity.id,
      contact_id: opportunity.primary_contact_id || (uuid.test(contactId) ? contactId : null),
      booking_uid: body.payload.uid ?? null,
      starts_at: body.payload.startTime ?? body.payload.start,
      ends_at: body.payload.endTime ?? body.payload.end ?? null,
      booking_status: event === "BOOKING_RESCHEDULED" ? "RESCHEDULED" : "SCHEDULED",
      updated_at: new Date().toISOString(),
    };
    if (demo.contact_id && demo.starts_at) {
      const { error: demoError } = await db.from("opportunity_demos").upsert(demo, { onConflict: "opportunity_id" });
      if (demoError) throw demoError;
    }
  } else {
    const { error: demoError } = await db.from("opportunity_demos").update({ booking_status: "CANCELLED", updated_at: new Date().toISOString() }).eq("opportunity_id", opportunity.id);
    if (demoError) throw demoError;
  }
  return NextResponse.json({ ok: true });
}
