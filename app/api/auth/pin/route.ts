import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeDocument, normalizePin, serviceClient } from "@/lib/auth-config";
import { requestSession } from "@/lib/request-session";

export const dynamic = "force-dynamic";

const createPinFields = z.object({
  action: z.literal("create-pin"),
  pin: z.string(),
});

const loginFields = z.object({
  action: z.literal("login"),
  documentType: z.enum(["DNI", "CE", "PASAPORTE"]),
  documentNumber: z.string(),
  pin: z.string(),
});

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const context = requestSession(request);

  if (body?.action === "create-pin") {
    const parsed = createPinFields.safeParse(body);
    const pin = parsed.success ? normalizePin(parsed.data.pin) : null;
    if (!pin) return context.respond({ error: "El PIN debe tener exactamente seis dígitos." }, 400);
    try {
      const { data: auth, error: authError } = await context.client.auth.getUser();
      if (authError || !auth.user?.email_confirmed_at) return context.respond({ error: "Tu sesión de postulación venció. Vuelve a ingresar con tu documento." }, 401);
      const admin = serviceClient();
      const { data: profile, error: profileError } = await admin.from("seller_profiles")
        .select("id,status,application_stage")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile || profile.status !== "APPLICANT" || profile.application_stage !== "CONTRACT") {
        return context.respond({ error: "Completa primero todos los pasos de la postulación." }, 403);
      }
      const passwordUpdate = await context.client.auth.updateUser({ password: pin });
      if (passwordUpdate.error) throw passwordUpdate.error;
      const { error: activationError } = await admin.from("seller_profiles").update({
        status: "ACTIVE",
        application_stage: "ACTIVE",
        updated_at: new Date().toISOString(),
      }).eq("id", profile.id).eq("status", "APPLICANT").eq("application_stage", "CONTRACT");
      if (activationError) throw activationError;
      return context.respond({ ok: true, next: "/portal" });
    } catch (error) {
      console.error("PIN creation failed", error);
      return context.respond({ error: "No se pudo crear el PIN. Inténtalo nuevamente." }, 503);
    }
  }

  const parsed = loginFields.safeParse(body);
  if (!parsed.success) return context.respond({ error: "Revisa el documento y el PIN." }, 400);
  const document = normalizeDocument(parsed.data.documentType, parsed.data.documentNumber);
  const pin = normalizePin(parsed.data.pin);
  if (!document || !pin) return context.respond({ error: "Revisa el documento y el PIN." }, 400);

  try {
    const admin = serviceClient();
    const profile = await admin.from("seller_profiles")
      .select("auth_user_id,email,status")
      .eq("document_type", document.documentType)
      .eq("document_number", document.documentNumber)
      .maybeSingle();
    if (profile.error) throw profile.error;
    if (!profile.data || profile.data.status !== "ACTIVE") return context.respond({ error: "Documento o PIN incorrecto." }, 401);

    const signedIn = await context.client.auth.signInWithPassword({ email: profile.data.email, password: pin });
    if (signedIn.error || signedIn.data.user?.id !== profile.data.auth_user_id) {
      await context.client.auth.signOut();
      return context.respond({ error: "Documento o PIN incorrecto." }, 401);
    }
    return context.respond({ ok: true, next: "/portal" });
  } catch (error) {
    console.error("PIN login failed", error);
    return context.respond({ error: "No se pudo iniciar sesión. Inténtalo más tarde." }, 503);
  }
}
