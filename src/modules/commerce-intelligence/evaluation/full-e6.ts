import { canonicalSerialization, sha256Hex } from "../planner-harness/canonical";
import dataset from "./full-e6/draft.json";
import rubrics from "./full-e6/rubrics.json";
import { MISSING_STATES } from "./types";

const CATEGORIES = ["UTILITY", "FASHION", "CURIOSITY", "EVERYDAY", "OBJECTION", "PERCEIVED_VALUE"] as const;
const SCENARIOS = ["HAPPY_PATH", "BOUNDARY", "ADVERSARIAL", "HARD_FAILURE", "SCENE_FAILURE", "PARTIAL", "TECHNICAL_RETRY", "MISSING_DATA"] as const;
const REQUIRED_DIMENSIONS = ["NATURALNESS", "ORIGINALITY", "PRODUCT_SPECIFICITY", "PERSUASION", "ATTENTION", "PRODUCT_INTEGRATION", "BLUEPRINT_REALIZATION", "PSYCHOLOGICAL_DIVERSITY", "CREATIVE_DIVERSITY", "PERCEIVED_TEMPLATING", "PLATFORM_FIT", "RECIPE_COHERENCE", "FREE_COMPOSITION_COHERENCE"] as const;
const CANDIDATE_ONLY = ["BLUEPRINT_REALIZATION", "RECIPE_COHERENCE", "FREE_COMPOSITION_COHERENCE"];

// Registro ÚNICO de capacidade (flip point): enquanto o Slice 008 (nova geração
// com memória e variedade) não existir, cases RECURRENT são DEFERRED — nunca
// excluídos da população, nunca NOT_APPLICABLE, nunca contados como zero.
// Ao implementar o slice, mudar para "EXECUTABLE" reativa as checagens de
// snapshot/strategy congelados e o blocker FREEZE_POLICY_CONFLICT derruba
// freezes obsoletos que ainda marquem o caso como DEFERRED.
export const FULL_E6_CAPABILITY_STATUS = { RECURRENT: "NOT_EXECUTED" } as const;
export const DEPENDENCY_SLICE_008 = "DEPENDENCY_SLICE_008" as const;
export const RECURRENCE_BLOCKER = "RECURRENCE_DEPENDS_ON_SLICE_008" as const;
export type FullE6ExecutionPolicy = "REQUIRED" | "DEFERRED";
export type FullE6CapabilityAvailability = {
  caseId: string;
  generation: "RECURRENT";
  status: (typeof FULL_E6_CAPABILITY_STATUS)["RECURRENT"];
  reason: typeof DEPENDENCY_SLICE_008;
  requiredForAcceptance: boolean;
};
const deferredCases = (input = dataset) =>
  input.cases.filter(
    (item): item is (typeof dataset.cases)[number] & { generation: "RECURRENT" } =>
      item.generation === "RECURRENT" && FULL_E6_CAPABILITY_STATUS.RECURRENT === "NOT_EXECUTED",
  );
const isDeferredCase = (item: { generation?: string }) =>
  item.generation === "RECURRENT" && FULL_E6_CAPABILITY_STATUS.RECURRENT === "NOT_EXECUTED";

export const FULL_E6_OPERATIONAL_METRICS: Record<string, string> = {
  calls: "PHYSICAL_ATTEMPTS", cost: "FROZEN_CURRENCY", latencyMs: "MILLISECONDS", inputTokens: "TOKENS", outputTokens: "TOKENS",
  cacheTokens: "TOKENS", reasoningTokens: "TOKENS", retries: "PHYSICAL_ATTEMPTS", repairs: "PHYSICAL_ATTEMPTS",
  hardFailures: "CONTENTS", sceneFailures: "CONTENTS", delivered: "CONTENTS", deliveryCoverage: "RATIO", judgeCoverage: "RATIO",
  contentsPerCall: "CONTENTS_PER_ATTEMPT", retryRate: "RATIO", repairRate: "RATIO", partialSuccessRate: "RATIO",
};
const candidateOnly = (dimension: string) => CANDIDATE_ONLY.includes(dimension);
const labelsFor = (dimension: string) => (candidateOnly(dimension) ? rubrics.candidateOnlyLabels : rubrics.labels);
const plannedSeed = (item: (typeof dataset.cases)[number]) => hash([dataset.arms.jobSeedDerivation, item.caseId, hash(item)]);
const hash = (value: unknown) => sha256Hex(canonicalSerialization(value));
const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: readonly number[]) => (values.length ? sum(values) / values.length : null);
const ratio = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);
const percentile = (values: readonly number[], rank: number) =>
  values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * rank) - 1]! : null;

/** Draft validation is not approval or provider evidence. Historical Judge-only v1 stays untouched. */
export function verifyFullE6Draft(input = dataset, rubric = rubrics) {
  if (
    input.protocolVersion !== "full-e6.v1" ||
    input.status !== "DRAFT" ||
    input.evidenceClass !== "OFFLINE_INPUT_ONLY" ||
    rubric.status !== "DRAFT" ||
    rubric.thresholds !== null
  )
    throw new Error("E6-INVALID-DRAFT: não promover protocolo sem revisão e thresholds aprovados");
  if (input.arms.baselineCommit !== null || input.arms.candidateCommit !== null || input.approval.userAcceptanceHash !== null)
    throw new Error("E6-INVALID-DRAFT: resultados ou commits não observados no draft");
  if (input.categories.length !== CATEGORIES.length || CATEGORIES.some((category) => !input.categories.includes(category)))
    throw new Error("E6-INVALID-DRAFT: categorias incompletas");
  const ids = new Set<string>();
  for (const item of input.cases) {
    if (
      ids.has(item.caseId) ||
      !/^e6-[a-z]+-\d+$/.test(item.caseId) ||
      !CATEGORIES.includes(item.category as (typeof CATEGORIES)[number]) ||
      !SCENARIOS.includes(item.scenario as (typeof SCENARIOS)[number]) ||
      !Number.isInteger(item.targetContentCount) ||
      item.targetContentCount < 1 ||
      item.targetContentCount > 10 ||
      !item.product.name.trim() ||
      !item.product.description.trim() ||
      item.expected.length === 0
    )
      throw new Error("E6-INVALID-DRAFT: case inválido ou duplicado");
    ids.add(item.caseId);
    if (/https?:\/\/|(?:api[_-]?key|bearer\s+|password|cookie)\s*[:=]/i.test(canonicalSerialization(item.product)))
      throw new Error("E6-INVALID-DRAFT: URL ou credencial em fixture");
  }
  if (
    CATEGORIES.some((category) => !input.cases.some((item) => item.category === category)) ||
    SCENARIOS.some((scenario) => !input.cases.some((item) => item.scenario === scenario)) ||
    [1, 5, 10].some((n) => !input.cases.some((item) => item.targetContentCount === n)) ||
    !input.cases.some((item) => item.creativePopulation === "FREE_COMPOSITION") ||
    !input.cases.some((item) => item.creativePopulation === "RECIPE_BACKED") ||
    !input.cases.some((item) => item.generation === "RECURRENT")
  )
    throw new Error("E6-INVALID-DRAFT: população incompleta");
  const dimensions = rubric.dimensions.map(({ id }) => id);
  if (
    !rubric.blind ||
    rubric.minimumIndependentAnnotators < 2 ||
    dimensions.length !== REQUIRED_DIMENSIONS.length ||
    new Set(dimensions).size !== dimensions.length ||
    REQUIRED_DIMENSIONS.some((dimension) => !dimensions.includes(dimension)) ||
    rubric.dimensions.some((entry) => !entry.question.trim() || !entry.positiveAnchor.trim() || !entry.negativeAnchor.trim())
  )
    throw new Error("E6-INVALID-DRAFT: rubrica incompleta");
  const capabilityAvailability: FullE6CapabilityAvailability[] = deferredCases(input).map((item) => ({
    caseId: item.caseId,
    generation: "RECURRENT" as const,
    status: FULL_E6_CAPABILITY_STATUS.RECURRENT,
    reason: DEPENDENCY_SLICE_008,
    requiredForAcceptance: true,
  }));
  return {
    status: "DRAFT" as const,
    eligibleForLiveCollection: false as const,
    datasetHash: hash(input),
    rubricHash: hash(rubric),
    aggregationHash: hash(input.aggregationPolicy),
    caseHashes: input.cases.map((item) => ({ caseId: item.caseId, inputHash: hash(item) })),
    capabilityAvailability,
  };
}

