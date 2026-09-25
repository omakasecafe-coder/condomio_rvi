"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, UserRound, ClipboardCheck, Building2, Plus, Trash2, Pencil, History, Eye, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AssessmentKind = "ATTITUDINAL" | "APTITUDINAL";
type Attempt = {
  id: string; kind: AssessmentKind; attempt_number: number; score: number; max_score: number;
  percentage: number; passed: boolean; knockout_failed: boolean; completed_at: string;
  assessment_sets: { name: string; version: number } | null;
};
type Applicant = {
  id: string; document_type: string; document_number: string; email: string; first_name: string;
  paternal_surname: string; maternal_surname: string; birth_date: string; phone: string; status: string;
  application_stage: string; attitude_score: number | null; aptitude_score: number | null;
  identity_document_path: string | null; terms_accepted_at: string | null; created_at: string; updated_at: string;
  assessment_attempts: Attempt[];
};
type Question = {
  id?: string; position: number; prompt: string; options: string[]; correct_option: number; is_knockout: boolean;
};
type AssessmentSet = {
  id: string; kind: AssessmentKind; name: string; version: number; status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  pass_percentage: number; allowed_attempts: number; randomize_questions: boolean;
  published_at: string | null; created_at: string; updated_at: string; assessment_questions: Question[];
};
type Opportunity = { id: string; plan: string; unit_price_cents: number; status: string; commission_cents: number | null; payment_status: string | null };
type Building = { id: string; seller_id: string; building_name: string; apartments: number; district: string; seller_profiles: { id: string; first_name: string; paternal_surname: string }; opportunities: Opportunity[] };
type AdminData = { applicants: Applicant[]; assessmentSets: AssessmentSet[]; buildings: Building[] };
type Item = { building: Building; opportunity: Opportunity };

