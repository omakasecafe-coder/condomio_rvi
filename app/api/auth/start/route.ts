import { NextResponse } from "next/server";
import { normalizeDocument, publicAuthClient, serviceClient } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const origin = new URL(request.url).origin;
  if (body?.role === "resume-applicant") {
    const document = normalizeDocument(body.documentType, body.documentNumber);
    if (!document) return NextResponse.json({ error: "Revisa el tipo y número de documento." }, { status: 400 });
    try {
      const { data: profile, error } = await serviceClient().from("seller_profiles")
        .select("email,status")
        .eq("document_type", document.documentType)
        .eq("document_number", document.documentNumber)
        .maybeSingle();
      if (error) throw error;
      if (!profile) return NextResponse.json({ exists: false });
      if (profile.status === "ACTIVE") return NextResponse.json({ exists: true, active: true, next: "/ingresar" });
      if (profile.status !== "APPLICANT") {
        return NextResponse.json({ exists: true, blocked: true, error: "Esta postulación no se puede retomar por el momento." }, { status: 409 });
      }
      const result = await publicAuthClient().auth.signInWithOtp({ email: profile.email, options: { shouldCreateUser: false } });
      if (result.error) throw result.error;
      const [name, domain] = profile.email.split("@");
      const maskedEmail = `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
      return NextResponse.json({ exists: true, active: false, maskedEmail });
    } catch (error) {
      console.error("Applicant resume OTP request failed", error);
      return NextResponse.json({ error: "No se pudo validar la postulación. Inténtalo nuevamente." }, { status: 503 });
    }
  }
  if (body?.role === "applicant") {
    if (process.env.APPLICATIONS_ENABLED !== "true") {
      return NextResponse.json({ error: "Las postulaciones todavía no están habilitadas." }, { status: 503 });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Ingresa un correo electrónico válido." }, { status: 400 });
    }
    try {
      const result = await publicAuthClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Applicant OTP request failed", error);
      return NextResponse.json({ error: "No se pudo enviar el código. Inténtalo nuevamente." }, { status: 503 });
    }
  }
  if (body?.role === "admin") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const allowed = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!email || !allowed) return NextResponse.json({ error: "Acceso no configurado." }, { status: 503 });
    try {
      if (email === allowed) {
        const result = await publicAuthClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback?purpose=admin` } });
        if (result.error) throw result.error;
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Admin OTP request failed", error);
      return NextResponse.json({ error: "No se pudo enviar el enlace." }, { status: 503 });
    }
  }
  return NextResponse.json({ error: "Este acceso usa documento y PIN." }, { status: 400 });
}
