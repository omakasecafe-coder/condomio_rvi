import { NextResponse } from "next/server";
import { normalizeDocument, publicAuthClient, serviceClient } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.role === "applicant") {
    if (process.env.APPLICATIONS_ENABLED !== "true") return NextResponse.json({ error: "Las postulaciones todavía no están habilitadas." }, { status: 503 });
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Ingresa un correo válido." }, { status: 400 });
    }
    try {
      const result = await publicAuthClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Applicant OTP request failed", error);
      return NextResponse.json({ error: "No se pudo enviar el código." }, { status: 503 });
    }
  }
  if (body?.role === "admin") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const allowed = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!email || !allowed) return NextResponse.json({ error: "Acceso no configurado." }, { status: 503 });
    try {
      if (email === allowed) {
        const result = await publicAuthClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (result.error) throw result.error;
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Admin OTP request failed", error);
      return NextResponse.json({ error: "No se pudo enviar el código." }, { status: 503 });
    }
  }
  const document = normalizeDocument(body?.documentType, body?.documentNumber);
  if (!document) {
    return NextResponse.json({ error: "Revisa el tipo y número de documento." }, { status: 400 });
  }
  try {
    const { data, error } = await serviceClient()
      .from("seller_profiles")
      .select("email,status")
      .eq("document_type", document.documentType)
      .eq("document_number", document.documentNumber)
      .maybeSingle();
    if (error) throw error;
    if (data?.status === "ACTIVE") {
      const result = await publicAuthClient().auth.signInWithOtp({
        email: data.email,
        options: { shouldCreateUser: false },
      });
      if (result.error) throw result.error;
    }
    // A generic response avoids revealing whether a document is registered.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("OTP request failed", error);
    return NextResponse.json({ error: "No se pudo enviar el código. Inténtalo más tarde." }, { status: 503 });
  }
}