export type FullE6RoutingTarget = {
  provider: string;
  model: string;
  parametersHash: string;
  priceId: string;
};
export type FullE6RoutingManifest = {
  schemaVersion: "full-e6-routing.v2";
  routes: Array<{
    arm: "baseline" | "candidate";
    capability: string;
    tier: "LOW" | "MID" | "HIGH";
    primary: FullE6RoutingTarget;
    fallbacks: FullE6RoutingTarget[];
  }>;
};
export type FullE6PricingRate = { numerator: string; denominator: string };
export type FullE6PricingManifest = {
  schemaVersion: "full-e6-pricing.v2";
  currency: string;
  minorUnitExponent: number;
  prices: Array<{
    priceId: string;
    provider: string;
    model: string;
    sourceRef: string;
    rates: {
      input: FullE6PricingRate | null;
      output: FullE6PricingRate | null;
      cache: FullE6PricingRate | null;
      reasoning: FullE6PricingRate | null;
    };
  }>;
};
export type FullE6Freeze = {
  schemaVersion: string;
  status: string;
  evidenceClass: string;
  protocolHash: string;
  datasetHash: string;
  rubricHash: string;
  aggregationHash: string;
  registeredAt: string;
  collectionNotBefore: string;
  freezeHash: string;
  routingManifest: FullE6RoutingManifest;
  routingManifestHash: string;
  pricingManifest: FullE6PricingManifest;
  pricingHash: string;
  arms: Record<"baseline" | "candidate", { commit: string; engineVersion: string }>;
  cases: Array<{
    caseId: string;
    inputHash: string;
    jobSeed: string;
    controlsHash: string;
    baselinePromptContextHash: string;
    candidatePromptContextHash: string;
    memorySnapshotHash: string | null;
    reusedStrategyHash: string | null;
    executionPolicy: FullE6ExecutionPolicy;
    dependency: null | "SLICE_008";
    requiredForAcceptance: boolean;
  }>;
  thresholds: Record<string, { minimum: number; maximumRegression: number }>;
  minimumCategoryCoverage: Record<string, number>;
  metricPolicy: Record<string, { unit: string; direction: "LOWER_IS_BETTER" | "HIGHER_IS_BETTER"; maximumRegression: number; missingRule: "BLOCK_ACCEPTANCE" }>;
  approvals: { frozenPlanHash: string; approvedAt: string; architectReviewHash: string; userCollectionApprovalHash: string };
};

/** Read-only readiness of externally preserved preregistration, never execution or V2 acceptance. */
export function preflightFullE6(external?: unknown, nowMs = Date.now()) {
  const verified = verifyFullE6Draft();
  const blockers: string[] = [];
  if (external === undefined) {
    blockers.push(
      "PROTOCOL_NOT_FROZEN",
      "BASELINE_AND_CANDIDATE_COMMITS_NOT_PINNED",
      "THRESHOLDS_NOT_APPROVED",
      "PROVIDER_MODEL_PARAMETERS_NOT_FROZEN",
      "PROMPT_CONTEXT_ARTIFACTS_NOT_FROZEN",
      "APPROVED_HASHES_UNAVAILABLE",
      "AGGREGATION_COVERAGE_NOT_APPROVED",
      "REVIEW_APPROVAL_UNAVAILABLE",
    );
    if (verified.capabilityAvailability.length) blockers.push(RECURRENCE_BLOCKER);
  } else {
    // Review: versão detectada ANTES de qualquer exigência de campos v2 —
    // freeze v1 (ou outro schema) falha fechado, sem migração silenciosa.
    const previewSchemaVersion = (external as { schemaVersion?: string })?.schemaVersion;
    if (previewSchemaVersion !== "full-e6-freeze.v2") {
      blockers.push("FREEZE_VERSION_UNSUPPORTED");
    } else {
      try {
        allowlistedObject(external, [
          "schemaVersion",
          "status",
          "evidenceClass",
          "protocolHash",
          "datasetHash",
          "rubricHash",
          "aggregationHash",
          "registeredAt",
          "collectionNotBefore",
          "freezeHash",
          "arms",
          "routingManifest",
          "routingManifestHash",
          "pricingManifest",
          "pricingHash",
          "cases",
          "thresholds",
          "metricPolicy",
          "minimumCategoryCoverage",
          "approvals",
        ]);
        const frozen = external as FullE6Freeze;
        allowlistedObject(frozen.arms, ["baseline", "candidate"]);
        allowlistedObject(frozen.approvals, ["frozenPlanHash", "approvedAt", "architectReviewHash", "userCollectionApprovalHash"]);
        allowlistedObject(frozen.thresholds, REQUIRED_DIMENSIONS);
        allowlistedObject(frozen.minimumCategoryCoverage, CATEGORIES);
        allowlistedObject(frozen.metricPolicy, Object.keys(FULL_E6_OPERATIONAL_METRICS));
        for (const [metric, policy] of Object.entries(frozen.metricPolicy)) {
          allowlistedObject(policy, ["unit", "direction", "maximumRegression", "missingRule"]);
          if (
            policy.unit !== FULL_E6_OPERATIONAL_METRICS[metric] ||
            !nonnegative(policy.maximumRegression) ||
            (policy.unit === "RATIO" && policy.maximumRegression > 1) ||
            !["HIGHER_IS_BETTER", "LOWER_IS_BETTER"].includes(policy.direction) ||
            policy.missingRule !== "BLOCK_ACCEPTANCE"
          )
            blockers.push("OPERATIONAL_METRIC_POLICY_NOT_APPROVED");
        }
        if (frozen.status !== "FROZEN" || frozen.evidenceClass !== "OFFLINE_INPUT_ONLY")
          blockers.push("PROTOCOL_NOT_FROZEN");
        const { freezeHash, approvals, ...plan } = frozen;
        if (!isHash(freezeHash) || hash(plan) !== freezeHash) blockers.push("FREEZE_HASH_MISMATCH");
        if (approvals.frozenPlanHash !== freezeHash) blockers.push("APPROVAL_NOT_BOUND_TO_FREEZE");
        if (
          frozen.protocolHash !== hash(dataset) ||
          frozen.datasetHash !== verified.datasetHash ||
          frozen.rubricHash !== verified.rubricHash ||
          frozen.aggregationHash !== verified.aggregationHash
        )
          blockers.push("APPROVED_ARTIFACT_HASH_MISMATCH");
        const registered = Date.parse(frozen.registeredAt),
          approved = Date.parse(approvals.approvedAt),
          start = Date.parse(frozen.collectionNotBefore);
        if (![registered, approved, start].every(Number.isFinite) || registered > approved || approved >= start)
          blockers.push("INVALID_PREREGISTRATION_ORDER");
        if (!Number.isFinite(nowMs) || start > nowMs) blockers.push("COLLECTION_NOT_YET_ALLOWED");
        if (![approvals.architectReviewHash, approvals.userCollectionApprovalHash].every(isHash))
          blockers.push("REVIEW_APPROVAL_UNAVAILABLE");
        for (const arm of Object.values(frozen.arms)) {
          allowlistedObject(arm, ["commit", "engineVersion"]);
          if (!/^[a-f0-9]{40}$/.test(arm.commit)) blockers.push("BASELINE_AND_CANDIDATE_COMMITS_NOT_PINNED");
          if (typeof arm.engineVersion !== "string" || !arm.engineVersion.trim())
            blockers.push("PROVIDER_MODEL_PARAMETERS_NOT_FROZEN");
        }
        // Manifestos de routing/pricing: bytes versionados, hash canônico no
        // root; rotas/prices não vazios; alvos únicos por tuple dentro da rota;
        // paridade por projeção canônica removendo somente o campo arm.
        allowlistedObject(frozen.routingManifest, ["schemaVersion", "routes"]);
        allowlistedObject(frozen.pricingManifest, ["schemaVersion", "currency", "minorUnitExponent", "prices"]);
        if (
          frozen.routingManifestHash !== hash(frozen.routingManifest) ||
          frozen.pricingHash !== hash(frozen.pricingManifest) ||
          frozen.routingManifest.schemaVersion !== "full-e6-routing.v2" ||
          frozen.pricingManifest.schemaVersion !== "full-e6-pricing.v2"
        )
          blockers.push("PROVIDER_MODEL_PARAMETERS_NOT_FROZEN");
        // Review: rotas/prices vazios são shape inválido (fail-closed), não
        // apenas ausência de provider model parameters.
        if (frozen.routingManifest.routes.length === 0 || frozen.pricingManifest.prices.length === 0)
          blockers.push("INVALID_FREEZE_SHAPE");
        let currencyValid = false;
        try {
          currencyValid =
            /^[A-Z]{3}$/.test(frozen.pricingManifest.currency) &&
            frozen.pricingManifest.minorUnitExponent ===
              new Intl.NumberFormat("en-US", { style: "currency", currency: frozen.pricingManifest.currency }).resolvedOptions()
                .maximumFractionDigits;
        } catch {
          currencyValid = false;
        }
        if (!currencyValid) blockers.push("INVALID_FREEZE_SHAPE");
        const priceIds = new Set<string>();
        for (const price of frozen.pricingManifest.prices) {
          allowlistedObject(price, ["priceId", "provider", "model", "sourceRef", "rates"]);
          if (
            priceIds.has(price.priceId) ||
            typeof price.priceId !== "string" ||
            !price.priceId.trim() ||
            typeof price.provider !== "string" ||
            !price.provider.trim() ||
            typeof price.model !== "string" ||
            !price.model.trim() ||
            typeof price.sourceRef !== "string" ||
            !price.sourceRef.trim() ||
            // Review: sourceRef é metadado local OPACO — nenhum esquema URL
            // (https://, redacted://, etc.), sem resolução/fetch; apenas
            // identificador local [A-Za-z0-9][A-Za-z0-9._-]{0,127}.
            !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(price.sourceRef)
          )
            blockers.push("INVALID_FREEZE_SHAPE");
          priceIds.add(price.priceId);
          allowlistedObject(price.rates, ["input", "output", "cache", "reasoning"]);
          for (const rate of Object.values(price.rates)) {
            if (rate === null) continue;
            allowlistedObject(rate, ["numerator", "denominator"]);
            if (!/^(0|[1-9][0-9]*)$/.test(rate.numerator) || !/^[1-9][0-9]*$/.test(rate.denominator))
              blockers.push("INVALID_FREEZE_SHAPE");
          }
        }
        const routeKeys = new Set<string>();
      for (const route of frozen.routingManifest.routes) {
          allowlistedObject(route, ["arm", "capability", "tier", "primary", "fallbacks"]);
          const key = `${route.arm}:${route.capability}:${route.tier}`;
          if (
            routeKeys.has(key) ||
            !["baseline", "candidate"].includes(route.arm) ||
            !/^[A-Z][A-Z0-9_]+$/.test(route.capability) ||
            !["LOW", "MID", "HIGH"].includes(route.tier) ||
            !Array.isArray(route.fallbacks)
          )
            blockers.push("INVALID_FREEZE_SHAPE");
          routeKeys.add(key);
          const targetTuples = new Set<string>();
          for (const target of [route.primary, ...route.fallbacks]) {
            const tuple = `${target.provider}|${target.model}|${target.parametersHash}`;
            if (targetTuples.has(tuple)) blockers.push("INVALID_FREEZE_SHAPE");
            targetTuples.add(tuple);
            allowlistedObject(target, ["provider", "model", "parametersHash", "priceId"]);
            if (
              typeof target.provider !== "string" ||
              !target.provider.trim() ||
              typeof target.model !== "string" ||
              !target.model.trim() ||
              !isHash(target.parametersHash) ||
              typeof target.priceId !== "string" ||
              !priceIds.has(target.priceId)
            )
              blockers.push("PROVIDER_MODEL_PARAMETERS_NOT_FROZEN");
            const price = frozen.pricingManifest.prices.find((entry) => entry.priceId === target.priceId);
            if (price && (price.provider !== target.provider || price.model !== target.model))
              blockers.push("PROVIDER_MODEL_PARAMETERS_NOT_FROZEN");
          }
        }
        // Review/SPEC §13.2: paridade ORDENADA — projeção canônica de cada rota
        // removendo somente o campo arm, comparada como array completo (ordem,
        // primary e fallbacks preservados); qualquer divergência rejeita.
        const projection = (route: FullE6RoutingManifest["routes"][number]) =>
          canonicalSerialization([route.capability, route.tier, route.primary, route.fallbacks]);
        const baselineProjection = frozen.routingManifest.routes
          .filter((route) => route.arm === "baseline")
          .map(projection);
        const candidateProjection = frozen.routingManifest.routes
          .filter((route) => route.arm === "candidate")
          .map(projection);
        if (
          baselineProjection.length !== candidateProjection.length ||
          baselineProjection.some((projected, index) => projected !== candidateProjection[index])
        )
          blockers.push("PAIRED_PROVIDER_OR_PRICING_MISMATCH");
        for (const [dimension, threshold] of Object.entries(frozen.thresholds)) {
          allowlistedObject(threshold, ["minimum", "maximumRegression"]);
          if (
            !Number.isFinite(threshold.minimum) ||
            threshold.minimum < (candidateOnly(dimension) ? 0 : -1) ||
            threshold.minimum > 1 ||
            !nonnegative(threshold.maximumRegression) ||
            threshold.maximumRegression > (candidateOnly(dimension) ? 1 : 2)
          )
            blockers.push("THRESHOLDS_NOT_APPROVED");
        }
        if (Object.values(frozen.minimumCategoryCoverage).some((value) => !Number.isFinite(value) || value <= 0 || value > 1))
          blockers.push("AGGREGATION_COVERAGE_NOT_APPROVED");
        if (
          !Array.isArray(frozen.cases) ||
          frozen.cases.length !== dataset.cases.length ||
          new Set(frozen.cases.map((item) => item.caseId)).size !== dataset.cases.length
        )
          blockers.push("CASE_COVERAGE_INCOMPLETE");
        if (Array.isArray(frozen.cases))
          for (const item of frozen.cases) {
            allowlistedObject(item, [
              "caseId",
              "inputHash",
              "jobSeed",
              "controlsHash",
              "baselinePromptContextHash",
              "candidatePromptContextHash",
              "memorySnapshotHash",
              "reusedStrategyHash",
              "executionPolicy",
              "dependency",
              "requiredForAcceptance",
            ]);
            const expected = dataset.cases.find((entry) => entry.caseId === item.caseId);
            if (!expected || item.inputHash !== hash(expected) || item.jobSeed !== plannedSeed(expected))
              blockers.push("CASE_INPUT_OR_SEED_MISMATCH");
            if (
              (item.executionPolicy !== "REQUIRED" && item.executionPolicy !== "DEFERRED") ||
              (item.dependency !== null && item.dependency !== "SLICE_008") ||
              typeof item.requiredForAcceptance !== "boolean" ||
              (item.executionPolicy === "DEFERRED") !== (item.dependency === "SLICE_008")
            )
              blockers.push("INVALID_FREEZE_SHAPE");
            const deferred = item.executionPolicy === "DEFERRED";
            if (deferred) {
              if (item.requiredForAcceptance !== true) blockers.push("INVALID_FREEZE_SHAPE");
              if (item.memorySnapshotHash !== null || item.reusedStrategyHash !== null) blockers.push("INVALID_FREEZE_SHAPE");
              if (!expected || !isDeferredCase(expected)) blockers.push("FREEZE_POLICY_CONFLICT");
              else blockers.push(RECURRENCE_BLOCKER);
            } else {
              if (expected && isDeferredCase(expected)) blockers.push("FREEZE_POLICY_CONFLICT");
              if (
                (expected?.generation === "RECURRENT" &&
                  (!isHash(item.memorySnapshotHash) || !isHash(item.reusedStrategyHash))) ||
                (item.memorySnapshotHash !== null && !isHash(item.memorySnapshotHash)) ||
                (item.reusedStrategyHash !== null && !isHash(item.reusedStrategyHash))
              )
                blockers.push("RECURRENT_INPUT_SNAPSHOT_NOT_FROZEN");
            }
            if (![item.controlsHash, item.baselinePromptContextHash, item.candidatePromptContextHash].every(isHash))
              blockers.push("PROMPT_CONTEXT_ARTIFACTS_NOT_FROZEN");
          }
      } catch {
        blockers.push("INVALID_FREEZE_SHAPE");
      }
    }
  }
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ...verified,
    status: uniqueBlockers.length ? ("BLOCKED" as const) : ("READY_FOR_USER_COLLECTION" as const),
    eligibleForLiveCollection: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    statusDraft: verified.status,
    executionEvidence: false as const,
    acceptanceStatus: "V2_DEFAULT_PENDING_ACCEPTANCE" as const,
  };
}

