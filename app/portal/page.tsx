"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, ContactRound, FileSignature, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { commercialStage, commercialStageLabels, commissionCents, opportunityUnitPriceCents, sellerGuidance, sellerStateLabels, sellerStates, type CommercialPlan, type CommercialStage, type SellerState } from "@/lib/commerce";

type Contact = { id: string; name: string; role: string; phone: string; email: string | null; contact_type: string; is_primary: boolean; is_authorized_signer: boolean };
type Demo = { id: string; starts_at: string; ends_at: string | null; booking_status: string; result: string | null; information_sent_at: string | null };
type Contract = { id: string; status: string; signed_document_path: string | null };
type Commission = { id: string; amount_cents: number; status: "PENDING" | "PAID"; generated_at: string; paid_at: string | null };
type Opportunity = { id: string; plan: CommercialPlan | null; seller_state: SellerState; list_price_cents: number | null; autonomy_discount_applied: boolean; discount_cents: number | null; final_price_cents: number | null; confirmed_apartments: number | null; recurring_total_cents: number | null; potential_commission_cents: number | null; observations: string; lost_reason: string | null; created_at: string; opportunity_demos: Demo[]; contracts: Contract[]; commissions: Commission[] };
type Building = { id: string; building_name: string; apartments: number; district: string; province: string; department: string; street_type: string; street_name: string; street_number: string; administration_type: string; administration_company: string | null; lead_status: string; created_at: string; building_contacts: Contact[]; opportunities: Opportunity[] };
type Profile = { first_name: string; paternal_surname: string; maternal_surname: string; document_type: string; document_number: string; email: string; phone: string };
type Tab = "edificios" | "oportunidades" | "comisiones" | "perfil";
type OpportunityItem = { building: Building; opportunity: Opportunity };

const money = (cents: number | null) => cents == null ? "Por definir" : `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const calendarUrl = (buildingId: string, contactId: string) => `https://cal.com/red-de-vendedores-condomio-ji2gdw/30min?metadata%5BbuildingId%5D=${encodeURIComponent(buildingId)}&metadata%5BcontactId%5D=${encodeURIComponent(contactId)}`;
const stageOrder: CommercialStage[] = ["DEMO", "ELECCION_PLAN", "CONTRATO", "ACTIVACION", "CONCRETADA", "NO_CONCRETADA"];

