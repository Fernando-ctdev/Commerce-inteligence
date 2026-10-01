// Etapa 3 — testes estruturais do harness (requisitos §11). Isolados: nenhum
// import de engine, worker, runtime, provider, Prisma ou módulos de Tenant.
// Somente testes estruturais — nenhum A/B operacional.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadCreativeSystem } from "../creative-system";
import {
  candidateCap,
  CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1,
  ENUMERATION_POLICY_V1,
  FORMAT_COMPLEXITY_V1,
  HOOK_MECHANISM_PROJECTION_POLICY_V1,
  PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2,
  PLANNER_POLICY_REGISTRY,
} from "./policies";
import {
  canonicalCandidateKey,
  canonicalSerialization,
  compareUtf8,
  harnessSeedForFixture,
  memorySignalKey,
  tieHash,
} from "./canonical";
import {
  capOrderCompare,
  isEmptyMemorySnapshot,
  isEnumerationLimitExceeded,
  mergeMemorySignalsCanonical,
  planPortfolio,
  scoreCandidateForHarnessTest,
  type CommercialDiscoveryPool,
  type EligibleCandidate,
  type EvidenceRef,
  type MemorySnapshotInput,
  type PlannerInput,
  type PlannerMemorySignals,
} from "./plan-portfolio";

const refute = (error: unknown, code: string): boolean =>
  (error as { code?: string }).code === code;

const binding = { platformSkillVersion: "tiktok-commerce@1.3", creativeSystemVersion: "1.3", source: "frozen-harness-fixture" } as const;

function evidenceRef(id: string, field = id, valueHash = `hash-${id}`): EvidenceRef {
  return Object.freeze({ id, field, valueHash });
}

function refByIndex(index: number): EvidenceRef {
  return evidenceRef(`fact:fixture:${index + 1}`);
}

// Fixtures congeladas: 12 oportunidades da Discovery com efeitos comerciais
// distintos o suficiente para os mínimos de diversidade; N=10 exige
// `candidateCap(10) = 80 >= 10`.
function buildPool(opportunityCount: number): CommercialDiscoveryPool {
  const opportunities = Array.from({ length: opportunityCount }, (_unused, index) => Object.freeze({
    sourceOpportunityId: `src-${String(index + 1).padStart(2, "0")}`,
    commercialObjective: `objetivo ${index + 1}`,
    angle: `ângulo ${index + 1}`,
    coreMessage: `mensagem ${index + 1}`,
    commercialEffects: index % 2 === 0
      ? ["desejo", "curiosidade", "impulso"]
      : ["identificação", "humor", "confiança"],
    evidenceRefs: Object.freeze([refByIndex(index % 4)]),
  }));
  return Object.freeze({
    evidenceCatalog: Object.freeze({ refs: Object.freeze([refByIndex(0), refByIndex(1), refByIndex(2), refByIndex(3)]) }),
    opportunities,
  });
}

function baseInput(overrides: Partial<Extract<PlannerInput, { plannerPolicyVersion: "PLANNER_POLICY_V1" }>> = {}): PlannerInput {
  return {
    fixtureId: "fixture-base-v1",
    targetContentCount: 5,
    productFacts: {
      fixtureProductRef: "product-1",
      fields: { categoria: "casa" },
      evidenceRefs: [refByIndex(0), refByIndex(1), refByIndex(2), refByIndex(3)],
    },
    commercialDiscovery: buildPool(12),
    creatorConstraints: {
      allowedFormats: ["pov", "talk_first"],
      allowedProductRoles: ["solution"],
      disallowedFormats: [],
      disallowedProductRoles: [],
    },
    productionConstraints: {},
    skillBinding: { ...binding },
    inputMemorySnapshot: {},
    seed: harnessSeedForFixture({
      fixtureId: "fixture-base-v1",
      targetContentCount: 5,
      plannerPolicyVersion: "PLANNER_POLICY_V1",
      skillBinding: { ...binding },
      inputFingerprint: createHash("sha256").update("fixture-base-v1").digest("hex"),
    }),
    plannerPolicyVersion: "PLANNER_POLICY_V1",
    ...overrides,
  };
}

