"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation avoids the broken client router in the Cloudflare runtime. */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PinInput } from "@/components/pin-input";

type Step = "documento" | "datos" | "correo" | "actitud" | "resultado" | "conoce" | "examen" | "resultado-comercial" | "validacion" | "bienvenida";
type Applicant = { firstName: string; paternalSurname: string; maternalSurname: string; documentType: string; documentNumber: string; birthDate: string; phone: string; email: string };
type AssessmentQuestion = { id: string; prompt: string; options: string[] };
type PublishedAssessment = { id: string; kind: "ATTITUDINAL" | "APTITUDINAL"; name: string; version: number; passPercentage: number; allowedAttempts: number; questionCount: number; randomizeQuestions: boolean; questions: AssessmentQuestion[] };
type Resume = { step: Step; passedAttitude: boolean; passedCommercial: boolean };
type Config = { termsUrl: string | null; termsVersion: string | null; materialsUrl: string | null; acceptingApplications: boolean; acceptingFinalValidation: boolean; assessments: PublishedAssessment[]; resume?: Resume | null };
const steps: Step[] = ["datos", "actitud", "resultado", "conoce", "examen", "validacion", "bienvenida"];
const sidebarSteps = steps.filter((_, index) => index !== 3 && index !== 6);
const labels: Record<Step, string> = { documento: "Documento de identidad", datos: "Datos personales", correo: "Verificación de correo", actitud: "Evaluación actitudinal", resultado: "Resultado", conoce: "Conoce Condomio", examen: "Evaluación aptitudinal", "resultado-comercial": "Resultado aptitudinal", validacion: "Validación final", bienvenida: "Bienvenida" };
const demoAssessments: PublishedAssessment[] = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "ATTITUDINAL", name: "Evaluación actitudinal", version: 1, passPercentage: 75, allowedAttempts: 1, questionCount: 2, randomizeQuestions: true, questions: [
    { id: "11111111-1111-4111-8111-111111111101", prompt: "Un edificio quiere conocer el servicio, pero aún no decide. ¿Qué haces?", options: ["Insisto en que firme hoy", "Escucho sus necesidades y acuerdo un siguiente paso", "Dejo de contactarlo"] },
    { id: "11111111-1111-4111-8111-111111111102", prompt: "Un cliente pide una función que no sabes si existe. ¿Cómo respondes?", options: ["Prometo que sí existe", "Le digo que no se puede sin consultar", "Verifico la información antes de comprometerme"] },
  ] },
  { id: "22222222-2222-4222-8222-222222222222", kind: "APTITUDINAL", name: "Evaluación aptitudinal comercial", version: 1, passPercentage: 75, allowedAttempts: 2, questionCount: 2, randomizeQuestions: true, questions: [
    { id: "22222222-2222-4222-8222-222222222201", prompt: "Un edificio tiene 50 departamentos y el plan cuesta S/ 4 por departamento. ¿Cuál es el ingreso mensual?", options: ["S/ 54", "S/ 200", "S/ 500"] },
    { id: "22222222-2222-4222-8222-222222222202", prompt: "El contacto necesita aprobación de la junta. ¿Cuál es el mejor siguiente paso?", options: ["Marcar la venta como ganada", "Acordar la presentación a la junta", "Cerrar la oportunidad"] },
  ] },
];

