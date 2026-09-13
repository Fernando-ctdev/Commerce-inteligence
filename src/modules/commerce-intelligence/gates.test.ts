import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefSet, repairBriefs } from "./gates";
import { ContractError } from "./contract";
const brief = (id: string, angle = "angle", hook = "hook", cta = "cta") => ({ contentId: id, briefVersionId: `${id}-v1`, version: 1 as const, angle, hook, development: ["produto"], script: `Fale sobre ${id}`, cta });
test("desconto só é factual quando presente no catálogo: suportado com fato, contradito sem correspondência e não suportado sem fato", () => {
  const evidence = { facts: ["20% de desconto"], refs: ["fact:discountPercentage"] };
  const report = validateBriefSet([{ ...brief("d1"), development: ["20% de desconto"], script: "Mostre o produto e diga que ele está com 20% de desconto." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.deepEqual(report.evidenceRefs, ["fact:discountPercentage"]);
  const contradicted = validateBriefSet([{ ...brief("d2"), development: ["20% de desconto"], script: "Aproveite 30% de desconto hoje." }], evidence)[0];
  assert.equal(contradicted.factualStatus, "CONTRADICTED");
  const unsupported = validateBriefSet([{ ...brief("d3"), script: "Aproveite 20% de desconto hoje." }])[0];
  assert.equal(unsupported.factualStatus, "UNSUPPORTED");
});
test("regressão b0d4b7a6: negação não adjacente ao fato não é contradição", () => {
  // Cenário real do produto b0d4b7a6: priceCurrency "R$" entra como fato; o preço
  // "r$ 28,90" no script não forma token objetivo (R$ precede o número) e cai no
  // ramo subjetivo; "não" em outra frase não pode negar o fato "r$".
  const evidence = { facts: ["Calça Pantalona Duna", "R$"], refs: ["product:name", "fact:priceCurrency"] };
  const report = validateBriefSet([{ ...brief("b0d4b7a6"), development: ["Calça Pantalona Duna"], script: "Essa pantalona não é cara: custa só r$ 28,90 e renova o look." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.deepEqual(report.evidenceRefs, ["product:name", "fact:priceCurrency"]);
  // Negação imediatamente antes do fato continua sendo contradição.
  const negated = validateBriefSet([{ ...brief("b0d4b7a6-neg"), development: ["Calça Pantalona Duna"], script: "Não r$ 28,90 aqui: é bem mais barato." }], evidence)[0];
  assert.equal(negated.factualStatus, "CONTRADICTED");
});
test("regressão b0d4b7a6: negação não adjacente a atributo autorizado não é contradição", () => {
  const evidence = { facts: ["Alça magnética ajustável"], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...brief("b0d4b7a6-attr"), development: ["Alça magnética ajustável"], script: "O fecho não é o único diferencial: alça magnética e ajustável." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
});
test("regressão creator solo: produção complexa repara e briefing gravável sozinho passa", () => {
  // Caso real da nota "da-uma-olhada-nesse-briefing-d": câmera 360, montagem
  // complexa com múltiplos setups e motion graphics não são graváveis por um
  // creator sozinho com celular e tripé.
  const ev = { facts: ["Fone Space S1", "drivers de 40 mm", "R$"], refs: ["product:name", "fact:features", "fact:priceCurrency"] };
  const complexo = validateBriefSet([{ ...brief("solo-1"), development: ["Câmera orbita 360 graus ao redor da pessoa", "Montagem rápida: jogo, música e close", "Animação de ondas sonoras saindo do fone"], script: "Eu achava que áudio espacial era conversa de marketing. A câmera gira 360 graus ao redor de mim enquanto o som passa de lado a lado.", cta: "Saiba mais." }], ev)[0];
  assert.equal(complexo.decision, "REPAIR");
  assert.ok(complexo.issues.some((issue) => issue.includes("creator solo")));
  const motion = validateBriefSet([{ ...brief("solo-2"), development: ["Abertura com motion graphics e VFX"], script: "Mostra o produto.", cta: "cta" }], ev)[0];
  assert.equal(motion.decision, "REPAIR");
  // Briefing gravável sozinho: câmera fixa no tripé, mãos + produto, close simples.
  const solo = validateBriefSet([{ ...brief("solo-3"), development: ["Destaque Fone Space S1", "Reforce drivers de 40 mm"], script: "Esse fone é o Fone Space S1 e tem drivers de 40 mm.", cta: "Se você curte esse tipo de imersão, vale dar uma olhada nesse aqui." }], ev)[0];
  assert.equal(solo.decision, "PASS");
});
test("detects normalized duplicate and fails closed via typed repair exhaustion", () => { const ev = { facts: ["produto"], refs: ["product:name"] }; const briefs = [brief("a", "angle-a"), brief("b", "angle-b", "other", "other-cta")]; const reports = validateBriefSet(briefs, ev); assert.equal(reports[0].decision, "PASS"); assert.equal(reports[1].decision, "PASS"); const duplicate = [brief("a", "angle-a"), { ...brief("b", "angle-b"), script: "Fale sobre a" }]; const detected = validateBriefSet(duplicate, ev); assert.equal(detected[1].decision, "REPAIR"); assert.throws(() => repairBriefs(duplicate, detected, 1), (error: unknown) => error instanceof ContractError && error.code === "GEN-REPAIR-EXHAUSTED"); });
