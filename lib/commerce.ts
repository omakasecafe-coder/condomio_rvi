export type PaymentStatus = "PENDIENTE_DE_PAGO" | "PAGADO";
export type CommercialPlan = "BASICO" | "PRO";

export const planPricesCents: Record<CommercialPlan, number> = { BASICO: 250, PRO: 350 };

export const sellerStates = [
  "SIN_CONTACTO", "CONTACTO_REGISTRADO", "DEMO_AGENDADA", "DEMO_REALIZADA",
  "INFORMACION_ENVIADA", "PLAN_PENDIENTE", "PLAN_SELECCIONADO",
  "CONTRATO_SOLICITADO", "CONTRATO_ENVIADO", "CONTRATO_EN_VALIDACION",
  "ONBOARDING", "PRIMERA_CUOTA_PENDIENTE", "CONCRETADA", "NO_CONCRETADA",
] as const;

export type SellerState = (typeof sellerStates)[number];
export type CommercialStage = "DEMO" | "ELECCION_PLAN" | "CONTRATO" | "ACTIVACION" | "CONCRETADA" | "NO_CONCRETADA";
export type ResponsibleRole = "VENDEDOR" | "CONDOMIO" | "AMBOS";

export const sellerStateLabels: Record<SellerState, string> = {
  SIN_CONTACTO: "Sin contacto", CONTACTO_REGISTRADO: "Contacto registrado",
  DEMO_AGENDADA: "Demo agendada", DEMO_REALIZADA: "Demo realizada",
  INFORMACION_ENVIADA: "Información enviada", PLAN_PENDIENTE: "Plan pendiente",
  PLAN_SELECCIONADO: "Plan seleccionado", CONTRATO_SOLICITADO: "Contrato solicitado",
  CONTRATO_ENVIADO: "Contrato enviado", CONTRATO_EN_VALIDACION: "Contrato en validación",
  ONBOARDING: "Onboarding", PRIMERA_CUOTA_PENDIENTE: "Primera cuota pendiente",
  CONCRETADA: "Concretada", NO_CONCRETADA: "No concretada",
};

export const commercialStageLabels: Record<CommercialStage, string> = {
  DEMO: "Demo", ELECCION_PLAN: "Elección de plan", CONTRATO: "Contrato",
  ACTIVACION: "Activación", CONCRETADA: "Concretada", NO_CONCRETADA: "No concretada",
};

const stateStage: Record<SellerState, CommercialStage> = {
  SIN_CONTACTO: "DEMO", CONTACTO_REGISTRADO: "DEMO", DEMO_AGENDADA: "DEMO",
  DEMO_REALIZADA: "DEMO", INFORMACION_ENVIADA: "ELECCION_PLAN", PLAN_PENDIENTE: "ELECCION_PLAN",
  PLAN_SELECCIONADO: "CONTRATO", CONTRATO_SOLICITADO: "CONTRATO", CONTRATO_ENVIADO: "CONTRATO",
  CONTRATO_EN_VALIDACION: "CONTRATO", ONBOARDING: "ACTIVACION", PRIMERA_CUOTA_PENDIENTE: "ACTIVACION",
  CONCRETADA: "CONCRETADA", NO_CONCRETADA: "NO_CONCRETADA",
};

export type StateGuidance = {
  nextStep: string;
  responsible: ResponsibleRole;
  action: "ADD_CONTACT" | "SCHEDULE_DEMO" | "WAIT_DEMO" | "WAIT_CONDOMIO" | "CHOOSE_PLAN" | "REQUEST_CONTRACT" | "UPLOAD_CONTRACT" | "VIEW_PROGRESS" | null;
  actionLabel: string | null;
};

