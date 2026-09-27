"use client";

import { useMemo, useState } from "react";
import { sellerStateLabels, sellerStates } from "@/lib/commerce";

type ReviewGroup = "Sitio público" | "Accesos" | "Postulación" | "Portal vendedor" | "Administración";
type ReviewScreen = {
  id: string;
  group: ReviewGroup;
  name: string;
  description: string;
  path: string;
};

const screens: ReviewScreen[] = [
  { id: "WEB01", group: "Sitio público", name: "Página principal", description: "Presentación pública de la red comercial independiente.", path: "/" },
  { id: "AC01", group: "Accesos", name: "Acceso del vendedor", description: "Ingreso con documento y PIN de seis dígitos.", path: "/ingresar" },
  { id: "AC02", group: "Accesos", name: "Acceso administrativo", description: "Ingreso restringido al correo administrador.", path: "/admin/login" },
  { id: "P01", group: "Postulación", name: "Consulta de documento", description: "Validación inicial para detectar y recuperar postulaciones existentes.", path: "/postular?demo=1&paso=documento" },
  { id: "P02", group: "Postulación", name: "Datos personales", description: "Datos adicionales solicitados únicamente a postulantes nuevos.", path: "/postular?demo=1&paso=datos" },
  { id: "P02.1", group: "Postulación", name: "Validación de correo", description: "Ingreso del código de seis dígitos para crear o recuperar la postulación.", path: "/postular?demo=1&paso=correo" },
  { id: "P02.2", group: "Postulación", name: "Recuperar postulación", description: "Validación del correo registrado antes de retomar el último hito.", path: "/postular?demo=1&paso=correo&existente=1" },
  { id: "P03", group: "Postulación", name: "Test actitudinal", description: "Preguntas de evaluación actitudinal.", path: "/postular?demo=1&paso=actitud" },
  { id: "P04", group: "Postulación", name: "Resultado aprobado", description: "Felicitación después de superar el filtro actitudinal.", path: "/postular?demo=1&paso=resultado&aprobado=1" },
  { id: "P05", group: "Postulación", name: "Resultado no aprobado", description: "Mensaje de cierre cuando no se supera el filtro.", path: "/postular?demo=1&paso=resultado" },
  { id: "P06", group: "Postulación", name: "Conoce Condomio", description: "Producto, funcionamiento y modelo comercial.", path: "/postular?demo=1&paso=conoce" },
  { id: "P07", group: "Postulación", name: "Test comercial", description: "Evaluación sobre Condomio y su modelo comercial.", path: "/postular?demo=1&paso=examen" },
  { id: "P08", group: "Postulación", name: "Resultado comercial", description: "Pantalla para volver a estudiar y reintentar.", path: "/postular?demo=1&paso=resultado-comercial" },
  { id: "P09", group: "Postulación", name: "Validación final", description: "Documento, cuenta, CCI y aceptación de condiciones.", path: "/postular?demo=1&paso=validacion" },
  { id: "P10", group: "Postulación", name: "Bienvenida y creación de PIN", description: "Creación de la clave de seis dígitos y activación del acceso.", path: "/postular?demo=1&paso=bienvenida" },
  { id: "V01", group: "Portal vendedor", name: "Edificios", description: "Lista de edificios registrados por el vendedor.", path: "/portal?demo=1&seccion=edificios" },
  { id: "V02", group: "Portal vendedor", name: "Nuevo edificio", description: "Formulario completo para registrar un lead.", path: "/portal?demo=1&vista=nuevo-edificio" },
  { id: "V03", group: "Portal vendedor", name: "Detalle de oportunidad", description: "Estado, siguiente paso y condiciones comerciales según avance.", path: "/portal?demo=1&vista=detalle-oportunidad" },
  { id: "V04", group: "Portal vendedor", name: "Oportunidades", description: "Procesos agrupados por su etapa comercial real.", path: "/portal?demo=1&seccion=oportunidades" },
  ...sellerStates.map((state, index) => ({ id: `V04.${String(index + 1).padStart(2, "0")}`, group: "Portal vendedor" as const, name: sellerStateLabels[state], description: `Vista de muestra del estado “${sellerStateLabels[state]}”.`, path: `/portal?demo=1&seccion=oportunidades&estado=${state}` })),
  { id: "V05", group: "Portal vendedor", name: "Comisiones", description: "Ganadas, pendientes de pago y pagadas.", path: "/portal?demo=1&seccion=comisiones" },
  { id: "V06", group: "Portal vendedor", name: "Mi información", description: "Datos personales en modo de solo lectura.", path: "/portal?demo=1&seccion=perfil" },
  { id: "A01", group: "Administración", name: "Control comercial", description: "Validación de contratos y actualización de comisiones.", path: "/admin?demo=1" },
];

