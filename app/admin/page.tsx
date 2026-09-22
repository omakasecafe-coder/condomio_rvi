"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Opportunity = { id: string; plan: string; unit_price_cents: number; status: string; commission_cents: number | null; payment_status: string | null };
type Building = { id: string; building_name: string; apartments: number; district: string; seller_profiles: { first_name: string; paternal_surname: string }; opportunities: Opportunity[] };
type Item = { building: Building; opportunity: Opportunity };

const money = (cents: number) => `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sampleBuildings: Building[] = [
  { id: "a-1", building_name: "Residencial Los Olivos", apartments: 48, district: "Miraflores", seller_profiles: { first_name: "Valeria", paternal_surname: "Ramos" }, opportunities: [{ id: "ao-1", plan: "PRO", unit_price_cents: 2400, status: "NEGOCIACIÓN", commission_cents: null, payment_status: null }] },
  { id: "a-2", building_name: "Edificio Aurora", apartments: 32, district: "San Isidro", seller_profiles: { first_name: "Valeria", paternal_surname: "Ramos" }, opportunities: [{ id: "ao-2", plan: "BASICO", unit_price_cents: 1800, status: "GANADO", commission_cents: 57600, payment_status: "PENDIENTE_DE_PAGO" }] },
  { id: "a-3", building_name: "Condominio Brisa", apartments: 60, district: "Surco", seller_profiles: { first_name: "Mateo", paternal_surname: "Flores" }, opportunities: [{ id: "ao-3", plan: "PERSONALIZADO", unit_price_cents: 2700, status: "GANADO", commission_cents: 162000, payment_status: "PAGADO" }] },
];

export default function AdminPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);

  const reload = useCallback(async () => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") { setDemo(true); setBuildings(sampleBuildings); setLoading(false); return; }
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/admin/login"); return; }
      const result = (await response.json()) as { buildings?: Building[]; error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudieron cargar los datos.");
      setBuildings(result.buildings || []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Initial data loading intentionally synchronizes API state into the view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  async function act(item: Item, action: "markWon" | "markPaid") {
    if (demo) { setError("Esta es una muestra visual. Los cambios no se guardan."); return; }
    setBusy(item.opportunity.id);
    setError("");
    try {
      const response = await fetch("/api/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, opportunityId: item.opportunity.id, contractSigned: action === "markWon" ? !!checks[item.opportunity.id] : undefined }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el cambio.");
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio."); }
    finally { setBusy(null); }
  }

  const all = buildings.flatMap(building => building.opportunities.map(opportunity => ({ building, opportunity })));
  const pending = all.filter(item => item.opportunity.status === "NEGOCIACIÓN");
  const won = all.filter(item => item.opportunity.status === "GANADO");
  const unpaid = won.filter(item => item.opportunity.payment_status === "PENDIENTE_DE_PAGO");
  useEffect(() => { document.title = "Administración · Condomio MVP"; }, []);

  return <main className="mvp-shell workspace-shell">
    <header className="workspace-header"><div className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Administración</small></span></div><span className="workspace-label">Control comercial</span></header>
    <section className="workspace-content">
      {demo && <p className="demo-banner">Vista de muestra · datos ficticios · sin guardado</p>}
      <div className="workspace-heading"><div><span className="eyebrow">GESTIÓN COMERCIAL</span><h1>Validación y comisiones</h1><p>Confirma contratos firmados y registra los pagos de las oportunidades ganadas.</p></div></div>
      <div className="metric-row"><div><span>En negociación</span><strong>{pending.length}</strong></div><div><span>Ganadas</span><strong>{won.length}</strong></div><div><span>Pago pendiente</span><strong>{unpaid.length}</strong></div></div>
      {error && <p role="alert" className="workspace-error">{error}</p>}
      {loading ? <p>Cargando oportunidades…</p> : <>
        <section className="workspace-section"><div className="section-title"><h2>Contratos por validar</h2><span>{pending.length} oportunidades</span></div>
          {pending.length ? <div className="record-list">{pending.map(item => <article className="record-card" key={item.opportunity.id}>
            <div><span className="record-label">{item.opportunity.plan} · {item.building.district}</span><h3>{item.building.building_name}</h3><p>Vendedor: {item.building.seller_profiles.first_name} {item.building.seller_profiles.paternal_surname}</p><p>{money(item.opportunity.unit_price_cents)} × {item.building.apartments} departamentos</p><strong>Comisión: {money(item.opportunity.unit_price_cents * item.building.apartments)}</strong></div>
            <div className="record-actions"><label className="checkbox-label"><Checkbox checked={!!checks[item.opportunity.id]} onCheckedChange={checked => setChecks(current => ({ ...current, [item.opportunity.id]: checked === true }))} /><span>Confirmo que el contrato está firmado</span></label><Button disabled={!checks[item.opportunity.id] || busy === item.opportunity.id} onClick={() => void act(item, "markWon")}>Marcar Ganado</Button></div>
          </article>)}</div> : <p className="empty-state">No hay contratos pendientes de validación.</p>}
        </section>
        <section className="workspace-section"><div className="section-title"><h2>Comisiones</h2><span>{won.length} oportunidades ganadas</span></div>
          {won.length ? <div className="record-list">{won.map(item => <article className="record-card" key={item.opportunity.id}>
            <div><span className="record-label">{item.opportunity.plan} · {item.building.district}</span><h3>{item.building.building_name}</h3><p>{item.building.apartments} departamentos × {money(item.opportunity.unit_price_cents)}</p><strong>{money(item.opportunity.commission_cents ?? 0)}</strong></div>
            <div className="record-actions"><span className={item.opportunity.payment_status === "PAGADO" ? "status-chip paid" : "status-chip pending"}>{item.opportunity.payment_status === "PAGADO" ? "Pagado" : "Pendiente de pago"}</span>{item.opportunity.payment_status !== "PAGADO" && <Button variant="outline" disabled={busy === item.opportunity.id} onClick={() => void act(item, "markPaid")}>Marcar Pagado</Button>}</div>
          </article>)}</div> : <p className="empty-state">Las oportunidades ganadas aparecerán aquí.</p>}
        </section>
      </>}
    </section>
  </main>;
}
