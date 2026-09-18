export const opportunityStatuses = [
  "CONTACTO",
  "DEMO",
  "NEGOCIACIÓN",
  "GANADO",
  "PERDIDO",
] as const;

export type OpportunityStatus = (typeof opportunityStatuses)[number];
export type PaymentStatus = "PENDIENTE_DE_PAGO" | "PAGADO";

const sellerNext: Partial<Record<OpportunityStatus, OpportunityStatus>> = {
  CONTACTO: "DEMO",
  DEMO: "NEGOCIACIÓN",
  "NEGOCIACIÓN": "PERDIDO",
};

export function transitionAsSeller(
  current: OpportunityStatus,
  next: OpportunityStatus,
): OpportunityStatus {
  if (sellerNext[current] !== next) {
    throw new Error("El vendedor no puede realizar esta transición.");
  }
  return next;
}

export function validateWin(
  current: OpportunityStatus,
  contractSigned: boolean,
): "GANADO" {
  if (current !== "NEGOCIACIÓN" || !contractSigned) {
    throw new Error("Se requiere una oportunidad en negociación y un contrato firmado.");
  }
  return "GANADO";
}

export function commissionCents(
  unitPriceCents: number,
  apartments: number,
): number {
  if (
    !Number.isSafeInteger(unitPriceCents) ||
    unitPriceCents < 0 ||
    !Number.isSafeInteger(apartments) ||
    apartments < 1
  ) {
    throw new Error("Precio unitario o número de departamentos inválido.");
  }
  const amount = unitPriceCents * apartments;
  if (!Number.isSafeInteger(amount)) {
    throw new Error("El importe de la comisión excede el límite permitido.");
  }
  return amount;
}

export function validatePaid(
  opportunityStatus: OpportunityStatus,
  paymentStatus: PaymentStatus,
): "PAGADO" {
  if (opportunityStatus !== "GANADO" || paymentStatus !== "PENDIENTE_DE_PAGO") {
    throw new Error("Solo puede pagarse una comisión ganada y pendiente.");
  }
  return "PAGADO";
}