export type FullE6Call = {
  capability: string;
  tier: "LOW" | "MID" | "HIGH";
  attempt: number;
  retry: boolean;
  repair: boolean;
  provider: string;
  model: string;
  parametersHash: string;
  tokens: { input: number | null; output: number | null; cache: number | null; reasoning: number | null } | null;
  cost: { amountMinor: string; currency: string; pricingHash: string; source: "REPORTED"; complete: boolean; evidenceRef: string } | null;
  latencyMs: number | null;
};
export type FullE6Direction = { attentionMechanisms: string[]; psychologicalEffects: string[]; format: string; narrativeMoves: string[]; productRole: string };
export type FullE6Content = {
  position: number;
  angle: string;
  hook: string;
  development: string[];
  script: string;
  cta: string;
  scenes: string[];
  creativeMode: "RECIPE_BACKED" | "FREE_COMPOSITION" | "UNAVAILABLE";
  blueprint: FullE6Direction | null;
};
export type FullE6ExecutedObservation = {
  executionStatus: "EXECUTED";
  caseId: string;
  arm: "baseline" | "candidate";
  evidenceClass: "OFFLINE" | "LIVE_PROVIDER";
  inputHash: string;
  jobSeed: string;
  controlsHash: string;
  provenanceHash: string;
  status: "SUCCEEDED" | "SUCCEEDED_PARTIAL" | "FAILED";
  requested: number;
  delivered: number;
  hardFailures: number;
  sceneFailures: number;
  judge: { executed: number; notExecuted: number; failed: number; notApplicable: number };
  calls: FullE6Call[];
  totalLatencyMs: number | null;
  contents?: FullE6Content[];
};
export type FullE6NotExecutedObservation = {
  executionStatus: "NOT_EXECUTED";
  caseId: string;
  arm: "baseline" | "candidate";
  reason: typeof DEPENDENCY_SLICE_008;
  requiredForAcceptance: true;
};
export type FullE6Observation = FullE6ExecutedObservation | FullE6NotExecutedObservation;

