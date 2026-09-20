// ADR-026 — regressões mínimas dos dois casos reais do job 0e94549e:
// 1) locator interno de evidência no script: "[fact:features]";
// 2) metainstrução de inserção editorial no script: "Eu colocaria aqui um
//    objeto pequeno...".
// Prova: detecção é regex determinística no gate (zero capability nova; as
// únicas chamadas extras são o CONTENT_BRIEF_REPAIR já previsto), o artefato
// não publica (reparado ou, persistindo, item fora do entregue — fail-closed)
// e fala creator-first legítima continua passando.
import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { gateSceneSet, internalLocator, scriptInsertMetacomment } from "./gates";

const describe = () => ({ provider: "test", model: "test", instructionVersion: "test" });
const developmentOk = [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }];
const qualityPassParts = [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
];
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function judgeItems(input?: { trustedContext?: unknown }): Array<{ contentId: string }> {
  const items = recordOf(input?.trustedContext)?.items;
  return Array.isArray(items) ? items as Array<{ contentId: string }> : [];
}
// Contadores de chamada por task: chaves estáticas, incremento por evento.
function bumped(calls: Record<string, number>, task: string): void {
  calls[task] = (calls[task] ?? 0) + 1;
}
// Fixtures canônicas de 1 conteúdo (mesma família factual da suíte).
function oneContentCalls(): Record<string, number> {
  return {
    PRODUCT_UNDERSTANDING: 1,
    COMMERCIAL_OPPORTUNITY_MAPPING: 1,
    STRATEGY_SYNTHESIS: 1,
    CONTENT_PLAN_GENERATION: 1,
    CONTENT_BRIEF_GENERATION: 1,
    CONTENT_SCENE_IDEAS: 1,
    CONTENT_QUALITY_JUDGE: 1,
  };
}

test("ADR-026: internalLocator casa só colchete namespace:token sem espaço", () => {
  assert.equal(internalLocator("texto [fact:features] fim"), "[fact:features]");
  assert.equal(internalLocator("[product:name]"), "[product:name]");
  assert.equal(internalLocator("m [fact:features:2]"), "[fact:features:2]");
  assert.equal(internalLocator("[mostra a etiqueta por dentro]"), null, "colchete de fala tem espaço");
  assert.equal(internalLocator("cite os termos do fato, sem colchete"), null);
});

test("ADR-026: scriptInsertMetacomment casa inserção editorial e preserva fala legítima", () => {
  assert.match(
    scriptInsertMetacomment("Eu colocaria aqui um objeto pequeno que mostra o tecido") ?? "",
    /colocaria aqui/,
  );
  assert.equal(scriptInsertMetacomment("Eu pegaria esse modelo porque ele é leve"), null);
  assert.equal(scriptInsertMetacomment("aqui cabe no bolso"), null);
  assert.equal(scriptInsertMetacomment("Dá um close no tecido e conta o que você sente"), null);
});

test("ADR-026: locator derruba SOMENTE a cena que o contém", () => {
  const evidence = { facts: ["tecido respiravel"], refs: ["product:description"] };
  const brief = { angle: "a", hook: "Gancho", development: ["Destaque o tecido respiravel", "Destaque o tecido respiravel"], script: "Tecido respiravel", cta: "cta" };
  const gated = gateSceneSet([
    { description: "Mostre o tecido respiravel em uso" },
    { description: "[fact:features] Mostre o tecido respiravel" },
    { description: "Pegue o tecido respiravel e aproxime para demonstrar" },
  ], brief, evidence);
  assert.equal(gated.kept.length, 2, "as duas cenas limpas seguem válidas");
  assert.equal(gated.dropped, 1);
  assert.ok(gated.causes.includes("locator_interno:1"));
});

