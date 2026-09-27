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
  const opportunityId = String(metadata.opportunityId ?? metadata.opportunity_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(opportunityId)) {
    return NextResponse.json({ ok: true, ignored: "missing_opportunity_id" });
  }

  const db = serviceClient();
  const event = body.triggerEvent;
  const cancelled = event === "BOOKING_CANCELLED";
  const update: Record<string, unknown> = {
    cal_booking_uid: body.payload.uid ?? null,
    demo_starts_at: body.payload.startTime ?? body.payload.start ?? null,
    demo_ends_at: body.payload.endTime ?? body.payload.end ?? null,
    demo_booking_status: cancelled ? "CANCELLED" : event === "BOOKING_RESCHEDULED" ? "RESCHEDULED" : "CREATED",
    demo_scheduled: !cancelled,
    updated_at: new Date().toISOString(),
  };
  const { data: opportunity, error: lookupError } = await db.from("opportunities").select("id,status").eq("id", opportunityId).maybeSingle();
  if (lookupError) throw lookupError;
  if (!opportunity) return NextResponse.json({ ok: true, ignored: "unknown_opportunity" });
  if (!cancelled && opportunity.status === "CONTACTO") update.status = "DEMO";
  const { error } = await db.from("opportunities").update(update).eq("id", opportunity.id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
}
