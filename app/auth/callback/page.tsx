"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AuthCallbackPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    async function finishSignIn() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const authError = hash.get("error_description");
      window.history.replaceState({}, "", window.location.pathname + window.location.search);

      if (authError || !accessToken || !refreshToken) {
        setError(authError || "El enlace no es válido o ya venció.");
        return;
      }

      try {
        const purpose = new URLSearchParams(window.location.search).get("purpose") || "seller";
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, refreshToken, purpose }),
        });
        const result = await response.json() as { error?: string; next?: string };
        if (!response.ok || !result.next) throw new Error(result.error || "No se pudo iniciar la sesión.");
        window.location.replace(result.next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo iniciar la sesión.");
      }
    }
    void finishSignIn();
  }, []);

  return <main className="mvp-shell admin-login-shell">
    <header className="mvp-header"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Acceso seguro</small></span></header>
    <section className="login-card admin-login-card">
      <span className="card-kicker">VALIDANDO ENLACE</span>
      <h1>{error ? "No pudimos abrir este enlace" : "Ingresando a Condomio…"}</h1>
      <p>{error || "Espera un momento mientras verificamos tu acceso."}</p>
      {error && <Link href="/" className="portal-link">Solicitar un enlace nuevo</Link>}
    </section>
  </main>;
}
