"use client";

import { useEffect, useState } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { document.title = `${sent ? "Verificación admin" : "Acceso admin"} · Condomio MVP`; }, [sent]);

  useEffect(() => { if (new URLSearchParams(window.location.search).get("vista") === "otp") setSent(true); }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(sent ? "/api/auth/verify" : "/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin", email, token }),
      });
      const result = (await response.json()) as { error?: string; next?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo continuar.");
      if (sent) window.location.assign(result.next || "/admin");
      else setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo continuar.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mvp-shell admin-login-shell">
    <header className="mvp-header"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Administración</small></span></header>
    <section className="login-card admin-login-card">
      <span className="card-kicker">ACCESO ADMINISTRATIVO</span>
      <h1>{sent ? "Revisa tu correo" : "Ingresa a administración"}</h1>
      <p>{sent ? "Escribe el código enviado al correo autorizado." : "El acceso está limitado al correo administrador registrado."}</p>
      <form className="login-form" onSubmit={submit}>
        {!sent ? <div className="form-field"><Label htmlFor="admin-email">Correo administrador</Label><Input id="admin-email" type="email" className="field-control" value={email} onChange={event => setEmail(event.target.value)} required /></div> :
          <div className="form-field"><Label htmlFor="admin-otp">Código de verificación</Label><InputOTP id="admin-otp" maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={token} onChange={setToken}><InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} className="otp-slot" />)}</InputOTPGroup></InputOTP></div>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <Button className="submit-button" type="submit" disabled={busy || (sent && token.length !== 6)}>{busy ? "Procesando…" : sent ? "Entrar" : "Enviar código"}</Button>
      </form>
    </section>
  </main>;
}
