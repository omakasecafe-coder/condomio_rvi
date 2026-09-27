"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation avoids the broken client router in the Cloudflare runtime. */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PinInput } from "@/components/pin-input";

export default function SellerLogin() {
  const [documentType, setDocumentType] = useState("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { document.title = "Acceso vendedor · Condomio MVP"; }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin)) { setError("Ingresa los seis dígitos de tu PIN."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", documentType, documentNumber, pin }),
      });
      const result = await response.json() as { error?: string; next?: string };
      if (!response.ok || !result.next) throw new Error(result.error || "No se pudo iniciar sesión.");
      window.location.replace(result.next);
    } catch (cause) {
      setPin("");
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión.");
    } finally { setBusy(false); }
  }

  return <main className="mvp-shell">
    <header className="mvp-header"><a href="/" className="workspace-brand" aria-label="Volver al inicio"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Red comercial</small></span></a></header>
    <div className="mvp-grid">
      <section className="mvp-intro" aria-labelledby="main-title">
        <span className="eyebrow">PORTAL DE VENDEDORES INDEPENDIENTES</span><h1 id="main-title">Tu cartera comercial, en un solo lugar.</h1><p>Registra edificios, acompaña oportunidades y consulta tus comisiones con información siempre actualizada.</p><div className="intro-line" aria-hidden="true" /><div className="intro-facts"><span>01 · Edificios</span><span>02 · Oportunidades</span><span>03 · Comisiones</span></div><a href="/postular" className="apply-home-link">¿Aún no formas parte de la red? Conoce cómo postular →</a>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <span className="card-kicker">ACCESO SEGURO</span><h2 id="login-title">Ingresa o retoma tu postulación</h2><p>Usa el documento registrado y tu PIN personal de seis dígitos.</p>
        <form onSubmit={login} className="login-form">
          <div className="form-field"><Label htmlFor="document-type">Tipo de documento</Label><Select value={documentType} onValueChange={setDocumentType}><SelectTrigger id="document-type" className="field-control"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DNI">DNI</SelectItem><SelectItem value="CE">Carné de extranjería</SelectItem><SelectItem value="PASAPORTE">Pasaporte</SelectItem></SelectContent></Select></div>
          <div className="form-field"><Label htmlFor="document-number">Número de documento</Label><Input id="document-number" className="field-control" value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} autoComplete="username" maxLength={20} required /></div>
          <PinInput label="PIN de seis dígitos" value={pin} onChange={setPin} disabled={busy} />
          {error && <p role="alert" className="form-error">{error}</p>}
          <Button type="submit" className="submit-button" disabled={busy || pin.length !== 6}>{busy ? "Ingresando…" : "Ingresar"}</Button>
        </form>
        <p className="login-foot">Tu PIN es personal. Condomio nunca te lo solicitará por correo, llamada o mensaje. Si tu cuenta fue creada antes de usar PIN, contacta a administración para habilitarlo.</p><a href="/admin/login" className="admin-home-link">Acceso de administración</a>
      </section>
    </div>
  </main>;
}