function nonnegative(value: unknown, integer = false): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value));
}
function allowlistedObject(value: unknown, keys: readonly string[], required = keys): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  )
    throw new Error("E6-INVALID: non-allowlisted artifact shape");
}
function verifyObservation(item: FullE6Observation) {
  if (item.executionStatus === "NOT_EXECUTED") {
    allowlistedObject(item, ["executionStatus", "caseId", "arm", "reason", "requiredForAcceptance"]);
    const expected = dataset.cases.find((entry) => entry.caseId === item.caseId);
    if (
      !expected ||
      !isDeferredCase(expected) ||
      item.reason !== DEPENDENCY_SLICE_008 ||
      item.requiredForAcceptance !== true ||
      !["baseline", "candidate"].includes(item.arm)
    )
      throw new Error("E6-INVALID: non-executed observation is stale or not allowlisted");
    return;
  }
  allowlistedObject(
    item,
    [
      "executionStatus",
      "caseId",
      "arm",
      "evidenceClass",
      "inputHash",
      "jobSeed",
      "controlsHash",
      "provenanceHash",
      "status",
      "requested",
      "delivered",
      "hardFailures",
      "sceneFailures",
      "judge",
      "calls",
      "totalLatencyMs",
      "contents",
    ],
    [
      "executionStatus",
      "caseId",
      "arm",
      "evidenceClass",
      "inputHash",
      "jobSeed",
      "controlsHash",
      "provenanceHash",
      "status",
      "requested",
      "delivered",
      "hardFailures",
      "sceneFailures",
      "judge",
      "calls",
      "totalLatencyMs",
    ],
  );
  allowlistedObject(item.judge, ["executed", "notExecuted", "failed", "notApplicable"]);
  if (!Array.isArray(item.calls)) throw new Error("E6-INVALID: calls array");
  const expected = dataset.cases.find((entry) => entry.caseId === item.caseId);
  if (!expected || item.inputHash !== hash(expected)) throw new Error("E6-INVALID: case/inputHash mismatch");
  if (isDeferredCase(expected)) throw new Error("E6-INVALID: capability-deferred case cannot have executed observations");
  if (item.executionStatus !== "EXECUTED" || item.jobSeed !== plannedSeed(expected))
    throw new Error("E6-INVALID: jobSeed differs from frozen collection plan seed");
  if (
    !["baseline", "candidate"].includes(item.arm) ||
    !["OFFLINE", "LIVE_PROVIDER"].includes(item.evidenceClass) ||
    !["SUCCEEDED", "SUCCEEDED_PARTIAL", "FAILED"].includes(item.status) ||
    !item.jobSeed?.trim() ||
    !isHash(item.controlsHash) ||
    !isHash(item.provenanceHash) ||
    item.requested !== expected.targetContentCount ||
    ![item.delivered, item.hardFailures, item.sceneFailures, ...Object.values(item.judge)].every((n) => nonnegative(n, true)) ||
    item.delivered > item.requested ||
    // Saída com conteúdo entregue exige tentativas físicas registradas.
    (item.delivered > 0 && item.calls.length === 0) ||
    sum(Object.values(item.judge)) !== item.delivered ||
    (item.status === "SUCCEEDED" && item.delivered !== item.requested) ||
    (item.status === "FAILED" && item.delivered !== 0) ||
    (item.status === "SUCCEEDED_PARTIAL" && (item.delivered === 0 || item.delivered === item.requested))
  )
    throw new Error("E6-INVALID: observation cardinality/status/provenance");
  if (item.totalLatencyMs !== null && !nonnegative(item.totalLatencyMs)) throw new Error("E6-INVALID: latency");
  for (const call of item.calls) {
    allowlistedObject(call, [
      "capability",
      "tier",
      "attempt",
      "retry",
      "repair",
      "provider",
      "model",
      "parametersHash",
      "tokens",
      "cost",
      "latencyMs",
    ]);
    if (call.tokens !== null) allowlistedObject(call.tokens, ["input", "output", "cache", "reasoning"]);
    if (call.cost !== null) allowlistedObject(call.cost, ["amountMinor", "currency", "pricingHash", "source", "complete", "evidenceRef"]);
    if (
      !/^[A-Z][A-Z0-9_]+$/.test(call.capability) ||
      !["LOW", "MID", "HIGH"].includes(call.tier) ||
      !nonnegative(call.attempt, true) ||
      call.attempt < 1 ||
      typeof call.retry !== "boolean" ||
      typeof call.repair !== "boolean" ||
      typeof call.provider !== "string" ||
      !call.provider.trim() ||
      typeof call.model !== "string" ||
      !call.model.trim() ||
      !isHash(call.parametersHash) ||
      (call.latencyMs !== null && !nonnegative(call.latencyMs)) ||
      (call.tokens !== null && [call.tokens.input, call.tokens.output, call.tokens.cache, call.tokens.reasoning].some((n) => n !== null && !nonnegative(n, true))) ||
      (call.cost !== null &&
        (!/^\d+$/.test(call.cost.amountMinor) ||
          !/^[A-Z]{3}$/.test(call.cost.currency) ||
          !isHash(call.cost.pricingHash) ||
          call.cost.source !== "REPORTED" ||
          typeof call.cost.complete !== "boolean" ||
          typeof call.cost.evidenceRef !== "string" ||
          !call.cost.evidenceRef.trim()))
    )
      throw new Error("E6-INVALID: call metrics");
  }
  if (item.contents) {
    const positions = new Set<number>();
    if (item.contents.length !== item.delivered) throw new Error("E6-INVALID: content coverage");
    for (const content of item.contents) {
      allowlistedObject(content, ["position", "angle", "hook", "development", "script", "cta", "scenes", "creativeMode", "blueprint"]);
      if (
        !Number.isInteger(content.position) ||
        content.position < 1 ||
        content.position > item.requested ||
        positions.has(content.position) ||
        ![content.angle, content.hook, content.script, content.cta].every((text) => typeof text === "string" && text.trim()) ||
        !Array.isArray(content.development) ||
        !Array.isArray(content.scenes) ||
        [...content.development, ...content.scenes].some((text) => typeof text !== "string" || !text.trim()) ||
        (content.blueprint !== null && typeof content.blueprint !== "object") ||
        !["RECIPE_BACKED", "FREE_COMPOSITION", "UNAVAILABLE"].includes(content.creativeMode)
      )
        throw new Error("E6-INVALID: content position/shape");
      if (content.blueprint !== null) {
        allowlistedObject(content.blueprint, ["attentionMechanisms", "psychologicalEffects", "format", "narrativeMoves", "productRole"]);
        const direction = content.blueprint;
        if (
          ![direction.format, direction.productRole].every((text) => typeof text === "string" && text.trim()) ||
          [direction.attentionMechanisms, direction.psychologicalEffects, direction.narrativeMoves].some(
            (values) => !Array.isArray(values) || values.length === 0 || values.some((text) => typeof text !== "string" || !text.trim()),
          )
        )
          throw new Error("E6-INVALID: semantic direction");
      }
      positions.add(content.position);
    }
  }
}

const isExecuted = (item: FullE6Observation): item is FullE6ExecutedObservation => item.executionStatus === "EXECUTED";
const findExecuted = (
  observations: readonly FullE6Observation[],
  caseId: string,
  arm: "baseline" | "candidate",
): FullE6ExecutedObservation | undefined => {
  const found = observations.find((entry) => entry.caseId === caseId && entry.arm === arm);
  return found && isExecuted(found) ? found : undefined;
};

// Review: formatação EXATA de major units a partir de minor units (BigInt),
// com expoente ISO (USD=2, JPY=0, KWD=3) — sem /100 fixo, sem Number para
// valores grandes; half-up acontece em minor units.
const formatMajorWithExponent = (minor: bigint, exponent: number): string => {
  const scale = 10n ** BigInt(exponent);
  const whole = minor / scale;
  const fraction = minor % scale;
  return exponent === 0 ? whole.toString() : `${whole}.${fraction.toString().padStart(exponent, "0")}`;
};
const halfUpPerContentMinor = (amountMinor: bigint, delivered: number) =>
  (amountMinor * 2n + BigInt(delivered)) / (2n * BigInt(delivered));

/** Physical attempts, not logical capability count. Offline values never satisfy live evidence. */
export function summarizeFullE6Arm(item: FullE6Observation, minorUnitExponent?: number) {
  if (!isExecuted(item)) throw new Error("E6-INVALID: summarize requires an executed observation");
  verifyObservation(item);
  const live = item.evidenceClass === "LIVE_PROVIDER";
  const currencies = new Set(item.calls.flatMap((call) => (call.cost ? [call.cost.currency] : [])));
  const pricingHashes = new Set(item.calls.flatMap((call) => (call.cost ? [call.cost.pricingHash] : [])));
  const costComplete =
    live && item.calls.length > 0 && item.calls.every((call) => call.cost !== null && call.cost.complete) && currencies.size === 1 && pricingHashes.size === 1;
  const amountMinor = costComplete ? item.calls.reduce((total, call) => total + BigInt(call.cost!.amountMinor), 0n).toString() : null;
  const latencyComplete = live && item.totalLatencyMs !== null;
  const tokenField = (field: "input" | "output" | "cache" | "reasoning") =>
    live && item.calls.length > 0 && item.calls.every((call) => call.tokens?.[field] != null)
      ? sum(item.calls.map((call) => call.tokens![field]!))
      : null;
  const byCapability = Object.fromEntries(
    [...new Set(item.calls.map((call) => call.capability))].sort().map((capability) => {
      const calls = item.calls.filter((call) => call.capability === capability);
      const observed = live ? calls.flatMap((call) => (call.latencyMs === null ? [] : [call.latencyMs])) : [];
      return [
        capability,
        {
          calls: calls.length,
          tiers: [...new Set(calls.map((call) => call.tier))].sort(),
          retries: calls.filter((call) => call.retry).length,
          repairs: calls.filter((call) => call.repair).length,
          latency: { observed: observed.length, expected: calls.length, p50: percentile(observed, 0.5), p95: percentile(observed, 0.95) },
        },
      ];
    }),
  );
  return {
    evidenceClass: item.evidenceClass,
    calls: item.calls.length,
    byCapability,
    requested: item.requested,
    delivered: item.delivered,
    deliveryCoverage: ratio(item.delivered, item.requested),
    judgeCoverage: ratio(item.judge.executed, item.delivered),
    judge: item.judge,
    hardFailures: item.hardFailures,
    sceneFailures: item.sceneFailures,
    partialSuccess: item.status === "SUCCEEDED_PARTIAL",
    retries: item.calls.filter((call) => call.retry).length,
    retryRate: ratio(item.calls.filter((call) => call.retry).length, item.calls.length),
    repairs: item.calls.filter((call) => call.repair).length,
    repairRate: ratio(item.calls.filter((call) => call.repair).length, item.calls.length),
    contentsPerCall: ratio(item.delivered, item.calls.length),
    tokens: { input: tokenField("input"), output: tokenField("output"), cache: tokenField("cache"), reasoning: tokenField("reasoning") },
    cost: {
      state: costComplete ? ("OBSERVED" as const) : ("UNAVAILABLE" as const),
      amountMinor,
      currency: costComplete ? [...currencies][0]! : null,
      pricingHash: costComplete ? [...pricingHashes][0]! : null,
      roundingPolicy: "ISO_MINOR_UNIT_SCALE_BIGINT_HALF_UP" as const,
      perDeliveredContent:
        amountMinor === null ||
        item.delivered === 0 ||
        // Sem escala configurada (freeze utilizável) não há formatação —
        // nunca inferir expoente do currency code (JPY não é 16.67).
        minorUnitExponent === undefined
          ? null
          : formatMajorWithExponent(
              halfUpPerContentMinor(BigInt(amountMinor), item.delivered),
              minorUnitExponent,
            ),
      contentsPerCurrencyUnit: null,
    },
    latency: {
      state: latencyComplete ? ("OBSERVED" as const) : ("UNAVAILABLE" as const),
      totalMs: latencyComplete ? item.totalLatencyMs : null,
      contentsPerSecond: latencyComplete ? ratio(item.delivered * 1000, item.totalLatencyMs!) : null,
    },
  };
}

