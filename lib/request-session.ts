import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authSettings } from "@/lib/auth-config";

type CookieUpdate = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

export function requestSession(request: NextRequest) {
  const { url, publishableKey } = authSettings();
  const updates: CookieUpdate[] = [];
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => { updates.push(...cookies); },
    },
  });
  function respond(body: unknown, status = 200) {
    const response = NextResponse.json(body, { status });
    response.headers.set("Cache-Control", "no-store");
    for (const cookie of updates) response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  }
  return { client, respond };
}
