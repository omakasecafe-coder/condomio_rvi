"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useResendCountdown } from "@/lib/use-resend-countdown";

type Step = "datos" | "correo" | "actitud" | "resultado" | "conoce" | "examen" | "resultado-comercial" | "validacion" | "bienvenida";
type Applicant = { firstName: string; paternalSurname: string; maternalSurname: string; documentType: string; documentNumber: string; birthDate: string; phone: string; email: string };
type AssessmentQuestion = { id: string; prompt: string; options: string[] };
type PublishedAssessment = { id: string; kind: "ATTITUDINAL" | "APTITUDINAL"; name: string; version: number; passPercentage: number; allowedAttempts: number; randomizeQuestions: boolean; questions: AssessmentQuestion[] };
type Config = { termsUrl: string | null; termsVersion: string | null; materialsUrl: string | null; acceptingApplications: boolean; assessments: PublishedAssessment[] };
const steps: Step[] = ["datos", "correo", "actitud", "resultado", "conoce", "examen", "validacion", "bienvenida"];
const labels: Record<Step, string> = { datos: "Datos personales", correo: "Verifica tu correo", actitud: "Evaluación actitudinal", resultado: "Resultado", conoce: "Conoce Condomio", examen: "Evaluación aptitudinal", "resultado-comercial": "Resultado aptitudinal", validacion: "Validación final", bienvenida: "Bienvenida" };
const demoAssessments: PublishedAssessment[] = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "ATTITUDINAL", name: "Evaluación actitudinal", version: 1, passPercentage: 75, allowedAttempts: 1, randomizeQuestions: false, questions: [
    { id: "11111111-1111-4111-8111-111111111101", prompt: "Un edificio quiere conocer el servicio, pero aún no decide. ¿Qué haces?", options: ["Insisto en que firme hoy", "Escucho sus necesidades y acuerdo un siguiente paso", "Dejo de contactarlo"] },
    { id: "11111111-1111-4111-8111-111111111102", prompt: "Un cliente pide una función que no sabes si existe. ¿Cómo respondes?", options: ["Prometo que sí existe", "Le digo que no se puede sin consultar", "Verifico la información antes de comprometerme"] },
  ] },
  { id: "22222222-2222-4222-8222-222222222222", kind: "APTITUDINAL", name: "Evaluación aptitudinal comercial", version: 1, passPercentage: 75, allowedAttempts: 2, randomizeQuestions: false, questions: [
    { id: "22222222-2222-4222-8222-222222222201", prompt: "Un edificio tiene 50 departamentos y el plan cuesta S/ 4 por departamento. ¿Cuál es el ingreso mensual?", options: ["S/ 54", "S/ 200", "S/ 500"] },
    { id: "22222222-2222-4222-8222-222222222202", prompt: "El contacto necesita aprobación de la junta. ¿Cuál es el mejor siguiente paso?", options: ["Marcar la venta como ganada", "Acordar la presentación a la junta", "Cerrar la oportunidad"] },
  ] },
];

