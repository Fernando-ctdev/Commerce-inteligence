// ADR-026 (pós-job ace9e417) — regressões do caminho FAILED/GEN-REPAIR-EXHAUSTED:
// a telemetria de cenas (sceneOutcomes: status/generated/dropped/causes agregadas
// e tentativas com duração/código) sobrevive no detail do erro e é sanitizada
// antes de ir ao IntelligenceRun — NUNCA payload/descrição de cena. Zero mudança
// de comportamento: contagem de chamadas CONTENT_SCENE_IDEAS idêntica ao fluxo
// pré-existente (2 tentativas por conteúdo).
import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { GenerationError } from "./errors";
import { projectSceneOutcomes } from "./observability";

const describe = () => ({ provider: "test", model: "test", instructionVersion: "test" });
const qualityPassParts = [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
];
const developmentOk = ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"];
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function judgeItems(input?: { trustedContext?: unknown }): Array<{ contentId: string }> {
  const items = recordOf(input?.trustedContext)?.items;
  return Array.isArray(items) ? items as Array<{ contentId: string }> : [];
}
function bumped(calls: Record<string, number>, task: string): void {
  calls[task] = (calls[task] ?? 0) + 1;
}
// Router determinístico de 2 conteúdos com comportamento configurável de cenas;
// briefs passam no hard gate (a falha do job é exclusivamente de cenas).
function twoContentRouter(sceneResponse: () => unknown) {
  const calls: Record<string, number> = {};
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    bumped(calls, task);
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:description"] }] };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 2, opportunities: [
      { commercialObjective: "c", angle: "a1", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] },
      { commercialObjective: "c", angle: "a2", coreMessage: "m", hookMechanism: "achei o produto por acaso", noveltyTargets: ["n"] },
    ] };
    if (task === "CONTENT_BRIEF_GENERATION") return { items: [
      { angle: "a1", hook: "Gancho 1", development: developmentOk, script: "Tecido respiravel", cta: "cta 1" },
      { angle: "a2", hook: "Gancho 2", development: developmentOk, script: "Tecido respiravel na pratica", cta: "cta 2" },
    ] };
    if (task === "CONTENT_SCENE_IDEAS") return sceneResponse();
    if (task === "CONTENT_QUALITY_JUDGE")
      return { audits: judgeItems(input).map(({ contentId }) => ({ contentId, parts: qualityPassParts })) };
    return {};
  } };
  return { router, calls };
}
async function captureFailure(run: () => Promise<unknown>): Promise<GenerationError> {
  let captured: GenerationError | undefined;
  await assert.rejects(run, (error: unknown) => {
    captured = error as GenerationError;
    return (error as { code?: string })?.code === "GEN-REPAIR-EXHAUSTED";
  });
  return captured!;
}

test("ADR-026 telemetria: set FILTERED transporta status/counts/causas/tentativas, sem payload de cena", async () => {
  const { router, calls } = twoContentRouter(() => ({ scenes: [{ description: "Ambiente iluminado e bonito" }, { description: "Espaço decorado e organizado" }] }));
  const error = await captureFailure(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router }));
  assert.deepEqual(calls.CONTENT_SCENE_IDEAS, 4, "2 tentativas por conteúdo — contagem inalterada");
  const outcomes = (error.detail as { sceneOutcomes?: Array<Record<string, unknown>> }).sceneOutcomes ?? [];
  assert.deepEqual(outcomes.map(({ contentId, status, generated, dropped, causes }) => ({ contentId, status, generated, dropped, causes })), [
    { contentId: "j-content-1", status: "FILTERED", generated: 2, dropped: 2, causes: ["acao_ausente:2"] },
    { contentId: "j-content-2", status: "FILTERED", generated: 2, dropped: 2, causes: ["acao_ausente:2"] },
  ]);
  for (const outcome of outcomes)
    assert.deepEqual((outcome.attempts as Array<Record<string, unknown>> | undefined)?.map(({ attempt, status, kept, dropped }) => ({ attempt, status, kept, dropped })), [
      { attempt: 1, status: "completed", kept: 0, dropped: 2 },
      { attempt: 2, status: "completed", kept: 0, dropped: 2 },
    ]);
  const raw = JSON.stringify(error.detail);
  assert.ok(!raw.includes("iluminado") && !raw.includes("decorado"), "nenhuma descrição de cena no diagnóstico");
});