const groups: ReviewGroup[] = ["Sitio público", "Accesos", "Postulación", "Portal vendedor", "Administración"];

export default function ReviewWorkspace() {
  const [selectedId, setSelectedId] = useState("WEB01");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const selected = screens.find(screen => screen.id === selectedId) ?? screens[0];
  const frameWidth = { desktop: "100%", tablet: "820px", mobile: "390px" }[viewport];

  const feedback = useMemo(() => [
    `[${selected.id} · ${selected.name}]`,
    note.trim() || "Cambio solicitado: ",
    `Pantalla: ${selected.path}`,
  ].join("\n"), [note, selected]);

  async function copyFeedback() {
    await navigator.clipboard.writeText(feedback);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <main className="review-shell">
    <header className="review-header">
      <div className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Revisión del MVP</small></span></div>
      <div className="review-header-copy"><strong>Tablero de pantallas</strong><span>Entorno visual · no ingreses datos reales</span></div>
    </header>

    <div className="review-layout">
      <aside className="review-catalog" aria-label="Catálogo de pantallas">
        <div className="review-intro"><span className="eyebrow">VERSIÓN EN DESARROLLO</span><h1>Revisa cada flujo.</h1><p>Selecciona una pantalla, pruébala y copia una observación con su código de referencia.</p></div>
        {groups.map(group => <section key={group} className="review-group">
          <h2>{group}</h2>
          {screens.filter(screen => screen.group === group).map(screen => <button key={screen.id} type="button" className={screen.id === selected.id ? "active" : ""} onClick={() => { setSelectedId(screen.id); setNote(""); }}>
            <span>{screen.id}</span><div><strong>{screen.name}</strong><small>{screen.description}</small></div>
          </button>)}
        </section>)}
      </aside>

      <section className="review-stage">
        <div className="review-toolbar">
          <div><span className="review-code">{selected.id}</span><h2>{selected.name}</h2><p>{selected.description}</p></div>
          <div className="review-actions">
            <div className="viewport-switch" aria-label="Tamaño de vista">
              {(["desktop", "tablet", "mobile"] as const).map(size => <button key={size} type="button" className={viewport === size ? "active" : ""} onClick={() => setViewport(size)}>{({ desktop: "Escritorio", tablet: "Tablet", mobile: "Móvil" } as const)[size]}</button>)}
            </div>
            <a href={selected.path} target="_blank" rel="noreferrer">Abrir completa ↗</a>
          </div>
        </div>

        <div className="review-canvas">
          <div className="review-device" style={{ width: frameWidth }}>
            <div className="review-browser-bar"><i /><i /><i /><span>{selected.path}</span></div>
            <iframe key={`${selected.id}-${viewport}`} title={`${selected.id} ${selected.name}`} src={selected.path} />
          </div>
        </div>

        <div className="review-feedback">
          <div><span className="eyebrow">COMENTARIO PARA EL EQUIPO</span><h2>¿Qué debemos modificar?</h2><p>Describe el cambio y copia el texto para enviarlo por el chat. La referencia de pantalla se agregará automáticamente.</p></div>
          <div className="review-feedback-form">
            <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Ejemplo: Cambiar el título principal y dar mayor contraste al botón…" rows={4} />
            <button type="button" onClick={() => void copyFeedback()}>{copied ? "Comentario copiado ✓" : "Copiar comentario"}</button>
          </div>
        </div>
      </section>
    </div>
  </main>;
}