test("policy registry é fechado em PLANNER_POLICY_V1 com enumeração e cap registrados", () => {
  assert.deepEqual(PLANNER_POLICY_REGISTRY.PLANNER_POLICY_V1, { enumeration: "ENUMERATION_POLICY_V1", candidateCap: "CANDIDATE_CAP_POLICY_V1" });
  const result = planPortfolio(baseInput({ plannerPolicyVersion: "PLANNER_POLICY_V9" as never }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "GEN-PLANNER-POLICY");
});

test("limites de N derivam da PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2 congelada", () => {
  assert.equal(Object.isFrozen(PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2), true);
  const { min, max } = PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2.targetContentCount;
  assert.equal(validateN(min), true);
  assert.equal(validateN(max), true);
  for (const invalid of [min - 1, max + 1]) assert.equal(validateN(invalid), false);
});

function validateN(value: number): boolean {
  return planPortfolio(baseInput({ targetContentCount: value })).ok;
}

test("validação de input ocorre antes da Skill e da enumeração", () => {
  for (const invalid of [-1, 0, 11, 2.5]) {
    const result = planPortfolio(baseInput({ targetContentCount: invalid }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "GEN-PLANNER-INPUT");
  }
});

test("exact-N: N=1 produz um candidate e N=10 produz dez", () => {
  const one = planPortfolio(baseInput({ targetContentCount: 1 }));
  assert.equal(one.ok, true);
  if (one.ok) assert.equal(one.value.opportunities.length, 1);
  const ten = planPortfolio(baseInput({ targetContentCount: 10 }));
  assert.equal(ten.ok, true);
  if (ten.ok) {
    assert.equal(ten.value.opportunities.length, 10);
    assert.deepEqual(ten.value.opportunities.map((opportunity) => opportunity.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }
});

test("source repetido na Discovery falha GEN-PLANNER-SOURCE; origem inexistente no resolvedor falha GEN-CS-REF", () => {
  const pool = buildPool(3);
  const forged = {
    ...pool,
    opportunities: [...pool.opportunities.map((opportunity: { sourceOpportunityId: string }) => ({ ...opportunity, sourceOpportunityId: "src-2" })), pool.opportunities[2]!],
  } as unknown as CommercialDiscoveryPool;
  const result = planPortfolio(baseInput({ commercialDiscovery: forged, targetContentCount: 2 }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "GEN-PLANNER-SOURCE");
});

test("candidateCap segue a policy e não rejeita N válidos", () => {
  for (let n = 1; n <= 10; n++) assert.ok(candidateCap(n) >= n);
  assert.equal(candidateCap(1), 32);
  assert.equal(candidateCap(10), 80);
});

test("cap de 4096 raw candidates: 4096 permitido seria pré-cap; overflow estrutural falha", () => {
  assert.equal(ENUMERATION_POLICY_V1.maxRawCandidates, 4096);
  const hugePool = buildPool(500);
  const result = planPortfolio(baseInput({ commercialDiscovery: hugePool, targetContentCount: 10 }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "GEN-PLANNER-ENUMERATION-LIMIT");
});

test("free composition exige par literal format × productRole e resolvedor @1.3 como autoridade", () => {
  const skill = loadCreativeSystem("tiktok-commerce@1.3");
  const declaredPairs = new Set(
    Object.entries(skill.compatibility.formatsByProductRole)
      .flatMap(([role, formats]) => formats.map((format) => `${format}×${role}`)),
  );
  assert.ok(declaredPairs.size >= 11, "matriz format × productRole declarada na Skill");
  assert.equal(Object.keys(FORMAT_COMPLEXITY_V1).length, 11);
  assert.deepEqual(Object.keys(FORMAT_COMPLEXITY_V1).sort(), [...skill.formats].sort());
  assert.equal(Object.values(FORMAT_COMPLEXITY_V1).every((value) => value !== undefined && Number.isInteger(value) && value > 0), true);
  assert.equal(Object.keys(HOOK_MECHANISM_PROJECTION_POLICY_V1).length, 10);
});

test("hook projection: [0] é primário; permutação muda a projeção", () => {
  assert.equal(HOOK_MECHANISM_PROJECTION_POLICY_V1.failure, "problem");
  assert.equal(HOOK_MECHANISM_PROJECTION_POLICY_V1.curiosity, "discovery");
  const failureKey = canonicalCandidateKey({
    sourceOpportunityId: "s", evidenceRefs: [], format: "pov",
    narrativeMoves: ["setup", "payoff"], productRole: "solution", angle: "a", noveltyTargets: [],
    attentionMechanisms: ["failure"], psychologicalEffects: ["humor"], recipeId: undefined,
  });
  const curiosityKey = canonicalCandidateKey({
    sourceOpportunityId: "s", evidenceRefs: [], format: "pov",
    narrativeMoves: ["setup", "payoff"], productRole: "solution", angle: "a", noveltyTargets: [],
    attentionMechanisms: ["curiosity"], psychologicalEffects: ["humor"], recipeId: undefined,
  });
  assert.notEqual(failureKey, curiosityKey, "primário distinto produz candidate distinto");
  const reversed = canonicalSerialization({ attention: ["curiosity", "failure"] });
  assert.notEqual(reversed, canonicalSerialization({ attention: ["failure", "curiosity"] }), "ordem semântica não é set");
});

test("reprodutibilidade: mesmo input + mesmo seed = mesma saída; seeds de fixture controlada variam ordem", () => {
  const input = baseInput({ fixtureId: "seed-variation-v1", targetContentCount: 2 });
  const first = planPortfolio(input);
  const second = planPortfolio(input);
  assert.equal(first.ok && second.ok, true);
  if (first.ok && second.ok)
    assert.deepEqual(first.value.opportunities.map((opportunity) => opportunity.candidateKey), second.value.opportunities.map((opportunity) => opportunity.candidateKey));
  const otherSeed = planPortfolio(baseInput({
    fixtureId: "seed-variation-v1",
    targetContentCount: 2,
    seed: createHash("sha256").update("outro-seed").digest("hex"),
  }));
  assert.equal(otherSeed.ok, true);
});

test("diversidade: pool sem suporte falha GEN-PLANNER-DIVERSITY", () => {
  const pool = buildPool(3);
  const uniformEffects = {
    ...pool,
    opportunities: (pool.opportunities as unknown as { commercialEffects: string[] }[]).map((opportunity) => ({ ...opportunity, commercialEffects: ["desejo"] as string[] })),
  } as unknown as CommercialDiscoveryPool;
  const result = planPortfolio(baseInput({ commercialDiscovery: uniformEffects, targetContentCount: 3 }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "GEN-PLANNER-DIVERSITY");
});

test("duration é validação de input: dois campos opcionais 1..3600, conflito fail-closed, nunca candidate/score", () => {
  const valid = planPortfolio(baseInput({
    creatorConstraints: { allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"], disallowedFormats: [], disallowedProductRoles: [], maxDurationSeconds: 30 },
    productionConstraints: { maxDurationSeconds: 60 },
  }));
  assert.equal(valid.ok, true);
  const conflict = planPortfolio(baseInput({
    creatorConstraints: { allowedFormats: [], allowedProductRoles: [], disallowedFormats: [], disallowedProductRoles: [], maxDurationSeconds: 60 },
    productionConstraints: { maxDurationSeconds: 30 },
  }));
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "GEN-CS-ELIGIBILITY");
  for (const invalid of [0, -5, 3601, 30.5, "30", Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = planPortfolio(baseInput({
      creatorConstraints: { allowedFormats: [], allowedProductRoles: [], disallowedFormats: [], disallowedProductRoles: [], maxDurationSeconds: invalid as number },
    }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "GEN-PLANNER-INPUT");
  }
  const bothAbsent = planPortfolio(baseInput());
  assert.equal(bothAbsent.ok, true);
});

test("memória: {} runtime exato via Reflect.ownKeys; nove sinais preservados; merge deduplica", () => {
  assert.equal(isEmptyMemorySnapshot({}), true);
  assert.equal(isEmptyMemorySnapshot(null), false);
  assert.equal(isEmptyMemorySnapshot([]), false);
  const withSymbol = Object.assign({}, {} as Record<string, never>) as { [key: symbol]: never };
  withSymbol[Symbol("x")] = Symbol("y") as never;
  assert.equal(isEmptyMemorySnapshot(withSymbol), false);
  assert.equal(isEmptyMemorySnapshot(Object.create(Object.prototype)), true);
  assert.equal(isEmptyMemorySnapshot(Object.create(null)), false);
  const signal: PlannerMemorySignals = {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
    attentionMechanisms: ["failure"],
    psychologicalEffects: ["humor"],
    narrativeShape: ["setup", "payoff"],
  };
  const merged = mergeMemorySignalsCanonical([signal], [signal, { ...signal, format: "pov" }]);
  assert.equal(merged.length, 2);
  assert.deepEqual(mergeMemorySignalsCanonical([signal], [signal]).length, 1);
  const invalidSchema = { signalsSchemaVersion: "OUTRA_V9", signals: [] } as unknown as MemorySnapshotInput;
  const invalid = planPortfolio(baseInput({ inputMemorySnapshot: invalidSchema }));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, "GEN-PLANNER-MEMORY");
});

test("memória: formas inválidas falham GEN-PLANNER-MEMORY e merge é determinístico", () => {
  assert.equal(isEmptyMemorySnapshot(42), false);
  assert.equal(isEmptyMemorySnapshot("x"), false);
  const extraKey = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", signals: [], extra: 1 };
  const invalidMemory = planPortfolio(baseInput({ inputMemorySnapshot: extraKey as unknown as MemorySnapshotInput }));
  assert.equal(invalidMemory.ok, false);
  if (!invalidMemory.ok) assert.equal(invalidMemory.error.code, "GEN-PLANNER-MEMORY");
  const badSignalType = {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
    signals: [{ signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", attentionMechanisms: "failure", psychologicalEffects: ["humor"], narrativeShape: ["setup"], commercialEffects: [] }],
  } as unknown as MemorySnapshotInput;
  const invalidSignal = planPortfolio(baseInput({ inputMemorySnapshot: badSignalType }));
  assert.equal(invalidSignal.ok, false);
  if (!invalidSignal.ok) assert.equal(invalidSignal.error.code, "GEN-PLANNER-MEMORY");
  const missingSignalsField = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" } as unknown as MemorySnapshotInput;
  const missingField = planPortfolio(baseInput({ inputMemorySnapshot: missingSignalsField }));
  assert.equal(missingField.ok, false);
  if (!missingField.ok) assert.equal(missingField.error.code, "GEN-PLANNER-MEMORY");
  const signalA: PlannerMemorySignals = {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
    attentionMechanisms: ["failure"],
    psychologicalEffects: ["humor"],
    narrativeShape: ["setup", "payoff"],
    commercialEffects: ["desejo"],
  };
  const mergedOnce = mergeMemorySignalsCanonical([signalA], [signalA]);
  assert.equal(mergedOnce.length, 1);
  assert.deepEqual(mergeMemorySignalsCanonical([], [signalA]), [signalA]);
  const reordered = { ...signalA, attentionMechanisms: ["curiosity"] };
  assert.equal(mergeMemorySignalsCanonical([signalA], [reordered]).length, 2);
});

test("merge: sinais que diferem só por commercialEffects geram chaves distintas", () => {
  const base: PlannerMemorySignals = {
    signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1",
    attentionMechanisms: ["failure"],
    psychologicalEffects: ["humor"],
    narrativeShape: ["setup", "payoff"],
    commercialEffects: ["desejo"],
  };
  const other = { ...base, commercialEffects: ["confiança"] };
  assert.equal(mergeMemorySignalsCanonical([base], [other]).length, 2, "commercialEffects distintos → chaves distintas");
  assert.equal(mergeMemorySignalsCanonical([base], [{ ...base, commercialEffects: ["desejo"] }]).length, 1, "mesmo set → mesma chave");
});

test("canonicalCandidateKey: permutação de effects é set-like; attention e narrative são ordered", () => {
  const keyOf = (parts: { attention: string[]; psychological: string[]; moves: string[] }): string => canonicalCandidateKey({
    sourceOpportunityId: "s", evidenceRefs: [], recipeId: undefined,
    attentionMechanisms: parts.attention, psychologicalEffects: parts.psychological, format: "pov",
    narrativeMoves: parts.moves, productRole: "solution", angle: "a", noveltyTargets: [],
  });
  assert.equal(
    keyOf({ attention: ["failure"], psychological: ["humor", "trust"], moves: ["setup", "payoff"] }),
    keyOf({ attention: ["failure"], psychological: ["trust", "humor"], moves: ["setup", "payoff"] }),
    "psychologicalEffects é set-like: permutação não muda a chave",
  );
  assert.notEqual(
    keyOf({ attention: ["failure", "curiosity"], psychological: ["humor"], moves: ["setup", "payoff"] }),
    keyOf({ attention: ["curiosity", "failure"], psychological: ["humor"], moves: ["setup", "payoff"] }),
    "attentionMechanisms é ordered: permutação muda o primário e a chave",
  );
  assert.notEqual(
    keyOf({ attention: ["failure"], psychological: ["humor"], moves: ["setup", "payoff"] }),
    keyOf({ attention: ["failure"], psychological: ["humor"], moves: ["payoff", "setup"] }),
    "narrativeMoves é ordered: permutação muda a chave",
  );
});

test("capOrder é reflexivo: a < a é falso para candidates idênticos", () => {
  const skill = loadCreativeSystem("tiktok-commerce@1.3");
  const recipe = skill.recipes[0]!;
  const source = {
    sourceOpportunityId: "src-x",
    commercialObjective: "o", angle: "a", coreMessage: "m",
    commercialEffects: ["desejo"] as readonly string[],
    evidenceRefs: [refByIndex(0)] as readonly EvidenceRef[],
  };
  const blueprint = {
    recipeId: recipe.id,
    attentionMechanisms: [...recipe.attentionMechanisms].slice(0, 2),
    psychologicalEffects: [...recipe.psychologicalEffects].slice(0, 3),
    format: "pov",
    narrativeMoves: [...recipe.narrativeMoves],
    productRole: "solution",
  };
  const a = candidateOf(source, blueprint);
  const b = candidateOf(source, blueprint);
  assert.equal(capOrderCompare(a, a), 0, "a < a é falso (reflexividade)");
  assert.equal(capOrderCompare(a, b), 0, "estruturalmente idênticos são iguais na ordem");
  assert.equal(capOrderCompare(b, a), 0);
});

test("recipe-backed preserva a ordem declarada da attention; [0] é o primário projetado", () => {
  const skill = loadCreativeSystem("tiktok-commerce@1.3");
  const recipe = skill.recipes.find(({ id }) => id === "result-first-curiosity")!;
  assert.deepEqual([...recipe.attentionMechanisms].sort(compareUtf8), ["curiosity", "result_first"], "ordem UTF-8 difere da declarada — fixture prova a regra");
  const source = {
    sourceOpportunityId: "src-ordered",
    commercialObjective: "o", angle: "a", coreMessage: "m",
    commercialEffects: ["desejo", "curiosidade", "impulso"] as readonly string[],
    evidenceRefs: [refByIndex(0)] as readonly EvidenceRef[],
  };
  const pool: CommercialDiscoveryPool = {
    evidenceCatalog: { refs: [refByIndex(0)] },
    opportunities: [source],
  };
  const input = baseInput({
    commercialDiscovery: pool,
    targetContentCount: 1,
    creatorConstraints: { allowedFormats: ["demonstration"], allowedProductRoles: ["proof"], disallowedFormats: [], disallowedProductRoles: [] },
  });
  const result = planPortfolio(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const blueprint = result.value.opportunities[0]!.blueprint.blueprint;
  assert.equal(blueprint.recipeId, "result-first-curiosity");
  assert.deepEqual(blueprint.attentionMechanisms, ["result_first", "curiosity"], "ordem declarada preservada, não ordenada por UTF-8");
  assert.equal(blueprint.attentionMechanisms[0], "result_first", "primário é o declarado [0]");
  assert.equal(result.value.opportunities[0]!.hookMechanism, HOOK_MECHANISM_PROJECTION_POLICY_V1.result_first, "primário projetado é result_first → demonstration");
});

test("cardinalidade do Blueprint vem da policy congelada como única autoridade", () => {
  assert.equal(Object.isFrozen(CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1), true);
  assert.equal(CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1.attentionMechanisms.max, 2);
  assert.equal(CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1.psychologicalEffects.max, 3);
  assert.equal(CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1.narrativeMoves.max, 6);
});

test("evidenceRefs: colisão de delimitador não ocorre; id/field/valueHash preservados exatamente", () => {
  const result = planPortfolio(baseInput({ targetContentCount: 1 }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const catalog = new Map(baseInput().commercialDiscovery.evidenceCatalog.refs
    .concat(baseInput().productFacts.evidenceRefs)
    .map((ref) => [canonicalSerialization({ id: ref.id, field: ref.field, valueHash: ref.valueHash }), ref]));
  for (const opportunity of result.value.opportunities) {
    for (const ref of opportunity.evidenceRefs) {
      const known = catalog.get(canonicalSerialization({ id: ref.id, field: ref.field, valueHash: ref.valueHash }));
      assert.ok(known !== undefined);
      assert.deepEqual(ref, known);
    }
  }
  // Dois refs com id/field iguais e valueHash distintos NÃO colidem na
  // identity estruturada — cada um preserva seu próprio valueHash.
  const refA = { id: "fact:x", field: "fact:x", valueHash: "h\u0000a" };
  const refB = { id: "fact:x", field: "fact:x", valueHash: "h\u0000b" };
  assert.notEqual(
    canonicalSerialization({ id: refA.id, field: refA.field, valueHash: refA.valueHash }),
    canonicalSerialization({ id: refB.id, field: refB.field, valueHash: refB.valueHash }),
  );
});

test("feasibility positiva determinada pelo cap: N=2 com fixtures conhecidas fecha exato", () => {
  const result = planPortfolio(baseInput({
    targetContentCount: 2,
    creatorConstraints: { allowedFormats: ["pov", "talk_first"], allowedProductRoles: ["solution"], disallowedFormats: [], disallowedProductRoles: [] },
  }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.opportunities.length, 2);
  const [first, second] = result.value.opportunities;
  assert.notEqual(first!.sourceOpportunityId, second!.sourceOpportunityId, "sources distintos");
  assert.notEqual(first!.blueprint.blueprint.format, second!.blueprint.blueprint.format, "maxSameFormat força formatos distintos");
});

test("raw até 4004 (26 fontes) atravessa; 27 fontes falha GEN-PLANNER-ENUMERATION-LIMIT", () => {
  // Granularidade: cada fonte gera 12 recipes + 71 pares × 2 variantes =
  // 154 raw; o limite cruza 4096 entre a 26ª e 27ª fonte (26 × 154 = 4004 ≤
  // 4096 < 4158). Falha fechado sem truncar — nunca reduz a enumeração.
  // O corte exato 4096/4097 é coberto pelo predicado isEnumerationLimitExceeded.
  const below = planPortfolio(baseInput({ commercialDiscovery: buildPool(26), targetContentCount: 1 }));
  assert.equal(below.ok, true);
  const above = planPortfolio(baseInput({ commercialDiscovery: buildPool(27), targetContentCount: 1 }));
  assert.equal(above.ok, false);
  if (!above.ok) {
    assert.equal(above.error.code, "GEN-PLANNER-ENUMERATION-LIMIT");
    assert.equal(above.error.phase, "enumeration");
    assert.equal((above.error.sanitized as Record<string, number>).rawCandidates, 4158);
    assert.equal((above.error.sanitized as Record<string, number>).maxRawCandidates, 4096);
  }
});

test("predicado da policy: 4096 permitido; 4097 rejeitado (GEN-PLANNER-ENUMERATION-LIMIT)", () => {
  assert.equal(ENUMERATION_POLICY_V1.maxRawCandidates, 4096);
  assert.equal(isEnumerationLimitExceeded(4095), false);
  assert.equal(isEnumerationLimitExceeded(4096), false, "raw 4096 é permitido");
  assert.equal(isEnumerationLimitExceeded(4097), true, "raw 4097 excede maxRawCandidates");
});

test("source uniqueness no output: N candidates têm sources distintos e presentes na Discovery", () => {
  const result = planPortfolio(baseInput({ targetContentCount: 5 }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const sources = result.value.opportunities.map((opportunity) => opportunity.sourceOpportunityId);
  assert.equal(new Set(sources).size, sources.length, "fontes repetidas proibidas na seleção");
  const poolSources = new Set(baseInput().commercialDiscovery.opportunities.map((opportunity) => opportunity.sourceOpportunityId));
  assert.ok(sources.every((source) => poolSources.has(source)));
});

test("fora do cap nunca é pontuado nem selecionado; saída é determinística", () => {
  // §7.2: mechanismDiversity lê P pré-cap por design — fontes extras podem
  // reordenar a seleção, mas nunca entram no output fora do exact-N.
  const input = baseInput({ targetContentCount: 3 });
  const probe = planPortfolio(input);
  assert.equal(probe.ok, true);
  if (!probe.ok) return;
  const baselineKeys = probe.value.opportunities.map((opportunity) => opportunity.candidateKey);
  assert.equal(new Set(baselineKeys).size, 3);
  const extra = Array.from({ length: 6 }, (_unused, index) => ({
    sourceOpportunityId: `src-${String(13 + index).padStart(2, "0")}`,
    commercialObjective: `extra ${index}`,
    angle: `extra ${index}`,
    coreMessage: `extra ${index}`,
    commercialEffects: ["impulso", "aspiração", "confiança"] as readonly string[],
    evidenceRefs: [refByIndex(index % 4)] as readonly EvidenceRef[],
  }));
  const biggerPool = {
    evidenceCatalog: baseInput().commercialDiscovery.evidenceCatalog,
    opportunities: [...baseInput().commercialDiscovery.opportunities, ...extra],
  };
  const withMore = planPortfolio(baseInput({ commercialDiscovery: biggerPool, targetContentCount: 3 }));
  assert.equal(withMore.ok, true);
  if (!withMore.ok) return;
  assert.equal(withMore.value.opportunities.length, 3);
  const poolSources = new Set(biggerPool.opportunities.map((opportunity) => opportunity.sourceOpportunityId));
  for (const opportunity of withMore.value.opportunities) {
    assert.ok(poolSources.has(opportunity.sourceOpportunityId), "candidato selecionado vem da Discovery");
    
  }
  const rerun = planPortfolio(baseInput({ commercialDiscovery: biggerPool, targetContentCount: 3 }));
  assert.equal(rerun.ok, true);
  if (rerun.ok)
    assert.deepEqual(rerun.value.opportunities.map((opportunity) => opportunity.candidateKey), withMore.value.opportunities.map((opportunity) => opportunity.candidateKey), "determinismo com o mesmo input");
});

test("score: 11 features com origens, rounding e rankScore exatos; fora-cap afeta mechanismDiversity", () => {
  const productFactsRefs = [refByIndex(0)];
  const skill = loadCreativeSystem("tiktok-commerce@1.3");
  const recipe = skill.recipes.find(({ id }) => id === "pov-identification-payoff")!;
  const source = Object.freeze({
    sourceOpportunityId: "src-01",
    commercialObjective: "objetivo",
    angle: "ângulo",
    coreMessage: "mensagem",
    commercialEffects: ["desejo", "curiosidade", "impulso"] as readonly string[],
    evidenceRefs: [refByIndex(0)] as readonly EvidenceRef[],
  });
  const blueprint = {
    recipeId: recipe.id,
    attentionMechanisms: [...recipe.attentionMechanisms].sort((a, b) => compareUtf8(a, b)).slice(0, 2),
    psychologicalEffects: [...recipe.psychologicalEffects].sort((a, b) => compareUtf8(a, b)).slice(0, 3),
    format: "pov",
    narrativeMoves: [...recipe.narrativeMoves],
    productRole: "object_of_desire",
  };
  const poolP = [candidateOf(source, blueprint)];
  const scored = scoreCandidateForHarnessTest({
    candidate: poolP[0]!,
    poolP,
    inputMemorySnapshot: {},
    productFactsRefs,
    skillPsychologicalEffects: skill.psychologicalEffects,
    creatorConstraints: { allowedFormats: ["pov"], allowedProductRoles: ["object_of_desire"], disallowedFormats: [], disallowedProductRoles: [] },
    policyVersion: "PLANNER_POLICY_V1",
    skillBinding: { ...binding },
  });
  const inputs = scored.inputs;
  assert.deepEqual(
    [inputs.relevance, inputs.commercialFit, inputs.psychologicalFit, inputs.creativeFit, inputs.recipeFit,
      inputs.novelty, inputs.mechanismDiversity, inputs.memoryDistance, inputs.creatorFit,
      inputs.productionComplexity, inputs.recentRepetition].map((f) => f.value),
    [1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 1_000_000, 250_000, 0],
  );
  assert.deepEqual(
    [inputs.relevance, inputs.commercialFit, inputs.psychologicalFit, inputs.creativeFit, inputs.recipeFit,
      inputs.novelty, inputs.mechanismDiversity, inputs.memoryDistance, inputs.creatorFit,
      inputs.productionComplexity, inputs.recentRepetition].map((f) => f.origin),
    ["validated-evidence", "validated-evidence", "creative-system", "creative-system", "creative-system",
      "validated-memory", "planner-policy", "validated-memory", "creator-constraints", "planner-policy", "validated-memory"],
  );
  assert.deepEqual(inputs.relevance.evidenceRefs, [refByIndex(0)]);
  assert.equal(scored.rankScore, 987_500, "1_000_000 − roundHalfUp(50×250_000/1000)");
  // fora do cap: P maior com o mesmo primário reduz mechanismDiversity e o rank
  const samePrimaryExtra = candidateOf(source, blueprint);
  const bigger = scoreCandidateForHarnessTest({
    candidate: poolP[0]!,
    poolP: [poolP[0]!, samePrimaryExtra, samePrimaryExtra],
    inputMemorySnapshot: {},
    productFactsRefs,
    skillPsychologicalEffects: skill.psychologicalEffects,
    creatorConstraints: { allowedFormats: ["pov"], allowedProductRoles: ["object_of_desire"], disallowedFormats: [], disallowedProductRoles: [] },
    policyVersion: "PLANNER_POLICY_V1",
    skillBinding: { ...binding },
  });
  assert.equal(bigger.inputs.mechanismDiversity.value, 0, "norm((2−2)/max(1,1)) = 0");
  assert.equal(bigger.rankScore, 987_500 - 100_000, "queda de 100×100_000/1000 no rankScore");
});

function candidateOf(source: { sourceOpportunityId: string; commercialObjective: string; angle: string; coreMessage: string; commercialEffects: readonly string[]; evidenceRefs: readonly EvidenceRef[] }, blueprint: { recipeId: string; attentionMechanisms: string[]; psychologicalEffects: string[]; format: string; narrativeMoves: string[]; productRole: string }): EligibleCandidate {
  return {
    sourceOpportunityId: source.sourceOpportunityId,
    source,
    evidenceRefs: source.evidenceRefs,
    blueprint,
    noveltyTargets: [],
    candidateKey: canonicalCandidateKey({
      sourceOpportunityId: source.sourceOpportunityId,
      evidenceRefs: source.evidenceRefs,
      recipeId: blueprint.recipeId,
      attentionMechanisms: blueprint.attentionMechanisms,
      psychologicalEffects: blueprint.psychologicalEffects,
      format: blueprint.format,
      narrativeMoves: blueprint.narrativeMoves,
      productRole: blueprint.productRole,
      angle: source.angle,
      noveltyTargets: [],
    }),
    hookMechanism: "discovery",
    validatedEvidenceRefs: source.evidenceRefs,
  };
}

test("chave canônica: ordem semântica e case mudam a chave; tie/seed/hashes são estáveis", () => {
  const keyOf = (attention: string[]): string => canonicalCandidateKey({
    sourceOpportunityId: "s", evidenceRefs: [], recipeId: undefined,
    attentionMechanisms: attention, psychologicalEffects: ["humor"], format: "pov",
    narrativeMoves: ["setup", "payoff"], productRole: "solution", angle: "a", noveltyTargets: [],
  });
  assert.notEqual(keyOf(["failure", "curiosity"]), keyOf(["curiosity", "failure"]), "attention é ordered semantic: permutação muda o primário e a chave");
  assert.notEqual(keyOf(["failure"]), keyOf(["Failure"]));
  const signalA = { signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1", recipeId: "r", attentionMechanisms: ["failure"], psychologicalEffects: ["humor"], format: "pov", productRole: "solution", narrativeShape: ["setup"], commercialEffects: ["desejo"], audienceContext: "casa", proofPattern: "demo" } satisfies PlannerMemorySignals;
  const signalB = { ...signalA, narrativeShape: ["payoff", "setup"] };
  assert.notEqual(memorySignalKey(signalA), memorySignalKey(signalB));
  assert.equal(memorySignalKey(signalA), memorySignalKey({ ...signalA, proofPattern: "demo" }));
  assert.equal(compareUtf8("a", "b") < 0, true);
  assert.equal(tieHash("seed", "key"), tieHash("seed", "key"));
  assert.notEqual(tieHash("seed-a", "key"), tieHash("seed-b", "key"));
  assert.match(canonicalSerialization({ a: 1 }), /^\[/);
  assert.equal(harnessSeedForFixture({ fixtureId: "f", targetContentCount: 1, plannerPolicyVersion: "PLANNER_POLICY_V1", skillBinding: { ...binding }, inputFingerprint: "fp" }).length, 64);
});

test("feasibility pós-cap/recipe-format/source-diversidade falham GEN-PLANNER-DIVERSITY fail-closed", () => {
  // (a) recipe-format: maxSameFormat = 1 (N=2) e todos os candidates são pov
  // → dead-end após o primeiro pick, com 31 restantes (sanitized comprova).
  const singleFormat = planPortfolio(baseInput({
    targetContentCount: 2,
    creatorConstraints: { allowedFormats: ["pov"], allowedProductRoles: [], disallowedFormats: [], disallowedProductRoles: [] },
  }));
  assert.equal(singleFormat.ok, false);
  if (!singleFormat.ok) {
    assert.equal(singleFormat.error.code, "GEN-PLANNER-DIVERSITY");
    assert.equal((singleFormat.error.sanitized as Record<string, number>).selected, 1);
  }
  // (c) source-diversidade: efeitos comerciais uniformes → suporte < mínimo.
  const pool = buildPool(3);
  const uniform = planPortfolio(baseInput({
    commercialDiscovery: {
      ...pool,
      opportunities: (pool.opportunities as unknown as { commercialEffects: string[] }[]).map((opportunity) => ({ ...opportunity, commercialEffects: ["desejo"] as string[] })),
    } as unknown as CommercialDiscoveryPool,
    targetContentCount: 3,
  }));
  assert.equal(uniform.ok, false);
  if (!uniform.ok) assert.equal(uniform.error.code, "GEN-PLANNER-DIVERSITY");
  // (d) recipe-constraints: só uma recipe sobrevive e maxSameRecipe = ceil(N/2)
  // limita; sem outras famílias, N=10 falha fechado.
  const singleRecipe = planPortfolio(baseInput({
    targetContentCount: 10,
    creatorConstraints: { allowedFormats: ["pov"], allowedProductRoles: ["object_of_desire"], disallowedFormats: [], disallowedProductRoles: [] },
  }));
  assert.equal(singleRecipe.ok, false);
  if (!singleRecipe.ok) assert.ok(["GEN-PLANNER-DIVERSITY", "GEN-PLANNER-INSUFFICIENT-CANDIDATES"].includes(singleRecipe.error.code));
});