const sampleProfile: Profile = { first_name: "Valeria", paternal_surname: "Ramos", maternal_surname: "Salazar", document_type: "DNI", document_number: "••••4567", email: "valeria@ejemplo.com", phone: "+51 900 000 000" };
const sampleBuildings: Building[] = [
  { id: "b1", building_name: "Residencial Los Olivos", apartments: 48, district: "Miraflores", province: "Lima", department: "Lima", street_type: "Avenida", street_name: "Ejemplo", street_number: "125", administration_type: "TERCERA", administration_company: "Administración Demo", lead_status: "ACTIVE", created_at: "2026-09-25T12:00:00Z", building_contacts: [{ id: "c1", name: "Lucía Torres", role: "Administradora", phone: "+51 900 000 001", email: "lucia@ejemplo.com", contact_type: "ADMINISTRADOR", is_primary: true, is_authorized_signer: true }], opportunities: [{ id: "o1", plan: null, seller_state: "DEMO_AGENDADA", list_price_cents: null, autonomy_discount_applied: false, discount_cents: null, final_price_cents: null, confirmed_apartments: null, recurring_total_cents: null, potential_commission_cents: null, observations: "", lost_reason: null, created_at: "2026-09-26T15:00:00Z", opportunity_demos: [{ id: "d1", starts_at: "2026-10-02T15:00:00Z", ends_at: "2026-10-02T15:30:00Z", booking_status: "SCHEDULED", result: null, information_sent_at: null }], contracts: [], commissions: [] }] },
  { id: "b2", building_name: "Edificio Aurora", apartments: 32, district: "San Isidro", province: "Lima", department: "Lima", street_type: "Calle", street_name: "Muestra", street_number: "240", administration_type: "PROPIA", administration_company: null, lead_status: "ACTIVE", created_at: "2026-09-21T12:00:00Z", building_contacts: [{ id: "c2", name: "Carlos Paredes", role: "Presidente de junta", phone: "+51 900 000 002", email: null, contact_type: "PRESIDENTE_JUNTA", is_primary: true, is_authorized_signer: true }], opportunities: [{ id: "o2", plan: "PRO", seller_state: "CONTRATO_ENVIADO", list_price_cents: 350, autonomy_discount_applied: false, discount_cents: 0, final_price_cents: 350, confirmed_apartments: 32, recurring_total_cents: 11200, potential_commission_cents: 9492, observations: "", lost_reason: null, created_at: "2026-09-22T15:00:00Z", opportunity_demos: [], contracts: [{ id: "ct1", status: "SENT", signed_document_path: null }], commissions: [] }] },
  { id: "b3", building_name: "Condominio Central", apartments: 60, district: "Surco", province: "Lima", department: "Lima", street_type: "Avenida", street_name: "Central", street_number: "510", administration_type: "TERCERA", administration_company: "Gestión Uno", lead_status: "ACTIVE", created_at: "2026-09-15T12:00:00Z", building_contacts: [], opportunities: [{ id: "o3", plan: "BASICO", seller_state: "CONCRETADA", list_price_cents: 250, autonomy_discount_applied: true, discount_cents: 50, final_price_cents: 200, confirmed_apartments: 60, recurring_total_cents: 12000, potential_commission_cents: 10169, observations: "", lost_reason: null, created_at: "2026-09-16T15:00:00Z", opportunity_demos: [], contracts: [{ id: "ct2", status: "VALIDATED", signed_document_path: "contracts/demo.pdf" }], commissions: [{ id: "cm1", amount_cents: 10169, status: "PENDING", generated_at: "2026-09-26T12:00:00Z", paid_at: null }] }] },
];

