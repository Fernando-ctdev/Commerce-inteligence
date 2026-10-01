import assert from "node:assert/strict";
import { test } from "node:test";
import { assertFreeCompositionCooccurrence, loadCreativeSystem } from "../creative-system";
import { enumerateV2, evaluateCandidateEligibility, planPortfolio, type PlannerInput } from "./plan-portfolio";
import { canonicalSerialization, sha256Hex } from "./canonical";

const ref = { id: "product:description", field: "product:description", valueHash: "hash" };
function input(n: number, effects = ["desejo"]): PlannerInput {
  return {
    fixtureId: "v2-test", targetContentCount: n, plannerPolicyVersion: "PLANNER_POLICY_V2",
    compatibilityPolicyVersion: "CREATIVE_COMPATIBILITY_V2",
    creativeSystemHash: sha256Hex(canonicalSerialization(loadCreativeSystem("tiktok-commerce@1.3"))),
    productFacts: { fixtureProductRef: "p", fields: { description: "produto" }, evidenceRefs: [ref] },
    commercialDiscovery: {
      evidenceCatalog: { refs: [ref] },
      opportunities: Array.from({ length: n }, (_, index) => ({
        sourceOpportunityId: `src-${index}`, commercialObjective: `objetivo ${index}`,
        angle: `ângulo ${index}`, coreMessage: `mensagem ${index}`,
        commercialEffects: effects, evidenceRefs: [ref],
      })),
    },
    creatorConstraints: { allowedFormats: ["pov"], allowedProductRoles: ["solution"], disallowedFormats: [], disallowedProductRoles: [] },
    productionConstraints: {},
    skillBinding: { platformSkillVersion: "tiktok-commerce@1.3", creativeSystemVersion: "1.3", source: "runtime-skill" },
    inputMemorySnapshot: {}, seed: "v2-seed",
  };
}

test("enumeração V2 preserva os 3.731 candidatos suportados por origem", () => {
  const raw = enumerateV2(input(1), loadCreativeSystem("tiktok-commerce@1.3"));
  assert.equal(raw.filter((item) => item.blueprint.recipeId !== undefined).length, 802);
  assert.equal(raw.length, 3_731);
});
test("V2 seleciona N origens mesmo sem variedade de efeitos comerciais, sem cortar o pool", () => {
  for (const n of [1, 5, 10]) {
    const result = planPortfolio(input(n));
    assert.equal(result.ok, true, result.ok ? undefined : `${result.error.code}: ${result.error.message}`);
    if (result.ok) {
      assert.equal(result.value.opportunities.length, n);
      assert.equal(new Set(result.value.opportunities.map((item) => item.sourceOpportunityId)).size, n);
      assert.equal(result.value.plannerPolicyVersion, "PLANNER_POLICY_V2");
    }
  }
});

test("V2 falha fechado ao ultrapassar o teto bruto de 65.536 antes de dedup", () => {
  const result = planPortfolio(input(10, ["desejo"]));
  assert.equal(result.ok, true);
  // O teste de teto usa origens excedentes sem exigir N adicional.
  const huge = input(10);
  huge.commercialDiscovery = {
    ...huge.commercialDiscovery,
    opportunities: Array.from({ length: 20 }, (_, index) => ({
      ...huge.commercialDiscovery.opportunities[index % 10]!, sourceOpportunityId: `huge-${index}`,
    })),
  };
  const overflow = planPortfolio(huge);
  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.equal(overflow.error.code, "GEN-PLANNER-ENUMERATION-LIMIT");
});

test("elegibilidade V2 rejeita primitives sem suporte pairwise mesmo com formato/papel válidos", () => {
  const request = input(1);
  const source = request.commercialDiscovery.opportunities[0]!;
  const system = loadCreativeSystem("tiktok-commerce@1.3");
  const context = { pool: new Map([[source.sourceOpportunityId, source]]), catalogRefs: [ref],
    creatorConstraints: request.creatorConstraints, creativeSystemValue: system,
    policyVersion: request.plannerPolicyVersion, skillBinding: request.skillBinding };
  assert.throws(() => evaluateCandidateEligibility({
    sourceOpportunityId: source.sourceOpportunityId, source, evidenceRefs: [ref], noveltyTargets: [],
    blueprint: { attentionMechanisms: ["curiosity"], psychologicalEffects: ["identification"],
      format: "pov", productRole: "solution", narrativeMoves: ["reveal"] },
  }, context), (error: unknown) => (error as { code?: string }).code === "GEN-CS-COMPAT");
});

test("composição livre combina suporte de recipes diferentes sem virar uma recipe completa", () => {
  const request = input(1);
  const system = loadCreativeSystem("tiktok-commerce@1.3");
  const raw = enumerateV2(request, system);
  const novel = raw.find(({ blueprint: b }) => b.recipeId === undefined
    && !system.recipes.some((recipe) => b.attentionMechanisms.every((id) => recipe.attentionMechanisms.includes(id))
      && b.psychologicalEffects.every((id) => recipe.psychologicalEffects.includes(id))
      && recipe.formats.includes(b.format) && recipe.productRoles.includes(b.productRole)
      && JSON.stringify(recipe.narrativeMoves) === JSON.stringify(b.narrativeMoves)));
  assert.ok(novel, "espaço combinatório contém Blueprint fora de recipes completas");
  const eligible = evaluateCandidateEligibility(novel, {
    pool: new Map(request.commercialDiscovery.opportunities.map((source) => [source.sourceOpportunityId, source])),
    catalogRefs: [ref], creatorConstraints: { allowedFormats: [], allowedProductRoles: [], disallowedFormats: [], disallowedProductRoles: [] },
    creativeSystemValue: system, policyVersion: request.plannerPolicyVersion, skillBinding: request.skillBinding,
  });
  assert.ok(eligible);
  for (const candidate of raw.filter(({ blueprint }) => blueprint.recipeId === undefined))
    assertFreeCompositionCooccurrence(system, candidate.blueprint);
  assert.ok(new Set(raw.filter(({ blueprint }) => blueprint.recipeId === undefined)
    .map(({ blueprint }) => JSON.stringify(blueprint.narrativeMoves))).size > 1);
});

test("V2 rejeita versão de compatibilidade ou hash de conhecimento divergente antes de enumerar", () => {
  for (const mutation of [
    { compatibilityPolicyVersion: "CREATIVE_COMPATIBILITY_UNKNOWN" },
    { creativeSystemHash: "0".repeat(64) },
    { creativeSystemHash: undefined },
  ]) {
    const result = planPortfolio({ ...input(1), ...mutation } as PlannerInput);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "GEN-CS-VERSION");
  }
});
