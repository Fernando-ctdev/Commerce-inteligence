import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefSet, repairBriefs } from "./gates";
import { ContractError } from "./contract";
const brief = (id: string, angle = "angle", hook = "hook", cta = "cta") => ({ contentId: id, briefVersionId: `${id}-v1`, version: 1 as const, angle, hook, script: `Fale sobre ${id}`, scenes: ["a", "b"], cta });
test("desconto só é factual quando presente no catálogo: suportado com fato, contradito sem correspondência e não suportado sem fato", () => {
  const evidence = { facts: ["20% de desconto"], refs: ["fact:discountPercentage"] };
  const report = validateBriefSet([{ ...brief("d1"), script: "Mostre o produto e diga que ele está com 20% de desconto." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.deepEqual(report.evidenceRefs, ["fact:discountPercentage"]);
  const contradicted = validateBriefSet([{ ...brief("d2"), script: "Aproveite 30% de desconto hoje." }], evidence)[0];
  assert.equal(contradicted.factualStatus, "CONTRADICTED");
  const unsupported = validateBriefSet([{ ...brief("d3"), script: "Aproveite 20% de desconto hoje." }])[0];
  assert.equal(unsupported.factualStatus, "UNSUPPORTED");
});
test("regressão b0d4b7a6: negação não adjacente ao fato não é contradição", () => {
  // Cenário real do produto b0d4b7a6: priceCurrency "R$" entra como fato; o preço
  // "r$ 28,90" no script não forma token objetivo (R$ precede o número) e cai no
  // ramo subjetivo; "não" em outra frase não pode negar o fato "r$".
  const evidence = { facts: ["Calça Pantalona Duna", "R$"], refs: ["product:name", "fact:priceCurrency"] };
  const report = validateBriefSet([{ ...brief("b0d4b7a6"), script: "Essa pantalona não é cara: custa só r$ 28,90 e renova o look." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.deepEqual(report.evidenceRefs, ["fact:priceCurrency"]);
  // Negação imediatamente antes do fato continua sendo contradição.
  const negated = validateBriefSet([{ ...brief("b0d4b7a6-neg"), script: "Não r$ 28,90 aqui: é bem mais barato." }], evidence)[0];
  assert.equal(negated.factualStatus, "CONTRADICTED");
});
test("regressão b0d4b7a6: negação não adjacente a atributo autorizado não é contradição", () => {
  const evidence = { facts: ["Alça magnética ajustável"], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...brief("b0d4b7a6-attr"), script: "O fecho não é o único diferencial: alça magnética e ajustável." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
});
test("detects normalized duplicate and fails closed via typed repair exhaustion", () => { const briefs = [brief("a", "angle-a"), brief("b", "angle-b", "other", "other-cta")]; const reports = validateBriefSet(briefs); assert.equal(reports[0].decision, "PASS"); assert.equal(reports[1].decision, "PASS"); const duplicate = [brief("a", "angle-a"), { ...brief("b", "angle-b"), script: "Fale sobre a" }]; const detected = validateBriefSet(duplicate); assert.equal(detected[1].decision, "REPAIR"); assert.throws(() => repairBriefs(duplicate, detected, 1), (error: unknown) => error instanceof ContractError && error.code === "GEN-REPAIR-EXHAUSTED"); });