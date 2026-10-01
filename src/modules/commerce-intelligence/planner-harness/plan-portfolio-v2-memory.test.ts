import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCreativeSystem } from "../creative-system";
import { canonicalSerialization, sha256Hex } from "./canonical";
import { enumerateV2, evaluateCandidateEligibility, planPortfolio, similarityV2, type PlannerInput, type PlannerMemorySignals } from "./plan-portfolio";

const system = loadCreativeSystem("tiktok-commerce@1.3");
const ref = { id: "product:description", field: "product:description", valueHash: "hash" };
function input(signals: readonly PlannerMemorySignals[] = []): PlannerInput {
  return {
    fixtureId: "v2-memory", targetContentCount: 1, plannerPolicyVersion: "PLANNER_POLICY_V2",
    compatibilityPolicyVersion: "CREATIVE_COMPATIBILITY_V2",
    creativeSystemHash: sha256Hex(canonicalSerialization(system)),
    productFacts: { fixtureProductRef: "p", fields: { description: "produto" }, evidenceRefs: [ref] },
    commercialDiscovery: { evidenceCatalog: { refs: [ref] }, opportunities: [{
      sourceOpportunityId: "src", commercialObjective: "vender", angle: "uso", coreMessage: "benefício",
      commercialEffects: ["desejo"], evidenceRefs: [ref],
    }] },
    creatorConstraints: { allowedFormats: ["pov"], allowedProductRoles: ["solution"], disallowedFormats: [], disallowedProductRoles: [] },
    productionConstraints: {},
    skillBinding: { platformSkillVersion: "tiktok-commerce@1.3", creativeSystemVersion: "1.3", source: "runtime-skill" },
    inputMemorySnapshot: signals.length ? { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals } : {},
    seed: "v2-memory-seed",
  };
}
const request = input();
const candidates = enumerateV2(request, system).flatMap((candidate) => {
  const eligible = evaluateCandidateEligibility(candidate, {
    pool: new Map(request.commercialDiscovery.opportunities.map((source) => [source.sourceOpportunityId, source])),
    catalogRefs: [ref], creatorConstraints: request.creatorConstraints, creativeSystemValue: system,
    policyVersion: request.plannerPolicyVersion, skillBinding: request.skillBinding,
  });
  return eligible ? [eligible] : [];
});
type Candidate = (typeof candidates)[number];
function signal(candidate: Candidate): PlannerMemorySignals {
  const b = candidate.blueprint;
  return {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
    ...(b.recipeId === undefined ? {} : { recipeId: b.recipeId }),
    attentionMechanisms: [b.attentionMechanisms[0]!], psychologicalEffects: b.psychologicalEffects,
    format: b.format, productRole: b.productRole, narrativeShape: b.narrativeMoves,
    commercialEffects: candidate.source.commercialEffects,
  };
}
function chosen(signals: readonly PlannerMemorySignals[]): Candidate {
  const result = planPortfolio(input(signals));
  assert.equal(result.ok, true, result.ok ? undefined : result.error.code);
  const selected = candidates.find((candidate) => candidate.candidateKey === result.value.opportunities[0]!.candidateKey);
  assert.ok(selected);
  return selected;
}

// Independent behavioral oracle: compare memory priorities only, not planner tie hashes or enumeration order.
const set = (value: readonly string[] | undefined) => value?.length ? JSON.stringify([...new Set(value)].sort()) : undefined;
const ordered = (value: readonly string[]) => value.length ? JSON.stringify(value) : undefined;
function dimensions(s: PlannerMemorySignals): readonly (string | undefined)[] {
  return [set(s.commercialEffects), set(s.psychologicalEffects), s.recipeId, s.attentionMechanisms[0], s.format, s.productRole, ordered(s.narrativeShape)];
}
const weights = [250, 200, 150, 150, 100, 50, 100];
function memoryPriority(candidate: Candidate, history: readonly PlannerMemorySignals[]): readonly [number, number] {
  const current = dimensions(signal(candidate));
  const historic = history.map(dimensions);
  const matches = current.filter((value, index) => value !== undefined && historic.some((row) => row[index] === value)).length;
  let maxSimilarity = 0;
  for (const row of historic) {
    let applicable = 0;
    let matching = 0;
    for (let index = 0; index < weights.length; index++) {
      if (current[index] === undefined || row[index] === undefined) continue;
      applicable += weights[index]!;
      if (current[index] === row[index]) matching += weights[index]!;
    }
    maxSimilarity = Math.max(maxSimilarity, applicable ? Math.floor(1_000_000 * matching / applicable + 0.5) : 0);
  }
  return [matches, maxSimilarity];
}
function assertOptimalMemorySelection(history: readonly PlannerMemorySignals[]): Candidate {
  const selected = chosen(history);
  const actual = memoryPriority(selected, history);
  for (const candidate of candidates) {
    const other = memoryPriority(candidate, history);
    assert.ok(actual[0] < other[0] || (actual[0] === other[0] && actual[1] <= other[1]),
      `selected ${selected.candidateKey} repeats more applicable history than ${candidate.candidateKey}`);
  }
  return selected;
}

test("V2 memory ranking normalizes only dimensions present on both sides, including absent recipes", () => {
  const free = candidates.filter((candidate) => candidate.blueprint.recipeId === undefined);
  const backed = candidates.filter((candidate) => candidate.blueprint.recipeId !== undefined);
  assert.ok(free.length && backed.length);
  const full = signal(free[0]!);
  const recipe = signal(backed[0]!);
  const partial: PlannerMemorySignals = {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
    attentionMechanisms: [], psychologicalEffects: recipe.psychologicalEffects, narrativeShape: recipe.narrativeShape,
  };
  for (const history of [
    [full, partial],
    [recipe, { ...full, commercialEffects: [] }],
    [full, { ...recipe, attentionMechanisms: [], psychologicalEffects: [], narrativeShape: [], format: undefined }],
    [{ signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", attentionMechanisms: [], psychologicalEffects: [], narrativeShape: [] } satisfies PlannerMemorySignals],
  ]) assertOptimalMemorySelection(history);
});

test("V2 avoids the previously selected structure when Product Memory contains it", () => {
  const original = chosen([]);
  assert.notEqual(original.blueprint.recipeId, undefined, "empate sem memória prefere recipe conhecida");
  const selected = assertOptimalMemorySelection([signal(original)]);
  assert.notDeepEqual(dimensions(signal(selected)), dimensions(signal(original)));
});

test("recipe preference does not block free exploration when all recipes are in memory", () => {
  const recipes = candidates.filter((candidate) => candidate.blueprint.recipeId !== undefined).map(signal);
  assert.ok(recipes.length);
  const selected = assertOptimalMemorySelection(recipes);
  assert.equal(selected.blueprint.recipeId, undefined);
});

test("similaridade V2 de livres idênticas é 100%; recipe ausente não entra no denominador", () => {
  const free: PlannerMemorySignals = {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
    attentionMechanisms: ["curiosity"], psychologicalEffects: ["desire"],
    format: "pov", productRole: "solution", narrativeShape: ["setup", "payoff"],
    commercialEffects: ["desejo"],
  };
  assert.equal(similarityV2(free, structuredClone(free)), 1_000_000);
  assert.equal(similarityV2(free, { ...free, recipeId: "known-recipe" }), 1_000_000);
  assert.equal(similarityV2(free, { ...free, psychologicalEffects: ["trust"] }), 764_706);
  assert.equal(similarityV2(free, { ...free, narrativeShape: ["payoff", "setup"] }), 882_353);
});
