import test from "node:test";
import assert from "node:assert/strict";
import type { EvidenceSnapshot } from "./contract";
import { validateBriefSet, parseStructuredDevelopment, diagnoseDevelopmentPoint, diagnoseStructuredDevelopmentBullet, developmentDiagnosticNeedsRepair, developmentRequirements, validDevelopmentPoint, isActionableCta } from "./gates";
import { ContractError } from "./contract";

test("structured development derives action and rationale from provider text", () => {
  const text = "Destaque o tecido respiravel para explicar o conforto no uso";
  const evidence = { facts: ["Tecido respiravel"], refs: ["fact:features"] };
  const diagnosis = diagnoseDevelopmentPoint(text, evidence, undefined, "Confira o produto na página.");
  assert.equal(diagnosis.action, "Destaque");
  assert.equal(diagnosis.rationale, "para explicar o conforto no uso");
  assert.equal(diagnosis.grounded, true);
  assert.equal(diagnosis.connectorValid, true);
  assert.equal(diagnosis.ctaValid, true);
  assert.deepEqual(diagnosis.issues, []);
  const parsed = parseStructuredDevelopment([
    { text, factRefs: ["fact:features"], cta: "Confira o produto na página." },
  ], evidence);
  assert.equal(parsed.bullets[0]!.action, "Destaque");
  assert.equal(parsed.bullets[0]!.rationale, "para explicar o conforto no uso");
  assert.equal(parsed.diagnostics[0]!.grounded, true);
});

test("structured development ignores provider action/rationale and derives both from text", () => {
  const text = "Destaque o tecido respiravel para explicar o conforto no uso";
  const parsed = parseStructuredDevelopment([
    { text, action: "Ação inventada", rationale: "rationale inventada", factRefs: ["fact:features"], cta: "Confira o produto na página." },
  ], { facts: ["Tecido respiravel"], refs: ["fact:features"] });
  assert.equal(parsed.bullets[0]!.action, "Destaque");
  assert.equal(parsed.bullets[0]!.rationale, "para explicar o conforto no uso");
});

test("diagnóstico canônico inclui CTA inválido e faz o gate reprovar", () => {
  const evidence = { facts: ["Tecido respiravel"], refs: ["fact:features"] };
  const checked = diagnoseStructuredDevelopmentBullet({
    text: "Destaque o tecido respiravel para explicar o tecido respiravel no uso",
    factRefs: ["fact:features"],
    cta: "O produto é leve e confortável",
  }, 0, evidence);
  assert.equal(checked.point.ctaValid, false);
  assert.equal(checked.point.valid, false);
  assert.ok(checked.point.issues.includes("cta"));
  assert.equal(checked.diagnostic.ctaValid, false);
  assert.equal(developmentDiagnosticNeedsRepair(checked.diagnostic), true);
  const brief = {
    contentId: "cta-canonical",
    briefVersionId: "cta-canonical-v1",
    version: 1 as const,
    angle: "uso",
    hook: "Veja o tecido",
    development: [checked.point.action + " o tecido respiravel para explicar o tecido respiravel no uso", checked.point.action + " o tecido respiravel para explicar o tecido respiravel no uso"],
    script: "Fale sobre o tecido respiravel",
    cta: "Confira o produto",
  };
  const structuredBullet = {
    text: "Destaque o tecido respiravel para explicar o tecido respiravel no uso",
    action: "Destaque",
    rationale: "para explicar o tecido respiravel no uso",
    factRefs: ["fact:features"],
    cta: "O produto é leve e confortável",
  };
  const report = validateBriefSet(
    [brief],
    evidence,
    "tiktok-commerce",
    "tiktok-commerce@1.2",
    [],
    undefined,
    new Map([[brief.contentId, [structuredBullet, structuredBullet]]]),
  )[0]!;
  assert.ok(["REPAIR", "REJECT"].includes(report.decision));
});

