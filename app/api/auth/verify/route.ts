import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authSettings, normalizeDocument, publicAuthClient, serviceClient } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const admin = body?.role === "admin";
  const applicant = body?.role === "applicant";
  const document = admin || applicant ? null : normalizeDocument(body?.documentType, body?.documentNumber);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if ((!admin && !applicant && !document) || !/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: "Revisa el documento y el código." }, { status: 400 });
  }
  try {
    let email: string;
    let expectedUserId: string | null = null;
    if (admin) {
      email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email || email !== process.env.ADMIN_EMAIL?.trim().toLowerCase()) {
        return NextResponse.json({ error: "No se pudo validar el código." }, { status: 401 });
      }
    } else if (applicant) {
      email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return NextResponse.json({ error: "No se pudo validar el código." }, { status: 401 });
      }
    } else {
      const { data: profile, error: lookupError } = await serviceClient()
        .from("seller_profiles")
        .select("auth_user_id,email,status")
        .eq("document_type", document!.documentType)
        .eq("document_number", document!.documentNumber)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!profile || profile.status !== "ACTIVE") {
        return NextResponse.json({ error: "No se pudo validar el código." }, { status: 401 });
      }
      email = profile.email;
      expectedUserId = profile.auth_user_id;
    }
    const { data, error } = await publicAuthClient().auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error || !data.user || !data.session || (expectedUserId && data.user.id !== expectedUserId) || ((admin || applicant) && data.user.email?.toLowerCase() !== email)) {
      return NextResponse.json({ error: "No se pudo validar el código." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, next: admin ? "/admin" : applicant ? "/postular" : "/portal" });
    response.headers.set("Cache-Control", "no-store");
    const { url, publishableKey } = authSettings();
    const sessionClient = createServerClient(url, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const cookie of cookies) response.cookies.set(cookie.name, cookie.value, cookie.options);
        },
      },
    });
    const sessionResult = await sessionClient.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (sessionResult.error) throw sessionResult.error;
    return response;
  } catch (error) {
    console.error("OTP verification failed", error);
    return NextResponse.json({ error: "No se pudo validar el código. Inténtalo más tarde." }, { status: 503 });
  }
}