export default function SellerPortal() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [tab, setTab] = useState<Tab>("edificios");
  const [buildingForm, setBuildingForm] = useState(false);
  const [skipContact, setSkipContact] = useState(false);
  const [contactBuilding, setContactBuilding] = useState<Building | null>(null);
  const [selected, setSelected] = useState<OpportunityItem | null>(null);
  const [plan, setPlan] = useState<CommercialPlan>("BASICO");
  const [discount, setDiscount] = useState(false);
  const [apartments, setApartments] = useState(1);
  const [lost, setLost] = useState<Opportunity | null>(null);
  const [lostReason, setLostReason] = useState("SIN_RESPUESTA");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);

  const openOpportunity = useCallback((item: OpportunityItem) => {
    setSelected(item);
    setPlan(item.opportunity.plan || "BASICO");
    setDiscount(item.opportunity.autonomy_discount_applied);
    setApartments(item.opportunity.confirmed_apartments || item.building.apartments);
  }, []);

  const reload = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      const requestedState = params.get("estado") as SellerState | null;
      const demoBuildings = requestedState && sellerStates.includes(requestedState)
        ? sampleBuildings.map((building, index) => index === 0 ? { ...building, opportunities: [{ ...building.opportunities[0], seller_state: requestedState }] } : building)
        : sampleBuildings;
      setDemo(true); setProfile(sampleProfile); setBuildings(demoBuildings); setLoading(false); return;
    }
    try {
      const response = await fetch("/api/portal", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/ingresar"); return; }
      const result = await response.json() as { profile?: Profile; buildings?: Building[]; error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo cargar el portal.");
      setProfile(result.profile || null); setBuildings(result.buildings || []); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar el portal."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("seccion") as Tab | null;
    // Query parameters seed deterministic review views after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requested && ["edificios", "oportunidades", "comisiones", "perfil"].includes(requested)) setTab(requested);
    if (params.get("vista") === "nuevo-edificio") setBuildingForm(true);
    if (params.get("vista") === "detalle-oportunidad" || params.get("vista") === "nueva-oportunidad") openOpportunity({ building: sampleBuildings[1], opportunity: sampleBuildings[1].opportunities[0] });
    void reload();
  }, [openOpportunity, reload]);

  async function save(action: string, data: unknown) {
    if (demo) { setError("Esta es una muestra visual. Los cambios no se guardan."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo guardar.");
      setBuildingForm(false); setContactBuilding(null); setSelected(null); setLost(null); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }

  const opportunities = useMemo(() => buildings.flatMap(building => building.opportunities.map(opportunity => ({ building, opportunity }))), [buildings]);
  const commissions = opportunities.flatMap(item => item.opportunity.commissions.map(commission => ({ ...item, commission })));
  const grouped = stageOrder.map(stage => ({ stage, items: opportunities.filter(item => commercialStage(item.opportunity.seller_state) === stage).sort((a, b) => +new Date(b.opportunity.created_at) - +new Date(a.opportunity.created_at)) })).filter(group => group.items.length);
  const currentPrice = opportunityUnitPriceCents(plan, discount);
  const potential = commissionCents(currentPrice, apartments);

  return <main className="mvp-shell workspace-shell"><header className="workspace-header"><div className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Red comercial</small></span></div><span className="workspace-label">{profile ? `${profile.first_name} ${profile.paternal_surname}` : "Portal del vendedor"}</span></header><div className="workspace-content">
    {demo && <p className="demo-banner">Vista de muestra · datos ficticios · sin guardado</p>}
    <div className="workspace-heading"><span className="eyebrow">MI ESPACIO COMERCIAL</span><h1>Hola{profile ? `, ${profile.first_name}` : ""}.</h1><p>Registra edificios y avanza con una indicación clara en cada paso.</p></div>
    <div className="metric-row"><div><span>Edificios</span><strong>{buildings.length}</strong></div><div><span>Procesos activos</span><strong>{opportunities.filter(item => !["CONCRETADA", "NO_CONCRETADA"].includes(item.opportunity.seller_state)).length}</strong></div><div><span>Comisiones</span><strong>{commissions.length}</strong></div></div>
    <nav className="portal-tabs">{(["edificios", "oportunidades", "comisiones", "perfil"] as Tab[]).map(item => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{({ edificios: "Edificios", oportunidades: "Oportunidades", comisiones: "Comisiones", perfil: "Mi información" })[item]}</button>)}</nav>
    {error && <p role="alert" className="workspace-error">{error}</p>}
    {loading ? <p className="empty-state">Cargando tu información…</p> : <>
      {tab === "edificios" && <section className="workspace-section"><div className="section-title"><div><h2>Mis edificios</h2><p>Registrar un edificio no crea todavía una oportunidad.</p></div><Button onClick={() => setBuildingForm(value => !value)}><Plus /> {buildingForm ? "Cerrar" : "Nuevo edificio"}</Button></div>
        {buildingForm && <BuildingForm busy={busy} skipContact={skipContact} onSkipContact={setSkipContact} onSubmit={data => void save("createBuilding", data)} />}
        <div className="record-list">{buildings.filter(building => building.lead_status !== "DISCARDED").map(building => <BuildingCard key={building.id} building={building} onAddContact={() => setContactBuilding(building)} onOpen={openOpportunity} onDiscard={() => void save("discardBuilding", { buildingId: building.id, reason: "Sin potencial comercial por ahora" })} />)}</div>
      </section>}
      {tab === "oportunidades" && <section className="workspace-section"><div className="section-title"><div><h2>Oportunidades</h2><p>Agrupadas por la etapa real del proceso.</p></div><span>{opportunities.length} registradas</span></div>{grouped.length ? <div className="opportunity-groups">{grouped.map(group => <section className="opportunity-group" key={group.stage}><div className="opportunity-group-title"><h3>{commercialStageLabels[group.stage]}</h3><span>{group.items.length}</span></div><div className="record-list">{group.items.map(item => <OpportunityRow key={item.opportunity.id} item={item} onOpen={() => openOpportunity(item)} />)}</div></section>)}</div> : <p className="empty-state">La primera oportunidad aparecerá automáticamente cuando se agende una demo.</p>}</section>}
      {tab === "comisiones" && <section className="workspace-section"><div className="section-title"><div><h2>Comisiones</h2><p>Se generan después de confirmar la primera cuota.</p></div><span>{commissions.length} registradas</span></div>{commissions.length ? <div className="record-list">{commissions.map(({ building, opportunity, commission }) => <article className="record-card commission-card" key={commission.id}><div><span className="record-label">{formatDate(commission.generated_at)} · {opportunity.plan}</span><h3>{building.building_name}</h3><p>{money(opportunity.final_price_cents)} × {opportunity.confirmed_apartments} departamentos · sin IGV</p><strong>{money(commission.amount_cents)}</strong></div><span className={`status-chip ${commission.status === "PAID" ? "paid" : "pending"}`}>{commission.status === "PAID" ? "Pagada" : "Pendiente de pago"}</span></article>)}</div> : <p className="empty-state">Todavía no tienes comisiones generadas.</p>}</section>}
      {tab === "perfil" && profile && <section className="workspace-section"><div className="section-title"><h2>Mi información</h2><span>Solo lectura</span></div><div className="profile-card"><div><span>Nombre completo</span><strong>{profile.first_name} {profile.paternal_surname} {profile.maternal_surname}</strong></div><div><span>Documento</span><strong>{profile.document_type} {profile.document_number}</strong></div><div><span>Teléfono</span><strong>{profile.phone}</strong></div><div><span>Correo</span><strong>{profile.email}</strong></div><p>Para solicitar un cambio, escribe al correo administrador de Condomio.</p></div></section>}
    </>}
    {contactBuilding && <Modal title="Agregar contacto" onClose={() => setContactBuilding(null)}><ContactForm busy={busy} onSubmit={contact => void save("addContact", { buildingId: contactBuilding.id, ...contact })} /></Modal>}
    {selected && <Modal title={selected.building.building_name} onClose={() => setSelected(null)} wide><OpportunityDetail item={selected} busy={busy} plan={plan} discount={discount} apartments={apartments} price={currentPrice} potential={potential} onPlan={setPlan} onDiscount={setDiscount} onApartments={setApartments} onSave={save} onLose={() => setLost(selected.opportunity)} /></Modal>}
    {lost && <Modal title="Cerrar como no concretada" onClose={() => setLost(null)}><form className="portal-form" onSubmit={event => { event.preventDefault(); void save("loseOpportunity", { opportunityId: lost.id, reason: lostReason }); }}><p>Selecciona el motivo. Esta acción cierra el proceso comercial.</p><Select value={lostReason} onValueChange={setLostReason}><SelectTrigger className="field-control"><SelectValue /></SelectTrigger><SelectContent>{[["SIN_RESPUESTA", "Sin respuesta"], ["SIN_INTERES", "Sin interés"], ["PRECIO", "Precio"], ["OTRA_SOLUCION", "Eligió otra solución"], ["NO_PRIORIDAD", "No es prioridad"], ["NO_HAY_AUTORIDAD", "Contacto sin autoridad"], ["SIN_PRESUPUESTO", "Sin presupuesto"], ["DATOS_INCORRECTOS", "Datos incorrectos"], ["OTRO", "Otro"]].map(([value, label]) => <SelectItem value={value} key={value}>{label}</SelectItem>)}</SelectContent></Select><Button type="submit" className="danger-button" disabled={busy}>Confirmar cierre</Button></form></Modal>}
  </div></main>;
}

function BuildingCard({ building, onAddContact, onOpen, onDiscard }: { building: Building; onAddContact: () => void; onOpen: (item: OpportunityItem) => void; onDiscard: () => void }) {
  const primary = building.building_contacts.find(contact => contact.is_primary) || building.building_contacts[0];
  const active = building.opportunities.find(opportunity => !["CONCRETADA", "NO_CONCRETADA"].includes(opportunity.seller_state));
  const state: SellerState = active?.seller_state || (primary ? "CONTACTO_REGISTRADO" : "SIN_CONTACTO");
  const guide = sellerGuidance(state);
  return <article className="record-card building-card"><div className="building-card-main"><span className="record-label">{building.district} · {building.apartments} departamentos</span><h3>{building.building_name}</h3><p>{building.street_type} {building.street_name} {building.street_number}, {building.province}</p><div className="building-contact"><ContactRound /><span>{primary ? <><strong>{primary.name}</strong><small>{primary.role} · {primary.phone}</small></> : <><strong>Sin contacto</strong><small>Puedes registrarlo más adelante.</small></>}</span></div></div><div className="building-next"><span className={`status-chip status-${state.toLowerCase()}`}>{sellerStateLabels[state]}</span><small>Siguiente paso · Responsable: {guide.responsible === "CONDOMIO" ? "Condomio" : guide.responsible === "AMBOS" ? "Vendedor y Condomio" : "Vendedor"}</small><strong>{guide.nextStep}</strong><div className="record-actions">{!primary && <Button onClick={onAddContact}>Agregar contacto</Button>}{primary && !active && <a className="button-link" target="_blank" rel="noreferrer" href={calendarUrl(building.id, primary.id)}><CalendarDays /> Agendar demo</a>}{active && <Button onClick={() => onOpen({ building, opportunity: active })}>{guide.actionLabel || "Ver detalle"} <ChevronRight /></Button>}<Button variant="outline" onClick={onAddContact}>Contactos ({building.building_contacts.length})</Button>{!active && <Button variant="outline" className="lost-action" onClick={onDiscard}>Descartar edificio</Button>}</div></div></article>;
}

function OpportunityRow({ item, onOpen }: { item: OpportunityItem; onOpen: () => void }) {
  const { building, opportunity } = item; const guide = sellerGuidance(opportunity.seller_state);
  return <article className="record-card opportunity-card"><div><span className="record-label">{formatDate(opportunity.created_at)} · {opportunity.plan || "Plan por definir"}</span><h3>{building.building_name}</h3><p>{sellerStateLabels[opportunity.seller_state]} · Responsable: {guide.responsible === "CONDOMIO" ? "Condomio" : guide.responsible === "AMBOS" ? "Ambos" : "Vendedor"}</p><strong>{guide.nextStep}</strong></div><div className="record-actions"><span className={`status-chip status-${opportunity.seller_state.toLowerCase()}`}>{sellerStateLabels[opportunity.seller_state]}</span><Button variant="outline" onClick={onOpen}>{guide.actionLabel || "Ver detalle"}</Button></div></article>;
}

function OpportunityDetail({ item: { building, opportunity }, busy, plan, discount, apartments, price, potential, onPlan, onDiscount, onApartments, onSave, onLose }: { item: OpportunityItem; busy: boolean; plan: CommercialPlan; discount: boolean; apartments: number; price: number; potential: number; onPlan: (value: CommercialPlan) => void; onDiscount: (value: boolean) => void; onApartments: (value: number) => void; onSave: (action: string, data: unknown) => Promise<void>; onLose: () => void }) {
  const guide = sellerGuidance(opportunity.seller_state); const canChoose = ["INFORMACION_ENVIADA", "PLAN_PENDIENTE"].includes(opportunity.seller_state); const demo = opportunity.opportunity_demos[0];
  const [contractFile, setContractFile] = useState<File | null>(null);
  async function uploadContract() {
    if (!contractFile) return;
    const bytes = new Uint8Array(await contractFile.arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    await onSave("uploadSignedContract", { opportunityId: opportunity.id, fileName: contractFile.name, mimeType: contractFile.type, base64: btoa(binary) });
  }
  return <div className="opportunity-detail"><div className="opportunity-detail-hero"><div><span className="record-label">ETAPA · {commercialStageLabels[commercialStage(opportunity.seller_state)]}</span><h3>{sellerStateLabels[opportunity.seller_state]}</h3><p>{guide.nextStep}</p></div><div><small>Responsable</small><strong>{guide.responsible === "CONDOMIO" ? "Condomio" : guide.responsible === "AMBOS" ? "Vendedor y Condomio" : "Vendedor"}</strong></div></div>{demo && <div className="detail-callout"><CalendarDays /><div><strong>Demo agendada</strong><span>{new Intl.DateTimeFormat("es-PE", { dateStyle: "full", timeStyle: "short" }).format(new Date(demo.starts_at))}</span></div></div>}<dl className="opportunity-data"><div><dt>Plan</dt><dd>{opportunity.plan || "Por definir"}</dd></div><div><dt>Precio por dpto.</dt><dd>{money(opportunity.final_price_cents)}</dd></div><div><dt>N.º de dptos.</dt><dd>{opportunity.confirmed_apartments || building.apartments}</dd></div><div><dt>Comisión potencial</dt><dd>{money(opportunity.potential_commission_cents)}</dd></div></dl>{canChoose ? <section className="plan-panel"><h4>Elegir plan</h4><p>Disponible porque la demo y el envío de información ya fueron registrados.</p><div className="form-grid"><div className="form-field"><Label>Plan</Label><Select value={plan} onValueChange={value => onPlan(value as CommercialPlan)}><SelectTrigger className="field-control"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BASICO">Básico · S/ 2.50</SelectItem><SelectItem value="PRO">Pro · S/ 3.50</SelectItem></SelectContent></Select></div><div className="form-field"><Label htmlFor="confirmedApartments">Departamentos confirmados</Label><Input id="confirmedApartments" type="number" min={1} value={apartments} onChange={event => onApartments(Number(event.target.value))} /></div></div><label className="opportunity-discount"><Checkbox checked={discount} onCheckedChange={value => onDiscount(value === true)} /><span><strong>Aplicar autonomía comercial</strong><small>Descuento de S/ 0.50 por departamento.</small></span></label><div className="opportunity-pricing"><div><span>Precio final</span><strong>{money(price)}</strong></div><div><span>Comisión potencial sin IGV</span><strong>{money(potential)}</strong></div></div><Button disabled={busy} onClick={() => void onSave("choosePlan", { opportunityId: opportunity.id, plan, autonomyDiscount: discount, confirmedApartments: apartments })}>Confirmar plan</Button></section> : <div className="locked-plan"><FileSignature /><div><strong>{opportunity.plan ? "Condiciones comerciales confirmadas" : "Plan bloqueado por ahora"}</strong><p>{opportunity.plan ? `${opportunity.plan} · ${money(opportunity.final_price_cents)} por departamento` : "Se habilitará cuando Condomio registre la demo y el envío de información."}</p></div></div>}{opportunity.seller_state === "CONTRATO_ENVIADO" && <div className="contract-upload"><Label htmlFor="signedContract">Contrato firmado (PDF, JPG o PNG · máximo 8 MB)</Label><Input id="signedContract" type="file" accept="application/pdf,image/jpeg,image/png" onChange={event => setContractFile(event.target.files?.[0] || null)} /></div>}<div className="detail-actions">{opportunity.seller_state === "PLAN_SELECCIONADO" && <Button disabled={busy} onClick={() => void onSave("requestContract", { opportunityId: opportunity.id })}>Solicitar contrato</Button>}{opportunity.seller_state === "CONTRATO_ENVIADO" && <Button disabled={busy || !contractFile} onClick={() => void uploadContract()}>Enviar contrato a validación</Button>}{!["CONCRETADA", "NO_CONCRETADA"].includes(opportunity.seller_state) && <Button variant="outline" className="lost-action" onClick={onLose}>No se concretó</Button>}</div></div>;
}

function BuildingForm({ busy, skipContact, onSkipContact, onSubmit }: { busy: boolean; skipContact: boolean; onSkipContact: (value: boolean) => void; onSubmit: (data: unknown) => void }) {
  return <form className="portal-form" onSubmit={event => { event.preventDefault(); const d = new FormData(event.currentTarget); const contact = skipContact ? undefined : { name: d.get("contactName"), role: d.get("contactRole"), phone: d.get("contactPhone"), email: d.get("contactEmail"), contactType: d.get("contactType"), isPrimary: true, isAuthorizedSigner: d.get("authorized") === "on" }; onSubmit({ streetType: d.get("streetType"), streetName: d.get("streetName"), streetNumber: d.get("streetNumber"), district: d.get("district"), province: d.get("province"), department: d.get("department"), buildingName: d.get("buildingName"), apartments: Number(d.get("apartments")), administrationType: d.get("administrationType"), administrationCompany: d.get("administrationCompany"), contact }); }}><h3>1. Datos obligatorios del edificio</h3><div className="form-grid"><Field name="buildingName" label="Nombre del edificio" required /><SelectField name="streetType" label="Tipo de vía" values={["Avenida", "Jirón", "Calle", "Pasaje", "Otro"]} /><Field name="streetName" label="Nombre de la vía" required /><Field name="streetNumber" label="Número" required /><Field name="district" label="Distrito" required /><Field name="province" label="Provincia" required /><Field name="department" label="Departamento" required /><Field name="apartments" label="N.º de departamentos" type="number" min="1" required /><SelectField name="administrationType" label="Tipo de administración" values={["PROPIA", "TERCERA"]} /><Field name="administrationCompany" label="Empresa administradora (si aplica)" /></div><label className="opportunity-discount"><Checkbox checked={skipContact} onCheckedChange={value => onSkipContact(value === true)} /><span><strong>Todavía no tengo un contacto</strong><small>Podrás agregar uno después. No se creará una oportunidad todavía.</small></span></label>{!skipContact && <><h3>2. Contacto inicial (opcional)</h3><ContactFields /></>}<Button type="submit" disabled={busy}>Guardar edificio</Button></form>;
}

function ContactForm({ busy, onSubmit }: { busy: boolean; onSubmit: (data: Record<string, unknown>) => void }) { return <form className="portal-form" onSubmit={event => { event.preventDefault(); const d = new FormData(event.currentTarget); onSubmit({ name: d.get("contactName"), role: d.get("contactRole"), phone: d.get("contactPhone"), email: d.get("contactEmail"), contactType: d.get("contactType"), isPrimary: d.get("primary") === "on", isAuthorizedSigner: d.get("authorized") === "on" }); }}><ContactFields primary /><Button type="submit" disabled={busy}>Guardar contacto</Button></form>; }
function ContactFields({ primary = false }: { primary?: boolean }) { return <><div className="form-grid"><Field name="contactName" label="Nombre" required /><Field name="contactRole" label="Cargo o rol" required /><Field name="contactPhone" label="Teléfono" type="tel" required /><Field name="contactEmail" label="Correo (opcional)" type="email" /><SelectField name="contactType" label="Tipo de contacto" values={["ADMINISTRADOR", "PRESIDENTE_JUNTA", "PROPIETARIO", "OTRO"]} /></div><div className="inline-checks">{primary && <label><input type="checkbox" name="primary" /> Contacto principal</label>}<label><input type="checkbox" name="authorized" /> Puede firmar el contrato</label></div></>; }
function Field({ name, label, ...props }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <div className="form-field"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} className="field-control" {...props} /></div>; }
function SelectField({ name, label, values }: { name: string; label: string; values: string[] }) { const [value, setValue] = useState(values[0]); return <div className="form-field"><Label htmlFor={name}>{label}</Label><input type="hidden" name={name} value={value} /><Select value={value} onValueChange={setValue}><SelectTrigger id={name} className="field-control"><SelectValue /></SelectTrigger><SelectContent>{values.map(item => <SelectItem key={item} value={item}>{item.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div>; }
function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) { return <div className="portal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={`portal-dialog ${wide ? "opportunity-dialog" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="section-title"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Cerrar">✕</button></div>{children}</div></div>; }