test("structured development rejects malformed factRefs without filtering", () => {
  const evidence = { facts: ["Tecido respiravel"], refs: ["fact:features"] };
  for (const factRefs of [["fact:features", ""], ["fact:features", 1], ["fact:missing"]]) {
    assert.throws(() => parseStructuredDevelopment([
      { text: "Destaque o tecido respiravel para explicar o conforto no uso", factRefs, cta: "Confira o produto na página." },
    ], evidence), ContractError);
  }
});
const brief = (id: string, angle = "angle", hook = "hook", cta = "cta") => ({ contentId: id, briefVersionId: `${id}-v1`, version: 1 as const, angle, hook, development: ["Destaque o uso para orientar a conversa sobre o uso", "Destaque o uso para orientar a conversa sobre o uso"], script: `Fale sobre ${id}`, cta });
test("desconto só é factual quando presente no catálogo: suportado com fato, contradito sem correspondência e não suportado sem fato", () => {
  const evidence = { facts: ["20% de desconto"], refs: ["fact:discountPercentage"] };
  const report = validateBriefSet([{ ...brief("d1"), development: ["Destaque o desconto de 20% para explicar a oferta", "Destaque o desconto de 20% para explicar a oferta"], script: "Mostre o produto e diga que ele está com 20% de desconto." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.deepEqual(report.evidenceRefs, ["fact:discountPercentage"]);
  const contradicted = validateBriefSet([{ ...brief("d2"), development: ["Destaque o desconto de 20% para explicar a oferta", "Destaque o desconto de 20% para explicar a oferta"], script: "Aproveite 30% de desconto hoje." }], evidence)[0];
  assert.equal(contradicted.factualStatus, "CONTRADICTED");
  const unsupported = validateBriefSet([{ ...brief("d3"), script: "Aproveite 20% de desconto hoje." }])[0];
  assert.equal(unsupported.factualStatus, "UNSUPPORTED");
});
test("regressão b0d4b7a6: negação não adjacente ao fato não é contradição", () => {
  // Cenário real do produto b0d4b7a6: priceCurrency "R$" entra como fato; o preço
  // "r$ 28,90" no script não forma token objetivo (R$ precede o número) e cai no
  // ramo subjetivo; "não" em outra frase não pode negar o fato "r$".
  const evidence = { facts: ["Calça Pantalona Duna", "R$", "R$ 28,90"], refs: ["product:name", "fact:priceCurrency", "fact:price"] };
  const report = validateBriefSet([{ ...brief("b0d4b7a6"), development: ["Destaque R$ 28,90 para contextualizar a compra", "Destaque R$ 28,90 para contextualizar a compra"], script: "Essa pantalona não é cara: custa só r$ 28,90 e renova o look." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
  assert.deepEqual(report.evidenceRefs, ["fact:priceCurrency", "fact:price"]);
  // Negação imediatamente antes do fato continua sendo contradição.
  const negated = validateBriefSet([{ ...brief("b0d4b7a6-neg"), development: ["Destaque R$ 28,90 para contextualizar a compra", "Destaque R$ 28,90 para contextualizar a compra"], script: "Não r$ 28,90 aqui: é bem mais barato." }], evidence)[0];
  assert.equal(negated.factualStatus, "CONTRADICTED");
});
test("regressão b0d4b7a6: negação não adjacente a atributo autorizado não é contradição", () => {
  const evidence = { facts: ["Alça magnética ajustável"], refs: ["fact:features"] };
  const report = validateBriefSet([{ ...brief("b0d4b7a6-attr"), development: ["Destaque a alça magnética ajustável para explicar o fecho", "Destaque a alça magnética ajustável para explicar o fecho"], script: "O fecho não é o único diferencial: alça magnética e ajustável." }], evidence)[0];
  assert.equal(report.factualStatus, "SUPPORTED");
});
test("creator solo production gate uses recordsAlone and declared equipment", () => {
  const ev = { facts: ["Fone Space S1", "drivers de 40 mm", "R$"], refs: ["product:name", "fact:features", "fact:priceCurrency"] };
  const complex = { ...brief("solo-1"), development: ["Destaque os drivers de 40 mm para relacionar 40 mm aos drivers informados", "Destaque os drivers de 40 mm para relacionar 40 mm aos drivers informados"], script: "A câmera gira 360 graus ao redor de mim enquanto o som passa de lado a lado.", cta: "Saiba mais." };
  const soloContext = { recordsAlone: true, recordingEquipment: ["camera"], recordingSupport: ["tripod"] };
  const blocked = validateBriefSet([complex], ev, "tiktok-commerce", "tiktok-commerce@1.2", [], soloContext)[0];
  assert.equal(blocked.decision, "REPAIR");
  assert.ok(blocked.issues.includes("produção incompatível com creator solo"));
  const noSoloConstraint = validateBriefSet([complex], ev, "tiktok-commerce", "tiktok-commerce@1.2", [], { ...soloContext, recordsAlone: false })[0];
  assert.equal(noSoloConstraint.decision, "PASS");
  const droneBrief = { ...brief("solo-drone"), development: ["Destaque os drivers de 40 mm para relacionar 40 mm aos drivers informados", "Destaque os drivers de 40 mm para relacionar 40 mm aos drivers informados"], script: "O drone acompanha o produto." };
  const missingDrone = validateBriefSet([droneBrief], ev, "tiktok-commerce", "tiktok-commerce@1.2", [], soloContext)[0];
  assert.ok(missingDrone.issues.includes("produção incompatível com creator solo"));
  const declaredDrone = validateBriefSet([droneBrief], ev, "tiktok-commerce", "tiktok-commerce@1.2", [], { ...soloContext, recordingEquipment: ["camera", "drone"] })[0];
  assert.equal(declaredDrone.decision, "PASS");
  const solo = validateBriefSet([{ ...brief("solo-2"), development: ["Destaque drivers de 40 mm para relacionar 40 mm aos drivers informados", "Reforce drivers de 40 mm para conectar os drivers de 40 mm ao som"], script: "Esse fone é o Fone Space S1 e tem drivers de 40 mm.", cta: "Se você curte esse tipo de imersão, vale dar uma olhada nesse aqui." }], ev, "tiktok-commerce", "tiktok-commerce@1.2", [], soloContext)[0];
  assert.equal(solo.decision, "PASS", JSON.stringify(solo));
});
test("normalized, hook, CTA, and structural duplicates are repaired", () => {
  const ev = { facts: ["produto"], refs: ["product:name"] };
  const duplicate = [brief("a", "angle-a"), { ...brief("b", "angle-a"), script: "Fale sobre a" }];
  const reports = validateBriefSet(duplicate, ev);
  assert.equal(reports[0].varietyStatus, "PASS");
  assert.equal(reports[1].decision, "REPAIR");
  assert.equal(reports[1].varietyStatus, "FAIL");
  assert.ok(reports[1].issues.includes("duplicata normalizada"));
  assert.ok(reports[1].issues.includes("hook repetido"));
  assert.ok(reports[1].issues.includes("CTA repetido"));
  assert.ok(reports[1].issues.includes("duplicata estrutural"));
});

// Gate 7 — repro do incidente e6499288 (GEN-REPAIR-EXHAUSTED, 9x factual_issue
// no brief-1): a instrução de CONTENT_BRIEF_REPAIR proíbe apenas "sempre, nunca,
// jamais" (provider.ts), mas o gate reprova o predicado completo
// UNSUPPORTED_ABSOLUTE_CLAIMS — "qualquer", "perfeit[oa]s?", "sem falha", "sem
// defeito" (gates.ts). Um repair OBEDIENTE à instrução não converge: remove
// "nunca", mantém "perfeita"/"qualquer" e o gate mantém UNSUPPORTED até esgotar
// os rounds. Fixture documenta o gap prompt↔gate para o alinhamento mínimo.
test("regressão e6499288: absoluto fora da lista da instrução de repair mantém UNSUPPORTED", () => {
  const evidence = { facts: ["Calça Pantalona Duna", "Gênero: Feminino; Modelo: Calça Pantalona; Fechamento: cintura elástica com cordão"], refs: ["product:name", "fact:features"] };
  const development = ["Destaque a cintura elástica com cordão para conectar o cordão ao ajuste na cintura", "Destaque a cintura elástica com cordão para conectar o cordão ao ajuste na cintura"];
  const reportFor = (script: string) => validateBriefSet([{ contentId: "j-content-1", briefVersionId: "j-brief-1", version: 1 as const, angle: "demonstração", hook: "hook", development, script, cta: "cta" }], evidence)[0];
  const original = reportFor("A pantalona nunca aperta e é perfeita.");
  assert.equal(original.factualStatus, "UNSUPPORTED");
  assert.deepEqual(original.issues, ["claim absoluto sem evidência autorizada"]);
  // Repair obedecendo à instrução vigente (remove sempre/nunca/jamais): o gate
  // segue UNSUPPORTED — o loop do repair não converge por causa do prompt.
  const afterLiteralRepair = reportFor("A pantalona é perfeita.");
  assert.equal(afterLiteralRepair.factualStatus, "UNSUPPORTED");
  const afterAnyRepair = reportFor("A pantalona serve para qualquer ocasião.");
  assert.equal(afterAnyRepair.factualStatus, "UNSUPPORTED");
  // Repair que remove o predicado completo converge.
  const converged = reportFor("A pantalona tem cintura elástica com cordão.");
  assert.equal(converged.decision, "PASS");
});

// ADR-025 §5: fronteira script×cenas — metainstrução inequívoca de montagem ou
// direção no script é issue reparável (REPAIR), nunca REJECT automático; fala
// creator-first legítima não deve casar com o detector determinístico.
test("ADR-025: metainstrução de cena no script vira issue reparável, sem bloquear fala creator-first", () => {
  const evidence = { facts: ["Calça Pantalona Duna"], refs: ["product:name"] };
  const reportFor = (script: string) => validateBriefSet([{ contentId: "j-content-1", briefVersionId: "j-brief-1", version: 1 as const, angle: "demonstração", hook: "hook", development: ["Destaque o uso para orientar a conversa sobre o uso", "Destaque o uso para orientar a conversa sobre o uso"], script, cta: "cta" }], evidence)[0];
  const metacommentScripts = [
    "Corte para a etiqueta e mostre o detalhe.",
    "A câmera se aproxima do tecido enquanto eu falo.",
    "[mostra a etiqueta por dentro]",
    "Plano detalhe da costura.",
    "Enquadramento nas mãos.",
    "Texto na tela: ajustável.",
    "Cena 3 abre com o produto na mesa.",
    "Take 2 do produto girando.",
  ];
  for (const script of metacommentScripts) {
    const report = reportFor(script);
    assert.ok(report.issues.includes("script contém metainstrução de cena"), script);
    assert.equal(report.decision, "REPAIR", script);
  }
  const creatorFirst = [
    "Dá um close no tecido e conta o que você sente.",
    "Mostre o produto e diga o que mudou no seu dia.",
    "Segura a peça e fala da cintura elástica.",
    // Fala de produto do nicho beleza: "corte" é substantivo, não direção.
    "Meu corte seco favorito é esse.",
    "esse é o corte para cabelos ondulados",
  ];
  for (const script of creatorFirst)
    assert.equal(reportFor(script).issues.includes("script contém metainstrução de cena"), false, script);
});

// ---- Contrato estruturado de development (design 2026-09-18) ----

const evidenceStruct: EvidenceSnapshot = {
  facts: ["Presilha em acrílico padrão tartaruga", "Fechamento firme que não marca o cabelo"],
  refs: ["fact:features:1", "fact:features:2"],
};

const validBullet = {
  text: "Destaque a presilha tartaruga para explicar o cuidado com o cabelo",
  action: "Destaque",
  factRefs: ["fact:features:1"], cta: "Confira o produto na página.",
  rationale: "para explicar o cuidado com o cabelo",
};

test("parseStructuredDevelopment aceita bullet válido e projeta o texto canônico", () => {
  const parsed = parseStructuredDevelopment([validBullet], evidenceStruct);
  assert.deepEqual(parsed.texts, ["Destaque a presilha tartaruga para explicar o cuidado com o cabelo"]);
  const d = parsed.diagnostics[0]!;
  assert.equal(d.index, 0);
  assert.equal(d.actionPresent, true);
  assert.equal(d.factRefAllowed, true);
  assert.equal(d.connectorPresent, true);
  assert.equal(d.shotList, false);
  assert.equal(d.unverifiedClaim, false);
  assert.ok(d.rationaleGroundingMatched >= 2);
  // v4: contagem real e aplicabilidade expostas (facto tem ≥2 termos, rationale
  // do fixture não repete nenhum — exatamente o caso que o gate passa a reprovar).
  assert.equal(d.factGroundingApplicable, true);
  assert.equal(d.factTermsInRationale, 0);
  assert.deepEqual(d.unverifiedClaimParts, []);
});

test("parseStructuredDevelopment: shape/factRef/action/rationale estruturalmente inválidos viram GEN-SCHEMA", () => {
  const validText = "Destaque a presilha tartaruga para explicar o cuidado com o cabelo";
  assert.throws(() => parseStructuredDevelopment([{ text: validText, factRefs: ["product:name"], cta: "Confira o produto na página." }], evidenceStruct), /factRef/);
  assert.throws(() => parseStructuredDevelopment([{ text: validText, factRefs: ["fact:inexistente"], cta: "Confira o produto na página." }], evidenceStruct), /factRef/);
  assert.throws(() => parseStructuredDevelopment([{ text: validText, factRefs: ["fact:features:1"] }], evidenceStruct), /cta/);
  assert.throws(() => parseStructuredDevelopment([{ text: validText, cta: "Confira o produto na página." }], evidenceStruct), /factRefs/);
  assert.throws(() => parseStructuredDevelopment([{ factRefs: ["fact:features:1"], cta: "Confira o produto na página." }], evidenceStruct), /text/);
  assert.throws(() => parseStructuredDevelopment("não é lista", evidenceStruct));
});

test("parseStructuredDevelopment: bullet de qualidade inválida retorna texto + diagnóstico sanitizado (fluxo de repair)", () => {
  // sem conector no texto
  const semConector = parseStructuredDevelopment([{ text: "Destaque a presilha tartaruga para o", factRefs: validBullet.factRefs, cta: validBullet.cta }], evidenceStruct);
  assert.equal(semConector.diagnostics[0]?.connectorPresent, true);
  assert.equal(semConector.texts.length, 1, "texto segue para o gate/repair, sem publicação antecipada");
  // feature list / shot list
  const shotList = parseStructuredDevelopment([{ text: "Destaque o close da presilha tartaruga para explicar o cuidado", factRefs: validBullet.factRefs, cta: validBullet.cta }], evidenceStruct);
  assert.equal(shotList.diagnostics[0]?.shotList, true);
  // grounding curto: rationale com menos de 2 termos
  const groundingCurto = parseStructuredDevelopment([{ text: "Destaque a presilha para o", factRefs: validBullet.factRefs, cta: validBullet.cta }], evidenceStruct);
  assert.equal(groundingCurto.diagnostics[0]?.rationaleGroundingMatched, 0, "terms after connector: none");
});

test("parseStructuredDevelopment: diagnóstico contém apenas índice/flags/contagens (nunca texto)", () => {
  const parsed = parseStructuredDevelopment([validBullet], evidenceStruct);
  const serialized = JSON.stringify(parsed.diagnostics);
  assert.ok(!serialized.includes("tartaruga"), "texto do bullet nunca entra no diagnóstico");
  assert.deepEqual(Object.keys(parsed.diagnostics[0]!).sort(), ["actionPresent", "connectorPresent", "connectorValid", "ctaValid", "factGroundingApplicable", "factRefAllowed", "factTermsInRationale", "grounded", "index", "issues", "rationaleGroundingMatched", "shotList", "textGroundingMatched", "unverifiedClaim", "unverifiedClaimParts"]);
});

test("developmentRequirements é exportado do gate com requisitos derivados da evidência", () => {
  const req = developmentRequirements(evidenceStruct);
  assert.ok(req.allowedActionStems.includes("destaqu"));
  assert.deepEqual(req.connectors, ["para", "porque", "pois", "assim"]);
  assert.equal(req.noShotList, true);
  assert.deepEqual(req.minGrounding, { factTermsInPoint: 2, factTermsInRationale: 2, contextTerms: 1 });
  assert.equal(req.factRefs.length, 2);
  assert.ok(req.factRefs[0]!.terms.length > 0);
});

test("regressão feature_list/connector: bullet sem ação+conector é diagnosticado, gate reprova e corrigido converge", () => {
  const evidence: EvidenceSnapshot = { facts: ["Tecido respiravel"], refs: ["product:description"] };
  const featureList = { text: "Camisa leve, tecido respiravel, bolso frontal", factRefs: ["product:description"], cta: "Confira o produto na página." };
  const featureParsed = parseStructuredDevelopment([featureList], evidence);
  assert.equal(featureParsed.diagnostics[0]!.actionPresent, false);
  assert.equal(featureParsed.diagnostics[0]!.connectorValid, false);
  // texto projetado segue para o gate, que reprova (fail-closed preservado)
  const report = validateBriefSet([{ contentId: "c1", briefVersionId: "c1-v", version: 1 as const, angle: "a", hook: "h", development: [featureList.text, featureList.text], script: "Fale sobre o produto", cta: "c" }], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined)[0];
  assert.ok(["REPAIR", "REJECT"].includes(report.decision), `gate reprova fail-closed: ${report.decision} ${JSON.stringify(report.issues)}`);
  assert.ok(report.issues.some((issue) => /orientar comunicação|lista de features/.test(issue)));
  // convergência: ação + conector + grounding ≥2
  const fixed = { text: "Destaque o tecido respiravel para explicar o tecido respiravel no uso", action: "Destaque", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para explicar o tecido respiravel no uso" };
  const fixedParsed = parseStructuredDevelopment([fixed], evidence);
  assert.equal(fixedParsed.diagnostics[0]!.connectorPresent, true);
  assert.equal(validDevelopmentPoint(fixed.text, evidence), true);
  const fixedReport = validateBriefSet([{ contentId: "c2", briefVersionId: "c2-v", version: 1 as const, angle: "a", hook: "h", development: [fixedParsed.texts[0]!, fixedParsed.texts[0]!], script: "Tecido respiravel", cta: "c" }], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined)[0];
  assert.equal(fixedReport.decision, "PASS");
});

test("gate v4: trecho após o conector deve conter 2 termos do fato apontado por factRef (hard gate; judge advisory)", () => {
  const evidence: EvidenceSnapshot = { facts: ["Tecido respiravel"], refs: ["product:description"] };
  // Rationale sem termos do fato: passa nos checks textuais; sem o mapa estruturado
  // o requisito factRef não se aplica (comportamento textual existente preservado).
  const drifting = { text: "Destaque o tecido respiravel para explicar o conforto no uso diario", action: "Destaque", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para explicar o conforto no uso diario" };
  const brief = { contentId: "c-v4", briefVersionId: "c-v4-v", version: 1 as const, angle: "a", hook: "Veja o tecido", development: [drifting.text, drifting.text], script: "Tecido respiravel", cta: "c" };
  const withoutMap = validateBriefSet([brief], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined)[0]!;
  assert.equal(withoutMap.decision, "PASS", "sem bullets estruturados o requisito factRef não se aplica");
  const withMap = validateBriefSet([brief], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined, new Map([[brief.contentId, [drifting, drifting]]]))[0]!;
  assert.equal(withMap.decision, "REPAIR");
  assert.ok(withMap.issues.some((issue) => issue.includes("factRef")), "issue própria da ancoragem factRef");
  // Convergência: rationale/texto espelha ≥2 termos do fato → PASS.
  const grounded = { ...drifting, text: "Destaque o tecido respiravel para explicar como o tecido respiravel ajuda no uso", rationale: "para explicar como o tecido respiravel ajuda no uso" };
  const groundedReport = validateBriefSet([{ ...brief, development: [grounded.text, grounded.text] }], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined, new Map([[brief.contentId, [grounded, grounded]]]))[0]!;
  assert.equal(groundedReport.decision, "PASS");
  // Fato com <2 termos de ancoragem: regra vacuamente satisfeita (nunca falso positivo).
  const currencyBullet = { text: "Destaque o preço para explicar a oferta", action: "Destaque", factRefs: ["fact:priceCurrency"], cta: "Confira o produto na página.", rationale: "para explicar a oferta" };
  const currencyReport = validateBriefSet(
    [{ ...brief, contentId: "c-cur", briefVersionId: "c-cur-v", development: [currencyBullet.text, currencyBullet.text], script: "Fale sobre o preço" }],
    { facts: ["R$"], refs: ["fact:priceCurrency"] },
    "tiktok-commerce", "tiktok-commerce@1.2", [], undefined,
    new Map([["c-cur", [currencyBullet, currencyBullet]]]),
  )[0]!;
  assert.ok(!currencyReport.issues.some((issue) => issue.includes("factRef")), "fato sem 2 termos: requisito não aplicável");
});


test("primeira pessoa/experiencial é permitida; claim objetivo não ancorado e cta inválida por bullet são diagnosticadas sem curto-circuito (v2)", () => {
  const evidence: EvidenceSnapshot = { facts: ["Tecido respiravel"], refs: ["product:description"] };
  const good = { text: "Comente que eu adorei o tecido respiravel porque comentei como o tecido respiravel mudou meu dia", action: "Comente", rationale: "porque comentei como o tecido respiravel mudou meu dia", factRefs: ["product:description"], cta: "Confira o produto na página." };
  const briefFor = (development: string[]) => ({ contentId: "c-fp", briefVersionId: "c-fp-v", version: 1 as const, angle: "a", hook: "Veja o tecido", development, script: "Fale sobre o produto", cta: "c" });
  // (1) primeira pessoa/experiencial passa o hard gate — sem gate ético/testemunho.
  const ok = validateBriefSet([briefFor([good.text, good.text])], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined, new Map([["c-fp", [good, good]]]))[0]!;
  assert.equal(ok.decision, "PASS", "primeira pessoa/experiencial não é rejeitada por si só");
  // (2) primeira pessoa com claim OBJETIVO não ancorado (50 kg) reprova.
  const absurd = { ...good, text: "Eu garanto que ele aguenta 50 kg porque comentei os 50 kg medidos em casa", rationale: "porque comentei os 50 kg medidos em casa" };
  const bad = validateBriefSet([briefFor([absurd.text, absurd.text])], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined, new Map([["c-fp", [absurd, absurd]]]))[0]!;
  assert.notEqual(bad.decision, "PASS", "claim objetivo não ancorado reprova mesmo em primeira pessoa");
  // (3) cta por bullet: TODOS os bullets são diagnosticados (sem curto-circuito).
  const badCta = { ...good, cta: "Aproveite o frete grátis acima de R$ 99" };
  const parsed = parseStructuredDevelopment([badCta, badCta, good], evidence);
  assert.deepEqual(parsed.diagnostics.map((d) => d.ctaValid), [false, false, true], "cada bullet tem ctaValid própria");
  // CTA factual mas NÃO acionável (sem verbo imperativo/ação de conversão) falha em todos os bullets.
  const notActionable = { ...good, cta: "O produto é leve, prático e combina com tudo" };
  const parsedNA = parseStructuredDevelopment([notActionable, notActionable, good], evidence);
  assert.deepEqual(parsedNA.diagnostics.map((d) => d.ctaValid), [false, false, true], "cta descritiva sem imperativo não é acionável");
  // Regressão Lens: substring não vale — token exato decide.
  assert.deepEqual(parsedNA.diagnostics.filter((d) => d.index < 2).map((d) => d.ctaValid), [false, false]);
  const wordCta = { ...good, cta: "Confira o comprimento ajustável" };
  assert.equal(isActionableCta(wordCta.cta), false, "'comprimento' não é 'compre' (sem substring)");
  assert.equal(isActionableCta("Confira o produto"), true, "imperativo exato é acionável");
  const wordParsed = parseStructuredDevelopment([wordCta, wordCta, good], evidence);
  assert.deepEqual(wordParsed.diagnostics.map((d) => d.ctaValid), [false, false, true], "falso positivo de stem eliminado em todos os bullets");
  const naReport = validateBriefSet([briefFor([notActionable.text, notActionable.text])], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined, new Map([["c-fp", [notActionable, notActionable]]]))[0]!;
  assert.equal(naReport.decision, "REPAIR", "gate reprova cta não acionável");
  assert.ok(naReport.issues.some((issue) => issue.includes("cta sem suporte")));
  const ctaReport = validateBriefSet([briefFor([badCta.text, badCta.text])], evidence, "tiktok-commerce", "tiktok-commerce@1.2", [], undefined, new Map([["c-fp", [badCta, badCta]]]))[0]!;
  assert.equal(ctaReport.decision, "REPAIR");
  assert.ok(ctaReport.issues.some((issue) => issue.includes("cta sem suporte")), "cta por bullet validada no hard gate");
});

test("rationale sem conector é espelhado do trecho de text após o conector; sem conector em ambos é GEN-SCHEMA", () => {
  const evidence: EvidenceSnapshot = { facts: ["Tecido respiravel"], refs: ["product:description"] };
  // Provider devolveu rationale sem conector, mas text TEM conector → espelho determinístico.
  const parsed = parseStructuredDevelopment(
    [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel ajuda no uso", action: "Destaque", factRefs: ["product:description"], rationale: "explicar como o tecido respiravel ajuda", cta: "Confira o produto." }],
    evidence,
  );
  assert.equal(parsed.bullets[0]!.rationale, "para explicar como o tecido respiravel ajuda no uso", "rationale vira o trecho de text após o conector");
  assert.deepEqual(parsed.diagnostics.map((d) => d.factTermsInRationale), [2]);
  // Sem conector em ambos, o texto é preservado e o diagnóstico reprova.
  const missingConnector = parseStructuredDevelopment(
    [{ text: "Destaque o tecido respiravel no uso diario", action: "Destaque", factRefs: ["product:description"], rationale: "explicar o conforto", cta: "Confira o produto." }],
    evidence,
  );
  assert.equal(missingConnector.diagnostics[0]!.connectorValid, false);
});
