import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefSet } from "./gates";
import type { EvidenceSnapshot } from "./contract";
const evidence: EvidenceSnapshot = { facts: ["Produto"], refs: ["Produto"] };
const base = { contentId: "c", briefVersionId: "b", version: 1 as const, angle: "a", hook: "h", script: "Produto", scenes: ["1", "2"], cta: "c" };
test("rejects unsupported objective claim", () => { const report = validateBriefSet([{ ...base, script: "aguenta 5 kg" }], evidence)[0]; assert.equal(report.factualStatus, "UNSUPPORTED"); assert.equal(report.claimType, "objetivo"); assert.equal(report.decision, "REPAIR"); });
test("rejects contradicted claim", () => assert.equal(validateBriefSet([{ ...base, script: "Produto nunca funciona" }], evidence)[0].factualStatus, "CONTRADICTED"));
test("rejects unsupported platform skill", () => assert.equal(validateBriefSet([base], evidence, "unknown", "unknown@1")[0].platformStatus, "FAIL"));
test("rejects excessive scene count for platform", () => assert.equal(validateBriefSet([{ ...base, scenes: ["1", "2", "3", "4", "5", "6", "7"] }], evidence)[0].platformStatus, "FAIL"));
test("objective claim with matching value and unit is supported without literal substring", () => { const ev = { facts: ["Bateria de 4000 mAh"], refs: ["fact:bateria"] }; const report = validateBriefSet([{ ...base, script: "rende até 4000 mAh em uso intenso contínuo" }], ev)[0]; assert.equal(report.factualStatus, "SUPPORTED"); assert.equal(report.decision, "PASS"); });
test("objective claim with conflicting value is contradicted", () => { const ev = { facts: ["Bateria de 4000 mAh"], refs: ["fact:bateria"] }; const report = validateBriefSet([{ ...base, script: "nada supera os 5000 mAh reais" }], ev)[0]; assert.equal(report.factualStatus, "CONTRADICTED"); assert.equal(report.decision, "REJECT"); });
test("strategic claim without technical attribute is inferred but safe", () => assert.equal(validateBriefSet([{ ...base, script: "a escolha inteligente do dia a dia" }], evidence)[0].factualStatus, "INFERRED_BUT_SAFE"));
test("non-numeric objective attribute backed by evidence is supported", () => {
  const ev = { facts: ["Base magnética, compacto, montagem simples."], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...base, script: "A base magnética segura o celular durante a montagem" }], ev)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.equal(report.claimType, "objetivo");
  assert.equal(report.decision, "PASS");
});
test("non-numeric objective attribute without evidence is unsupported", () => {
  const ev = { facts: ["Base magnética, compacto, montagem simples."], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...base, script: "Feito em alumínio aeroespantil" }], ev)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.claimType, "objetivo");
  assert.equal(report.decision, "REPAIR");
});
test("contradicted numeric fact still rejected with attribute catalog present", () => {
  const ev = { facts: ["Bateria de 4000 mAh", "Base magnética"], refs: ["fact:bateria", "fact:features"] };
  const report = validateBriefSet([{ ...base, script: "são 9000 mAh de autonomia" }], ev)[0];
  assert.equal(report.factualStatus, "CONTRADICTED");
});
test("CTA neutro passa, claim factual sem evidência repara, contradição rejeita e anti-pattern repara", () => {
  const neutral = validateBriefSet([{ ...base, cta: "Confira no carrinho" }])[0];
  assert.equal(neutral.decision, "PASS");
  const unsupported = validateBriefSet([{ ...base, cta: "Entrega em 24 horas" }])[0];
  assert.equal(unsupported.factualStatus, "UNSUPPORTED");
  assert.equal(unsupported.decision, "REPAIR");
  const contradicted = validateBriefSet([{ ...base, cta: "Não funciona nunca" }], evidence)[0];
  assert.equal(contradicted.factualStatus, "CONTRADICTED");
  assert.equal(contradicted.decision, "REJECT");
  const antiPattern = validateBriefSet([{ ...base, cta: "Corre, última chance!" }])[0];
  assert.equal(antiPattern.decision, "REPAIR");
});