const guidance: Record<SellerState, StateGuidance> = {
  SIN_CONTACTO: { nextStep: "Agrega una persona de contacto para coordinar la demostración.", responsible: "VENDEDOR", action: "ADD_CONTACT", actionLabel: "Agregar contacto" },
  CONTACTO_REGISTRADO: { nextStep: "Agenda una demostración con el contacto principal.", responsible: "VENDEDOR", action: "SCHEDULE_DEMO", actionLabel: "Agendar demo" },
  DEMO_AGENDADA: { nextStep: "Asiste a la demostración en la fecha coordinada.", responsible: "AMBOS", action: "WAIT_DEMO", actionLabel: "Ver demo agendada" },
  DEMO_REALIZADA: { nextStep: "Condomio registrará el resultado y enviará la información comercial.", responsible: "CONDOMIO", action: "WAIT_CONDOMIO", actionLabel: null },
  INFORMACION_ENVIADA: { nextStep: "Revisa la información y selecciona el plan acordado con el edificio.", responsible: "VENDEDOR", action: "CHOOSE_PLAN", actionLabel: "Elegir plan" },
  PLAN_PENDIENTE: { nextStep: "Selecciona el plan y confirma el número de departamentos.", responsible: "VENDEDOR", action: "CHOOSE_PLAN", actionLabel: "Elegir plan" },
  PLAN_SELECCIONADO: { nextStep: "Solicita a Condomio la generación del contrato.", responsible: "VENDEDOR", action: "REQUEST_CONTRACT", actionLabel: "Solicitar contrato" },
  CONTRATO_SOLICITADO: { nextStep: "Condomio revisará los datos y generará el contrato.", responsible: "CONDOMIO", action: "WAIT_CONDOMIO", actionLabel: null },
  CONTRATO_ENVIADO: { nextStep: "Carga el contrato firmado por el representante autorizado.", responsible: "VENDEDOR", action: "UPLOAD_CONTRACT", actionLabel: "Subir contrato firmado" },
  CONTRATO_EN_VALIDACION: { nextStep: "Condomio validará el contrato firmado.", responsible: "CONDOMIO", action: "WAIT_CONDOMIO", actionLabel: null },
  ONBOARDING: { nextStep: "Acompaña al edificio durante su activación en Condomio.", responsible: "AMBOS", action: "VIEW_PROGRESS", actionLabel: "Ver avance" },
  PRIMERA_CUOTA_PENDIENTE: { nextStep: "La comisión se generará cuando Condomio confirme la primera cuota.", responsible: "CONDOMIO", action: "VIEW_PROGRESS", actionLabel: "Ver avance" },
  CONCRETADA: { nextStep: "La venta fue concretada. Revisa el estado de tu comisión.", responsible: "CONDOMIO", action: "VIEW_PROGRESS", actionLabel: "Ver comisión" },
  NO_CONCRETADA: { nextStep: "Esta oportunidad se cerró sin concretarse.", responsible: "VENDEDOR", action: null, actionLabel: null },
};

export function commercialStage(state: SellerState): CommercialStage { return stateStage[state]; }
export function sellerGuidance(state: SellerState): StateGuidance { return guidance[state]; }

export function normalizeAddress(parts: readonly string[]): string {
  return parts.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function opportunityUnitPriceCents(plan: CommercialPlan, autonomyDiscount: boolean): number {
  return planPricesCents[plan] - (autonomyDiscount ? 50 : 0);
}

export function commissionCents(unitPriceCents: number, apartments: number, percentage = 100): number {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || !Number.isSafeInteger(apartments) || apartments < 1 || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    throw new Error("Precio, departamentos o porcentaje de comisión inválido.");
  }
  const amount = Math.round((unitPriceCents * apartments * percentage * 100) / 11800);
  if (!Number.isSafeInteger(amount)) throw new Error("El importe de la comisión excede el límite permitido.");
  return amount;
}

// Compatibility with v1 records. New seller flows use seller_state and do not
// expose a generic status selector.
export const opportunityStatuses = ["CONTACTO", "DEMO", "NEGOCIACIÓN", "GANADO", "PERDIDO"] as const;
export type OpportunityStatus = (typeof opportunityStatuses)[number];
const sellerNext: Partial<Record<OpportunityStatus, OpportunityStatus>> = { CONTACTO: "DEMO", DEMO: "NEGOCIACIÓN", "NEGOCIACIÓN": "PERDIDO" };

export function transitionAsSeller(current: OpportunityStatus, next: OpportunityStatus): OpportunityStatus {
  if (sellerNext[current] !== next) throw new Error("El vendedor no puede realizar esta transición.");
  return next;
}

export function validateWin(current: OpportunityStatus, contractSigned: boolean): "GANADO" {
  if (current !== "NEGOCIACIÓN" || !contractSigned) throw new Error("Se requiere una oportunidad en negociación y un contrato firmado.");
  return "GANADO";
}

export function validatePaid(opportunityStatus: OpportunityStatus, paymentStatus: PaymentStatus): "PAGADO" {
  if (opportunityStatus !== "GANADO" || paymentStatus !== "PENDIENTE_DE_PAGO") throw new Error("Solo puede pagarse una comisión ganada y pendiente.");
  return "PAGADO";
}