export type FullE6Assignment = {
  assignmentId: string;
  caseId: string;
  dimension: string;
  unitId: string;
  leftArm: "baseline" | "candidate" | null;
  rightArm: "baseline" | "candidate" | null;
  evaluation: "PAIRED" | "CANDIDATE_ONLY";
  opaqueAnnotatorId: string;
  assignmentHash: string;
  applicable: boolean;
  evidenceAvailable: boolean;
  missingReason: string | null;
};
export type FullE6Annotation = { assignmentHash: string; annotatorId: string; label: string; evidence: string; annotationHash: string };
export type FullE6Adjudication = {
  unitId: string;
  dimension: string;
  caseId: string;
  annotationHashes: string[];
  adjudicatorId: string;
  label: string;
  reason: string;
  adjudicationHash: string;
};
export type FullE6NonExecutedCase = {
  caseId: string;
  generation: "RECURRENT";
  reason: typeof DEPENDENCY_SLICE_008;
  requiredForAcceptance: true;
  expectedUnits: number;
  expectedAssignments: number;
};

// Review: denominadores subjetivos contam unidades ÚNICAS (uma linha por
// unitId em resolveSubjective) — sem multiplicar por anotador.
// expectedAssignments é o total de tarefas por anotador, para carga do
// coordinator; unidades deferidas não geram tarefas.
const uniqueUnitsFor = (item: (typeof dataset.cases)[number]) =>
  rubrics.dimensions.reduce((total, dimension) => total + (dimension.unit === "JOB" ? 1 : item.targetContentCount), 0);

/** Coordinator mapping stays separate from explicitly projected blind view. */
export function prepareFullE6Assignments(observations: readonly FullE6Observation[]) {
  observations.forEach(verifyObservation);
  if (new Set(observations.map((item) => `${item.caseId}:${item.arm}`)).size !== observations.length)
    throw new Error("E6-INVALID: duplicate arm");
  for (const caseId of new Set(observations.map((item) => item.caseId))) {
    const statuses = new Set(observations.filter((item) => item.caseId === caseId).map((item) => item.executionStatus));
    if (statuses.size > 1) throw new Error("E6-INVALID: mixed execution status inside a pair");
  }
  const assignments: FullE6Assignment[] = [];
  const views: Array<{
    assignmentHash: string;
    caseId: string;
    dimension: string;
    unitId: string;
    annotatorId: string;
    question: string;
    positiveAnchor: string;
    negativeAnchor: string;
    labels: string[];
    left: unknown;
    right: unknown;
    target: unknown;
    direction: FullE6Direction | null;
  }> = [];
  const nonExecutedCases: FullE6NonExecutedCase[] = deferredCases().map((item) => ({
    caseId: item.caseId,
    generation: "RECURRENT" as const,
    reason: DEPENDENCY_SLICE_008,
    requiredForAcceptance: true as const,
    expectedUnits: uniqueUnitsFor(item),
    expectedAssignments: uniqueUnitsFor(item) * dataset.collection.annotatorIds.length,
  }));
  const deferredIds = new Set(nonExecutedCases.map((entry) => entry.caseId));
  const rubricHash = hash(rubrics);
  for (const item of dataset.cases) {
    if (deferredIds.has(item.caseId)) continue;
    const baseline = findExecuted(observations, item.caseId, "baseline");
    const candidate = findExecuted(observations, item.caseId, "candidate");
    const leftArm = parseInt(hash([item.caseId, rubrics.rubricVersion, baseline?.provenanceHash, candidate?.provenanceHash]).slice(0, 2), 16) % 2
      ? "baseline"
      : "candidate";
    const rightArm = leftArm === "baseline" ? "candidate" : "baseline";
    const project = (content: FullE6Content | undefined) =>
      content
        ? { angle: content.angle, hook: content.hook, development: content.development, script: content.script, cta: content.cta, scenes: content.scenes }
        : null;
    for (const dimension of rubrics.dimensions) {
      const positions = dimension.unit === "JOB" ? [0] : Array.from({ length: item.targetContentCount }, (_, index) => index + 1);
      for (const position of positions) {
        const b = baseline?.contents?.find((content) => content.position === position);
        const c = candidate?.contents?.find((content) => content.position === position);
        const unary = candidateOnly(dimension.id);
        const live = unary
          ? candidate?.evidenceClass === "LIVE_PROVIDER"
          : baseline?.evidenceClass === "LIVE_PROVIDER" &&
            candidate?.evidenceClass === "LIVE_PROVIDER" &&
            baseline.controlsHash === candidate.controlsHash;
        const present =
          dimension.unit === "JOB"
            ? Boolean(baseline?.contents?.length && candidate?.contents?.length)
            : unary
              ? Boolean(c && c.blueprint && (dimension.id === "BLUEPRINT_REALIZATION" || c.creativeMode !== "UNAVAILABLE"))
              : Boolean(b && c);
        const evidenceAvailable = live && present;
        const applicable =
          unary && c?.creativeMode !== "UNAVAILABLE" && c
            ? dimension.id === "RECIPE_COHERENCE"
              ? c.creativeMode === "RECIPE_BACKED"
              : dimension.id === "FREE_COMPOSITION_COHERENCE"
                ? c.creativeMode === "FREE_COMPOSITION"
                : true
            : !evidenceAvailable
              ? true
              : dimension.unit === "JOB"
                ? Math.min(baseline!.delivered, candidate!.delivered) >= 2
                : true;
        const missingReason = evidenceAvailable
          ? null
          : (unary ? candidate?.evidenceClass === "OFFLINE" : baseline?.evidenceClass === "OFFLINE" || candidate?.evidenceClass === "OFFLINE")
            ? "OFFLINE_NOT_LIVE_EVIDENCE"
            : !present
              ? "CONTENT_OR_DIRECTION_MISSING"
              : "LIVE_PAIR_CONTROLS_MISMATCH";
        const unitId = `${item.caseId}:${dimension.unit}:${position}`;
        const left = unary ? null : position === 0 ? (leftArm === "baseline" ? baseline : candidate)?.contents?.map(project) ?? null : project(leftArm === "baseline" ? b : c);
        const right = unary ? null : position === 0 ? (rightArm === "baseline" ? baseline : candidate)?.contents?.map(project) ?? null : project(rightArm === "baseline" ? b : c);
        const target = unary ? project(c) : null;
        const direction =
          unary && c?.blueprint
            ? {
                attentionMechanisms: [...c.blueprint.attentionMechanisms],
                psychologicalEffects: [...c.blueprint.psychologicalEffects],
                format: c.blueprint.format,
                narrativeMoves: [...c.blueprint.narrativeMoves],
                productRole: c.blueprint.productRole,
              }
            : null;
        for (const annotator of dataset.collection.annotatorIds) {
          const base: Omit<FullE6Assignment, "assignmentHash"> = {
            assignmentId: hash([unitId, dimension.id, annotator]).slice(0, 24),
            caseId: item.caseId,
            dimension: dimension.id,
            unitId,
            leftArm: unary ? null : leftArm,
            rightArm: unary ? null : rightArm,
            evaluation: unary ? "CANDIDATE_ONLY" : "PAIRED",
            opaqueAnnotatorId: annotator,
            applicable,
            evidenceAvailable,
            missingReason,
          };
          const assignment = { ...base, assignmentHash: hash({ ...base, rubricHash, left, right, target, direction }) };
          assignments.push(assignment);
          // Review: view cega só existe com evidência disponível — sem
          // left/right/target=null distribuídos ao annotator. Coordinator
          // assignments continuam registrados para reconciliação.
          if (evidenceAvailable)
            views.push({
              assignmentHash: assignment.assignmentHash,
              caseId: item.caseId,
              dimension: dimension.id,
              unitId,
              annotatorId: annotator,
              question: dimension.question,
              positiveAnchor: dimension.positiveAnchor,
              negativeAnchor: dimension.negativeAnchor,
              labels: labelsFor(dimension.id),
              left,
              right,
              target,
              direction,
            });
        }
      }
    }
  }
  return { assignments, views, nonExecutedCases };
}

