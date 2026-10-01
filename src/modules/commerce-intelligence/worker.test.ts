import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { assertHandoffAlignmentV2, attemptDeadlineMsFor, briefPayloadForPersistence, callBudget, fallbackCallBudget, fenceMatches, heartbeatAction, internalFailureMetadata, mergeMemorySignals, plannerMemorySignalsFor, plannerProvenanceOf, projectEngineFacts, projectFailureDiagnostics, runMetadata, sceneBackfillLimitFor, sceneCallBudget, semanticQualityCallBudget } from "./worker";
import { ENGINE_VERSION, type EngineResult } from "./engine";
import type { PlannedOpportunityHandoffV2 } from "./engine-v2";
import { GATE_POLICY_VERSION } from "./gates";
import { loadCreativeSystem } from "./creative-system";
import { canonicalSerialization, sha256Hex } from "./planner-harness/canonical";
import { collectJobEvents, emitJobEvent, resetJobEvents } from "./observability";

// Gate 5 (item 3): a projeção de fatos é pura e determinística. Desconto,
// comissão e features saíram do contrato ativo (ADR-030) — nenhum é projetado.
test("engineFacts projeta somente fatos do contrato ativo, sem legado", () => {
  const base = {
    id: "p1",
    name: "Produto",
    description: "D",
    category: "C",
    brand: null,
    priceAmount: null,
    priceCurrency: "R$",
    variants: null,
    images: [],
    seller: null,
    sourceUrl: null,
  };
  const facts = projectEngineFacts(base);
  assert.deepEqual(Object.keys(facts).sort(), ["brand", "category", "description", "images", "name", "priceAmount", "priceCurrency", "productId", "seller", "sourceUrl", "variants"]);
});

// ADR-031: linha histórica com comissão/features/desconto
// ainda carrega as colunas, mas a projeção canônica NUNCA as expõe à engine.
test("engineFacts não projeta comissão/features/desconto de linhas históricas", () => {
  const legacyRow = {
    id: "p2",
    name: "Produto legado",
    description: "D",
    category: "C",
    brand: null,
    priceAmount: null,
    priceCurrency: "R$",
    features: ["50 aulas", "certificado"],
    commissionType: "PERCENT",
    commissionValue: "10.50",
    discountPercentage: "25.5",
    discountType: "PERCENTAGE",
    discountValue: "15.5",
    variants: null,
    images: [],
    seller: null,
    sourceUrl: null,
  };
  const facts = projectEngineFacts(legacyRow);
  for (const key of ["features", "commissionType", "commissionValue", "discountType", "discountValue", "discountPercentage", "discount"]) {
    assert.equal(key in facts, false);
  }
  assert.equal(JSON.stringify(facts).includes("50 aulas"), false);
  assert.equal(JSON.stringify(facts).includes("15.5"), false);
});

// AC Etapa 2 3–4: priceAmount presente é serializado Decimal.toString() como
// string; variants/images/seller/sourceUrl atravessam sem normalização.
test("engineFacts serializa priceAmount Decimal como string e preserva valores declarados", () => {
  const variants = [{ name: "Preto" }];
  const images = ["https://cdn.example/a.jpg"];
  const facts = projectEngineFacts({
    id: "p3",
    name: "Produto com preço",
    description: "Descrição",
    category: "Categoria",
    brand: "Marca",
    priceAmount: new Prisma.Decimal("89.9"),
    priceCurrency: "BRL",
    variants,
    images,
    seller: "loja oficial",
    sourceUrl: "https://shop.tiktok.com/product/x",
  });
  assert.equal(typeof facts.priceAmount, "string");
  assert.equal(facts.priceAmount, "89.9");
  assert.deepEqual(facts.variants, variants);
  assert.deepEqual(facts.images, images);
  assert.equal(facts.seller, "loja oficial");
  assert.equal(facts.sourceUrl, "https://shop.tiktok.com/product/x");
  // Ausência permanece ausência: null nunca vira outro campo ou "0".
  const semPreco = projectEngineFacts({
    id: "p4",
    name: "Sem preço",
    description: null,
    category: null,
    brand: null,
    priceAmount: null,
    priceCurrency: null,
    variants: null,
    images: null,
    seller: null,
    sourceUrl: null,
  });
  assert.equal(semPreco.priceAmount, undefined);
  assert.equal(semPreco.sourceUrl, null);
});

