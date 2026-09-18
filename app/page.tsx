"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Stage = "document" | "code";

export default function Home() {
  const [stage, setStage] = useState<Stage>("document");
  const [documentType, setDocumentType] = useState("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { document.title = `${stage === "code" ? "Verificación" : "Acceso vendedor"} · Condomio MVP`; }, [stage]);

  useEffect(() => { if (new URLSearchParams(window.location.search).get("vista") === "otp") setStage("code"); }, []);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, documentNumber }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo solicitar el código.");
      setStage("code");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo solicitar el código.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType, documentNumber, token }),
      });
      const result = (await response.json()) as { error?: string; next?: string };
      if (!response.ok) throw new Error(result.error || "El código no es válido.");
      window.location.assign(result.next || "/portal");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "El código no es válido.");
      setBusy(false);
    }
  }

  return (
    <main className="mvp-shell">
      <header className="mvp-header">
        <span className="brand-mark" aria-hidden="true">C</span>
        <span className="brand-name">Condomio <small>Red comercial</small></span>
      </header>
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
          <h2 id="login-title">{stage === "document" ? "Ingresa a tu portal" : "Verifica tu correo"}</h2>
          <p>{stage === "document" ? "Usa el tipo y número de documento registrados en Condomio." : "Si tu documento está registrado, enviamos un código al correo asociado. No compartas ese código."}</p>
          {stage === "document" ? (
            <form onSubmit={requestCode} className="login-form">
              <div className="form-field">
                <Label htmlFor="document-type">Tipo de documento</Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger id="document-type" className="field-control"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="CE">Carné de extranjería</SelectItem>
                    <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="form-field">
                <Label htmlFor="document-number">Número de documento</Label>
                <Input id="document-number" className="field-control" value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} autoComplete="off" maxLength={20} required />
              </div>
              {error && <p role="alert" className="form-error">{error}</p>}
              <Button type="submit" className="submit-button" disabled={busy}>{busy ? "Solicitando código…" : "Enviar código de acceso"}</Button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="login-form">
              <div className="form-field">
                <Label htmlFor="otp-code">Código de verificación</Label>
                <InputOTP id="otp-code" maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={token} onChange={setToken}>
                  <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} className="otp-slot" />)}</InputOTPGroup>
                </InputOTP>
              </div>
              {error && <p role="alert" className="form-error">{error}</p>}
              <Button type="submit" className="submit-button" disabled={busy || token.length !== 6}>{busy ? "Verificando…" : "Entrar al portal"}</Button>
              <button type="button" className="back-button" onClick={() => { setStage("document"); setToken(""); setError(""); }}>Usar otro documento</button>
            </form>
          )}
          <p className="login-foot">El código solo se envía al correo registrado. Si necesitas actualizarlo, contacta a administración de Condomio.</p>
          <Link href="/admin/login" className="admin-home-link">Acceso de administración</Link>
        </section>
      </div>
    </main>
  );
}