export default function ApplyPage() {
  const [step, setStep] = useState<Step>("datos");
  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [attitudeAnswers, setAttitudeAnswers] = useState<Record<number, number>>({});
  const [commercialAnswers, setCommercialAnswers] = useState<Record<number, number>>({});
  const [passedAttitude, setPassedAttitude] = useState(false);
  const [passedCommercial, setPassedCommercial] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { seconds: resendSeconds, restart: restartResend, canResend } = useResendCountdown();
  const [config, setConfig] = useState<Config>({ termsUrl: null, termsVersion: null, materialsUrl: null, acceptingApplications: false, assessments: [] });
  const restoredDraft = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("paso") as Step | null;
    if (requested && labels[requested]) {
      // Query parameters seed deterministic demo views after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(requested); setDemo(true);
      if (requested === "resultado" && params.get("aprobado") === "1") setPassedAttitude(true);
      if (requested === "validacion" || requested === "bienvenida") setPassedCommercial(true);
    }
    if (params.get("verified") === "1" && !restoredDraft.current) {
      restoredDraft.current = true;
      const rawDraft = window.localStorage.getItem("condomio-application-draft");
      if (rawDraft) {
        try {
          const draft = JSON.parse(rawDraft) as Applicant;
          setApplicant(draft); setBusy(true);
          fetch("/api/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "profile", data: draft }) })
            .then(async response => {
              const result = await response.json() as { error?: string };
              if (!response.ok) throw new Error(result.error || "No se pudo continuar la postulación.");
              window.localStorage.removeItem("condomio-application-draft");
              setStep("actitud"); window.history.replaceState({}, "", "/postular"); window.scrollTo({ top: 0 });
            })
            .catch(cause => setError(cause instanceof Error ? cause.message : "No se pudo continuar la postulación."))
            .finally(() => setBusy(false));
        } catch { setError("No pudimos recuperar los datos de tu postulación."); }
      } else { setError("No encontramos los datos de tu postulación. Completa el formulario nuevamente."); }
    }
    fetch("/api/apply", { cache: "no-store" }).then(response => response.json() as Promise<Config>).then(setConfig).catch(() => undefined);
  }, []);
  useEffect(() => { document.title = `${labels[step]} · Condomio MVP`; }, [step]);
  const forward = (next: Step) => { setError(""); setStep(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function postJson(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string; passed?: boolean };
    if (!response.ok) throw new Error(data.error || "No se pudo continuar.");
    return data;
  }

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data: Applicant = {
      firstName: String(form.get("firstName") || ""), paternalSurname: String(form.get("paternalSurname") || ""), maternalSurname: String(form.get("maternalSurname") || ""),
      documentType: String(form.get("documentType") || "DNI"), documentNumber: String(form.get("documentNumber") || ""), birthDate: String(form.get("birthDate") || ""),
      phone: String(form.get("phone") || ""), email: String(form.get("email") || "").trim().toLowerCase(),
    };
    setApplicant(data);
    if (demo) { forward("actitud"); return; }
    if (!config.acceptingApplications) { setError("Las postulaciones aún no están habilitadas. No se han enviado tus datos."); return; }
    setBusy(true); setError("");
    try {
      window.localStorage.setItem("condomio-application-draft", JSON.stringify(data));
      await postJson("/api/auth/start", { role: "applicant", email: data.email }); restartResend(); forward("correo");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo enviar el enlace."); }
    finally { setBusy(false); }
  }

  async function resendEmailLink() {
    if (!applicant || !canResend || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await postJson("/api/auth/start", { role: "applicant", email: applicant.email });
      restartResend();
      setNotice("Enviamos un enlace nuevo. Revisa también la carpeta de spam.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo reenviar el enlace."); }
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
      if (kind === "attitude") { setPassedAttitude(!!result.passed); forward("resultado"); }
      else { setPassedCommercial(!!result.passed); forward(result.passed ? "validacion" : "resultado-comercial"); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron guardar las respuestas."); }
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

  const stepIndex = Math.max(0, steps.indexOf(step));
  const visibleAssessments = config.assessments.length ? config.assessments : demoAssessments;
  const attitudeAssessment = visibleAssessments.find(item => item.kind === "ATTITUDINAL");
  const aptitudeAssessment = visibleAssessments.find(item => item.kind === "APTITUDINAL");
  return <main className="apply-shell">
    <header className="workspace-header apply-header"><Link href="/" className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Red comercial</small></span></Link><span className="workspace-label">Postulación de vendedores</span></header>
    <div className="apply-frame">
      <aside className="apply-sidebar"><span className="eyebrow">TU CAMINO A LA RED</span><h1>Haz crecer tu cartera con Condomio.</h1><p>Conoce la propuesta, demuestra lo que sabes y completa tu postulación.</p><div className="apply-progress">{steps.map((item, index) => <button type="button" key={item} disabled={!demo} className={item === step ? "current" : ""} onClick={() => forward(item)}><span>{String(index + 1).padStart(2, "0")}</span>{labels[item]}</button>)}</div><small>{demo ? "Vista previa: los datos de esta pantalla no se guardan." : "Tus datos se guardarán solo después de verificar tu correo."}</small></aside>
      <section className="apply-main"><div className="apply-topline"><span>ETAPA {stepIndex + 1} DE {steps.length}</span><span>{demo ? "VISTA PREVIA DEL MVP" : "POSTULACIÓN"}</span></div>
        {error && <p role="alert" className="workspace-error">{error}</p>}
        {step === "datos" && <div className="apply-panel"><span className="card-kicker">01 / POSTULACIÓN</span><h2>Cuéntanos sobre ti</h2><p>Verificaremos tu correo antes de guardar tus datos.</p><form onSubmit={submitProfile}><div className="form-grid"><Field name="firstName" label="Nombre" required /><Field name="paternalSurname" label="Apellido paterno" required /><Field name="maternalSurname" label="Apellido materno" required /><SelectField name="documentType" label="Tipo de documento" values={["DNI", "CE", "PASAPORTE"]} /><Field name="documentNumber" label="Número de documento" required /><Field name="birthDate" label="Fecha de nacimiento" type="date" required /><Field name="phone" label="Teléfono" type="tel" required /><Field name="email" label="Correo electrónico" type="email" required /></div><Button type="submit" className="apply-primary" disabled={busy}>{busy ? "Enviando enlace…" : "Continuar a evaluación"}</Button></form></div>}
        {step === "correo" && <div className="apply-panel"><span className="card-kicker">02 / VERIFICACIÓN</span><h2>Revisa tu correo</h2><p>Enviamos un enlace de verificación a {applicant?.email}. Ábrelo para continuar tu postulación.</p>{notice && <p role="status" className="form-notice">{notice}</p>}<div className="resend-row" aria-live="polite">{canResend ? <button type="button" className="resend-button" onClick={() => void resendEmailLink()} disabled={busy || !applicant}>{busy ? "Reenviando…" : "Reenviar enlace"}</button> : <span>Podrás reenviar en {resendSeconds} s</span>}</div></div>}
        {step === "actitud" && <div className="apply-panel"><span className="card-kicker">03 / EVALUACIÓN ACTITUDINAL</span><h2>¿Cómo actuarías?</h2><p>Selecciona la respuesta que mejor refleja tu forma de trabajar. La nota mínima vigente es {attitudeAssessment?.passPercentage ?? 75}%.</p><QuestionSet questions={attitudeAssessment?.questions ?? []} answers={attitudeAnswers} onAnswer={(index, value) => setAttitudeAnswers(current => ({ ...current, [index]: value }))} /><Button className="apply-primary" disabled={busy || !attitudeAssessment || Object.keys(attitudeAnswers).length < attitudeAssessment.questions.length} onClick={() => void submitAnswers("attitude")}>Ver resultado</Button></div>}
        {step === "resultado" && <div className="apply-panel result-panel"><span className="result-icon">{passedAttitude ? "✓" : "—"}</span><span className="card-kicker">04 / RESULTADO</span><h2>{passedAttitude ? "¡Felicitaciones, has superado la prueba!" : "Gracias por tu interés"}</h2><p>{passedAttitude ? "Ya puedes conocer Condomio y continuar con la siguiente evaluación." : "Conservaremos tu postulación y nos pondremos en contacto contigo más adelante."}</p>{passedAttitude && <Button className="apply-primary" onClick={() => forward("conoce")}>Conocer Condomio</Button>}</div>}
        {step === "conoce" && <div className="apply-panel learn-panel"><span className="card-kicker">05 / CONOCE CONDOMIO</span><h2>Una mejor experiencia para la vida en edificios.</h2><p>Condomio es una solución para la gestión de edificios y condominios. La red comercial independiente identifica oportunidades y acompaña a los potenciales clientes durante el proceso de evaluación.</p><div className="learn-grid"><article><span>01</span><h3>Qué hacemos</h3><p>Ayudamos a organizar la información y la operación de comunidades residenciales.</p></article><article><span>02</span><h3>Cómo funciona</h3><p>El vendedor registra un edificio, crea una oportunidad y da seguimiento desde Contacto hasta Negociación.</p></article><article><span>03</span><h3>Modelo comercial</h3><p>Administración valida los contratos firmados. La comisión se muestra como precio unitario por número de departamentos.</p></article></div><div className="resource-note"><strong>Material comercial</strong>{config.materialsUrl ? <p><a href={config.materialsUrl} target="_blank" rel="noopener noreferrer">Descargar presentación o PDF oficial</a></p> : <p>Las presentaciones y PDF oficiales están pendientes de publicación.</p>}</div><Button className="apply-primary" onClick={() => forward("examen")}>Tomar evaluación comercial</Button></div>}
        {step === "examen" && <div className="apply-panel"><span className="card-kicker">06 / EVALUACIÓN APTITUDINAL</span><h2>Resuelve situaciones comerciales</h2><p>Evalúa razonamiento, criterio comercial y capacidad para organizar oportunidades. La nota mínima vigente es {aptitudeAssessment?.passPercentage ?? 75}%.</p><QuestionSet questions={aptitudeAssessment?.questions ?? []} answers={commercialAnswers} onAnswer={(index, value) => setCommercialAnswers(current => ({ ...current, [index]: value }))} /><Button className="apply-primary" disabled={busy || !aptitudeAssessment || Object.keys(commercialAnswers).length < aptitudeAssessment.questions.length} onClick={() => void submitAnswers("aptitude")}>Enviar respuestas</Button></div>}
        {step === "resultado-comercial" && <div className="apply-panel result-panel"><span className="result-icon">—</span><h2>Aún no superaste esta evaluación</h2><p>Revisa la información de Condomio y vuelve a intentarlo.</p><Button className="apply-primary" onClick={() => { setCommercialAnswers({}); forward("conoce"); }}>Volver al contenido</Button></div>}
        {step === "validacion" && <div className="apply-panel"><span className="card-kicker">07 / VALIDACIÓN FINAL</span><h2>Últimos datos para incorporarte</h2><p>Estos datos se usarán para identificarte y gestionar el pago de comisiones.</p><form onSubmit={finish}><div className="form-grid preview-fields"><Field name="photo" label="Foto del documento de identidad" type="file" accept="image/jpeg,image/png,image/webp" disabled={!config.termsUrl || demo} required={!demo} /><Field name="bankAccount" label="Número de cuenta bancaria" inputMode="numeric" disabled={!config.termsUrl || demo} required={!demo} /><Field name="cci" label="CCI (20 dígitos)" inputMode="numeric" maxLength={20} disabled={!config.termsUrl || demo} required={!demo} /></div><div className="resource-note"><strong>Condiciones de participación</strong>{config.termsUrl ? <p><a href={config.termsUrl} target="_blank" rel="noopener noreferrer">Leer las condiciones oficiales</a></p> : <p>El documento oficial de condiciones está pendiente. No podemos recibir datos bancarios ni documentos hasta que esté disponible.</p>}<label className="checkbox-label"><Checkbox checked={accepted} disabled={!config.termsUrl && !demo} onCheckedChange={value => setAccepted(value === true)} /><span>He leído y acepto las condiciones de participación.</span></label></div><Button type="submit" className="apply-primary" disabled={busy || !accepted || (!passedCommercial && !demo) || (!config.termsUrl && !demo)}>{demo ? "Ver pantalla de bienvenida" : busy ? "Guardando…" : "Finalizar postulación"}</Button></form></div>}
        {step === "bienvenida" && <div className="apply-panel result-panel"><span className="result-icon">✓</span><span className="card-kicker">08 / BIENVENIDA</span><h2>Bienvenido a la red comercial independiente de Condomio{applicant?.firstName ? `, ${applicant.firstName}` : ""}.</h2><p>Ya puedes acceder con tu documento y un enlace enviado a tu correo registrado. Los materiales comerciales estarán disponibles cuando Condomio los publique.</p>{demo && <p className="demo-disclaimer">Esta vista previa no ha enviado tu postulación ni correo alguno.</p>}<Link className="portal-link" href="/">Ir al acceso de vendedores</Link></div>}
      </section>
    </div>
  </main>;
}

function Field({ name, label, ...props }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <div className="form-field"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} className="field-control" {...props} /></div>; }
function SelectField({ name, label, values }: { name: string; label: string; values: string[] }) { const [value, setValue] = useState(values[0]); return <div className="form-field"><Label htmlFor={name}>{label}</Label><input type="hidden" name={name} value={value} /><Select value={value} onValueChange={setValue}><SelectTrigger id={name} className="field-control"><SelectValue /></SelectTrigger><SelectContent>{values.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>; }
function QuestionSet({ questions, answers, onAnswer }: { questions: readonly AssessmentQuestion[]; answers: Record<number, number>; onAnswer: (index: number, value: number) => void }) { return <div className="question-list">{questions.map((item, index) => <fieldset key={item.id} className="question-card"><legend><span>{String(index + 1).padStart(2, "0")}</span>{item.prompt}</legend><div>{item.options.map((option, optionIndex) => <label key={option} className={answers[index] === optionIndex ? "selected" : ""}><input type="radio" name={`question-${index}`} checked={answers[index] === optionIndex} onChange={() => onAnswer(index, optionIndex)} />{option}</label>)}</div></fieldset>)}</div>; }