// Fluxo do caso real 1: "[fact:features]" no script → issue no gate → repair do
// briefing → publicado limpo. Contagem exata de chamadas prova que a detecção
// não adiciona capability nenhuma.
test("ADR-026 caso real 1: [fact:features] no script não publica e repara sem chamada extra", async () => {
  const calls: Record<string, number> = {};
  const repairContexts: Array<Record<string, unknown>> = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    bumped(calls, task);
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "Gancho", development: developmentOk, script: "[fact:features] Tecido respiravel", cta: "cta" }] };
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairContexts.push(recordOf(input?.trustedContext) ?? {});
      return { angle: "a", hook: "Gancho", development: [{ text: developmentOk[0].text, action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }, { text: developmentOk[0].text, action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }], script: "Tecido respiravel", cta: "cta" };
    }
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE")
      return { audits: judgeItems(input).map(({ contentId }) => ({ contentId, parts: qualityPassParts })) };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(result.briefs.length, 1, "item reparado publica");
  const brief = result.briefs[0];
  for (const value of [brief.hook, brief.script, brief.cta, brief.development.join(" ")])
    assert.equal(internalLocator(value), null, "nada publicado carrega locator");
  // O repair recebeu a causa e o checklist do locator (reparo seletivo da parte).
  assert.ok(JSON.stringify(repairContexts[0]?.issues).includes("locator interno de evidência em script"));
  assert.equal((repairContexts[0]?.repairChecklist as Record<string, unknown> | undefined)?.removeLocator, true);
  // Zero chamada extra para detecção: mapa exato do fluxo (o repair é o já previsto).
  assert.deepEqual(calls, { ...oneContentCalls(), CONTENT_BRIEF_REPAIR: 1 });
});

// Fluxo do caso real 2: metainstrução de inserção ("Eu colocaria aqui um objeto
// pequeno...") → issue de metainstrução (ADR-025 §5 + padrão ADR-026) → repair
// → publicado limpo.
test("ADR-026 caso real 2: inserção editorial no script não publica e repara sem chamada extra", async () => {
  const calls: Record<string, number> = {};
  const repairContexts: Array<Record<string, unknown>> = [];
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    bumped(calls, task);
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "Gancho", development: developmentOk, script: "Eu colocaria aqui um objeto pequeno que mostra o tecido respiravel", cta: "cta" }] };
    if (task === "CONTENT_BRIEF_REPAIR") {
      repairContexts.push(recordOf(input?.trustedContext) ?? {});
      return { angle: "a", hook: "Gancho", development: [{ text: developmentOk[0].text, action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }, { text: developmentOk[0].text, action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }], script: "Tecido respiravel", cta: "cta" };
    }
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE")
      return { audits: judgeItems(input).map(({ contentId }) => ({ contentId, parts: qualityPassParts })) };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router });
  assert.equal(result.briefs.length, 1);
  assert.equal(scriptInsertMetacomment(result.briefs[0].script), null, "script publicado sem metainstrução de inserção");
  assert.ok(JSON.stringify(repairContexts[0]?.issues).includes("metainstrução de cena"));
  assert.equal((repairContexts[0]?.repairChecklist as Record<string, unknown> | undefined)?.removeSceneMetacomment, true);
  assert.deepEqual(calls, { ...oneContentCalls(), CONTENT_BRIEF_REPAIR: 1 });
});

// Fail-closed: repair que NÃO limpa o locator esgota o orçamento e o item não
// publica — o job não carrega artefato interno como entregue.
test("ADR-026: locator persistente após repair falha o item, nunca publica", async () => {
  const calls: Record<string, number> = {};
  const leakyBrief = { angle: "a", hook: "Gancho", development: developmentOk, script: "[fact:features] Tecido respiravel", cta: "cta" };
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    bumped(calls, task);
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [leakyBrief] };
    if (task === "CONTENT_BRIEF_REPAIR")
      return { ...leakyBrief, development: [{ text: developmentOk[0].text, action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }, { text: developmentOk[0].text, action: "Destaque", factRef: "product:description", rationale: "para explicar como o tecido respiravel afeta o uso" }] };
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE")
      return { audits: judgeItems(input).map(({ contentId }) => ({ contentId, parts: qualityPassParts })) };
    return {};
  } };
  await assert.rejects(
    () => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 1, router }),
    (error: unknown) => (error as { code?: string })?.code === "GEN-REPAIR-EXHAUSTED",
  );
  assert.equal(calls.CONTENT_BRIEF_REPAIR, 2, "orçamento de repair existente, sem retry extra para detecção");
});
