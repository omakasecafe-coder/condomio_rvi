import { createClient } from "@supabase/supabase-js";

export function authSettings() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error("La autenticación todavía no está configurada.");
  }
  return { url, publishableKey, serviceRoleKey };
}

export function publicAuthClient() {
  const { url, publishableKey } = authSettings();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function serviceClient() {
  const { url, serviceRoleKey } = authSettings();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function normalizeDocument(type: unknown, number: unknown) {
  if (typeof type !== "string" || typeof number !== "string") return null;
  const documentType = type.trim().toUpperCase();
  const documentNumber = number.replace(/\s/g, "").toUpperCase();
  if (!(["DNI", "CE", "PASAPORTE"].includes(documentType)) || !/^[A-Z0-9]{6,20}$/.test(documentNumber)) {
    return null;
  }
  return { documentType, documentNumber };
}
