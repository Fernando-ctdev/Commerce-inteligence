import test from "node:test";
import assert from "node:assert/strict";
import { validateBriefSet } from "./gates";
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