export default function ApplyPage() {
  const [step, setStep] = useState<Step>("documento");
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [documentType, setDocumentType] = useState("DNI");
  const [documentNumber, setDocumentNumber] = useState("");
  const [returningApplicant, setReturningApplicant] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [attitudeAnswers, setAttitudeAnswers] = useState<Record<number, number>>({});
  const [commercialAnswers, setCommercialAnswers] = useState<Record<number, number>>({});
  const [passedAttitude, setPassedAttitude] = useState(false);
  const [passedCommercial, setPassedCommercial] = useState(false);
  const [attitudeAttemptsRemaining, setAttitudeAttemptsRemaining] = useState(0);
  const [commercialAttemptsRemaining, setCommercialAttemptsRemaining] = useState(0);
  const [pin, setPin] = useState("");
  const [pinConfirmation, setPinConfirmation] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [pinCreated, setPinCreated] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<Config>({ termsUrl: null, termsVersion: null, materialsUrl: null, acceptingApplications: false, acceptingFinalValidation: false, assessments: [] });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("paso") as Step | null;
    if (requested && labels[requested]) {
      // Query parameters seed deterministic demo views after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(requested); setDemo(true);
      if (requested === "resultado" && params.get("aprobado") === "1") setPassedAttitude(true);
      if (requested === "validacion" || requested === "bienvenida") setPassedCommercial(true);
      if (requested === "correo" && params.get("existente") === "1") { setReturningApplicant(true); setMaskedEmail("pa****@correo.com"); }
    }
    fetch("/api/apply", { cache: "no-store" }).then(response => response.json() as Promise<Config>).then(result => {
      setConfig(result);
      if (params.get("resume") === "1" && result.resume) {
        setPassedAttitude(result.resume.passedAttitude);
        setPassedCommercial(result.resume.passedCommercial);
        setStep(result.resume.step);
      }
    }).catch(() => undefined);
  }, []);
  useEffect(() => { document.title = `${labels[step]} · Condomio MVP`; }, [step]);
  const forward = (next: Step) => { setError(""); setStep(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string; passed?: boolean; attemptsRemaining?: number; exists?: boolean; active?: boolean; blocked?: boolean; maskedEmail?: string; next?: string };
    if (!response.ok) throw new Error(data.error || "No se pudo continuar.");
    return data;
  }

  async function submitDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentNumber.trim()) { setError("Ingresa tu número de documento."); return; }
    if (demo) { forward("datos"); return; }
    setBusy(true); setError("");
    try {
      const result = await postJson("/api/auth/start", { role: "resume-applicant", documentType, documentNumber });
      if (result.active) { window.location.assign(result.next || "/ingresar"); return; }
      if (result.exists) {
        setReturningApplicant(true);
        setMaskedEmail(result.maskedEmail || "tu correo registrado");
        forward("correo");
        return;
      }
      if (!config.acceptingApplications) throw new Error("Las postulaciones se están preparando. Inténtalo nuevamente en unos minutos.");
      setReturningApplicant(false);
      forward("datos");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo validar el documento."); }
    finally { setBusy(false); }
  }

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data: Applicant = {
      firstName: String(form.get("firstName") || ""), paternalSurname: String(form.get("paternalSurname") || ""), maternalSurname: String(form.get("maternalSurname") || ""),
      documentType, documentNumber: documentNumber.trim(), birthDate: String(form.get("birthDate") || ""),
      phone: String(form.get("phone") || ""), email: String(form.get("email") || "").trim().toLowerCase(),
    };
    setApplicant(data);
    if (demo) { forward("correo"); return; }
    if (!config.acceptingApplications) { setError("Las postulaciones se están preparando. Inténtalo nuevamente en unos minutos."); return; }
    setBusy(true); setError("");
    try {
      await postJson("/api/auth/start", { role: "applicant", email: data.email });
      forward("correo");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo enviar el código de verificación."); }
    finally { setBusy(false); }
  }

  async function verifyEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) { forward("actitud"); return; }
    if ((!returningApplicant && !applicant) || !/^\d{6}$/.test(emailOtp)) { setError("Ingresa el código de seis dígitos enviado a tu correo."); return; }
    setBusy(true); setError("");
    try {
      if (!emailVerified) {
        await postJson("/api/auth/verify", returningApplicant
          ? { documentType, documentNumber, token: emailOtp }
          : { role: "applicant", email: applicant!.email, token: emailOtp });
        setEmailVerified(true);
      }
      if (returningApplicant) {
        const response = await fetch("/api/apply", { cache: "no-store" });
        const refreshed = await response.json() as Config & { error?: string };
        if (!response.ok || !refreshed.resume) throw new Error(refreshed.error || "No encontramos un hito pendiente para retomar.");
        setConfig(refreshed);
        setPassedAttitude(refreshed.resume.passedAttitude);
        setPassedCommercial(refreshed.resume.passedCommercial);
        forward(refreshed.resume.step);
        return;
      }
      await postJson("/api/apply", { action: "profile", data: applicant });
      forward("actitud");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo verificar el correo."); }
    finally { setBusy(false); }
  }

  async function resendEmailCode() {
    if ((!applicant && !returningApplicant) || demo) return;
    setBusy(true); setError("");
    try {
      if (returningApplicant) await postJson("/api/auth/start", { role: "resume-applicant", documentType, documentNumber });
      else await postJson("/api/auth/start", { role: "applicant", email: applicant!.email });
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo reenviar el código."); }
    finally { setBusy(false); }
  }

  async function submitAnswers(kind: "attitude" | "aptitude") {
    if (demo) { if (kind === "attitude") { setPassedAttitude(true); forward("resultado"); } else { setPassedCommercial(true); forward("validacion"); } return; }
    const answers = kind === "attitude" ? attitudeAnswers : commercialAnswers;
    const assessment = config.assessments.find(item => item.kind === (kind === "attitude" ? "ATTITUDINAL" : "APTITUDINAL"));
    if (!assessment) { setError("La evaluación todavía no está disponible."); return; }
    setBusy(true); setError("");
    try {
      const result = await postJson("/api/apply", { action: kind, setId: assessment.id, answers: assessment.questions.map((question, index) => ({ questionId: question.id, optionIndex: answers[index] })) });
      if (kind === "attitude") { setPassedAttitude(!!result.passed); setAttitudeAttemptsRemaining(result.attemptsRemaining ?? 0); forward("resultado"); }
      else { setPassedCommercial(!!result.passed); setCommercialAttemptsRemaining(result.attemptsRemaining ?? 0); forward(result.passed ? "validacion" : "resultado-comercial"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron guardar las respuestas."); }
    finally { setBusy(false); }
  }

  async function retryAssessment(kind: "attitude" | "aptitude") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/apply", { cache: "no-store" });
      const refreshed = await response.json() as Config & { error?: string };
      if (!response.ok) throw new Error(refreshed.error || "No se pudo preparar un nuevo intento.");
      setConfig(refreshed);
      if (kind === "attitude") { setAttitudeAnswers({}); forward("actitud"); }
      else { setCommercialAnswers({}); forward("examen"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo preparar un nuevo intento."); }
    finally { setBusy(false); }
  }

  async function finish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) { forward("bienvenida"); return; }
    if (!config.termsUrl || !config.termsVersion || !accepted) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(event.currentTarget);
      form.set("termsVersion", config.termsVersion); form.set("accepted", "true");
      const response = await fetch("/api/apply", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo terminar la postulación.");
      forward("bienvenida");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo terminar la postulación."); }
    finally { setBusy(false); }
  }

  async function createPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(pin) || pin !== pinConfirmation) { setError("Crea un PIN de seis dígitos y repítelo correctamente."); return; }
    if (demo) { setPinCreated(true); return; }
    setBusy(true); setError("");
    try {
      await postJson("/api/auth/pin", { action: "create-pin", pin });
      setPinCreated(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear el PIN."); }
    finally { setBusy(false); }
  }

  const stepIndex = Math.max(0, steps.indexOf(step));
  const visibleAssessments = config.assessments.length ? config.assessments : demoAssessments;
  const attitudeAssessment = visibleAssessments.find(item => item.kind === "ATTITUDINAL");
  const aptitudeAssessment = visibleAssessments.find(item => item.kind === "APTITUDINAL");
  return <main className="apply-shell">
    <header className="workspace-header apply-header"><a href="/" className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Red comercial</small></span></a><span className="workspace-label">Postulación de vendedores</span></header>
    <div className="apply-frame">
      <aside className="apply-sidebar"><span className="eyebrow">TU CAMINO A LA RED</span><h1>Haz crecer tu cartera con Condomio.</h1><p>Conoce la propuesta, demuestra lo que sabes y completa tu postulación.</p><div className="apply-progress">{sidebarSteps.map(item => <button type="button" key={item} disabled={!demo} className={(item === "datos" && ["documento", "datos", "correo"].includes(step)) || item === step ? "current" : ""} onClick={() => forward(item)}><span>{String(steps.indexOf(item) + 1).padStart(2, "0")}</span>{labels[item]}</button>)}</div><small>{demo ? "Vista previa: los datos de esta pantalla no se guardan." : "Si ya comenzaste, validaremos tu correo y recuperaremos el último hito guardado."}</small></aside>
      <section className="apply-main"><div className="apply-topline"><span>{step === "correo" ? "VERIFICACIÓN DE CORREO" : `ETAPA ${stepIndex + 1} DE ${steps.length}`}</span><span>{demo ? "VISTA PREVIA DEL MVP" : "POSTULACIÓN"}</span></div>
        {error && <p role="alert" className="workspace-error">{error}</p>}
        {step === "documento" && <div className="apply-panel"><span className="card-kicker">01 / DATOS PERSONALES</span><h2>Empecemos con tu documento</h2><p>Primero verificaremos si ya tienes una postulación. Si existe, podrás continuar desde el último hito guardado.</p><form onSubmit={submitDocument}><div className="form-grid"><div className="form-field"><Label htmlFor="document-type">Tipo de documento</Label><Select value={documentType} onValueChange={setDocumentType}><SelectTrigger id="document-type" className="field-control"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DNI">DNI</SelectItem><SelectItem value="CE">Carné de extranjería</SelectItem><SelectItem value="PASAPORTE">Pasaporte</SelectItem></SelectContent></Select></div><div className="form-field"><Label htmlFor="document-number">Número de documento</Label><Input id="document-number" className="field-control" value={documentNumber} onChange={event => setDocumentNumber(event.target.value)} maxLength={20} autoComplete="username" required /></div></div><Button type="submit" className="apply-primary" disabled={busy || !documentNumber.trim()}>{busy ? "Validando…" : "Continuar"}</Button></form></div>}
        {step === "datos" && <div className="apply-panel"><span className="card-kicker">01 / DATOS PERSONALES</span><h2>Completa tus datos</h2><p>No encontramos una postulación asociada a tu documento. Cuéntanos un poco más sobre ti.</p><div className="resource-note document-summary"><strong>{documentType} · {documentNumber || "Documento por completar"}</strong><p>Este documento se usará para identificar tu postulación.</p></div><form onSubmit={submitProfile}><div className="form-grid"><Field name="firstName" label="Nombre" required /><Field name="paternalSurname" label="Apellido paterno" required /><Field name="maternalSurname" label="Apellido materno" required /><Field name="birthDate" label="Fecha de nacimiento" type="date" required /><Field name="phone" label="Teléfono" type="tel" required /><Field name="email" label="Correo electrónico" type="email" required /></div><Button type="submit" className="apply-primary" disabled={busy}>{busy ? "Enviando código…" : "Validar correo y continuar"}</Button></form></div>}
        {step === "correo" && <div className="apply-panel"><span className="card-kicker">VERIFICACIÓN DE CORREO</span><h2>{returningApplicant ? "Confirma que eres tú" : "Revisa tu correo"}</h2><p>Enviamos un código de seis dígitos a <strong>{returningApplicant ? maskedEmail || "tu correo registrado" : applicant?.email || "tu correo"}</strong>. {returningApplicant ? "Al validarlo recuperaremos tu postulación." : "Al validarlo guardaremos tus datos y podrás retomar la postulación más adelante."}</p><form onSubmit={verifyEmail}><div className="pin-creation"><PinInput label="Código de verificación" value={emailOtp} onChange={setEmailOtp} disabled={busy} /><small>El código es de uso único. Si no aparece, revisa la carpeta de correo no deseado.</small></div><div className="email-code-actions"><Button type="submit" className="apply-primary" disabled={busy || emailOtp.length !== 6}>{busy ? "Verificando…" : returningApplicant ? "Verificar y retomar" : "Verificar y continuar"}</Button><Button type="button" variant="ghost" disabled={busy || demo} onClick={() => void resendEmailCode()}>Reenviar código</Button></div></form></div>}
        {step === "actitud" && <div className="apply-panel"><span className="card-kicker">02 / EVALUACIÓN ACTITUDINAL</span><h2>¿Cómo actuarías?</h2><div className="assessment-guidance"><p>En Condomio queremos construir una red sólida y potente, alineada con nuestros valores y visión. Por ello, es muy importante conocer tu afinidad cultural. Marca la respuesta que consideres correcta.</p><small>Este intento contiene {attitudeAssessment?.questions.length ?? 0} preguntas elegidas al azar. La nota mínima vigente es {attitudeAssessment?.passPercentage ?? 75}%.</small></div><QuestionSet questions={attitudeAssessment?.questions ?? []} answers={attitudeAnswers} onAnswer={(index, value) => setAttitudeAnswers(current => ({ ...current, [index]: value }))} /><Button className="apply-primary" disabled={busy || !attitudeAssessment || Object.keys(attitudeAnswers).length < attitudeAssessment.questions.length} onClick={() => void submitAnswers("attitude")}>Enviar respuestas</Button></div>}
        {step === "resultado" && <div className="apply-panel result-panel"><span className="result-icon">{passedAttitude ? "✓" : "—"}</span><span className="card-kicker">03 / RESULTADO</span><h2>{passedAttitude ? "¡Excelente! Tienes una gran afinidad con nuestra cultura y visión." : attitudeAttemptsRemaining > 0 ? "Puedes volver a intentarlo" : "Gracias por completar la evaluación"}</h2><p>{passedAttitude ? "En el siguiente paso conocerás más sobre Condomio: cómo funciona la plataforma, cuáles son sus funcionalidades y cómo es nuestro proceso comercial, que es clave para registrar tus ventas." : attitudeAttemptsRemaining > 0 ? `Te queda${attitudeAttemptsRemaining === 1 ? "" : "n"} ${attitudeAttemptsRemaining} intento${attitudeAttemptsRemaining === 1 ? "" : "s"}. El próximo examen tendrá una nueva selección aleatoria.` : "Vamos a revisar tus respuestas y estaremos en contacto contigo."}</p>{passedAttitude ? <Button className="apply-primary" onClick={() => forward("conoce")}>Conocer Condomio</Button> : attitudeAttemptsRemaining > 0 && <Button className="apply-primary" disabled={busy} onClick={() => void retryAssessment("attitude")}>{busy ? "Preparando…" : "Volver a intentar"}</Button>}</div>}
        {step === "conoce" && <div className="apply-panel learn-panel"><span className="card-kicker">04 / CONOCE CONDOMIO</span><h2>Una mejor experiencia para la vida en edificios.</h2><p>Condomio es una solución para la gestión de edificios y condominios. La red comercial independiente identifica oportunidades y acompaña a los potenciales clientes durante el proceso de evaluación.</p><div className="learn-grid"><article><span>01</span><h3>Qué hacemos</h3><p>Ayudamos a organizar la información y la operación de comunidades residenciales.</p></article><article><span>02</span><h3>Cómo funciona</h3><p>El vendedor registra un edificio, crea una oportunidad y da seguimiento desde Contacto hasta Negociación.</p></article><article><span>03</span><h3>Modelo comercial</h3><p>Administración valida los contratos firmados. La comisión se muestra como precio unitario por número de departamentos.</p></article></div><div className="resource-note"><strong>Material comercial</strong>{config.materialsUrl ? <p><a href={config.materialsUrl} target="_blank" rel="noopener noreferrer">Descargar presentación o PDF oficial</a></p> : <p>Las presentaciones y PDF oficiales están pendientes de publicación.</p>}</div><Button className="apply-primary" onClick={() => forward("examen")}>Tomar evaluación comercial</Button></div>}
        {step === "examen" && <div className="apply-panel"><span className="card-kicker">05 / EVALUACIÓN APTITUDINAL</span><h2>Resuelve situaciones comerciales</h2><p>Este intento contiene {aptitudeAssessment?.questions.length ?? 0} preguntas elegidas al azar. La nota mínima vigente es {aptitudeAssessment?.passPercentage ?? 75}%.</p><QuestionSet questions={aptitudeAssessment?.questions ?? []} answers={commercialAnswers} onAnswer={(index, value) => setCommercialAnswers(current => ({ ...current, [index]: value }))} /><Button className="apply-primary" disabled={busy || !aptitudeAssessment || Object.keys(commercialAnswers).length < aptitudeAssessment.questions.length} onClick={() => void submitAnswers("aptitude")}>Enviar respuestas</Button></div>}
        {step === "resultado-comercial" && <div className="apply-panel result-panel"><span className="result-icon">—</span><h2>Aún no superaste esta evaluación</h2><p>{commercialAttemptsRemaining > 0 ? `Te queda${commercialAttemptsRemaining === 1 ? "" : "n"} ${commercialAttemptsRemaining} intento${commercialAttemptsRemaining === 1 ? "" : "s"}. El próximo tendrá preguntas elegidas nuevamente al azar.` : "No quedan intentos disponibles. Conservaremos tu postulación para revisión."}</p>{commercialAttemptsRemaining > 0 && <Button className="apply-primary" disabled={busy} onClick={() => void retryAssessment("aptitude")}>{busy ? "Preparando…" : "Volver a intentar con nuevas preguntas"}</Button>}</div>}
        {step === "validacion" && <div className="apply-panel"><span className="card-kicker">06 / VALIDACIÓN FINAL</span><h2>Últimos datos para incorporarte</h2><p>Estos datos se usarán para identificarte y gestionar el pago de comisiones.</p><form onSubmit={finish}><div className="form-grid preview-fields"><Field name="photo" label="Foto del documento de identidad" type="file" accept="image/jpeg,image/png,image/webp" disabled={!config.termsUrl || demo} required={!demo} /><Field name="bankAccount" label="Número de cuenta bancaria" inputMode="numeric" disabled={!config.termsUrl || demo} required={!demo} /><Field name="cci" label="CCI (20 dígitos)" inputMode="numeric" maxLength={20} disabled={!config.termsUrl || demo} required={!demo} /></div><div className="resource-note"><strong>Condiciones de participación</strong>{config.termsUrl ? <p><a href={config.termsUrl} target="_blank" rel="noopener noreferrer">Leer las condiciones oficiales</a></p> : <p>El documento oficial de condiciones está pendiente. No podemos recibir datos bancarios ni documentos hasta que esté disponible.</p>}<label className="checkbox-label"><Checkbox checked={accepted} disabled={!config.termsUrl && !demo} onCheckedChange={value => setAccepted(value === true)} /><span>He leído y acepto las condiciones de participación.</span></label></div><Button type="submit" className="apply-primary" disabled={busy || !accepted || (!passedCommercial && !demo) || (!config.termsUrl && !demo)}>{demo ? "Ver pantalla de bienvenida" : busy ? "Guardando…" : "Finalizar postulación"}</Button></form></div>}
        {step === "bienvenida" && <div className="apply-panel result-panel"><span className="result-icon">✓</span><span className="card-kicker">07 / BIENVENIDA</span><h2>Bienvenido a la red comercial independiente de Condomio{applicant?.firstName ? `, ${applicant.firstName}` : ""}.</h2>{pinCreated ? <><p>Tu PIN fue creado correctamente. Ya puedes ingresar con tu documento y estos seis dígitos.</p>{demo && <p className="demo-disclaimer">Esta vista previa no ha creado tu cuenta ni guardado información.</p>}<a className="portal-link" href="/ingresar">Ir al acceso de vendedores</a></> : <><p>Crea ahora el PIN personal de seis dígitos que usarás para acceder a tu portal.</p><form onSubmit={createPin}><div className="pin-creation"><PinInput label="Crea tu PIN" value={pin} onChange={setPin} disabled={busy} /><PinInput label="Repite tu PIN" value={pinConfirmation} onChange={setPinConfirmation} disabled={busy} /><small>No uses tu fecha de nacimiento ni compartas este PIN con otras personas.</small></div><Button type="submit" className="apply-primary" disabled={busy || pin.length !== 6 || pinConfirmation.length !== 6}>{busy ? "Creando PIN…" : "Crear PIN y activar mi acceso"}</Button></form></>}</div>}
      </section>
    </div>
  </main>;
}

function Field({ name, label, ...props }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <div className="form-field"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} className="field-control" {...props} /></div>; }
function QuestionSet({ questions, answers, onAnswer }: { questions: readonly AssessmentQuestion[]; answers: Record<number, number>; onAnswer: (index: number, value: number) => void }) { return <div className="question-list">{questions.map((item, index) => <fieldset key={item.id} className="question-card"><legend><span>{String(index + 1).padStart(2, "0")}</span>{item.prompt}</legend><div>{item.options.map((option, optionIndex) => <label key={option} className={answers[index] === optionIndex ? "selected" : ""}><input type="radio" name={`question-${index}`} checked={answers[index] === optionIndex} onChange={() => onAnswer(index, optionIndex)} />{option}</label>)}</div></fieldset>)}</div>; }
