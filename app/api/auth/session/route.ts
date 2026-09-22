import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authSettings, serviceClient } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Solicitud no permitida." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  const refreshToken = typeof body?.refreshToken === "string" ? body.refreshToken : "";
  const purpose = typeof body?.purpose === "string" ? body.purpose : "seller";
  if (!accessToken || !refreshToken || !["admin", "seller", "applicant"].includes(purpose)) {
    return NextResponse.json({ error: "El enlace no es válido." }, { status: 400 });
  }

  const { url, publishableKey } = authSettings();
  let cookiesToSet: { name: string; value: string; options: CookieOptions }[] = [];
  let authHeaders: Record<string, string> = { "Cache-Control": "private, no-store" };
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => { cookiesToSet = cookies; authHeaders = { ...authHeaders, ...headers }; },
    },
  });

  try {
    const sessionResult = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    const userEmail = sessionResult.data.user?.email;
    if (sessionResult.error || !userEmail || !sessionResult.data.user) throw sessionResult.error || new Error("Sesión inválida");
    const user = sessionResult.data.user;
    const email = userEmail.toLowerCase();
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

    let next: string | null = null;
    if (purpose === "admin" && adminEmail && email === adminEmail) {
      next = "/admin";
    } else {
      const { data: profile, error } = await serviceClient().from("seller_profiles")
        .select("status,email")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (purpose === "seller" && profile?.status === "ACTIVE" && profile.email.toLowerCase() === email) next = "/portal";
      if (purpose === "applicant" && process.env.APPLICATIONS_ENABLED === "true" && (!profile || profile.status === "APPLICANT")) next = "/postular?verified=1";
    }

    if (!next) {
      await client.auth.signOut();
      const denied = NextResponse.json({ error: "Esta cuenta no tiene acceso habilitado." }, { status: 403, headers: authHeaders });
      for (const cookie of cookiesToSet) denied.cookies.set(cookie.name, cookie.value, cookie.options);
      return denied;
    }
    const response = NextResponse.json({ ok: true, next }, { headers: authHeaders });
    for (const cookie of cookiesToSet) response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    console.error("Magic link session failed", error);
    return NextResponse.json({ error: "El enlace no es válido o ya venció." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
}
