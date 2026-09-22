"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResendCountdown } from "@/lib/use-resend-countdown";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { seconds: resendSeconds, restart: restartResend, reset: resetResend, canResend } = useResendCountdown();

  useEffect(() => { document.title = `${sent ? "Enlace enviado" : "Acceso admin"} · Condomio MVP`; }, [sent]);

  async function sendLink() {
    const response = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin", email }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || "No se pudo enviar el enlace.");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await sendLink();
      setSent(true);
      restartResend();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el enlace.");
    } finally { setBusy(false); }
  }

  async function resendLink() {
    if (!canResend || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await sendLink();
      restartResend();
      setNotice("Enviamos un enlace nuevo. Revisa también la carpeta de spam.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo reenviar el enlace.");
    } finally { setBusy(false); }
  }

  function changeEmail() {
    setSent(false); setError(""); setNotice(""); resetResend();
  }

  return <main className="mvp-shell admin-login-shell">
    <header className="mvp-header"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Administración</small></span></header>
    <section className="login-card admin-login-card">
      <span className="card-kicker">ACCESO ADMINISTRATIVO</span>
      <h1>{sent ? "Revisa tu correo" : "Ingresa a administración"}</h1>
      <p>{sent ? <>Enviamos un enlace de acceso a <strong>{email}</strong>. Ábrelo para entrar a administración.</> : "El acceso está limitado al correo administrador registrado."}</p>
      {!sent ? <form className="login-form" onSubmit={submit}>
        <div className="form-field"><Label htmlFor="admin-email">Correo administrador</Label><Input id="admin-email" type="email" className="field-control" value={email} onChange={event => setEmail(event.target.value)} required /></div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <Button className="submit-button" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar enlace de acceso"}</Button>
      </form> : <div className="login-form">
        {error && <p role="alert" className="form-error">{error}</p>}
        {notice && <p role="status" className="form-notice">{notice}</p>}
        <div className="resend-row" aria-live="polite">{canResend ? <button type="button" className="resend-button" onClick={() => void resendLink()} disabled={busy}>{busy ? "Reenviando…" : "Reenviar enlace"}</button> : <span>Podrás reenviar en {resendSeconds} s</span>}</div>
        <button type="button" className="back-button" onClick={changeEmail}>Usar otro correo</button>
      </div>}
    </section>
  </main>;
}