const stageLabels: Record<string, string> = {
  REGISTERED: "Registrado", ACTITUDINAL: "Evaluación actitudinal", APTITUDINAL: "Evaluación aptitudinal",
  TRAINING: "Capacitación", KNOWLEDGE: "Conocimiento", VALIDATION: "Validación documental",
  CONTRACT: "Contrato", ACTIVE: "Vendedor activo", REJECTED: "Rechazado", SUSPENDED: "Suspendido",
};
const kindLabels: Record<AssessmentKind, string> = { ATTITUDINAL: "Actitudinal", APTITUDINAL: "Aptitudinal" };
const money = (cents: number) => `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const latestAttempt = (applicant: Applicant, kind: AssessmentKind) =>
  [...(applicant.assessment_attempts || [])].filter(item => item.kind === kind).sort((a, b) => b.attempt_number - a.attempt_number)[0];

const sampleData: AdminData = {
  applicants: [
    { id: "p-1", document_type: "DNI", document_number: "74281930", email: "valeria@example.com", first_name: "Valeria", paternal_surname: "Ramos", maternal_surname: "León", birth_date: "1992-05-14", phone: "987654321", status: "APPLICANT", application_stage: "VALIDATION", attitude_score: 4, aptitude_score: 3, identity_document_path: null, terms_accepted_at: null, created_at: "2026-09-24T14:30:00Z", updated_at: "2026-09-24T15:10:00Z", assessment_attempts: [
      { id: "t-1", kind: "ATTITUDINAL", attempt_number: 1, score: 4, max_score: 4, percentage: 100, passed: true, knockout_failed: false, completed_at: "2026-09-24T14:50:00Z", assessment_sets: { name: "Evaluación actitudinal", version: 1 } },
      { id: "t-2", kind: "APTITUDINAL", attempt_number: 1, score: 3, max_score: 4, percentage: 75, passed: true, knockout_failed: false, completed_at: "2026-09-24T15:10:00Z", assessment_sets: { name: "Evaluación aptitudinal comercial", version: 1 } },
    ] },
    { id: "p-2", document_type: "CE", document_number: "001928374", email: "mateo@example.com", first_name: "Mateo", paternal_surname: "Flores", maternal_surname: "Silva", birth_date: "1988-11-02", phone: "945111222", status: "APPLICANT", application_stage: "APTITUDINAL", attitude_score: 3, aptitude_score: null, identity_document_path: null, terms_accepted_at: null, created_at: "2026-09-23T11:20:00Z", updated_at: "2026-09-23T11:40:00Z", assessment_attempts: [
      { id: "t-3", kind: "ATTITUDINAL", attempt_number: 1, score: 3, max_score: 4, percentage: 75, passed: true, knockout_failed: false, completed_at: "2026-09-23T11:40:00Z", assessment_sets: { name: "Evaluación actitudinal", version: 1 } },
    ] },
  ],
  assessmentSets: [
    { id: "s-1", kind: "ATTITUDINAL", name: "Evaluación actitudinal", version: 1, status: "PUBLISHED", pass_percentage: 75, allowed_attempts: 1, randomize_questions: false, published_at: "2026-09-18T10:00:00Z", created_at: "2026-09-18T10:00:00Z", updated_at: "2026-09-18T10:00:00Z", assessment_questions: [] },
    { id: "s-2", kind: "APTITUDINAL", name: "Evaluación aptitudinal comercial", version: 1, status: "PUBLISHED", pass_percentage: 75, allowed_attempts: 2, randomize_questions: false, published_at: "2026-09-18T10:00:00Z", created_at: "2026-09-18T10:00:00Z", updated_at: "2026-09-18T10:00:00Z", assessment_questions: [] },
  ],
  buildings: [],
};

export default function AdminPage() {
  const [data, setData] = useState<AdminData>({ applicants: [], assessmentSets: [], buildings: [] });
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [demo, setDemo] = useState(false);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("ALL");
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Applicant | null>(null);
  const [editingSet, setEditingSet] = useState<AssessmentSet | null>(null);
  const [viewingSet, setViewingSet] = useState<AssessmentSet | null>(null);

  const reload = useCallback(async () => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      setDemo(true); setData(sampleData); setLoading(false); return;
    }
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/admin/login"); return; }
      const result = (await response.json()) as AdminData & { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar los datos.");
      setData(result); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Initial data loading intentionally synchronizes API state into the view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  useEffect(() => { document.title = "Administración · Red comercial Condomio"; }, []);

  async function post(body: unknown) {
    if (demo) throw new Error("Esta es una muestra visual. Los cambios no se guardan.");
    const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string; setId?: string };
    if (!response.ok) throw new Error(result.error || "No se pudo guardar el cambio.");
    return result;
  }

  async function createVersion(kind: AssessmentKind) {
    setBusy(kind); setError(""); setNotice("");
    try {
      await post({ action: "createAssessmentVersion", kind });
      await reload(); setNotice("Nueva versión creada como borrador.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear la versión."); }
    finally { setBusy(null); }
  }

  async function saveSet(set: AssessmentSet, publish = false) {
    setBusy(set.id); setError(""); setNotice("");
    try {
      await post({
        action: "saveAssessmentSet", setId: set.id, name: set.name,
        passPercentage: set.pass_percentage, allowedAttempts: set.allowed_attempts,
        randomizeQuestions: set.randomize_questions,
        questions: set.assessment_questions.map((question, index) => ({
          position: index + 1, prompt: question.prompt, options: question.options,
          correctOption: question.correct_option, isKnockout: question.is_knockout,
        })),
      });
      if (publish) await post({ action: "publishAssessmentSet", setId: set.id });
      setEditingSet(null); await reload();
      setNotice(publish ? "La nueva versión quedó publicada." : "Borrador guardado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la evaluación."); }
    finally { setBusy(null); }
  }

  async function act(item: Item, action: "markWon" | "markPaid") {
    setBusy(item.opportunity.id); setError("");
    try {
      await post({ action, opportunityId: item.opportunity.id, contractSigned: action === "markWon" ? !!checks[item.opportunity.id] : undefined });
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio."); }
    finally { setBusy(null); }
  }

  async function setSellerStatus(seller: Applicant, status: "ACTIVE" | "SUSPENDED") {
    setBusy(seller.id); setError(""); setNotice("");
    try {
      await post({ action: "setSellerStatus", sellerId: seller.id, status });
      setSelectedSeller(null); await reload();
      setNotice(status === "SUSPENDED" ? "El vendedor quedó suspendido." : "El vendedor fue reactivado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo actualizar al vendedor."); }
    finally { setBusy(null); }
  }

  const applicants = useMemo(() => data.applicants.filter(applicant => {
    const text = `${applicant.first_name} ${applicant.paternal_surname} ${applicant.maternal_surname} ${applicant.email} ${applicant.document_number}`.toLowerCase();
    return !["ACTIVE", "SUSPENDED"].includes(applicant.status) && text.includes(query.toLowerCase()) && (stage === "ALL" || applicant.application_stage === stage);
  }), [data.applicants, query, stage]);
  const applicantRecords = data.applicants.filter(item => !["ACTIVE", "SUSPENDED"].includes(item.status));
  const sellerRecords = data.applicants.filter(item => ["ACTIVE", "SUSPENDED"].includes(item.status));
  const active = sellerRecords.filter(item => item.status === "ACTIVE").length;
  const passed = applicantRecords.filter(item => latestAttempt(item, "ATTITUDINAL")?.passed && latestAttempt(item, "APTITUDINAL")?.passed).length;
  const all = data.buildings.flatMap(building => building.opportunities.map(opportunity => ({ building, opportunity })));
  const pending = all.filter(item => item.opportunity.status === "NEGOCIACIÓN");
  const won = all.filter(item => item.opportunity.status === "GANADO");

  return <main className="mvp-shell workspace-shell admin-shell">
    <header className="workspace-header"><div className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Administración</small></span></div><span className="workspace-label">Red comercial</span></header>
    <section className="workspace-content admin-content">
      {demo && <p className="demo-banner">Vista de muestra · datos ficticios · sin guardado</p>}
      <div className="workspace-heading admin-heading"><div><span className="eyebrow">RED COMERCIAL</span><h1>Personas y evaluaciones</h1><p>Administra postulantes, resultados y versiones de cada evaluación.</p></div></div>
      <div className="metric-row admin-metrics"><div><span>Registrados</span><strong>{data.applicants.length}</strong></div><div><span>Ambas pruebas aprobadas</span><strong>{passed}</strong></div><div><span>Vendedores activos</span><strong>{active}</strong></div><div><span>En validación</span><strong>{data.applicants.filter(item => item.application_stage === "VALIDATION").length}</strong></div></div>
      {error && <p role="alert" className="workspace-error">{error}</p>}
      {notice && <p role="status" className="workspace-success">{notice}</p>}

      <Tabs defaultValue="applicants" className="admin-tabs">
        <TabsList variant="line" className="admin-tab-list">
          <TabsTrigger value="applicants"><UserRound /> Postulantes</TabsTrigger>
          <TabsTrigger value="sellers"><UserCheck /> Vendedores</TabsTrigger>
          <TabsTrigger value="assessments"><ClipboardCheck /> Evaluaciones</TabsTrigger>
          <TabsTrigger value="commercial"><Building2 /> Gestión comercial</TabsTrigger>
        </TabsList>

        <TabsContent value="applicants" className="admin-tab-panel">
          <div className="admin-toolbar">
            <div className="admin-search"><Search aria-hidden="true" /><Input aria-label="Buscar postulantes" placeholder="Buscar por nombre, documento o correo" value={query} onChange={event => setQuery(event.target.value)} /></div>
            <label className="stage-filter"><SlidersHorizontal aria-hidden="true" /><span className="sr-only">Filtrar por etapa</span><select value={stage} onChange={event => setStage(event.target.value)}><option value="ALL">Todas las etapas</option>{Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <div className="admin-table-card">
            {loading ? <p className="empty-state">Cargando postulantes…</p> : applicants.length ? <Table>
              <TableHeader><TableRow><TableHead>Postulante</TableHead><TableHead>Etapa actual</TableHead><TableHead>Actitudinal</TableHead><TableHead>Aptitudinal</TableHead><TableHead>Registro</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
              <TableBody>{applicants.map(applicant => {
                const attitude = latestAttempt(applicant, "ATTITUDINAL"); const aptitude = latestAttempt(applicant, "APTITUDINAL");
                return <TableRow key={applicant.id}>
                  <TableCell><button className="person-cell" onClick={() => setSelectedApplicant(applicant)}><span>{applicant.first_name.charAt(0)}{applicant.paternal_surname.charAt(0)}</span><span><strong>{applicant.first_name} {applicant.paternal_surname}</strong><small>{applicant.document_type} {applicant.document_number}</small></span></button></TableCell>
                  <TableCell><StageChip stage={applicant.application_stage} /></TableCell>
                  <TableCell><ScoreCell attempt={attitude} /></TableCell>
                  <TableCell><ScoreCell attempt={aptitude} /></TableCell>
                  <TableCell>{date(applicant.created_at)}</TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={() => setSelectedApplicant(applicant)}>Ver ficha</Button></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table> : <p className="empty-state">No encontramos postulantes con esos filtros.</p>}
          </div>
        </TabsContent>

        <TabsContent value="sellers" className="admin-tab-panel">
          <div className="section-title"><h2>Maestra de vendedores</h2><span>{sellerRecords.length} vendedores</span></div>
          <div className="admin-table-card">
            {loading ? <p className="empty-state">Cargando vendedores…</p> : sellerRecords.length ? <Table>
              <TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead>Estado</TableHead><TableHead>Edificios</TableHead><TableHead>Oportunidades</TableHead><TableHead>Comisiones ganadas</TableHead><TableHead><span className="sr-only">Acciones</span></TableHead></TableRow></TableHeader>
              <TableBody>{sellerRecords.map(seller => {
                const buildings = data.buildings.filter(building => building.seller_id === seller.id);
                const opportunities = buildings.flatMap(building => building.opportunities);
                const commissions = opportunities.filter(item => item.status === "GANADO").reduce((sum, item) => sum + Number(item.commission_cents || 0), 0);
                return <TableRow key={seller.id}>
                  <TableCell><button className="person-cell" onClick={() => setSelectedSeller(seller)}><span>{seller.first_name.charAt(0)}{seller.paternal_surname.charAt(0)}</span><span><strong>{seller.first_name} {seller.paternal_surname}</strong><small>{seller.email}</small></span></button></TableCell>
                  <TableCell><StageChip stage={seller.status} /></TableCell>
                  <TableCell>{buildings.length}</TableCell>
                  <TableCell>{opportunities.length}</TableCell>
                  <TableCell><strong>{money(commissions)}</strong></TableCell>
                  <TableCell><Button variant="outline" size="sm" onClick={() => setSelectedSeller(seller)}>Administrar</Button></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table> : <p className="empty-state">Todavía no hay vendedores activos o suspendidos.</p>}
          </div>
        </TabsContent>

        <TabsContent value="assessments" className="admin-tab-panel">
          <div className="assessment-grid">{(["ATTITUDINAL", "APTITUDINAL"] as AssessmentKind[]).map(kind => {
            const sets = data.assessmentSets.filter(item => item.kind === kind);
            const published = sets.find(item => item.status === "PUBLISHED");
            const draft = sets.find(item => item.status === "DRAFT");
            return <section className="assessment-card" key={kind}>
              <div className="assessment-card-head"><div><span className="assessment-icon">{kind === "ATTITUDINAL" ? "A" : "P"}</span><div><span className="record-label">EVALUACIÓN {kindLabels[kind].toUpperCase()}</span><h2>{published?.name || kindLabels[kind]}</h2></div></div><span className="status-chip paid">Publicada</span></div>
              <div className="assessment-summary"><div><span>Versión activa</span><strong>v{published?.version ?? "—"}</strong></div><div><span>Preguntas</span><strong>{published?.assessment_questions.length ?? 0}</strong></div><div><span>Nota mínima</span><strong>{published?.pass_percentage ?? 0}%</strong></div><div><span>Intentos</span><strong>{published?.allowed_attempts ?? 0}</strong></div></div>
              {published && <Button variant="outline" className="view-questions-button" onClick={() => setViewingSet(normalizeSet(published))}><Eye /> Ver preguntas y respuestas</Button>}
              {draft ? <div className="draft-row"><div><strong>Borrador v{draft.version}</strong><span>Actualizado {date(draft.updated_at)}</span></div><Button onClick={() => setEditingSet(normalizeSet(draft))}><Pencil /> Editar borrador</Button></div>
                : <Button variant="outline" className="new-version-button" disabled={busy === kind || demo} onClick={() => void createVersion(kind)}><Plus /> Crear nueva versión</Button>}
              <div className="version-history"><History /><span>{sets.filter(item => item.status === "ARCHIVED").length} versiones archivadas</span></div>
            </section>;
          })}</div>
        </TabsContent>

        <TabsContent value="commercial" className="admin-tab-panel">
          <section className="workspace-section"><div className="section-title"><h2>Contratos por validar</h2><span>{pending.length} oportunidades</span></div>
            {pending.length ? <div className="record-list">{pending.map(item => <article className="record-card" key={item.opportunity.id}><div><span className="record-label">{item.opportunity.plan} · {item.building.district}</span><h3>{item.building.building_name}</h3><p>Vendedor: {item.building.seller_profiles.first_name} {item.building.seller_profiles.paternal_surname}</p><strong>Comisión: {money(item.opportunity.unit_price_cents * item.building.apartments)}</strong></div><div className="record-actions"><label className="checkbox-label"><Checkbox checked={!!checks[item.opportunity.id]} onCheckedChange={checked => setChecks(current => ({ ...current, [item.opportunity.id]: checked === true }))} /><span>Contrato firmado</span></label><Button disabled={!checks[item.opportunity.id] || busy === item.opportunity.id} onClick={() => void act(item, "markWon")}>Marcar ganado</Button></div></article>)}</div> : <p className="empty-state">No hay contratos pendientes de validación.</p>}
          </section>
          <section className="workspace-section"><div className="section-title"><h2>Comisiones</h2><span>{won.length} oportunidades ganadas</span></div>
            {won.length ? <div className="record-list">{won.map(item => <article className="record-card" key={item.opportunity.id}><div><span className="record-label">{item.opportunity.plan} · {item.building.district}</span><h3>{item.building.building_name}</h3><strong>{money(item.opportunity.commission_cents ?? 0)}</strong></div><div className="record-actions"><span className={item.opportunity.payment_status === "PAGADO" ? "status-chip paid" : "status-chip pending"}>{item.opportunity.payment_status === "PAGADO" ? "Pagado" : "Pendiente"}</span>{item.opportunity.payment_status !== "PAGADO" && <Button variant="outline" onClick={() => void act(item, "markPaid")}>Marcar pagado</Button>}</div></article>)}</div> : <p className="empty-state">Las oportunidades ganadas aparecerán aquí.</p>}
          </section>
        </TabsContent>
      </Tabs>
    </section>

    <ApplicantDialog applicant={selectedApplicant} onClose={() => setSelectedApplicant(null)} />
    <SellerDialog seller={selectedSeller} buildings={data.buildings.filter(building => building.seller_id === selectedSeller?.id)} busy={busy === selectedSeller?.id} onClose={() => setSelectedSeller(null)} onStatusChange={setSellerStatus} />
    <AssessmentViewer set={viewingSet} onClose={() => setViewingSet(null)} />
    <AssessmentEditor set={editingSet} busy={busy === editingSet?.id} onChange={setEditingSet} onClose={() => setEditingSet(null)} onSave={saveSet} />
  </main>;
}

function StageChip({ stage }: { stage: string }) {
  return <span className={`stage-chip stage-${stage.toLowerCase()}`}>{stageLabels[stage] || stage}</span>;
}

function ScoreCell({ attempt }: { attempt?: Attempt }) {
  if (!attempt) return <span className="score-empty">Pendiente</span>;
  return <div className="score-cell"><strong>{attempt.score}/{attempt.max_score}</strong><span className={attempt.passed ? "score-pass" : "score-fail"}>{attempt.percentage}% · {attempt.passed ? "Aprobado" : "No aprobado"}</span></div>;
}

function ApplicantDialog({ applicant, onClose }: { applicant: Applicant | null; onClose: () => void }) {
  return <Dialog open={!!applicant} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="applicant-dialog">
      {applicant && <><DialogHeader><DialogTitle>{applicant.first_name} {applicant.paternal_surname} {applicant.maternal_surname}</DialogTitle><DialogDescription>{applicant.document_type} {applicant.document_number} · Registrado {date(applicant.created_at)}</DialogDescription></DialogHeader>
        <div className="applicant-overview"><StageChip stage={applicant.application_stage} /><div><span>Correo</span><strong>{applicant.email}</strong></div><div><span>Teléfono</span><strong>{applicant.phone}</strong></div><div><span>Fecha de nacimiento</span><strong>{date(applicant.birth_date)}</strong></div></div>
        <section className="attempt-history"><h3>Historial de evaluaciones</h3>{applicant.assessment_attempts?.length ? [...applicant.assessment_attempts].sort((a, b) => +new Date(b.completed_at) - +new Date(a.completed_at)).map(attempt => <article key={attempt.id}><span className={attempt.passed ? "attempt-dot pass" : "attempt-dot fail"} /><div><strong>{kindLabels[attempt.kind]} · intento {attempt.attempt_number}</strong><span>{attempt.assessment_sets?.name} v{attempt.assessment_sets?.version} · {date(attempt.completed_at)}</span></div><ScoreCell attempt={attempt} /></article>) : <p className="empty-state">Todavía no ha rendido evaluaciones.</p>}</section>
      </>}
    </DialogContent>
  </Dialog>;
}

function normalizeSet(set: AssessmentSet): AssessmentSet {
  return { ...set, assessment_questions: [...set.assessment_questions].sort((a, b) => a.position - b.position).map(question => ({ ...question, options: [...question.options] })) };
}

function SellerDialog({ seller, buildings, busy, onClose, onStatusChange }: { seller: Applicant | null; buildings: Building[]; busy: boolean; onClose: () => void; onStatusChange: (seller: Applicant, status: "ACTIVE" | "SUSPENDED") => Promise<void> }) {
  const opportunities = buildings.flatMap(building => building.opportunities);
  return <Dialog open={!!seller} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="applicant-dialog">
      {seller && <><DialogHeader><DialogTitle>{seller.first_name} {seller.paternal_surname} {seller.maternal_surname}</DialogTitle><DialogDescription>{seller.document_type} {seller.document_number} · {seller.email}</DialogDescription></DialogHeader>
        <div className="applicant-overview"><StageChip stage={seller.status} /><div><span>Teléfono</span><strong>{seller.phone}</strong></div><div><span>Edificios registrados</span><strong>{buildings.length}</strong></div><div><span>Oportunidades</span><strong>{opportunities.length}</strong></div></div>
        <section className="seller-building-list"><h3>Actividad comercial</h3>{buildings.length ? buildings.map(building => <article key={building.id}><div><strong>{building.building_name}</strong><span>{building.district} · {building.apartments} departamentos</span></div><span>{building.opportunities.length} oportunidades</span></article>) : <p className="empty-state">Aún no registra edificios.</p>}</section>
        <DialogFooter>{seller.status === "ACTIVE" ? <Button variant="destructive" disabled={busy} onClick={() => void onStatusChange(seller, "SUSPENDED")}>{busy ? "Guardando…" : "Suspender vendedor"}</Button> : <Button disabled={busy} onClick={() => void onStatusChange(seller, "ACTIVE")}>{busy ? "Guardando…" : "Reactivar vendedor"}</Button>}</DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}

function AssessmentViewer({ set, onClose }: { set: AssessmentSet | null; onClose: () => void }) {
  return <Dialog open={!!set} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="assessment-dialog assessment-viewer">
      {set && <><DialogHeader><DialogTitle>{set.name} · v{set.version}</DialogTitle><DialogDescription>Versión publicada · nota mínima {set.pass_percentage}% · {set.allowed_attempts} intento{set.allowed_attempts === 1 ? "" : "s"}.</DialogDescription></DialogHeader>
        <div className="published-question-list">{set.assessment_questions.map((question, index) => <article key={question.id || index}><div className="question-view-head"><strong>Pregunta {index + 1}</strong>{question.is_knockout && <span>Eliminatoria</span>}</div><h3>{question.prompt}</h3><ol>{question.options.map((option, optionIndex) => <li key={option} className={question.correct_option === optionIndex ? "correct-answer" : ""}><span>{String.fromCharCode(65 + optionIndex)}</span><p>{option}</p>{question.correct_option === optionIndex && <strong>Correcta</strong>}</li>)}</ol></article>)}</div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}

function AssessmentEditor({ set, busy, onChange, onClose, onSave }: { set: AssessmentSet | null; busy: boolean; onChange: (set: AssessmentSet | null) => void; onClose: () => void; onSave: (set: AssessmentSet, publish?: boolean) => Promise<void> }) {
  if (!set) return <Dialog open={false} />;
  const updateQuestion = (index: number, changes: Partial<Question>) => onChange({ ...set, assessment_questions: set.assessment_questions.map((question, current) => current === index ? { ...question, ...changes } : question) });
  const addQuestion = () => onChange({ ...set, assessment_questions: [...set.assessment_questions, { position: set.assessment_questions.length + 1, prompt: "", options: ["", ""], correct_option: 0, is_knockout: false }] });
  const removeQuestion = (index: number) => onChange({ ...set, assessment_questions: set.assessment_questions.filter((_, current) => current !== index).map((question, position) => ({ ...question, position: position + 1 })) });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="assessment-dialog">
      <DialogHeader><DialogTitle>{kindLabels[set.kind]} · borrador v{set.version}</DialogTitle><DialogDescription>Los cambios se aplicarán a nuevos postulantes cuando publiques esta versión.</DialogDescription></DialogHeader>
      <div className="assessment-config"><div><Label htmlFor="set-name">Nombre</Label><Input id="set-name" value={set.name} onChange={event => onChange({ ...set, name: event.target.value })} /></div><div><Label htmlFor="pass-score">Nota mínima (%)</Label><Input id="pass-score" type="number" min={1} max={100} value={set.pass_percentage} onChange={event => onChange({ ...set, pass_percentage: Number(event.target.value) })} /></div><div><Label htmlFor="attempts">Intentos permitidos</Label><Input id="attempts" type="number" min={1} max={5} value={set.allowed_attempts} onChange={event => onChange({ ...set, allowed_attempts: Number(event.target.value) })} /></div><label className="switch-field"><Switch checked={set.randomize_questions} onCheckedChange={value => onChange({ ...set, randomize_questions: value })} /><span>Mostrar preguntas en orden aleatorio</span></label></div>
      <div className="question-editor-list">{set.assessment_questions.map((question, index) => <article className="question-editor" key={question.id || index}><div className="question-editor-head"><strong>Pregunta {index + 1}</strong><Button variant="ghost" size="icon-sm" aria-label={`Eliminar pregunta ${index + 1}`} disabled={set.assessment_questions.length === 1} onClick={() => removeQuestion(index)}><Trash2 /></Button></div><textarea aria-label={`Texto de la pregunta ${index + 1}`} value={question.prompt} onChange={event => updateQuestion(index, { prompt: event.target.value })} placeholder="Escribe la situación o pregunta" /> <div className="option-editor">{question.options.map((option, optionIndex) => <div key={optionIndex}><input type="radio" name={`correct-${index}`} checked={question.correct_option === optionIndex} onChange={() => updateQuestion(index, { correct_option: optionIndex })} aria-label={`Marcar alternativa ${optionIndex + 1} como correcta`} /><Input value={option} onChange={event => { const options = [...question.options]; options[optionIndex] = event.target.value; updateQuestion(index, { options }); }} placeholder={`Alternativa ${optionIndex + 1}`} />{question.options.length > 2 && <Button variant="ghost" size="icon-sm" aria-label="Eliminar alternativa" onClick={() => { const options = question.options.filter((_, current) => current !== optionIndex); updateQuestion(index, { options, correct_option: Math.min(question.correct_option, options.length - 1) }); }}><Trash2 /></Button>}</div>)}</div>{question.options.length < 6 && <Button variant="ghost" className="add-option" onClick={() => updateQuestion(index, { options: [...question.options, ""] })}><Plus /> Agregar alternativa</Button>}<label className="knockout-field"><Checkbox checked={question.is_knockout} onCheckedChange={value => updateQuestion(index, { is_knockout: value === true })} /><span>Respuesta incorrecta eliminatoria</span></label></article>)}</div>
      <Button variant="outline" onClick={addQuestion}><Plus /> Agregar pregunta</Button>
      <DialogFooter><Button variant="outline" onClick={() => void onSave(set, false)} disabled={busy}>Guardar borrador</Button><Button onClick={() => void onSave(set, true)} disabled={busy}>{busy ? "Publicando…" : "Guardar y publicar"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
