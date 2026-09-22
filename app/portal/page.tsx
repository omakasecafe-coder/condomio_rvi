"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Opportunity = { id: string; plan: string; unit_price_cents: number; observations: string; status: string; commission_cents: number | null; payment_status: string | null };
type Building = { id: string; building_name: string; apartments: number; district: string; province: string; department: string; street_type: string; street_name: string; street_number: string; administration_type: string; administration_company: string | null; contact_name: string; contact_role: string; contact_phone: string; contact_email: string; opportunities: Opportunity[] };
type Profile = { first_name: string; paternal_surname: string; maternal_surname: string; document_type: string; document_number: string; email: string; phone: string };
type Tab = "edificios" | "oportunidades" | "comisiones" | "perfil";

const money = (cents: number) => `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nextStatus: Record<string, string | undefined> = { CONTACTO: "DEMO", DEMO: "NEGOCIACIÓN", "NEGOCIACIÓN": "PERDIDO" };
const sampleProfile: Profile = { first_name: "Valeria", paternal_surname: "Ramos", maternal_surname: "Salazar", document_type: "DNI", document_number: "••••4567", email: "valeria@ejemplo.com", phone: "+51 900 000 000" };
const sampleBuildings: Building[] = [
  { id: "sample-1", building_name: "Residencial Los Olivos", apartments: 48, district: "Miraflores", province: "Lima", department: "Lima", street_type: "Avenida", street_name: "Ejemplo", street_number: "125", administration_type: "TERCERA", administration_company: "Administración Demo", contact_name: "Lucía Torres", contact_role: "Administradora", contact_phone: "+51 900 000 001", contact_email: "lucia@ejemplo.com", opportunities: [{ id: "op-1", plan: "PRO", unit_price_cents: 2400, observations: "Demo realizada; pendiente de propuesta final.", status: "NEGOCIACIÓN", commission_cents: null, payment_status: null }] },
  { id: "sample-2", building_name: "Edificio Aurora", apartments: 32, district: "San Isidro", province: "Lima", department: "Lima", street_type: "Calle", street_name: "Muestra", street_number: "240", administration_type: "PROPIA", administration_company: null, contact_name: "Carlos Paredes", contact_role: "Presidente de junta", contact_phone: "+51 900 000 002", contact_email: "carlos@ejemplo.com", opportunities: [{ id: "op-2", plan: "BASICO", unit_price_cents: 1800, observations: "Contrato firmado y validado.", status: "GANADO", commission_cents: 57600, payment_status: "PENDIENTE_DE_PAGO" }] },
];

export default function SellerPortal() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [tab, setTab] = useState<Tab>("edificios");
  const [showBuildingForm, setShowBuildingForm] = useState(false);
  const [opportunityBuilding, setOpportunityBuilding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);

  const reload = useCallback(async () => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") { setDemo(true); setProfile(sampleProfile); setBuildings(sampleBuildings); setLoading(false); return; }
    try {
      const response = await fetch("/api/portal", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/"); return; }
      const data = await response.json() as { profile?: Profile; buildings?: Building[]; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el portal.");
      setProfile(data.profile || null);
      setBuildings(data.buildings || []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar el portal."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("seccion") as Tab | null;
    // Query parameters seed deterministic demo views after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requested && ["edificios", "oportunidades", "comisiones", "perfil"].includes(requested)) setTab(requested);
    if (params.get("vista") === "nuevo-edificio") { setTab("edificios"); setShowBuildingForm(true); }
    if (params.get("vista") === "nueva-oportunidad") { setTab("edificios"); setOpportunityBuilding(sampleBuildings[0].id); }
    void reload();
  }, [reload]);

  async function save(action: string, data: unknown) {
    if (demo) { setError("Esta es una muestra visual. Los cambios no se guardan."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo guardar.");
      setShowBuildingForm(false); setOpportunityBuilding(null);
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }

  function submitBuilding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save("createBuilding", {
      streetType: data.get("streetType"), streetName: data.get("streetName"), streetNumber: data.get("streetNumber"),
      district: data.get("district"), province: data.get("province"), department: data.get("department"),
      buildingName: data.get("buildingName"), apartments: Number(data.get("apartments")),
      administrationType: data.get("administrationType"), administrationCompany: data.get("administrationCompany"),
      contactName: data.get("contactName"), contactRole: data.get("contactRole"), contactPhone: data.get("contactPhone"), contactEmail: data.get("contactEmail"),
    });
  }

  function submitOpportunity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void save("createOpportunity", { buildingId: opportunityBuilding, plan: data.get("plan"), unitPrice: data.get("unitPrice"), observations: data.get("observations") });
  }

  const opportunities = buildings.flatMap(building => building.opportunities.map(opportunity => ({ building, opportunity })));
  const commissions = opportunities.filter(item => item.opportunity.status === "GANADO");
  useEffect(() => { document.title = `${({ edificios: "Edificios", oportunidades: "Oportunidades", comisiones: "Comisiones", perfil: "Mi información" } as Record<Tab, string>)[tab]} · Portal vendedor Condomio`; }, [tab]);

  return <main className="mvp-shell workspace-shell">
    <header className="workspace-header"><div className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Red comercial</small></span></div><span className="workspace-label">{profile ? `${profile.first_name} ${profile.paternal_surname}` : "Portal del vendedor"}</span></header>
    <div className="workspace-content">
      {demo && <p className="demo-banner">Vista de muestra · datos ficticios · sin guardado</p>}
      <div className="workspace-heading"><span className="eyebrow">MI ESPACIO COMERCIAL</span><h1>Hola{profile ? `, ${profile.first_name}` : ""}.</h1><p>Da seguimiento a tus edificios, oportunidades y comisiones.</p></div>
      <div className="metric-row"><div><span>Edificios</span><strong>{buildings.length}</strong></div><div><span>Oportunidades activas</span><strong>{opportunities.filter(item => !["GANADO", "PERDIDO"].includes(item.opportunity.status)).length}</strong></div><div><span>Comisiones ganadas</span><strong>{commissions.length}</strong></div></div>
      <nav className="portal-tabs" aria-label="Secciones del portal">{(["edificios", "oportunidades", "comisiones", "perfil"] as Tab[]).map(item => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{({ edificios: "Edificios", oportunidades: "Oportunidades", comisiones: "Comisiones", perfil: "Mi información" } as Record<Tab, string>)[item]}</button>)}</nav>
      {error && <p role="alert" className="workspace-error">{error}</p>}
      {loading ? <p className="empty-state">Cargando tu información…</p> : <>
        {tab === "edificios" && <section className="workspace-section"><div className="section-title"><h2>Mis edificios</h2><Button onClick={() => setShowBuildingForm(value => !value)}>{showBuildingForm ? "Cerrar formulario" : "Nuevo edificio"}</Button></div>
          {showBuildingForm && <form className="portal-form" onSubmit={submitBuilding}><h3>Datos del edificio</h3><div className="form-grid">
            <Field name="buildingName" label="Nombre del edificio" required /><SelectField name="streetType" label="Tipo de vía" values={["Avenida", "Jirón", "Calle", "Pasaje", "Otro"]} /><Field name="streetName" label="Nombre de la vía" required /><Field name="streetNumber" label="Número" required /><Field name="district" label="Distrito" required /><Field name="province" label="Provincia" required /><Field name="department" label="Departamento" required /><Field name="apartments" label="N.º de departamentos" type="number" min="1" required /><SelectField name="administrationType" label="Tipo de administración" values={["PROPIA", "TERCERA"]} /><Field name="administrationCompany" label="Empresa administradora (si aplica)" /><Field name="contactName" label="Persona de contacto" required /><Field name="contactRole" label="Cargo o rol" required /><Field name="contactPhone" label="Teléfono de contacto" type="tel" required /><Field name="contactEmail" label="Correo de contacto" type="email" required />
          </div><Button type="submit" disabled={busy}>Guardar edificio</Button></form>}
          {buildings.length ? <div className="record-list">{buildings.map(building => <article className="record-card" key={building.id}><div><span className="record-label">{building.district} · {building.apartments} departamentos</span><h3>{building.building_name}</h3><p>{building.street_type} {building.street_name} {building.street_number}, {building.province}</p><p>Contacto: {building.contact_name} · {building.contact_phone}</p></div><div className="record-actions"><span>{building.opportunities.length} oportunidades</span><Button variant="outline" onClick={() => setOpportunityBuilding(building.id)}>Agregar oportunidad</Button></div></article>)}</div> : <p className="empty-state">Aún no registras edificios. Agrega el primero para crear una oportunidad comercial.</p>}
        </section>}
        {tab === "oportunidades" && <section className="workspace-section"><div className="section-title"><h2>Oportunidades</h2><span>{opportunities.length} registradas</span></div>{opportunities.length ? <div className="record-list">{opportunities.map(({ building, opportunity }) => <article className="record-card" key={opportunity.id}><div><span className="record-label">{opportunity.plan} · {building.district}</span><h3>{building.building_name}</h3><p>{money(opportunity.unit_price_cents)} por departamento · {building.apartments} departamentos</p><p>{opportunity.observations}</p></div><div className="record-actions"><span className="status-chip pending">{opportunity.status}</span>{nextStatus[opportunity.status] && <Button variant="outline" disabled={busy} onClick={() => void save("advanceOpportunity", { opportunityId: opportunity.id, next: nextStatus[opportunity.status] })}>Pasar a {nextStatus[opportunity.status]}</Button>}</div></article>)}</div> : <p className="empty-state">Las oportunidades que agregues a tus edificios aparecerán aquí.</p>}</section>}
        {tab === "comisiones" && <section className="workspace-section"><div className="section-title"><h2>Comisiones</h2><span>{commissions.length} oportunidades ganadas</span></div>{commissions.length ? <div className="record-list">{commissions.map(({ building, opportunity }) => <article className="record-card" key={opportunity.id}><div><span className="record-label">{opportunity.plan} · {building.district}</span><h3>{building.building_name}</h3><p>{money(opportunity.unit_price_cents)} × {building.apartments} departamentos</p><strong>{money(opportunity.commission_cents ?? opportunity.unit_price_cents * building.apartments)}</strong></div><span className={opportunity.payment_status === "PAGADO" ? "status-chip paid" : "status-chip pending"}>{opportunity.payment_status === "PAGADO" ? "Pagado" : "Pendiente de pago"}</span></article>)}</div> : <p className="empty-state">Cuando administración valide un contrato firmado, la comisión aparecerá aquí.</p>}</section>}
        {tab === "perfil" && <section className="workspace-section"><div className="section-title"><h2>Mi información</h2><span>Solo lectura</span></div>{profile && <div className="profile-card"><div><span>Nombre completo</span><strong>{profile.first_name} {profile.paternal_surname} {profile.maternal_surname}</strong></div><div><span>Documento</span><strong>{profile.document_type} {profile.document_number}</strong></div><div><span>Teléfono</span><strong>{profile.phone}</strong></div><div><span>Correo</span><strong>{profile.email}</strong></div><p>Para solicitar un cambio en tus datos, escribe al correo administrador de Condomio.</p></div>}</section>}
      </>}
      {opportunityBuilding && <div className="portal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpportunityBuilding(null); }}><form className="portal-dialog" role="dialog" aria-modal="true" aria-label="Nueva oportunidad" onSubmit={submitOpportunity}><div className="section-title"><h2>Nueva oportunidad</h2><button type="button" onClick={() => setOpportunityBuilding(null)} aria-label="Cerrar">✕</button></div><SelectField name="plan" label="Tipo de plan" values={["BASICO", "PRO", "PERSONALIZADO"]} /><Field name="unitPrice" label="Precio unitario por departamento (S/)" type="number" min="0" step="0.01" required /><div className="form-field"><Label htmlFor="observations">Observaciones</Label><Textarea id="observations" name="observations" maxLength={2000} /></div><Button type="submit" disabled={busy}>Guardar oportunidad</Button></form></div>}
    </div>
  </main>;
}

function Field({ name, label, ...props }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) { return <div className="form-field"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} className="field-control" {...props} /></div>; }
function SelectField({ name, label, values }: { name: string; label: string; values: string[] }) { const [value, setValue] = useState(values[0]); return <div className="form-field"><Label htmlFor={name}>{label}</Label><input type="hidden" name={name} value={value} /><Select value={value} onValueChange={setValue}><SelectTrigger id={name} className="field-control"><SelectValue /></SelectTrigger><SelectContent>{values.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>; }
