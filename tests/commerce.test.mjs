import test from "node:test";
import assert from "node:assert/strict";
import { normalizePin } from "../lib/auth-config.ts";
import { commercialStage, commissionCents, normalizeAddress, opportunityUnitPriceCents, sellerGuidance, transitionAsSeller, validatePaid, validateWin } from "../lib/commerce.ts";
import { gradeAssessment } from "../lib/assessment.ts";
import { resumableApplication } from "../lib/application-progress.ts";

test("solo el vendedor avanza por las transiciones permitidas", () => {
  assert.equal(transitionAsSeller("CONTACTO", "DEMO"), "DEMO");
  assert.equal(transitionAsSeller("DEMO", "NEGOCIACIÓN"), "NEGOCIACIÓN");
  assert.equal(transitionAsSeller("NEGOCIACIÓN", "PERDIDO"), "PERDIDO");
  assert.throws(() => transitionAsSeller("NEGOCIACIÓN", "GANADO"));
  assert.throws(() => transitionAsSeller("GANADO", "PERDIDO"));
});

test("ganado requiere negociación y contrato firmado", () => {
  assert.equal(validateWin("NEGOCIACIÓN", true), "GANADO");
  assert.throws(() => validateWin("NEGOCIACIÓN", false));
  assert.throws(() => validateWin("DEMO", true));
});

test("comisión es precio unitario por departamentos sin IGV", () => {
  assert.equal(commissionCents(2400, 48), 97627);
  assert.equal(commissionCents(2400, 48, 50), 48814);
  assert.throws(() => commissionCents(2400, 0));
  assert.throws(() => commissionCents(Number.MAX_SAFE_INTEGER, 2));
});

test("precio del plan aplica autonomía comercial", () => {
  assert.equal(opportunityUnitPriceCents("BASICO", false), 250);
  assert.equal(opportunityUnitPriceCents("BASICO", true), 200);
  assert.equal(opportunityUnitPriceCents("PRO", false), 350);
  assert.equal(opportunityUnitPriceCents("PRO", true), 300);
});

test("solo se paga una comisión ganada y pendiente", () => {
  assert.equal(validatePaid("GANADO", "PENDIENTE_DE_PAGO"), "PAGADO");
  assert.throws(() => validatePaid("GANADO", "PAGADO"));
  assert.throws(() => validatePaid("DEMO", "PENDIENTE_DE_PAGO"));
});

test("cada estado visible tiene etapa y siguiente paso calculados", () => {
  assert.equal(commercialStage("DEMO_AGENDADA"), "DEMO");
  assert.equal(commercialStage("PLAN_SELECCIONADO"), "CONTRATO");
  assert.equal(commercialStage("PRIMERA_CUOTA_PENDIENTE"), "ACTIVACION");
  assert.equal(sellerGuidance("CONTACTO_REGISTRADO").action, "SCHEDULE_DEMO");
  assert.equal(sellerGuidance("DEMO_REALIZADA").responsible, "CONDOMIO");
});

test("la dirección normalizada permite detectar duplicados", () => {
  assert.equal(
    normalizeAddress(["Avenida", "José Pardo", "123", "Miraflores", "Lima", "Lima"]),
    "avenida jose pardo 123 miraflores lima lima",
  );
});

test("el PIN requiere exactamente seis dígitos", () => {
  assert.equal(normalizePin("123456"), "123456");
  assert.equal(normalizePin("12345"), null);
  assert.equal(normalizePin("12A456"), null);
});

test("evaluaciones se corrigen en el servidor", () => {
  assert.equal(gradeAssessment("attitude", [1, 2, 0, 1]), 4);
  assert.equal(gradeAssessment("commercial", [0, 1, 0, 2]), 3);
  assert.throws(() => gradeAssessment("attitude", [1, 2]));
  assert.throws(() => gradeAssessment("attitude", [1, 2, 0, 9]));
});

test("una postulación validada retoma el último hito guardado", () => {
  assert.deepEqual(resumableApplication("APPLICANT", "ACTITUDINAL", null), { step: "actitud", passedAttitude: false, passedCommercial: false });
  assert.deepEqual(resumableApplication("APPLICANT", "APTITUDINAL", 4), { step: "examen", passedAttitude: true, passedCommercial: false });
  assert.deepEqual(resumableApplication("APPLICANT", "VALIDATION", 4), { step: "validacion", passedAttitude: true, passedCommercial: true });
  assert.deepEqual(resumableApplication("APPLICANT", "CONTRACT", 4), { step: "bienvenida", passedAttitude: true, passedCommercial: true });
  assert.equal(resumableApplication("ACTIVE", "ACTIVE", 4), null);
});