function resolveSubjective(
  assignments: readonly FullE6Assignment[],
  annotations: readonly FullE6Annotation[],
  adjudications: readonly FullE6Adjudication[],
) {
  const annotationIds = new Set<string>();
  for (const annotation of annotations) {
    const assignment = assignments.find((entry) => entry.assignmentHash === annotation.assignmentHash);
    const { annotationHash, ...base } = annotation;
    if (
      !assignment ||
      annotation.annotatorId !== assignment.opaqueAnnotatorId ||
      hash(base) !== annotationHash ||
      !labelsFor(assignment.dimension).includes(annotation.label) ||
      !annotation.evidence.trim() ||
      annotationIds.has(annotation.assignmentHash) ||
      (annotation.label !== "NOT_ANNOTATED" && !assignment.evidenceAvailable) ||
      (annotation.label === "NOT_APPLICABLE" ? assignment.applicable : annotation.label !== "NOT_ANNOTATED" && !assignment.applicable)
    )
      throw new Error("E6-INVALID: annotation hash/assignment/independence/evidence");
    annotationIds.add(annotation.assignmentHash);
  }
  const usedAdjudications = new Set<string>();
  const units = assignments.filter((entry) => entry.opaqueAnnotatorId === dataset.collection.annotatorIds[0]);
  const results = units.map((unit) => {
    const group = assignments.filter((entry) => entry.unitId === unit.unitId && entry.dimension === unit.dimension);
    const notes = group.flatMap((entry) => annotations.filter((annotation) => annotation.assignmentHash === entry.assignmentHash));
    let label: string | null = null;
    let state = !unit.applicable && unit.evidenceAvailable ? "NOT_APPLICABLE" : "NOT_ANNOTATED";
    if (notes.length === group.length && notes.every((entry) => entry.label !== "NOT_ANNOTATED")) {
      if (notes.every((entry) => entry.label === notes[0]!.label)) {
        label = notes[0]!.label;
        state = "AGREEMENT";
      } else {
        state = "CONFLICT";
        const record = adjudications.find(
          (entry) => entry.unitId === unit.unitId && entry.dimension === unit.dimension && entry.caseId === unit.caseId,
        );
        if (record) {
          const { adjudicationHash, ...base } = record;
          if (
            hash(base) !== adjudicationHash ||
            !dataset.collection.adjudicatorIds.includes(record.adjudicatorId) ||
            dataset.collection.annotatorIds.includes(record.adjudicatorId) ||
            !record.reason.trim() ||
            !labelsFor(unit.dimension).includes(record.label) ||
            ["NOT_ANNOTATED", "NOT_APPLICABLE"].includes(record.label) ||
            canonicalSerialization([...record.annotationHashes].sort()) !==
              canonicalSerialization(notes.map((entry) => entry.annotationHash).sort())
          )
            throw new Error("E6-INVALID: adjudication hash/independence/conflict");
          usedAdjudications.add(adjudicationHash);
          label = record.label;
          state = "ADJUDICATED";
        }
      }
    }
    if (label === "NOT_APPLICABLE") state = "NOT_APPLICABLE";
    const score =
      unit.evaluation === "CANDIDATE_ONLY"
        ? label === "SATISFIED"
          ? 1
          : label === "NOT_SATISFIED"
            ? 0
            : null
        : label === "EQUIVALENT"
          ? 0
          : label === "LEFT_BETTER"
            ? unit.leftArm === "candidate"
              ? 1
              : -1
            : label === "RIGHT_BETTER"
              ? unit.rightArm === "candidate"
                ? 1
                : -1
              : null;
    return {
      caseId: unit.caseId,
      unitId: unit.unitId,
      dimension: unit.dimension,
      unit: unit.unitId.includes(":JOB:") ? "PORTFOLIO" : "CONTENT",
      state,
      score,
      evaluation: unit.evaluation,
      missingReason: unit.missingReason,
      expectedAnnotators: group.length,
      observedAnnotators: notes.length,
      annotationHashes: notes.map((entry) => entry.annotationHash),
    };
  });
  if (usedAdjudications.size !== adjudications.length) throw new Error("E6-INVALID: duplicate or unmatched adjudication");
  return results;
}

function pairedSummary(values: readonly number[]) {
  const average = mean(values);
  const standardError =
    values.length > 1 ? Math.sqrt(sum(values.map((value) => (value - average!) ** 2)) / (values.length - 1) / values.length) : null;
  return { n: values.length, mean: average, standardError };
}

