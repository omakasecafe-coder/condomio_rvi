"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResendCountdown } from "@/lib/use-resend-countdown";

type Stage = "document" | "link";

export default function Home() {
  const [stage, setStage] = useState<Stage>("document");
  const [documentType, setDocumentType] = useState("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { seconds: resendSeconds, restart: restartResend, reset: resetResend, canResend } = useResendCountdown();

  useEffect(() => { document.title = `${stage === "link" ? "Enlace enviado" : "Acceso vendedor"} · Condomio MVP`; }, [stage]);

  async function sendLink() {
    const response = await fetch("/api/auth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType, documentNumber }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || "No se pudo enviar el enlace.");
  }

  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await sendLink();
      setStage("link");
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

  function changeDocument() {
    setStage("document"); setError(""); setNotice(""); resetResend();
  }

  return <main className="mvp-shell">
    <header className="mvp-header"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Red comercial</small></span></header>
    <div className="mvp-grid">
      <section className="mvp-intro" aria-labelledby="main-title">
        <span className="eyebrow">PORTAL DE VENDEDORES INDEPENDIENTES</span>
        <h1 id="main-title">Tu cartera comercial, en un solo lugar.</h1>
        <p>Registra edificios, acompaña oportunidades y consulta tus comisiones con información siempre actualizada.</p>
        <div className="intro-line" aria-hidden="true" />
        <div className="intro-facts"><span>01 · Edificios</span><span>02 · Oportunidades</span><span>03 · Comisiones</span></div>
        <Link href="/postular" className="apply-home-link">¿Aún no formas parte de la red? Conoce cómo postular →</Link>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <span className="card-kicker">ACCESO SEGURO</span>
        <h2 id="login-title">{stage === "document" ? "Ingresa a tu portal" : "Revisa tu correo"}</h2>
        <p>{stage === "document" ? "Usa el tipo y número de documento registrados en Condomio." : "Si tu documento está registrado, enviamos un enlace al correo asociado. Ábrelo para entrar a tu portal."}</p>
        {stage === "document" ? <form onSubmit={requestLink} className="login-form">
          <div className="form-field"><Label htmlFor="document-type">Tipo de documento</Label><Select value={documentType} onValueChange={setDocumentType}><SelectTrigger id="document-type" className="field-control"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DNI">DNI</SelectItem><SelectItem value="CE">Carné de extranjería</SelectItem><SelectItem value="PASAPORTE">Pasaporte</SelectItem></SelectContent></Select></div>
          <div className="form-field"><Label htmlFor="document-number">Número de documento</Label><Input id="document-number" className="field-control" value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} autoComplete="off" maxLength={20} required /></div>
          {error && <p role="alert" className="form-error">{error}</p>}
          <Button type="submit" className="submit-button" disabled={busy}>{busy ? "Enviando enlace…" : "Enviar enlace de acceso"}</Button>
        </form> : <div className="login-form">
          {error && <p role="alert" className="form-error">{error}</p>}
          {notice && <p role="status" className="form-notice">{notice}</p>}
          <div className="resend-row" aria-live="polite">{canResend ? <button type="button" className="resend-button" onClick={() => void resendLink()} disabled={busy}>{busy ? "Reenviando…" : "Reenviar enlace"}</button> : <span>Podrás reenviar en {resendSeconds} s</span>}</div>
          <button type="button" className="back-button" onClick={changeDocument}>Usar otro documento</button>
        </div>}
        <p className="login-foot">El enlace solo se envía al correo registrado y puede utilizarse una vez. Si necesitas actualizarlo, contacta a administración de Condomio.</p>
        <Link href="/admin/login" className="admin-home-link">Acceso de administración</Link>
      </section>
    </div>
  </main>;
}
