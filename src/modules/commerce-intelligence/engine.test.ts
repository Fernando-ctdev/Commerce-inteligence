import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceCatalog, runFirstGeneration } from "./engine";
import { CARDINALITY_POLICY_VERSION } from "./contract";
import { collectJobEvents, resetJobEvents } from "./observability";
import type { ProviderCallMetrics } from "./model-router";
const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });
test("fails closed when provider understanding violates contract", async () => { const router = { describe, complete: async () => ({ tenantId: "forbidden" }) }; await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), /Resposta inválida/); });
test("includes non-empty string arrays as stable fact evidence with 1:1 facts-to-refs", () => {
  const catalog = buildEvidenceCatalog({ facts: { features: ["Leve", "Compacto"], empty: [], mixed: ["Veloz", 3] } });
  assert.deepEqual(catalog.refs, ["fact:features", "fact:features:2"]);
  assert.deepEqual(catalog.facts, ["Leve", "Compacto"]);
  assert.equal(catalog.facts.length, catalog.refs.length, "cada fato tem exatamente uma ref na mesma posição");
});
test("repairs mapping envelope without opportunities via a second contract-true call", async () => {
  let mappingCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") { mappingCalls++; if (mappingCalls === 1) return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], analysis: "prosa sem opportunities" }; return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] }; }
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(mappingCalls, 2, "mapping retried once when envelope lacked opportunities");
  assert.equal((result.strategy as { opportunities: unknown[] }).opportunities.length, 1);
});
test("repairs content plan array root via one contract-true retry, then fail-closed", async () => {
  let planCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") { planCalls++; if (planCalls === 1) return [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }]; return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] }; }
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(planCalls, 2, "plan retried once when root was an array");
  assert.equal(result.briefs.length, 1);
});
test("plan retry exhausted yields typed GEN-SCHEMA without fabricating opportunities", async () => {
  let planCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") { planCalls++; return [1, 2]; }
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string }; return e?.code === "GEN-SCHEMA"; });
  assert.equal(planCalls, 2, "exactly one retry before failing closed");
});
test("repairs brief batch cardinality divergence via one retry preserving exact-N", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; if (briefCalls === 1) return { items: [] }; return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "c" }] }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(briefCalls, 2, "batch retried once on cardinality divergence");
  assert.equal(result.briefs.length, 1, "exact-N preserved after repair");
});
test("brief batch retry exhausted yields typed GEN-SCHEMA without publishing", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "c" }, { angle: "a2", hook: "h2", development: ["Produto real em uso"], script: "Mostre o Produto de novo", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string }; return e?.code === "GEN-SCHEMA"; });
  assert.equal(briefCalls, 2, "exactly one retry before failing closed");
});
test("provider scene data is not persisted in the brief", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", scenes: ["legado"], cta: "c" }] }; }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.equal(briefCalls, 1, "unknown provider fields do not affect the brief contract");
  assert.equal(result.briefs.length, 1, "exact-N preserved");
  assert.equal("scenes" in result.briefs[0], false);
});
test("development remains required in the brief contract", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") { briefCalls++; return { items: [{ angle: "a", hook: "h", script: "Mostre o Produto", cta: "c" }] }; }
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => { const e = error as { code?: string; detail?: Record<string, unknown> }; return e?.code === "GEN-SCHEMA" && e?.detail?.task === "CONTENT_BRIEF_GENERATION" && e?.detail?.retried === true; });
  assert.equal(briefCalls, 2, "missing development retries once");
});
test("GEN-REPAIR-EXHAUSTED carries sanitized gate summary without brief payload", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["SEGREDO_DO_BRIEFING em uso"], script: "SEGREDO_DO_BRIEFING suporta 7 kg comprovados", cta: "c" }] };
    return {};
  } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }), (error: unknown) => {
    const e = error as { code?: string; detail?: Record<string, unknown> };
    assert.equal(e.code, "GEN-REPAIR-EXHAUSTED");
    assert.equal(e.detail?.task, "CONTENT_BRIEF_GENERATION");
    assert.equal(typeof e.detail?.rounds, "number");
    assert.equal(e.detail?.expected, 1);
    const rejected = e.detail?.rejected as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(rejected) && rejected.length === 1);
    assert.ok(["UNSUPPORTED", "INFERRED_BUT_SAFE"].includes(String(rejected[0].factualStatus)));
    assert.ok(Array.isArray(rejected[0].issues));
    assert.ok(!JSON.stringify(e.detail).includes("SEGREDO_DO_BRIEFING"), "resumo não pode conter conteúdo do briefing");
    return true;
  });
});
test("capabilities carry provider metrics allowlist for IntelligenceRun metadata", async () => {
  const router = { describe: () => ({ provider: "test", model: "mid-model", instructionVersion: "slice-003" }), modelFor: (task: string) => task === "STRATEGY_SYNTHESIS" || task === "CONTENT_PLAN_GENERATION" ? "high-model" : "mid-model", complete: async (task: string, _input: unknown, _signal: unknown, onMetrics?: (metrics: ProviderCallMetrics) => void) => {
    onMetrics?.({ model: task === "STRATEGY_SYNTHESIS" ? "high-model" : "mid-model", reasoning: "low", providerStatus: 200, requestBytes: 1200, trustedContextBytes: 600, externalBytes: 2, responseBytes: 50, durationMs: 5 });
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "c" }] };
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  const strategyCap = result.capabilities.find((cap) => cap.task === "STRATEGY_SYNTHESIS");
  assert.equal(strategyCap?.model, "high-model", "modelo efetivo por capability");
  assert.equal(strategyCap?.reasoning, "low");
  assert.equal(strategyCap?.providerStatus, 200);
  assert.equal(strategyCap?.requestBytes, 1200);
  assert.equal(strategyCap?.trustedContextBytes, 600);
  assert.equal(strategyCap?.externalBytes, 2);
  assert.ok(typeof strategyCap?.durationMs === "number");
});
test("requires a provider outside explicit test fallback", async () => { await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1 }), /Provider não configurado/); });
test("repair of many rejected briefs is chunked by batch size preserving positions and ids", async () => {
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: unknown) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: Array.from({ length: 10 }, (_, i) => ({ commercialObjective: `c${i}`, angle: `a${i}`, coreMessage: `m${i}`, hookMechanism: "h", noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls++;
      const batch = input as { trustedContext?: { opportunities?: unknown[] } } | undefined;
      const n = batch?.trustedContext?.opportunities?.length ?? 1;
      // Rodada inicial: claim numérico sem evidência → todos os itens exigem repair factual.
      if (briefCalls <= 3) return { items: Array.from({ length: n }, () => ({ angle: "a", hook: "h", development: ["Produto"], script: "Suporta 999 kg", cta: "c" })) };
      // Repair: itens distintos (ângulo/hook/script/cta) → todos passam os gates.
      return { items: Array.from({ length: n }, (_, i) => ({ angle: `ang ${briefCalls}-${i}`, hook: `hook ${briefCalls}-${i}`, development: ["Produto"], script: `script distinto ${briefCalls}-${i}`, cta: `cta ${briefCalls}-${i}` })) };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 10, router });
  assert.equal(briefCalls, 6, "3 batches iniciais (4/4/2) + 10 rejeitados em chunks de 4/4/2, nenhum batch acima de 8");
  assert.equal(result.briefs.length, 10, "exact-N preservado");
  assert.deepEqual(result.briefs.map((b) => b.contentId), Array.from({ length: 10 }, (_, i) => `j-content-${i + 1}`), "posição/IDs estáveis após repair em chunks");
  assert.ok(result.reports.every((report) => report.decision === "PASS"));
  assert.equal(result.repairs, 10);
});
test("capability events carry cardinality policy version on success", async () => {
  const router = { describe, complete: async (task: string) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["p"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "h", noveltyTargets: ["n"] }] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "h", development: ["Produto real em uso"], script: "Mostre o Produto", cta: "c" }] };
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router });
  assert.ok(result.capabilities.length >= 5);
  assert.ok(result.capabilities.every((cap) => cap.cardinalityPolicyVersion === CARDINALITY_POLICY_VERSION), "todo CapabilityEvent persistido carrega a versão da política");
});
test("failed capability record and event carry cardinality policy version", async () => {
  resetJobEvents();
  const router = { describe, complete: async () => { throw new Error("boom"); } };
  await assert.rejects(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Descrição", targetContentCount: 1, router }));
  const failed = collectJobEvents().map((line) => JSON.parse(line) as Record<string, unknown>).find((event) => event.event === "capability.failed");
  assert.equal(failed?.cardinalityPolicyVersion, CARDINALITY_POLICY_VERSION, "falha de capability registra a versão da política");
});