export function buildFullE6Report(
  observations: readonly FullE6Observation[] = [],
  annotations: readonly FullE6Annotation[] = [],
  adjudications: readonly FullE6Adjudication[] = [],
  externalFreeze?: unknown,
) {
  const verified = verifyFullE6Draft();
  const readiness = preflightFullE6(externalFreeze);
  // O blocker de recorrência impede coleta/aceite, mas não invalida a checagem
  // de binding de pares já importados contra um freeze íntegro.
  const freezeUsable = externalFreeze !== undefined && readiness.blockers.every((blocker) => blocker === RECURRENCE_BLOCKER);
  const frozen = freezeUsable ? (externalFreeze as FullE6Freeze) : null;
  // Expoente vem SOMENTE de freeze utilizável; sem freeze, sem formatação.
  const minorUnitExponent = frozen?.pricingManifest.minorUnitExponent;
  const bindingMatches = (observation: FullE6ExecutedObservation) => {
    if (externalFreeze === undefined) return true;
    if (!frozen) return false;
    const input = frozen.cases.find((entry) => entry.caseId === observation.caseId);
    const arm = frozen.arms[observation.arm];
    // Binding de rota: cada tentativa casa exatamente com primary ou um
    // fallback declarado para (braço, capability, tier); custo presente casa
    // com a moeda e o bundle canônico (pricingHash) do freeze.
    const callBound = (call: FullE6Call) => {
      const route = frozen.routingManifest.routes.find(
        (item) => item.arm === observation.arm && item.capability === call.capability && item.tier === call.tier,
      );
      if (!route) return false;
      const allowed = [route.primary, ...route.fallbacks];
      const routed = allowed.some(
        (target) =>
          target.provider === call.provider && target.model === call.model && target.parametersHash === call.parametersHash,
      );
      const priced =
        call.cost === null ||
        (call.cost.currency === frozen.pricingManifest.currency && call.cost.pricingHash === frozen.pricingHash);
      return routed && priced;
    };
    return Boolean(
      input &&
        observation.controlsHash === input.controlsHash &&
        observation.provenanceHash === hash({ arm, input }) &&
        observation.calls.every(callBound),
    );
  };
  const seen = new Set<string>();
  for (const observation of observations) {
    verifyObservation(observation);
    const key = `${observation.caseId}:${observation.arm}`;
    if (seen.has(key)) throw new Error("E6-INVALID: duplicate arm");
    seen.add(key);
  }
  for (const caseId of new Set(observations.map((item) => item.caseId))) {
    const statuses = new Set(observations.filter((item) => item.caseId === caseId).map((item) => item.executionStatus));
    if (statuses.size > 1) throw new Error("E6-INVALID: mixed execution status inside a pair");
  }
  const nonExecutedCases: FullE6NonExecutedCase[] = deferredCases().map((item) => ({
    caseId: item.caseId,
    generation: "RECURRENT" as const,
    reason: DEPENDENCY_SLICE_008,
    requiredForAcceptance: true as const,
    expectedUnits: uniqueUnitsFor(item),
    expectedAssignments: uniqueUnitsFor(item) * dataset.collection.annotatorIds.length,
  }));
  const deferredIds = new Set(nonExecutedCases.map((entry) => entry.caseId));
  const pairs = dataset.cases.map((item) => {
    if (deferredIds.has(item.caseId)) {
      return {
        caseId: item.caseId,
        category: item.category,
        scenario: item.scenario,
        state: "NOT_EXECUTED" as const,
        reason: DEPENDENCY_SLICE_008,
        requiredForAcceptance: true as const,
        provenanceStatus: "NOT_EXECUTED" as const,
        pairFingerprint: hash({
          protocol: dataset.protocolVersion,
          datasetHash: verified.datasetHash,
          rubricHash: verified.rubricHash,
          aggregationHash: verified.aggregationHash,
          inputHash: hash(item),
          baseline: null,
          candidate: null,
        }),
        architecture: { baseline: null, candidate: null },
        delta: null,
      };
    }
    const baseline = findExecuted(observations, item.caseId, "baseline");
    const candidate = findExecuted(observations, item.caseId, "candidate");
    const mismatch =
      baseline &&
      candidate &&
      (baseline.jobSeed !== candidate.jobSeed ||
        baseline.controlsHash !== candidate.controlsHash ||
        baseline.evidenceClass !== candidate.evidenceClass);
    const bindingMismatch = [baseline, candidate].some((entry) => entry && !bindingMatches(entry));
    const state = bindingMismatch ? "INVALID" : !baseline || !candidate ? "MISSING" : mismatch ? "INVALID" : "PAIRED";
    const b = baseline ? summarizeFullE6Arm(baseline, minorUnitExponent) : null;
    const c = candidate ? summarizeFullE6Arm(candidate, minorUnitExponent) : null;
    const delta =
      state === "PAIRED"
        ? {
            calls: c!.calls - b!.calls,
            delivered: c!.delivered - b!.delivered,
            cost:
              c!.cost.amountMinor !== null &&
              b!.cost.amountMinor !== null &&
              c!.cost.currency === b!.cost.currency &&
              c!.cost.pricingHash === b!.cost.pricingHash
                ? (BigInt(c!.cost.amountMinor) - BigInt(b!.cost.amountMinor)).toString()
                : null,
            latencyMs:
              c!.latency.totalMs !== null && b!.latency.totalMs !== null ? c!.latency.totalMs - b!.latency.totalMs : null,
            retries: c!.retries - b!.retries,
            repairs: c!.repairs - b!.repairs,
            hardFailures: c!.hardFailures - b!.hardFailures,
            inputTokens:
              c!.tokens.input !== null && b!.tokens.input !== null ? c!.tokens.input - b!.tokens.input : null,
            outputTokens:
              c!.tokens.output !== null && b!.tokens.output !== null ? c!.tokens.output - b!.tokens.output : null,
            cacheTokens: c!.tokens.cache !== null && b!.tokens.cache !== null ? c!.tokens.cache - b!.tokens.cache : null,
            reasoningTokens:
              c!.tokens.reasoning !== null && b!.tokens.reasoning !== null ? c!.tokens.reasoning - b!.tokens.reasoning : null,
            sceneFailures: c!.sceneFailures - b!.sceneFailures,
            deliveryCoverage: c!.deliveryCoverage! - b!.deliveryCoverage!,
          }
        : null;
    return {
      caseId: item.caseId,
      category: item.category,
      scenario: item.scenario,
      state,
      provenanceStatus:
        externalFreeze === undefined
          ? "UNVERIFIED"
          : bindingMismatch
            ? "FROZEN_MISMATCH"
            : !baseline || !candidate
              ? "NOT_FULLY_COLLECTED"
              : "FROZEN_MATCH",
      reason: bindingMismatch
        ? "FROZEN_CONTROL_OR_PROVENANCE_MISMATCH"
        : mismatch
          ? "CONTROL_OR_SEED_OR_EVIDENCE_MISMATCH"
          : state === "MISSING"
            ? "ARM_NOT_COLLECTED"
            : null,
      pairFingerprint: hash({
        protocol: dataset.protocolVersion,
        datasetHash: verified.datasetHash,
        rubricHash: verified.rubricHash,
        aggregationHash: verified.aggregationHash,
        inputHash: hash(item),
        baseline: baseline ? hash(baseline) : null,
        candidate: candidate ? hash(candidate) : null,
      }),
      architecture: { baseline: b, candidate: c },
      delta,
    };
  });
  const blind = prepareFullE6Assignments(observations);
  const subjective = resolveSubjective(blind.assignments, annotations, adjudications).map((unit) => {
    const inputs = observations.filter(
      (entry) => entry.caseId === unit.caseId && (unit.evaluation === "PAIRED" || entry.arm === "candidate"),
    );
    return inputs.some((entry) => !isExecuted(entry) || !bindingMatches(entry))
      ? { ...unit, state: "INVALID", score: null, missingReason: "FROZEN_CONTROL_OR_PROVENANCE_MISMATCH" }
      : unit;
  });
  const subjectiveSummary = (categoryPairs: typeof pairs, unary: boolean) =>
    Object.fromEntries(
      rubrics.dimensions
        .filter((dimension) => candidateOnly(dimension.id) === unary)
        .map((dimension) => {
          const units = subjective.filter(
            (unit) => unit.dimension === dimension.id && categoryPairs.some((pair) => pair.caseId === unit.caseId),
          );
          // Review: unidades deferidas contam no denominador esperado (não
          // geram assignments) e são reportadas à parte em notExecutedUnits.
          const deferredUnits = categoryPairs
            .filter((pair) => pair.state === "NOT_EXECUTED")
            .reduce(
              (total, pair) =>
                total +
                (dimension.unit === "JOB"
                  ? 1
                  : dataset.cases.find((item) => item.caseId === pair.caseId)!.targetContentCount),
              0,
            );
          const caseMeans = categoryPairs.flatMap((pair) => {
            const scores = units
              .filter((unit) => unit.caseId === pair.caseId && (unary || pair.state === "PAIRED"))
              .flatMap((unit) => (unit.score === null ? [] : [unit.score]));
            return scores.length ? [mean(scores)!] : [];
          });
          return [
            dimension.id,
            {
              ...pairedSummary(caseMeans),
              evaluation: unary ? "CANDIDATE_ONLY" : "PAIRED",
              unit: dimension.unit === "JOB" ? "PORTFOLIO" : "CONTENT",
              expectedUnits: units.length + deferredUnits,
              notExecutedUnits: deferredUnits,
              resolvedUnits: units.filter((unit) => unit.score !== null).length,
              missingUnits: units.filter((unit) => unit.state === "NOT_ANNOTATED").length,
              invalidUnits: units.filter((unit) => unit.state === "INVALID").length,
              notApplicableUnits: units.filter((unit) => unit.state === "NOT_APPLICABLE").length,
              conflicts: units.filter((unit) => unit.state === "CONFLICT").length,
            },
          ];
        }),
    );
  const categorySummary = (categoryPairs: typeof pairs) => ({
    expectedPairs: categoryPairs.length,
    byArm: Object.fromEntries(
      (["baseline", "candidate"] as const).map((arm) => {
        const metrics = categoryPairs.flatMap((pair) => (pair.architecture[arm] ? [pair.architecture[arm]!] : []));
        const has = metrics.length > 0;
        const delivered = has ? sum(metrics.map((item) => item.delivered)) : null;
        const requested = has ? sum(metrics.map((item) => item.requested)) : null;
        const calls = has ? sum(metrics.map((item) => item.calls)) : null;
        return [
          arm,
          {
            observedCases: metrics.length,
            expectedCases: categoryPairs.length,
            // Review: sem métricas observadas, nenhum zero é inventado — os
            // campos ficam null/unavailable com missingData explicando.
            requested,
            delivered,
            deliveryCoverage: has ? ratio(delivered!, requested!) : null,
            calls,
            contentsPerCall: has ? ratio(delivered!, calls!) : null,
            judgeExecuted: has ? sum(metrics.map((item) => item.judge.executed)) : null,
            judgeCoverage: has ? ratio(sum(metrics.map((item) => item.judge.executed)), delivered!) : null,
            retryRate: has ? ratio(sum(metrics.map((item) => item.retries)), calls!) : null,
            repairRate: has ? ratio(sum(metrics.map((item) => item.repairs)), calls!) : null,
            hardGateFailureRate: has ? ratio(sum(metrics.map((item) => item.hardFailures)), requested!) : null,
            sceneFailureRate: has ? ratio(sum(metrics.map((item) => item.sceneFailures)), requested!) : null,
            partialSuccessRate: has ? ratio(metrics.filter((item) => item.partialSuccess).length, metrics.length) : null,
          },
        ];
      }),
    ),
    validPairs: categoryPairs.filter((pair) => pair.state === "PAIRED").length,
    missingPairs: categoryPairs.filter((pair) => pair.state === "MISSING").length,
    invalidPairs: categoryPairs.filter((pair) => pair.state === "INVALID").length,
    notExecutedPairs: categoryPairs.filter((pair) => pair.state === "NOT_EXECUTED").length,
    architecture: Object.fromEntries(
      ["calls", "delivered", "cost", "latencyMs", "retries", "repairs", "hardFailures", "sceneFailures", "deliveryCoverage", "inputTokens", "outputTokens", "cacheTokens", "reasoningTokens"].map(
        (metric) => {
          if (metric === "cost") {
            // Review: média exata em minor units (BigInt, half-up com sinal);
            // arredondamento só na apresentação — nunca Number(BigInt).
            // Semântica original preservada: ≥2 snapshots/moedas distintos nos
            // deltas excluem o agregado (all-or-nothing), nunca zero.
            const deltas = categoryPairs.flatMap((pair) =>
              pair.delta?.cost == null ? [] : [pair.delta.cost],
            );
            const currencySet = new Set(
              categoryPairs
                .filter((pair) => pair.delta?.cost != null)
                .map((pair) => pair.architecture.baseline!.cost.currency),
            );
            const hashSet = new Set(
              categoryPairs
                .filter((pair) => pair.delta?.cost != null)
                .map((pair) => pair.architecture.baseline!.cost.pricingHash),
            );
            const bigs =
              currencySet.size > 1 || hashSet.size > 1 ? [] : deltas.map((delta) => BigInt(delta));
            const total = bigs.reduce((sumBig, value) => sumBig + value, 0n);
            const count = BigInt(Math.max(bigs.length, 1));
            const negative = total < 0n;
            const abs = negative ? -total : total;
            const meanAbs = (abs * 2n + count) / (2n * count);
            return [
              metric,
              {
                n: bigs.length,
                mean: bigs.length ? (negative ? -meanAbs : meanAbs).toString() : null,
                standardError: null,
                expected: categoryPairs.length,
                missing: categoryPairs.length - bigs.length,
                currency: currencySet.size === 1 ? [...currencySet][0] : null,
                pricingHash: hashSet.size === 1 ? [...hashSet][0] : null,
                incompatibleCurrencies: currencySet.size > 1,
                incompatiblePricingSnapshots: hashSet.size > 1,
                roundingPolicy: "ISO_MINOR_UNIT_SCALE_BIGINT_HALF_UP" as const,
              },
            ];
          }
          const values = categoryPairs.flatMap((pair) => {
            const value = pair.delta?.[metric as keyof NonNullable<typeof pair.delta>];
            return value == null ? [] : [value];
          });
          return [
            metric,
            {
              ...pairedSummary(values as number[]),
              expected: categoryPairs.length,
              missing: categoryPairs.length - values.length,
            },
          ];
        },
      ),
    ),
    latencyMs: Object.fromEntries(
      (["baseline", "candidate"] as const).map((arm) => {
        const values = categoryPairs.flatMap((pair) =>
          pair.architecture[arm]?.latency.totalMs == null ? [] : [pair.architecture[arm]!.latency.totalMs!],
        );
        return [arm, { observed: values.length, expected: categoryPairs.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) }];
      }),
    ),
    subjective: subjectiveSummary(categoryPairs, false),
    candidateOnly: subjectiveSummary(categoryPairs, true),
  });
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, categorySummary(pairs.filter((pair) => pair.category === category))]));
  const aggregate = categorySummary(pairs);
  const acceptanceBlockers = nonExecutedCases.length ? [RECURRENCE_BLOCKER] : [];
  const report = {
    reportVersion: "full-e6-report.v2",
    protocolVersion: dataset.protocolVersion,
    evidenceClasses: [...new Set(observations.filter(isExecuted).map((item) => item.evidenceClass))].sort(),
    mode: "OFFLINE_PREPARATION",
    verdict: pairs.some((pair) => pair.state === "INVALID") ? "INVALID" : "INCOMPLETE",
    acceptanceStatus: "V2_DEFAULT_PENDING_ACCEPTANCE",
    acceptanceBlockers,
    approvalStatus: "DRAFT",
    preflight: readiness,
    externalFreezeHash: frozen?.freezeHash ?? null,
    inputs: verified,
    nonExecutedCases,
    observationHashes: observations.map(hash).sort(),
    annotationHashes: annotations.map((item) => item.annotationHash).sort(),
    adjudicationHashes: adjudications.map((item) => item.adjudicationHash).sort(),
    pairs,
    aggregate,
    byCategory,
    macroCategory: Object.fromEntries(
      rubrics.dimensions
        .filter((dimension) => !candidateOnly(dimension.id))
        .map((dimension) => [
          dimension.id,
          mean(
            CATEGORIES.flatMap((category) => {
              const value = byCategory[category]!.subjective[dimension.id]!.mean;
              return value === null ? [] : [value];
            }),
          ),
        ]),
    ),
    macroCandidateOnly: Object.fromEntries(
      rubrics.dimensions
        .filter((dimension) => candidateOnly(dimension.id))
        .map((dimension) => [
          dimension.id,
          mean(
            CATEGORIES.flatMap((category) => {
              const value = byCategory[category]!.candidateOnly[dimension.id]!.mean;
              return value === null ? [] : [value];
            }),
          ),
        ]),
    ),
    subjective,
    missingStates: MISSING_STATES,
    missingData: [
      ...pairs
        .filter((pair) => pair.state !== "PAIRED")
        .map((pair) => ({
          caseId: pair.caseId,
          category: pair.category,
          arm: null,
          metric: "PAIR",
          state: pair.state,
          reason: pair.reason,
        })),
      ...nonExecutedCases.flatMap((entry) => {
        const item = dataset.cases.find((candidate) => candidate.caseId === entry.caseId)!;
        return rubrics.dimensions.map((dimension) => ({
          caseId: entry.caseId,
          category: item.category,
          arm: candidateOnly(dimension.id) ? ("candidate" as const) : null,
          metric: dimension.id,
          state: "NOT_EXECUTED",
          reason: DEPENDENCY_SLICE_008,
        }));
      }),
      ...subjective
        .filter((unit) => ["NOT_ANNOTATED", "INVALID"].includes(unit.state))
        .map((unit) => ({
          caseId: unit.caseId,
          category: dataset.cases.find((item) => item.caseId === unit.caseId)!.category,
          arm: unit.evaluation === "CANDIDATE_ONLY" ? "candidate" : null,
          metric: unit.dimension,
          state: unit.state,
          reason: unit.missingReason ?? "HUMAN_ANNOTATION_MISSING",
        })),
      ...pairs
        .filter((pair) => pair.state === "PAIRED" && pair.delta?.cost === null)
        .map((pair) => ({
          caseId: pair.caseId,
          category: pair.category,
          arm: null,
          metric: "COST_DELTA",
          state: "UNAVAILABLE",
          reason: "MISSING_OR_INCOMPATIBLE_PRICING_SNAPSHOT_OR_CURRENCY",
        })),
      ...pairs.flatMap((pair) =>
        (["baseline", "candidate"] as const).flatMap((arm) => {
          const metrics = pair.architecture[arm];
          if (!metrics)
            // Review: caso NOT_EXECUTED reporta TODAS as métricas operacionais
            // por braço como UNAVAILABLE com a razão da dependência.
            return pair.state === "NOT_EXECUTED"
              ? Object.keys(FULL_E6_OPERATIONAL_METRICS).map((metric) => ({
                  caseId: pair.caseId,
                  category: pair.category,
                  arm,
                  metric,
                  state: "UNAVAILABLE",
                  reason: DEPENDENCY_SLICE_008,
                }))
              : [
                  {
                    caseId: pair.caseId,
                    category: pair.category,
                    arm,
                    metric: "OBSERVATION",
                    state: "NOT_EXECUTED",
                    reason: "ARM_NOT_COLLECTED",
                  },
                ];
          return [
            ...(metrics.cost.state === "UNAVAILABLE"
              ? [
                  {
                    metric: "COST",
                    reason:
                      metrics.evidenceClass === "OFFLINE"
                        ? "OFFLINE_NOT_LIVE_EVIDENCE"
                        : "MISSING_OR_INCOMPATIBLE_PRICING_SNAPSHOT_OR_CURRENCY",
                  },
                ]
              : []),
            ...(metrics.latency.state === "UNAVAILABLE"
              ? [
                  {
                    metric: "LATENCY",
                    reason: metrics.evidenceClass === "OFFLINE" ? "OFFLINE_NOT_LIVE_EVIDENCE" : "END_TO_END_LATENCY_MISSING",
                  },
                ]
              : []),
            ...Object.entries(metrics.tokens)
              .filter(([, value]) => value === null)
              .map(([field]) => ({ metric: `TOKENS_${field.toUpperCase()}`, reason: "USAGE_NOT_REPORTED_OR_OFFLINE" })),
          ].map((missing) => ({ caseId: pair.caseId, category: pair.category, arm, ...missing, state: "UNAVAILABLE" }));
        }),
      ),
    ],
    limitations: [
      "No live collection is executed by this tool.",
      "Offline counts demonstrate mechanics only; no quality, cost or latency improvement is claimed.",
      "Candidate-only realization and coherence are absolute target assessments, not paired comparisons; baseline equivalence or improvement cannot be inferred.",
      "Paired human views expose output content only; unary views expose output and allowlisted semantic direction, never recipeId or engine provenance. Unary task applicability may reveal the creative population; do not mix these sessions with paired comparisons.",
      "RECURRENCE case e6-memory-01 is DEFERRED (dependency SLICE_008, requiredForAcceptance): reported as NOT_EXECUTED with observed=0, never imputed as zero and never promotable to acceptance until real recurrent evidence exists after Slice 008.",
      "Costs aggregate exact integer minor units (BigInt) and format at the frozen currency's ISO minor-unit scale (USD 2, JPY 0, KWD 3 decimals) — no sub-minor-unit precision is claimed. Reported amounts are annotator/provider-declared (source REPORTED) and do not prove frozen rates.",
      "Without an external freeze, imported pairs are mechanically paired but preregistration/provenance is UNVERIFIED; no approved comparison or V2 acceptance follows.",
      "External freeze and provenance hashes establish artifact integrity/binding only, not authenticity of human approval or live execution.",
      "Imported live observations remain unapproved until frozen protocol, thresholds, formal reviews and explicit user acceptance.",
      "Provenance and controls hashes reference separately preserved redacted artifacts; hashes alone are not live execution proof.",
    ],
  };
  return { ...report, reportHash: hash(report) };
}

