import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefSet } from "./gates";
import type { EvidenceSnapshot } from "./contract";
import { CREATIVE_CATALOG } from "./platform-skill";
const evidence: EvidenceSnapshot = { facts: ["Produto"], refs: ["Produto"] };
const base = { contentId: "c", briefVersionId: "b", version: 1 as const, angle: "a", hook: "h", development: ["Uso cotidiano do item"], script: "Produto", scenes: ["1", "2"], cta: "c" };
test("rejects unsupported objective claim", () => { const report = validateBriefSet([{ ...base, script: "aguenta 5 kg" }], evidence)[0]; assert.equal(report.factualStatus, "UNSUPPORTED"); assert.equal(report.claimType, "objetivo"); assert.equal(report.decision, "REPAIR"); });
test("rejects contradicted claim", () => assert.equal(validateBriefSet([{ ...base, script: "Produto nunca funciona" }], evidence)[0].factualStatus, "CONTRADICTED"));
test("rejects unsupported platform skill", () => assert.equal(validateBriefSet([base], evidence, "unknown", "unknown@1")[0].platformStatus, "FAIL"));
test("scene arrays and the legacy flag do not affect platform validation", () => { process.env.GENERATION_SCENES_ENABLED = "1"; try { assert.equal(validateBriefSet([{ ...base, scenes: ["1", "2", "3", "4", "5", "6", "7"] }], evidence)[0].platformStatus, "PASS"); } finally { delete process.env.GENERATION_SCENES_ENABLED; } });
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
test("unsupported factual claims in the hook are gated", () => {
  const report = validateBriefSet([{ ...base, hook: "Feito em alumínio aeroespacial" }], evidence)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("CTA neutro passa, claim factual sem evidência repara, contradição rejeita e anti-pattern repara", () => {
  const neutral = validateBriefSet([{ ...base, cta: "Confira no carrinho" }])[0];
  assert.equal(neutral.decision, "PASS");
  const unsupported = validateBriefSet([{ ...base, cta: "Entrega em 24 horas" }])[0];
  assert.equal(unsupported.factualStatus, "UNSUPPORTED");
  assert.equal(unsupported.decision, "REPAIR");
  const contradicted = validateBriefSet([{ ...base, cta: "Esse produto nunca falha" }], evidence)[0];
  assert.equal(contradicted.factualStatus, "CONTRADICTED");
  assert.equal(contradicted.decision, "REJECT");
  const antiPattern = validateBriefSet([{ ...base, cta: "Corre, última chance!" }])[0];
  assert.equal(antiPattern.decision, "REPAIR");
});
test("naturalness gate flags boilerplate while preserving conversational language", () => {
  const natural = validateBriefSet([{ ...base, hook: "Olha como fica no uso do dia a dia" }], evidence)[0];
  assert.equal(natural.decision, "PASS");
  const boilerplate = validateBriefSet([{ ...base, hook: "No mundo de hoje, uma solução inovadora" }], evidence)[0];
  assert.equal(boilerplate.decision, "REPAIR");
  assert.ok(boilerplate.issues.includes("linguagem pouco natural ou publicitária"));
});
test("variety gate repairs repeated hooks or CTAs without copyright checks", () => {
  const repeatedHook = validateBriefSet([
    { ...base, contentId: "c1", briefVersionId: "b1", hook: "Olha esse detalhe", script: "produto no uso" },
    { ...base, contentId: "c2", briefVersionId: "b2", angle: "outro ângulo", hook: "Olha esse detalhe", script: "outro uso do produto", cta: "Veja detalhes" },
  ], evidence);
  assert.equal(repeatedHook[1].varietyStatus, "FAIL");
  assert.ok(repeatedHook[1].issues.includes("hook repetido"));
  const repeatedCta = validateBriefSet([
    { ...base, contentId: "c1", briefVersionId: "b1", hook: "primeiro hook", script: "produto no uso", cta: "Confira no carrinho" },
    { ...base, contentId: "c2", briefVersionId: "b2", angle: "outro ângulo", hook: "segundo hook", script: "outro uso do produto", cta: "Confira no carrinho" },
  ], evidence);
  assert.equal(repeatedCta[1].varietyStatus, "FAIL");
  assert.ok(repeatedCta[1].issues.includes("CTA repetido"));
  assert.ok(!repeatedCta[0].issues.some((issue) => /copyright|direitos autorais|cópia/i.test(issue)));
});
test("catalog phrases may be reused literally without anti-copy rejection", () => {
  const pattern = CREATIVE_CATALOG.hooks[0];
  const reused = validateBriefSet([{ ...base, hook: pattern.text }])[0];
  assert.equal(reused.decision, "PASS");
  assert.ok(!reused.issues.some((issue) => /catálogo|cópia|copyright|direitos autorais/i.test(issue)));
});
test("selected pattern validation rejects hook/CTA type swaps", () => {
  const hook = CREATIVE_CATALOG.hooks[0];
  const cta = CREATIVE_CATALOG.ctas[0];
  const selected = [{ hook, cta }];
  const hookGetsCta = validateBriefSet([{ ...base, hook: cta.text }], evidence, "tiktok-commerce", "tiktok-commerce@1.2", selected)[0];
  assert.ok(hookGetsCta.issues.includes("CTA usado como hook"));
  const ctaGetsHook = validateBriefSet([{ ...base, cta: hook.text }], evidence, "tiktok-commerce", "tiktok-commerce@1.2", selected)[0];
  assert.ok(ctaGetsHook.issues.includes("hook usado como CTA"));
});