// Review: IntelligenceRun.metadata registra gateVersion junto do engineVersion.
test("run metadata carries engineVersion, gateVersion and plan policy snapshots", () => {
  const metadata = runMetadata(1, () => ({ provider: "p", model: "m", instructionVersion: "i" }), [], 0, 1, [], [], [{ field: "cta", replacedWithId: "cta-x", reason: "função promo sem pattern deliverable" }], [], [], [{ field: "purchaseBarriers", received: 9, kept: 8 }], 1);
  assert.equal(metadata.engineVersion, ENGINE_VERSION);
  assert.equal(metadata.gateVersion, GATE_POLICY_VERSION);
  assert.equal(metadata.planPolicyVersion, 1);
  assert.deepEqual(metadata.patternReplacements, [{ field: "cta", replacedWithId: "cta-x", reason: "função promo sem pattern deliverable" }]);
  assert.deepEqual(metadata.understandingReductions, [{ field: "purchaseBarriers", received: 9, kept: 8 }]);
});
const v2Bullet = { text: "Ponto de desenvolvimento", action: "Mostre", rationale: "para destacar o ponto", factRefs: ["fact:features"], cta: "Confira o produto." };
test("brief persistence keeps development bullets and strips legacy scenes (v2)", () => {
  const payload = briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", development: ["Ponto de desenvolvimento", "Ponto de desenvolvimento"], script: "Roteiro oral", cta: "CTA", scenes: ["cena antiga"] } as never, [v2Bullet, v2Bullet]);
  assert.equal(payload.version, 2, "payload v2 carrega marcador de versão");
  assert.equal(payload.developmentSchemaVersion, 2, "payload v2 carrega marcador do schema de development");
  assert.deepEqual(payload.development, [v2Bullet, v2Bullet], "persistência é DevelopmentBullet[] canônico");
  assert.equal("scenes" in payload, false);
});
test("brief persistence rejects missing development", () => {
  assert.throws(() => briefPayloadForPersistence({ contentId: "c1", briefVersionId: "b1", version: 1, angle: "a", hook: "h", script: "Roteiro oral", cta: "CTA" } as never), /development/);
});
test("brief persistence rejects missing/misaligned structured bullets (string[] não é persistido)", () => {
  const base = { contentId: "c1", briefVersionId: "b1", version: 1 as const, angle: "a", hook: "h", script: "Roteiro oral", cta: "CTA" };
  assert.throws(() => briefPayloadForPersistence({ ...base, development: [{ text: "Ponto de desenvolvimento", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Ponto de desenvolvimento", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }] } as never), /bullets estruturados/);
  assert.throws(() => briefPayloadForPersistence({ ...base, development: [{ text: "Ponto de desenvolvimento", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Outro ponto", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }] } as never, [v2Bullet, v2Bullet]), /bullets estruturados/);
  assert.throws(() => briefPayloadForPersistence({ ...base, development: [{ text: "Ponto de desenvolvimento", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "Ponto de desenvolvimento", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }] } as never, [{ ...v2Bullet, factRefs: [] }, v2Bullet]), /bullets estruturados/);
  assert.throws(() => briefPayloadForPersistence({ ...base, development: [{ text: "1", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "2", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "3", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "4", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "5", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "6", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }, { text: "7", action: "Destaque", rationale: "para o uso no dia a dia", factRefs: ["product:description"], cta: "Confira o produto na página." }] } as never), /development/);
});
test("failure metadata persists internal code, current stage and sanitized causes per brief", () => {
  const metadata = internalFailureMetadata("GEN-REPAIR-EXHAUSTED", "GENERATING_BRIEFS", {
    task: "CONTENT_BRIEF_GENERATION",
    rejected: [{ briefId: "job-content-2:job-brief-2", factualStatus: "UNSUPPORTED", claimType: "objetivo", structuralStatus: "FAIL", platformStatus: "PASS", varietyStatus: "PASS", decision: "REPAIR", issues: ["claim sem suporte", "development invalido"], script: "raw brief must not be persisted" }],
  });
  assert.equal(metadata.code, "GEN-REPAIR-EXHAUSTED");
  assert.equal(metadata.stage, "GENERATING_BRIEFS");
  assert.deepEqual(metadata.causes, [{ briefId: "job-content-2:job-brief-2", causes: ["claim sem suporte", "development invalido"] }]);
  assert.ok(!JSON.stringify(metadata).includes("raw brief"));
});
test("failure metadata keeps semantic REVIEW out: no qualityFailures, no gateReports from semantic shapes", () => {
  const metadata = internalFailureMetadata("GEN-REPAIR-EXHAUSTED", "GENERATING_BRIEFS", {
    rejected: [{ contentId: "job-content-1", part: "hook", round: 2, status: "REVIEW", criterion: "hook_clarity", reason: "unclear", raw: "do not persist" }],
  });
  assert.equal("qualityFailures" in metadata, false);
  assert.equal("gateReports" in metadata, false);
  assert.ok(!JSON.stringify(metadata).includes("REVIEW"));
  assert.ok(!JSON.stringify(metadata).includes("do not persist"));
});
test("terminal failure event carries only objective gate reports, never qualityFailures", () => {
  const diagnostics = projectFailureDiagnostics([
    { contentId: "job-content-1", part: "hook", round: 2, status: "REVIEW", criterion: "hook_clarity", reason: "unclear", raw: "drop" },
    { briefId: "job-content-2:job-brief-2", factualStatus: "UNSUPPORTED", claimType: "objetivo", structuralStatus: "FAIL", platformStatus: "PASS", varietyStatus: "PASS", decision: "REPAIR", issues: ["claim sem suporte"] },
  ]);
  assert.equal("qualityFailures" in diagnostics, false);
  resetJobEvents();
  emitJobEvent("job.terminal", { errorCode: "GEN-REPAIR-EXHAUSTED", gateReports: diagnostics.gateReports });
  const event = JSON.parse(collectJobEvents()[0]) as Record<string, unknown>;
  assert.equal("qualityFailures" in event, false);
  assert.deepEqual((event.gateReports as Array<Record<string, unknown>>).map(({ briefId }) => briefId), ["job-content-2:job-brief-2"]);
  assert.ok(!JSON.stringify(event).includes("raw"));
  assert.ok(!JSON.stringify(event).includes("REVIEW"));
  resetJobEvents();
});
test("objective gate guard: semantic-shaped record with briefId and issues is not projected", () => {
  const diagnostics = projectFailureDiagnostics([
    { briefId: "job-content-1:job-brief-1", contentId: "job-content-1", part: "hook", round: 2, status: "REVIEW", criterion: "hook_clarity", reason: "unclear", issues: ["style"] },
  ]);
  assert.deepEqual(diagnostics.gateReports, []);
  assert.deepEqual(diagnostics.causes, []);
});
test("internal failure metadata retains sanitized ContractError identity and field", () => {
  const metadata = internalFailureMetadata("GEN-SCHEMA", "UNDERSTANDING_PRODUCT", {
    errorName: "ContractError",
    message: "cardinalidade de purchaseBarriers fora da politica (min 1, max 8)",
    field: "purchaseBarriers",
  });
  assert.equal(metadata.code, "GEN-SCHEMA");
  assert.equal(metadata.stage, "UNDERSTANDING_PRODUCT");
  assert.deepEqual(metadata.detail, {
    issue: "cardinalidade de purchaseBarriers fora da politica (min 1, max 8)",
    field: "purchaseBarriers",
    errorName: "ContractError",
  });
});
test("rejects result writes from a reclaimed owner", () => { const current = { leaseOwnerId: "new-owner", attempt: 2 }; assert.equal(fenceMatches(current, "old-owner", 1), false); assert.equal(fenceMatches(current, "new-owner", 2), true); });
// Coração do bloqueio 2 do Review: o heartbeat deve INTERROMPER a renovação e ABORTAR a
// tentativa no attemptDeadlineAt, cobrindo até provider que ignora o AbortSignal.
test("heartbeat renews only before the attempt deadline, aborts at it, skips after fence loss", () => {
  assert.equal(heartbeatAction(1_000, 10_000, false), "renew");
  assert.equal(heartbeatAction(9_999, 10_000, false), "renew");
  assert.equal(heartbeatAction(10_000, 10_000, false), "abort");
  assert.equal(heartbeatAction(60_000, 10_000, false), "abort");
  assert.equal(heartbeatAction(1_000, 10_000, true), "skip");
  assert.equal(heartbeatAction(60_000, 10_000, true), "skip");
});
test("attempt budget covers all semantic judge/part repairs and selected scene backfill", () => {
  const count = 10;
  const configuredTimeout = Number(process.env.GENERATION_PROVIDER_TIMEOUT_MS ?? 180000);
  const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 180000;
  const configuredMargin = Number(process.env.GENERATION_FINALIZE_MARGIN_MS ?? 120000);
  const margin = Number.isFinite(configuredMargin) && configuredMargin > 0 ? configuredMargin : 120000;
  assert.equal(semanticQualityCallBudget(count), 210);
  assert.equal(sceneBackfillLimitFor(1), 10);
  assert.equal(sceneBackfillLimitFor(count), 10);
  assert.equal(sceneCallBudget(1), 33);
  assert.equal(sceneCallBudget(count), 60);
  for (const targetCount of [1, count]) {
    const required = (callBudget(targetCount) + fallbackCallBudget(targetCount) + semanticQualityCallBudget(targetCount) + 2 * targetCount + sceneCallBudget(targetCount)) * timeout + margin;
    assert.ok(attemptDeadlineMsFor(targetCount) >= required, `deadline covers provider calls for count=${targetCount}`);
  }
});

test("mergeMemorySignals acumula com dedupe e não substitui histórico (ADR-021)", () => {
  const previous = {
    generatedCount: 4,
    deliveredHookMechanisms: ["demonstração direta", "prova social"],
    deliveredCtaFunctions: ["promo", "checkout"],
    deliveredAngles: ["a1"],
  };
  const merged = mergeMemorySignals(previous, {
    generatedCount: 2,
    deliveredHookMechanisms: ["prova social", "objeção respondida"],
    deliveredCtaFunctions: ["promo"],
    deliveredAngles: ["a2"],
  });
  assert.deepEqual(merged.deliveredHookMechanisms, ["demonstração direta", "prova social", "objeção respondida"]);
  assert.deepEqual(merged.deliveredCtaFunctions, ["promo", "checkout"]);
  assert.deepEqual(merged.deliveredAngles, ["a1", "a2"]);
  assert.equal(merged.generatedCount, 6, "contagem entregue é acumulada");
});

test("mergeMemorySignals sem snapshot anterior inicia o histórico", () => {
  const merged = mergeMemorySignals(undefined, {
    generatedCount: 2,
    deliveredHookMechanisms: ["prova social"],
    deliveredCtaFunctions: ["promo"],
    deliveredAngles: ["a1"],
  });
  assert.deepEqual(merged.deliveredHookMechanisms, ["prova social"]);
  assert.equal(merged.generatedCount, 2);
});

// ---- Task 3 (design 2026-09-18): diagnósticos redigidos por item no partial ----

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

test("failedItems carregam developmentDiagnostics e qualityDiagnostics allowlisted, sem texto de draft", async () => {
  const understanding = { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
  // Cutover V2: mapeamento com pool diverso (requisito do Planner determinístico)
  // e creatorContext explícito — mesma receita do engine-v2-routing.
  const envelope = { discoveryContractVersion: "2", hypotheses: [
    { commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
    { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 },
    { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 },
    { commercialObjective: "leve para carregar todo dia", angle: "leveza no uso", coreMessage: "leve para carregar todo dia", relevantCapabilities: ["cap"], benefits: ["leveza no uso"], proofOptions: ["product:description"], commercialEffects: ["leve para carregar todo dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
  ] };
  const strategy = { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.3", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
  // Bullet com claim objetivo sem suporte ("999 kg") — falha o hard gate por item.
  const badBullet = { text: "Prova os 999 kg de carga para o", action: "Prova", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para o" };
  const goodBullet = { text: "Destaque o tecido respiravel para explicar como o tecido respiravel ajuda no uso diario", action: "Destaque", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para explicar como o tecido respiravel ajuda no uso diario" };
  const secondBullet = { text: "Comente o tecido respiravel para conectar o tecido respiravel ao uso cotidiano", action: "Comente", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para mostrar o tecido respirável no uso diário" };
  const judgeBatchPass = (input?: { trustedContext: unknown }) => {
    const items = recordOf(input?.trustedContext)?.items;
    const list = Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
    return { audits: list.map(({ contentId }) => ({
      contentId,
      parts: [
        { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
        { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
        { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
        { part: "cta", status: "PASS", criterion: "cta_tiktok_native", reason: "meets_criteria" },
        { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
      ],
    })) };
  };
  const router = { describe: () => ({ provider: "test", model: "m", instructionVersion: "i" }), complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return understanding;
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return envelope;
    if (task === "CONTENT_PLAN_GENERATION" || task === "CONTENT_SCENE_IDEAS") throw new Error(`capability proibida no caminho V2: ${task}`);
    if (task === "CONTENT_BRIEF_GENERATION") return { developmentSchemaVersion: 2, items: [
      { angle: "a1", hook: "h1", development: [badBullet, badBullet], script: "Fale sobre o produto", cta: "c1" },
      { angle: "a2", hook: "h2", development: [goodBullet, secondBullet], script: "Fale sobre o produto", cta: "c2" },
    ] };
    if (task === "CONTENT_BRIEF_REPAIR") return { developmentSchemaVersion: 2, angle: "a1", hook: "h1", development: [badBullet, badBullet], script: "Fale sobre o produto", cta: "c1" };
    if (task === "CONTENT_QUALITY_JUDGE") return judgeBatchPass(input as { trustedContext: unknown });
    return {};
  } };
  const { runFirstGeneration } = await import("./engine");
  const result = await runFirstGeneration({ productId: "p", jobId: "j-diag", name: "Produto", description: "Tecido respirável", targetContentCount: 2, creatorContext: { recordsAlone: true, tone: "natural", allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"] }, router });
  assert.ok(result.partial, "parcial declarado (ADR-021)");
  assert.equal(result.partial.expectedCount, 2);
  const byContent = new Map(result.partial.failedItems.map((f) => [f.contentId, f]));
  const devFailed = byContent.get("j-diag-content-1")!;
  assert.equal(devFailed.reason, "HARD_GATE");
  assert.ok(Array.isArray(devFailed.developmentDiagnostics) && devFailed.developmentDiagnostics.length === 2, "diagnóstico por bullet presente");
  assert.deepEqual(devFailed.failedBulletIndexes, [0, 1], "repair mira os índices falhos");
  const firstDiag = devFailed.developmentDiagnostics![0]!;
  assert.ok(firstDiag.unverifiedClaimParts.includes("value_token"), "parte localizada value_token do claim '999 kg'");
  assert.ok(firstDiag.unverifiedClaimParts.every((part) => ["value_token", "attribute", "commercial_value"].includes(part)), "partes allowlisted do unverified_claim");
  assert.ok(devFailed.issues.includes("unverified_claim"), "rótulo fixo da cascata presente");
  assert.ok(!devFailed.issues.includes("feature_list"), "feature_list deriva SOMENTE de shotList=true; fixture não tem plano de gravação");
  const serialized = JSON.stringify(result.partial.failedItems);
  for (const sentinel of ["Destaque o tecido", "Tecido respirável", "Suporta 999 kg", "para explicar o conforto", "999 kg"]) {
    assert.ok(!serialized.includes(sentinel), `sem texto de draft/fato no metadata: ${sentinel}`);
  }
});

// ─── Etapa 3 (ADR-033 D2/D3/D4): contratos worker-owned de handoff e memória ──

// Literais exatos do contrato EngineResult.v2Policy (uniões literais — sem
// alargamento para string, sem casts).
const v2PolicyBase = {
  plannerPolicyVersion: "PLANNER_POLICY_V2",
  briefPolicyVersion: "BRIEF_GENERATION_POLICY_V1",
  creativeSystemVersion: "1.3",
  compatibilityPolicyVersion: "CREATIVE_COMPATIBILITY_V2",
  creativeSystemHash: sha256Hex(canonicalSerialization(loadCreativeSystem("tiktok-commerce@1.3"))),
} as const;
const seed64 = "a".repeat(64);
const inputHash64 = "c".repeat(64);
const outputHash64 = "b".repeat(64);
const v2PolicyWithProvenance = {
  ...v2PolicyBase,
  plannerSeed: seed64,
  plannerInputHash: inputHash64,
  plannerOutputHash: outputHash64,
  plannerBinding: { platformSkillVersion: "tiktok-commerce@1.3", creativeSystemVersion: "1.3" },
};

const blueprintEnvelope = {
  blueprintContractVersion: "1" as const,
  creativeSystemVersion: "1.3" as const,
  platformSkillVersion: "tiktok-commerce@1.3" as const,
  blueprint: {
    recipeId: "pov-identification-payoff",
    attentionMechanisms: ["curiosity"],
    psychologicalEffects: ["identification"],
    format: "pov",
    productRole: "solution",
    narrativeMoves: ["setup", "payoff"],
  },
};

const handoffOf = (sourceOpportunityId: string, position: number, overrides: Partial<PlannedOpportunityHandoffV2> = {}): PlannedOpportunityHandoffV2 => ({
  opportunityContractVersion: "2",
  position,
  sourceOpportunityId,
  candidateKey: `k-${position}`,
  hookMechanism: "demonstration",
  blueprint: blueprintEnvelope,
  creativeDirection: blueprintEnvelope.blueprint,
  evidenceRefs: [],
  commercialObjective: "resolver o dia a dia",
  angle: "praticidade",
  coreMessage: "resolve o dia a dia",
  ...overrides,
});

const engineResultOf = (overrides: Partial<EngineResult> = {}): EngineResult => ({
  productUnderstanding: {},
  strategy: { id: "s1", platformId: "tiktok", platformSkillVersion: "test" },
  plan: { id: "p1", platformId: "tiktok", platformSkillVersion: "test" },
  planPolicyVersion: 1,
  opportunities: [],
  briefs: [],
  reports: [],
  patternReplacements: [],
  understandingReductions: [],
  sceneSets: [],
  judgeExecutionRecords: [],
  judgeSelectionDecisions: [],
  preJudgeRiskAssessments: [],
  evidenceRefs: ["product:name"],
  memorySignals: {},
  stage: "FINALIZING",
  capabilities: [],
  repairs: 0,
  repairCauses: [],
  qualityAudits: [],
  qualityRepairs: [],
  validated: 0,
  briefOpportunityPositions: [],
  partial: null,
  ...overrides,
});

const opportunityOf = (sourceOpportunityId: string): Record<string, unknown> => ({ id: `op-${sourceOpportunityId}`, sourceOpportunityId });

test("plannerProvenanceOf: V2 expõe policy, seed, hashes e binding do Planner; nunca Blueprint; sem v2Policy → undefined", () => {
  const provenance = plannerProvenanceOf(engineResultOf({ v2Policy: { ...v2PolicyWithProvenance } }));
  assert.equal(provenance?.plannerPolicyVersion, "PLANNER_POLICY_V2");
  assert.equal(provenance?.plannerSeed, seed64);
  assert.equal(provenance?.plannerInputHash, inputHash64);
  assert.equal(provenance?.plannerOutputHash, outputHash64);
  assert.deepEqual(provenance?.plannerBinding, { platformSkillVersion: "tiktok-commerce@1.3", creativeSystemVersion: "1.3" }, "binding com versões persistido");
  const binding = provenance?.plannerBinding;
  assert.ok(binding !== null && typeof binding === "object" && !Array.isArray(binding));
  assert.ok("platformSkillVersion" in binding && binding.platformSkillVersion !== "frozen-harness-fixture", "proveniência operacional, nunca fixture de harness");
  assert.equal("plannedV2" in (provenance ?? {}), false, "proveniência nunca carrega plannedV2/Blueprint");
  assert.equal(plannerProvenanceOf(engineResultOf()), undefined, "fora de V2 não há proveniência de Planner");
});

test("assertHandoffAlignmentV2: arrays em ordens diferentes alinham por sourceOpportunityId + posição", () => {
  const output = engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    opportunities: [opportunityOf("commercial-2"), opportunityOf("commercial-1")],
    plannedV2: [handoffOf("commercial-1", 2), handoffOf("commercial-2", 1)],
  });
  const aligned = assertHandoffAlignmentV2(output);
  assert.equal(aligned.size, 2);
  assert.equal(aligned.get("commercial-2")?.position, 1, "posição vem do handoff identificado por ID, não do índice do array");
  assert.equal(aligned.get("commercial-1")?.position, 2);
});

test("assertHandoffAlignmentV2: ausente, duplicado, posição divergente, comprimento divergente e blueprint ausente falham fechado", () => {
  assert.throws(() => assertHandoffAlignmentV2(engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    opportunities: [opportunityOf("commercial-1"), opportunityOf("commercial-2")],
    plannedV2: [handoffOf("commercial-1", 1), handoffOf("commercial-9", 2)],
  })), /handoff ausente/);
  assert.throws(() => assertHandoffAlignmentV2(engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    opportunities: [opportunityOf("commercial-1"), opportunityOf("commercial-2")],
    plannedV2: [handoffOf("commercial-1", 1), handoffOf("commercial-1", 2)],
  })), /duplicado/);
  assert.throws(() => assertHandoffAlignmentV2(engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    opportunities: [opportunityOf("commercial-1"), opportunityOf("commercial-2")],
    plannedV2: [handoffOf("commercial-1", 1), handoffOf("commercial-2", 3)],
  })), /posição divergente/);
  assert.throws(() => assertHandoffAlignmentV2(engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    opportunities: [opportunityOf("commercial-1")],
    plannedV2: [],
  })), /diverge de opportunities/);
  assert.throws(() => assertHandoffAlignmentV2(engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    opportunities: [opportunityOf("commercial-1")],
    plannedV2: [handoffOf("commercial-1", 1, { creativeDirection: undefined })],
  })), /blueprint/);
});

const plannerSignalOf = (attention: string) => ({
  signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
  attentionMechanisms: [attention],
  psychologicalEffects: ["identification"],
  narrativeShape: ["setup", "payoff"],
  format: "pov",
  productRole: "solution",
  commercialEffects: ["resolve o dia a dia"],
});

test("plannerMemorySignalsFor: V2 usa snapshot canônico cumulativo com merge deduplicado idempotente", () => {
  const previous = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals: [plannerSignalOf("curiosity")] };
  const envelope = plannerMemorySignalsFor(previous, engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    memorySignals: { plannerSignals: [plannerSignalOf("contrast")] },
  }));
  assert.equal(envelope.signalsSchemaVersion, "PLANNER_MEMORY_SIGNALS_V1");
  assert.ok(Array.isArray(envelope.signals) && envelope.signals.length === 2, "acumula: 1 anterior + 1 entregue");
  const repeated = plannerMemorySignalsFor(previous, engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    memorySignals: { plannerSignals: [plannerSignalOf("curiosity")] },
  }));
  assert.ok(Array.isArray(repeated.signals) && repeated.signals.length === 1, "sinal re-entregue não duplica (dedup idempotente)");
  const fromLegacy = plannerMemorySignalsFor({ deliveredHookMechanisms: ["demo"] }, engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    memorySignals: { plannerSignals: [plannerSignalOf("contrast")] },
  }));
  assert.ok(Array.isArray(fromLegacy.signals) && fromLegacy.signals.length === 1, "snapshot legado sem envelope é tratado como vazio, sem retrofabricar");
});

test("plannerMemorySignalsFor: V2 exige sinais canônicos; fora de V2 o fallback legado permanece", () => {
  assert.throws(() => plannerMemorySignalsFor({}, engineResultOf({
    v2Policy: v2PolicyWithProvenance,
    memorySignals: { plannerSignals: "não-array" },
  })), /sinais canônicos/);
  assert.deepEqual(
    plannerMemorySignalsFor({ deliveredHookMechanisms: ["antigo"] }, engineResultOf({ memorySignals: { plannerSignals: [{ envelope: "v2" }] } })),
    { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals: [{ envelope: "v2" }] },
    "fora de V2, plannerSignals não vazio mantém o envelope legado atual",
  );
  assert.deepEqual(
    plannerMemorySignalsFor({ deliveredHookMechanisms: ["antigo"] }, engineResultOf({ memorySignals: { deliveredAngles: ["a2"] } })),
    { deliveredHookMechanisms: ["antigo"], deliveredAngles: ["a2"], generatedCount: 0, deliveredCtaFunctions: [] },
    "fora de V2, sem plannerSignals cai no merge legado existente",
  );
});