export function prepareFullE6() {
  const verified = verifyFullE6Draft();
  const collectionPlan = dataset.cases.map((item) => {
    const deferred = isDeferredCase(item);
    return {
      caseId: item.caseId,
      inputHash: hash(item),
      seed: plannedSeed(item),
      requested: item.targetContentCount,
      category: item.category,
      scenario: item.scenario,
      input: item,
      arms: ["baseline", "candidate"],
      status: "NOT_EXECUTED",
      executionStatus: "NOT_EXECUTED" as const,
      executionPolicy: (deferred ? "DEFERRED" : "REQUIRED") as FullE6ExecutionPolicy,
      dependency: deferred ? ("SLICE_008" as const) : null,
      requiredForAcceptance: deferred,
      controlsRequired: [
        "FACTS",
        "EVIDENCE",
        "CREATOR_CONTEXT",
        ...(deferred ? ["MEMORY", "REUSED_STRATEGY"] : []),
        "SEED",
        "PROVIDER_MODEL_PARAMETERS",
      ],
      provenanceRequired: [
        "COMMIT",
        "ENGINE_VERSION",
        "SKILL_BINDING",
        "CONTRACT_SCHEMA_GATE_RISK_POLICIES",
        "PROMPT_CONTEXT_HASHES",
        "PRICING_SNAPSHOT",
        "PHYSICAL_ATTEMPTS",
      ],
    };
  });
  const artifacts = {
    artifactVersion: "full-e6-preparation.v2",
    evidenceClass: "OFFLINE_INPUT_ONLY",
    ...verified,
    preflight: preflightFullE6(),
    dataset,
    rubrics,
    collectionPlan,
    observations: [] as FullE6Observation[],
    annotations: [] as FullE6Annotation[],
    adjudications: [] as FullE6Adjudication[],
    report: buildFullE6Report(),
  };
  return { ...artifacts, artifactHash: hash(artifacts) };
}
