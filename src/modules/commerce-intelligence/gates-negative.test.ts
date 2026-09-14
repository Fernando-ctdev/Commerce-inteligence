import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefSet } from "./gates";
import type { EvidenceSnapshot } from "./contract";
import { CREATIVE_CATALOG } from "./platform-skill";
const evidence: EvidenceSnapshot = { facts: ["Produto", "uso do produto", "uso cotidiano"], refs: ["product:name", "fact:usage", "fact:usage-context"] };
const base = { contentId: "c", briefVersionId: "b", version: 1 as const, angle: "a", hook: "h", development: ["Destaque o uso cotidiano para orientar a conversa sobre o uso cotidiano"], script: "Produto", cta: "c" };
test("rejects unsupported objective claim", () => { const report = validateBriefSet([{ ...base, script: "aguenta 5 kg" }], evidence)[0]; assert.equal(report.factualStatus, "UNSUPPORTED"); assert.equal(report.claimType, "objetivo"); assert.equal(report.decision, "REPAIR"); });
test("rejects unauthorized absolute script claim", () => {
  const report = validateBriefSet([{ ...base, script: "Produto nunca funciona" }], evidence)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("rejects unsupported platform skill", () => assert.equal(validateBriefSet([base], evidence, "unknown", "unknown@1")[0].platformStatus, "FAIL"));
test("objective claim with matching value and unit is supported without literal substring", () => { const ev = { facts: ["Bateria de 4000 mAh"], refs: ["fact:bateria"] }; const report = validateBriefSet([{ ...base, development: ["Destaque a bateria de 4000 mAh para relacionar 4000 mAh a bateria informada"], script: "rende até 4000 mAh em uso intenso contínuo" }], ev)[0]; assert.equal(report.factualStatus, "SUPPORTED"); assert.equal(report.decision, "PASS"); });
test("objective claim with conflicting value is contradicted", () => { const ev = { facts: ["Bateria de 4000 mAh"], refs: ["fact:bateria"] }; const report = validateBriefSet([{ ...base, development: ["Destaque a bateria de 4000 mAh para relacionar 4000 mAh a bateria informada"], script: "nada supera os 5000 mAh reais" }], ev)[0]; assert.equal(report.factualStatus, "CONTRADICTED"); assert.equal(report.decision, "REJECT"); });
test("strategic claim without technical attribute is inferred but safe", () => assert.equal(validateBriefSet([{ ...base, development: ["Destaque a escolha inteligente para contextualizar o uso"], script: "a escolha inteligente do dia a dia" }], evidence)[0].factualStatus, "INFERRED_BUT_SAFE"));
test("non-numeric objective attribute backed by evidence is supported", () => {
  const ev = { facts: ["Base magnética, compacto, montagem simples."], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Destaque a base magnética para mostrar como a base magnética auxilia o apoio na montagem"] , script: "A base magnética segura o celular durante a montagem" }], ev)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.equal(report.claimType, "objetivo");
  assert.equal(report.decision, "PASS");
});
test("non-numeric objective attribute without evidence is unsupported", () => {
  const ev = { facts: ["Base magnética, compacto, montagem simples."], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Destaque a base magnética para mostrar como a base magnética auxilia o apoio na montagem"], script: "Feito em alumínio aeroespantil" }], ev)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.claimType, "objetivo");
  assert.equal(report.decision, "REPAIR");
});
test("contradicted numeric fact still rejected with attribute catalog present", () => {
  const ev = { facts: ["Bateria de 4000 mAh", "Base magnética"], refs: ["fact:bateria", "fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Destaque a bateria de 4000 mAh para relacionar 4000 mAh a bateria informada"], script: "são 9000 mAh de autonomia" }], ev)[0];
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
test("thermal and pocket-capacity paraphrases require matching relevant facts, not refs", () => {
  const thermalFact = { facts: ["Tecido respirável"], refs: ["fact:features"] };
  const thermal = validateBriefSet([{ ...base, development: ["Destaque o tecido respirável para mostrar como o tecido respirável ajuda no uso"], script: "O tecido ajuda a ventilar" }], thermalFact)[0];
  assert.equal(thermal.factualStatus, "SUPPORTED");
  assert.equal(thermal.decision, "PASS");
  assert.deepEqual(thermal.evidenceRefs, ["fact:features"]);
  const overclaim = validateBriefSet([{ ...base, development: ["Destaque o uso para contextualizar a escolha"], script: "O tecido ajuda a ventilar e não esquenta" }], thermalFact)[0];
  assert.equal(overclaim.factualStatus, "UNSUPPORTED");
  assert.equal(overclaim.decision, "REPAIR");

  const capacityFact = { facts: ["Bolso que comporta telefone"], refs: ["fact:pocket"] };
  const capacity = validateBriefSet([{ ...base, development: ["Destaque o bolso que comporta telefone para mostrar como a capacidade do bolso atende ao telefone"], script: "No bolso cabe o celular" }], capacityFact)[0];
  assert.equal(capacity.factualStatus, "SUPPORTED");
  assert.equal(capacity.decision, "PASS");
  const oppositeCapacity = validateBriefSet([{ ...base, development: ["Destaque o uso para contextualizar a escolha"], script: "O bolso não cabe celular" }], capacityFact)[0];
  assert.equal(oppositeCapacity.factualStatus, "CONTRADICTED");
  assert.equal(oppositeCapacity.decision, "REJECT");
  const deceptiveRef = validateBriefSet([{ ...base, script: "No bolso cabe o celular" }], { facts: ["Calça Duna"], refs: ["product:name"] })[0];
  assert.equal(deceptiveRef.factualStatus, "UNSUPPORTED");
  assert.equal(deceptiveRef.decision, "REPAIR");
  const genericFeature = validateBriefSet([{ ...base, script: "No bolso cabe o celular" }], { facts: ["Bolsos frontais funcionais"], refs: ["fact:features"] })[0];
  assert.equal(genericFeature.factualStatus, "UNSUPPORTED");
});
test("script claims beyond factual development are repaired", () => {
  const ev = { facts: ["Produto", "Garantia vitalícia"], refs: ["product:name", "fact:features"] };
  const report = validateBriefSet([{ ...base, development: ["Destaque o produto para contextualizar a compra"], script: "O produto tem garantia vitalícia" }], ev)[0];
  assert.equal(report.decision, "REPAIR");
  assert.ok(report.issues.includes("script contém claim factual ausente de development"));
});
test("development shape requires communication action tied to evidence and rejects feature/shot lists", () => {
  const ev = { facts: ["Tecido duna leve e macio"], refs: ["fact:features"] };
  const goodFact = validateBriefSet([{ ...base, development: ["Destaque o tecido duna leve e macio porque o toque do tecido duna macio importa no uso"] }], ev)[0];
  assert.equal(goodFact.decision, "PASS");
  const unrelatedRationale = validateBriefSet([{ ...base, development: ["Destaque o tecido duna leve e macio porque tecido valoriza a marca"] }], ev)[0];
  assert.equal(unrelatedRationale.decision, "REPAIR");
  assert.ok(unrelatedRationale.issues.some((issue) => issue.startsWith("development deve orientar comunicação")));
  const genericFiller = validateBriefSet([{ ...base, development: ["Destaque o uso para contextualizar a escolha"] }], { facts: ["Produto"], refs: ["product:name"] })[0];
  assert.equal(genericFiller.factualStatus, "INFERRED_BUT_SAFE");
  assert.equal(genericFiller.decision, "REPAIR");
  assert.ok(genericFiller.issues.some((issue) => issue.startsWith("development deve orientar comunicação")));
  const imperativeFeature = validateBriefSet([{ ...base, development: ["Destaque o tecido duna leve e macio"] }], ev)[0];
  assert.equal(imperativeFeature.decision, "REPAIR");
  const featureList = validateBriefSet([{ ...base, development: ["Tecido duna leve e macio"] }], ev)[0];
  assert.equal(featureList.decision, "REPAIR");
  const shotList = validateBriefSet([{ ...base, development: ["Close no tecido; enquadramento de corpo inteiro"] }], ev)[0];
  assert.equal(shotList.decision, "REPAIR");
  assert.ok(shotList.issues.some((issue) => issue.startsWith("development deve orientar comunicação")));
});
test("development needs a communication action somewhere, not necessarily leading", () => {
  for (const [development, facts] of [
    ["O tecido duna e leve", ["Tecido duna leve e macio"]],
    ["A cintura e alta", ["Cintura alta"]],
    ["A peca possui dois bolsos", ["A peca possui dois bolsos"]],
  ] as const) {
    const report = validateBriefSet([{ ...base, development: [development] }], { facts: [...facts], refs: ["fact:product"] })[0];
    assert.equal(report.decision, "REPAIR", development);
    assert.ok(report.issues.some((issue) => issue.startsWith("development deve orientar comunicação")));
  }
  const nonInitialRationale = validateBriefSet([{ ...base, development: ["A leveza do tecido duna leve e macio aparece no uso: destaque o tecido duna leve e macio porque o toque do tecido duna macio importa no uso"] }], { facts: ["Tecido duna leve e macio"], refs: ["fact:features"] })[0];
  assert.equal(nonInitialRationale.decision, "PASS", nonInitialRationale.issues.join("; "));
  const nonInitialExperience = validateBriefSet([{ ...base, development: ["A leveza do tecido duna merece destaque: comente a leveza que voce sente com o tecido duna"] }], { facts: ["Tecido duna leve e macio"], refs: ["fact:product"] })[0];
  assert.equal(nonInitialExperience.decision, "PASS", nonInitialExperience.issues.join("; "));
});
test("universal pocket capacity claim requires an explicitly universal fact", () => {
  const brief = { ...base, development: ["Destaque o bolso que comporta todo telefone para mostrar como o bolso acomoda o telefone"], script: "No bolso cabe todo smartphone" };
  const limitedFact = validateBriefSet([brief], { facts: ["Bolso que comporta telefone"], refs: ["fact:pocket"] })[0];
  assert.equal(limitedFact.factualStatus, "UNSUPPORTED");
  assert.equal(limitedFact.decision, "REPAIR");
  const universalFact = validateBriefSet([brief], { facts: ["Bolso que comporta todo telefone"], refs: ["fact:pocket"] })[0];
  assert.equal(universalFact.factualStatus, "SUPPORTED");
  assert.equal(universalFact.decision, "PASS");
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
  const report = validateBriefSet([{ ...base, development: ["Destaque o produto para contextualizar a escolha"], script: "Esse produto sempre funciona perfeitamente para qualquer pessoa", cta: "Confira no carrinho" }], ev)[0];
  assert.equal(report.factualStatus, "UNSUPPORTED");
  assert.equal(report.decision, "REPAIR");
});
test("clean subjective development is inferred safe without evidence", () => {
  const ev = { facts: ["Produto"], refs: ["product:name"] };
  const report = validateBriefSet([{ ...base, development: ["Destaque a escolha inteligente para contextualizar o uso"], script: "Eu usaria assim no dia a dia", cta: "Confira no carrinho" }], ev)[0];
  assert.equal(report.factualStatus, "INFERRED_BUT_SAFE");
  assert.ok(!report.issues.includes("development contém claim sem evidência verificável"));
  assert.equal(report.decision, "REPAIR", "creator rationale without a relevant fact fails the development shape gate");
});
test("unsupported strategic development is repaired and neutral factual framing passes", () => {
  const unsupported = validateBriefSet([{ ...base, development: ["Destaque a escolha inteligente para contextualizar o uso"], script: "Eu usaria assim no dia a dia" }], evidence)[0];
  assert.equal(unsupported.factualStatus, "INFERRED_BUT_SAFE");
  assert.equal(unsupported.decision, "REPAIR", "generic filler is not a grounded development point");
  const ev = { facts: ["Produto", "Bateria de 4000 mAh"], refs: ["product:name", "fact:bateria"] };
  const framed = validateBriefSet([{ ...base, development: ["Destaque a bateria de 4000 mAh para relacionar 4000 mAh a bateria informada"], script: "Tem bateria de 4000 mAh" }], ev)[0];
  assert.equal(framed.factualStatus, "SUPPORTED");
  assert.equal(framed.decision, "PASS");
});
test("CTA neutro passa, claim factual sem evidência repara e contradição rejeita", () => {
  const neutral = validateBriefSet([{ ...base, cta: "Confira no carrinho" }], evidence)[0];
  assert.equal(neutral.decision, "PASS");
  const unsupported = validateBriefSet([{ ...base, cta: "Entrega em 24 horas" }])[0];
  assert.equal(unsupported.factualStatus, "UNSUPPORTED");
  assert.equal(unsupported.decision, "REPAIR");
  const contradicted = validateBriefSet([{ ...base, cta: "Confira o preço de 39,90 reais" }], { facts: ["28,90 reais"], refs: ["fact:price"] })[0];
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
test("five regressions: catalog verbatim, adapted duplicate, full duplicate, declared drone, and solo without equipment", () => {
  const catalogHook = CREATIVE_CATALOG.hooks[0].text;
  const content = (id: string, angle: string, hook: string, script: string, cta: string) => ({
    ...base,
    contentId: id,
    briefVersionId: `b-${id}`,
    angle,
    hook,
    script,
    cta,
  });
  const catalogReuse = validateBriefSet([
    content("catalog-1", "angle um", catalogHook, "Script um", "CTA um"),
    content("catalog-2", "angle dois", catalogHook, "Script dois", "CTA dois"),
  ], evidence);
  assert.equal(catalogReuse[1].decision, "PASS", "hook literal do catálogo pode ser reutilizado");

  const adapted = `${catalogHook} do meu jeito`;
  const adaptedRepeated = validateBriefSet([
    content("adapted-1", "angle um", adapted, "Script um", "CTA um"),
    content("adapted-2", "angle dois", adapted, "Script dois", "CTA dois"),
  ], evidence);
  assert.equal(adaptedRepeated[1].decision, "REPAIR", "hook adaptado repetido continua bloqueado");
  assert.ok(adaptedRepeated[1].issues.includes("hook repetido"));

  const fullDuplicate = validateBriefSet([
    content("full-1", "mesmo ângulo", catalogHook, "Mesmo script", "Mesmo CTA"),
    content("full-2", "mesmo ângulo", catalogHook, "Mesmo script", "Mesmo CTA"),
  ], evidence);
  assert.equal(fullDuplicate[1].decision, "REPAIR", "duplicata integral continua bloqueada mesmo com hook do catálogo");
  assert.ok(fullDuplicate[1].issues.includes("duplicata normalizada"));

  const orbitBrief = {
    ...content("solo-drone", "ângulo orbital", "Hook orbital", "A câmera orbita 360 graus ao redor do produto", "CTA orbital"),
    development: ["Destaque a orbita de 360 graus para explicar como a orbita acompanha o produto"],
  };
  const orbitEvidence = { facts: ["A camera orbita 360 graus ao redor do produto"], refs: ["fact:movement"] };
  const droneEquipped = validateBriefSet([orbitBrief], orbitEvidence, "tiktok-commerce", "tiktok-commerce@1.2", [], {
    recordsAlone: true,
    recordingEquipment: ["drone"],
  });
  assert.equal(droneEquipped[0].decision, "PASS", "drone declarado suporta tomada orbital solo");

  const soloWithoutEquipment = validateBriefSet([orbitBrief], orbitEvidence, "tiktok-commerce", "tiktok-commerce@1.2", [], {
    recordsAlone: true,
  });
  assert.equal(soloWithoutEquipment[0].decision, "REPAIR", "produção incompatível sem equipamento declarado");
  assert.ok(soloWithoutEquipment[0].issues.includes("produção incompatível com creator solo"));
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
