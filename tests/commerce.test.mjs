import test from "node:test";
import assert from "node:assert/strict";
import { commissionCents, transitionAsSeller, validatePaid, validateWin } from "../lib/commerce.ts";
import { gradeAssessment } from "../lib/assessment.ts";

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

test("comisión es precio unitario por departamentos", () => {
  assert.equal(commissionCents(2400, 48), 115200);
  assert.throws(() => commissionCents(2400, 0));
  assert.throws(() => commissionCents(Number.MAX_SAFE_INTEGER, 2));
});

test("solo se paga una comisión ganada y pendiente", () => {
  assert.equal(validatePaid("GANADO", "PENDIENTE_DE_PAGO"), "PAGADO");
  assert.throws(() => validatePaid("GANADO", "PAGADO"));
  assert.throws(() => validatePaid("DEMO", "PENDIENTE_DE_PAGO"));
});

test("evaluaciones se corrigen en el servidor", () => {
  assert.equal(gradeAssessment("attitude", [1, 2, 0, 1]), 4);
  assert.equal(gradeAssessment("commercial", [0, 1, 0, 2]), 3);
  assert.throws(() => gradeAssessment("attitude", [1, 2]));
  assert.throws(() => gradeAssessment("attitude", [1, 2, 0, 9]));
});