test("ADR-026 telemetria: set ERROR de schema carrega código GEN-SCHEMA por tentativa, sem payload", async () => {
  const { router, calls } = twoContentRouter(() => ({ scenes: [{ description: "curta" }] }));
  const error = await captureFailure(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router }));
  assert.deepEqual(calls.CONTENT_SCENE_IDEAS, 4);
  const outcomes = (error.detail as { sceneOutcomes?: Array<Record<string, unknown>> }).sceneOutcomes ?? [];
  assert.deepEqual(outcomes.map(({ contentId, status, generated, dropped, causes }) => ({ contentId, status, generated, dropped, causes })), [
    { contentId: "j-content-1", status: "ERROR", generated: 0, dropped: 0, causes: [] },
    { contentId: "j-content-2", status: "ERROR", generated: 0, dropped: 0, causes: [] },
  ]);
  for (const outcome of outcomes)
    assert.deepEqual((outcome.attempts as Array<Record<string, unknown>> | undefined)?.map(({ attempt, status, errorCode }) => ({ attempt, status, errorCode })), [
      { attempt: 1, status: "failed", errorCode: "GEN-SCHEMA" },
      { attempt: 2, status: "failed", errorCode: "GEN-SCHEMA" },
    ]);
  assert.ok(!JSON.stringify(error.detail).includes("curta"), "nenhum payload do provider no diagnóstico");
});


test("ADR-026 telemetria: falha de provider nas cenas registra GEN-PROVIDER sem mensagem", async () => {
  const { router, calls } = twoContentRouter(() => {
    throw Object.assign(new Error("boom interno do provider"), { code: "GEN-PROVIDER" });
  });
  const error = await captureFailure(() => runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 2, router }));
  assert.deepEqual(calls.CONTENT_SCENE_IDEAS, 4);
  const outcomes = (error.detail as { sceneOutcomes?: Array<Record<string, unknown>> }).sceneOutcomes ?? [];
  for (const outcome of outcomes)
    assert.deepEqual((outcome.attempts as Array<Record<string, unknown>> | undefined)?.map(({ attempt, status, errorCode }) => ({ attempt, status, errorCode })), [
      { attempt: 1, status: "failed", errorCode: "GEN-PROVIDER" },
      { attempt: 2, status: "failed", errorCode: "GEN-PROVIDER" },
    ]);
  assert.ok(!JSON.stringify(error.detail).includes("boom"), "mensagem do provider não vaza no diagnóstico");
});
test("ADR-026 telemetria: projectSceneOutcomes é allowlist estrita (status/código/contentId/counts)", () => {
  assert.deepEqual(projectSceneOutcomes([
    { contentId: "j-content-1", status: "FILTERED", generated: 2, dropped: 2, causes: ["acao_ausente:2", "DESCONHECIDA"], scenes: [{ description: "não pode vazar" }], attempts: [
      { attempt: 1, status: "completed", kept: 0, dropped: 2, durationMs: 12, scenes: "payload" },
      { attempt: 0, status: "estranho", durationMs: -1, kept: "x", errorCode: 7 },
    ] },
    "fora do formato",
    { scenes: [{ description: "vazar?" }] },
    { contentId: "DROP TABLE;--", status: "WRONG", generated: 2.5, dropped: 99999, causes: ["claim_nao_autorizado:3"], attempts: [
      { attempt: 99, status: "failed", errorCode: "injeção <script>", durationMs: 9e9 },
      { attempt: 1, status: "completed", kept: 1, dropped: 0, errorCode: "qualquer texto", durationMs: 30 },
    ] },
    { contentId: "j-content-2", status: "ERROR", generated: 0, dropped: 0, causes: ["ancora_ausente:2"], attempts: [
      { attempt: 1, status: "failed", errorCode: "GEN-CAPACITY", durationMs: 50 },
    ] },
  ]), [
    { contentId: "j-content-1", status: "FILTERED", generated: 2, dropped: 2, causes: ["acao_ausente:2", "scene_gate_issue"], attempts: [
      { attempt: 1, status: "completed", kept: 0, dropped: 2, errorCode: null, durationMs: 12 },
      { attempt: 0, status: "completed", kept: null, dropped: null, errorCode: null, durationMs: 0 },
    ] },
    { contentId: "", status: "UNKNOWN", generated: 0, dropped: 0, causes: [], attempts: [] },
    { contentId: "", status: "UNKNOWN", generated: 0, dropped: 0, causes: ["claim_nao_autorizado:3"], attempts: [
      { attempt: 0, status: "failed", kept: null, dropped: null, errorCode: "GEN-UNKNOWN", durationMs: 0 },
      { attempt: 1, status: "completed", kept: 1, dropped: 0, errorCode: null, durationMs: 30 },
    ] },
    { contentId: "j-content-2", status: "ERROR", generated: 0, dropped: 0, causes: ["ancora_ausente:2"], attempts: [
      { attempt: 1, status: "failed", kept: null, dropped: null, errorCode: "GEN-UNKNOWN", durationMs: 50 },
    ] },
  ]);
});
