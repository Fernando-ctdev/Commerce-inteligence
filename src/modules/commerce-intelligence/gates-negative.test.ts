import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefSet } from "./gates";
import type { EvidenceSnapshot } from "./contract";
import { CREATIVE_CATALOG } from "./platform-skill";
const evidence: EvidenceSnapshot = { facts: ["Produto"], refs: ["Produto"] };
const base = { contentId: "c", briefVersionId: "b", version: 1 as const, angle: "a", hook: "h", development: ["Produto"], script: "Produto", cta: "c" };
test("rejects unsupported objective claim", () => { const report = validateBriefSet([{ ...base, script: "aguenta 5 kg" }], evidence)[0]; assert.equal(report.factualStatus, "UNSUPPORTED"); assert.equal(report.claimType, "objetivo"); assert.equal(report.decision, "REPAIR"); });
test("rejects unauthorized absolute script claim", () => {
  const report = validateBriefSet([{ ...base, script: "Produto nunca funciona" }], evidence)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("rejects unsupported platform skill", () => assert.equal(validateBriefSet([base], evidence, "unknown", "unknown@1")[0].platformStatus, "FAIL"));
test("objective claim with matching value and unit is supported without literal substring", () => { const ev = { facts: ["Bateria de 4000 mAh"], refs: ["fact:bateria"] }; const report = validateBriefSet([{ ...base, development: ["Bateria de 4000 mAh"], script: "rende até 4000 mAh em uso intenso contínuo" }], ev)[0]; assert.equal(report.factualStatus, "SUPPORTED"); assert.equal(report.decision, "PASS"); });
test("objective claim with conflicting value is contradicted", () => { const ev = { facts: ["Bateria de 4000 mAh"], refs: ["fact:bateria"] }; const report = validateBriefSet([{ ...base, development: ["Bateria de 4000 mAh"], script: "nada supera os 5000 mAh reais" }], ev)[0]; assert.equal(report.factualStatus, "CONTRADICTED"); assert.equal(report.decision, "REJECT"); });
test("strategic claim without technical attribute is inferred but safe", () => assert.equal(validateBriefSet([{ ...base, development: ["a escolha inteligente do dia a dia"], script: "a escolha inteligente do dia a dia" }], evidence)[0].factualStatus, "INFERRED_BUT_SAFE"));
test("non-numeric objective attribute backed by evidence is supported", () => {
  const ev = { facts: ["Base magnética, compacto, montagem simples."], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Base magnética, compacto, montagem simples"], script: "A base magnética segura o celular durante a montagem" }], ev)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.equal(report.claimType, "objetivo");
  assert.equal(report.decision, "PASS");
});
test("non-numeric objective attribute without evidence is unsupported", () => {
  const ev = { facts: ["Base magnética, compacto, montagem simples."], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Base magnética, compacto, montagem simples"], script: "Feito em alumínio aeroespantil" }], ev)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.claimType, "objetivo");
  assert.equal(report.decision, "REPAIR");
});
test("contradicted numeric fact still rejected with attribute catalog present", () => {
  const ev = { facts: ["Bateria de 4000 mAh", "Base magnética"], refs: ["fact:bateria", "fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Bateria de 4000 mAh"], script: "são 9000 mAh de autonomia" }], ev)[0];
  assert.equal(report.factualStatus, "CONTRADICTED");
});
test("unsupported factual claims in the hook are gated", () => {
  const report = validateBriefSet([{ ...base, hook: "Feito em alumínio aeroespacial" }], evidence)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("rejects unsupported breathability claims in the development or script", () => {
  const report = validateBriefSet([{ ...base, development: ["Destaque que a peça deixa o ar circular"] }], { facts: ["Calça de algodão"], refs: ["fact:product"] })[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("script claims beyond factual development are repaired", () => {
  const ev = { facts: ["Produto", "Garantia vitalícia"], refs: ["product:name", "fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Produto"], script: "O produto tem garantia vitalícia" }], ev)[0];
  assert.equal(report.decision, "REPAIR");
  assert.ok(report.issues.includes("script contém claim factual ausente de development"));
});
test("development wording is not rejected by lexical production or CTA gates", () => {
  for (const instruction of ["Filme Produto", "Mostre Produto", "Fale de Produto", "Clique para ver", "Confira no carrinho", "Use cupom", "Confira o frete"]) {
    const report = validateBriefSet([{ ...base, development: [instruction], script: "Minha opinião pessoal", cta: "Confira" }], evidence)[0];
    assert.equal(report.decision, "PASS", instruction);
    assert.deepEqual(report.issues, [], instruction);
  }
});
test("product name alone cannot support an unrelated lifetime-warranty claim", () => {
  const report = validateBriefSet([{ ...base, script: "O produto tem garantia vitalícia" }], evidence)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("product name alone cannot support an arbitrary protection claim", () => {
  const report = validateBriefSet([{ ...base, script: "Produto entrega proteção superior" }], evidence)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("absolute claims are rejected even when the product name is authorized", () => {
  const report = validateBriefSet([{ ...base, script: "Esse produto sempre funciona perfeitamente para qualquer pessoa" }], evidence)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("product identity cannot support an absolute script claim", () => {
  const ev = { facts: ["Produto"], refs: ["product:name"] };
  const report = validateBriefSet([{ ...base, development: ["Produto"], script: "Esse produto sempre funciona perfeitamente para qualquer pessoa", cta: "Confira no carrinho" }], ev)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("clean subjective development is inferred safe without evidence", () => {
  const ev = { facts: ["Produto"], refs: ["product:name"] };
  const report = validateBriefSet([{ ...base, development: ["A escolha inteligente do dia a dia"], script: "Eu usaria assim no dia a dia", cta: "Confira no carrinho" }], ev)[0];
  assert.equal(report.factualStatus, "INFERRED_BUT_SAFE");
  assert.ok(!report.issues.includes("development contém claim sem evidência verificável"));
  assert.notEqual(report.decision, "REPAIR");
});
test("unsupported strategic development is repaired and neutral factual framing passes", () => {
  const unsupported = validateBriefSet([{ ...base, development: ["A escolha inteligente do dia a dia"], script: "Eu usaria assim no dia a dia" }], evidence)[0];
  assert.equal(unsupported.factualStatus, "INFERRED_BUT_SAFE");
  assert.notEqual(unsupported.decision, "REPAIR");
  const ev = { facts: ["Produto", "Bateria de 4000 mAh"], refs: ["product:name", "fact:bateria"] };
  const framed = validateBriefSet([{ ...base, development: ["Produto com bateria de 4000 mAh"], script: "Tem bateria de 4000 mAh" }], ev)[0];
  assert.equal(framed.factualStatus, "SUPPORTED");
  assert.equal(framed.decision, "PASS");
});
test("CTA neutro passa, claim factual sem evidência repara e contradição rejeita", () => {
  const neutral = validateBriefSet([{ ...base, cta: "Confira no carrinho" }], evidence)[0];
  assert.equal(neutral.decision, "PASS");
  const unsupported = validateBriefSet([{ ...base, cta: "Entrega em 24 horas" }])[0];
  assert.equal(unsupported.factualStatus, "UNSUPPORTED");
  assert.equal(unsupported.decision, "REPAIR");
  const contradicted = validateBriefSet([{ ...base, cta: "Esse produto nunca falha" }], evidence)[0];
  assert.equal(contradicted.factualStatus, "CONTRADICTED");
  assert.equal(contradicted.decision, "REJECT");
  const antiPattern = validateBriefSet([{ ...base, cta: "Corre, última chance!" }], evidence)[0];
  assert.equal(antiPattern.decision, "PASS");
});
test("wording is not rejected by lexical naturalness gates", () => {
  const natural = validateBriefSet([{ ...base, hook: "Olha como fica no uso do dia a dia" }], evidence)[0];
  assert.equal(natural.decision, "PASS");
  const boilerplate = validateBriefSet([{ ...base, hook: "No mundo de hoje, uma solução inovadora" }], evidence)[0];
  assert.equal(boilerplate.decision, "PASS");
  assert.ok(!boilerplate.issues.includes("linguagem pouco natural ou publicitária"));
});
test("normalized duplicate hooks and repeated CTAs fail the set variety gate", () => {
  const repeatedHook = validateBriefSet([
    { ...base, contentId: "c1", briefVersionId: "b1", hook: "Olha esse detalhe", script: "produto no uso" },
    { ...base, contentId: "c2", briefVersionId: "b2", angle: "outro ângulo", hook: " olha ESSE   detalhe ", script: "outro uso do produto", cta: "Veja detalhes" },
  ], evidence);
  assert.equal(repeatedHook[1].decision, "REPAIR");
  assert.equal(repeatedHook[1].varietyStatus, "FAIL");
  assert.ok(repeatedHook[1].issues.includes("hook repetido"));
  const repeatedCta = validateBriefSet([
    { ...base, contentId: "c1", briefVersionId: "b1", hook: "primeiro hook", script: "produto no uso", cta: "Confira no carrinho" },
    { ...base, contentId: "c2", briefVersionId: "b2", angle: "outro ângulo", hook: "segundo hook", script: "outro uso do produto", cta: "Confira no carrinho" },
  ], evidence);
  assert.equal(repeatedCta[1].decision, "REPAIR");
  assert.equal(repeatedCta[1].varietyStatus, "FAIL");
  assert.ok(repeatedCta[1].issues.includes("CTA repetido"));
  assert.ok(!repeatedCta[1].issues.some((issue) => /copyright|direitos autorais|cópia/i.test(issue)));
});
test("catalog phrases may be reused literally without anti-copy rejection", () => {
  const pattern = CREATIVE_CATALOG.hooks[0];
  const reused = validateBriefSet([{ ...base, hook: pattern.text }], evidence)[0];
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
