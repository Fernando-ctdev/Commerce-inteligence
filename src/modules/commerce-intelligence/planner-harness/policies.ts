// Etapa 3 — policies versionadas do harness, registradas em
// PLANNER_POLICY_REGISTRY. Autoridade única de pesos, cap, enumeração,
// complexidade, projeção de hook e desempates. Nenhuma implementação pode
// introduzir score, origem, limite ou desempate fora daqui. Todas as tabelas
// são congeladas recursivamente no load.
import type { PlannerPolicyVersion } from "./types";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value))
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const PLANNER_POLICY_REGISTRY = deepFreeze({
  PLANNER_POLICY_V1: {
    enumeration: "ENUMERATION_POLICY_V1",
    candidateCap: "CANDIDATE_CAP_POLICY_V1",
  },
  PLANNER_POLICY_V2: {
    enumeration: "ENUMERATION_POLICY_V2",
    selection: "LEXICOGRAPHIC_MMR_V2",
  },
});

export function isRegisteredPlannerPolicyVersion(value: string): value is PlannerPolicyVersion {
  return Object.prototype.hasOwnProperty.call(PLANNER_POLICY_REGISTRY, value);
}

// Pré-dedup e pré-cap. Exceder 4096 raw candidates falha
// GEN-PLANNER-ENUMERATION-LIMIT — nunca trunca.
export const ENUMERATION_POLICY_V1 = deepFreeze({ maxRawCandidates: 4096 });
export const ENUMERATION_POLICY_V2 = deepFreeze({ maxRawCandidates: 65_536 });

// candidateCap(N) >= N para todo N ∈ [1, 10]; cap < N é policy inválida.
export function candidateCap(targetContentCount: number): number {
  return Math.min(256, Math.max(32, 8 * targetContentCount));
}

// Complexidade por formato — completa para os 11 formatos `@1.3`.
// Formato fora da tabela: GEN-CS-REF (não existe na Skill) ou
// GEN-CS-ELIGIBILITY (existe sem production policy). Nunca zero implícito.
export const FORMAT_COMPLEXITY_V1: Readonly<Record<string, number | undefined>> = deepFreeze({
  pov: 250000,
  demonstration: 450000,
  try_on: 500000,
  unboxing: 350000,
  comparison: 550000,
  review: 300000,
  storytelling: 450000,
  sketch: 700000,
  showcase: 400000,
  visual_first: 300000,
  talk_first: 250000,
});

// Projeção legada attention → hookMechanism. Lookup case-sensitive, sem
// fallback; somente o primário attentionMechanisms[0] é projetado.
export const HOOK_MECHANISM_PROJECTION_POLICY_V1: Readonly<Record<string, string | undefined>> = deepFreeze({
  failure: "problem",
  visual_hook: "demonstration",
  result_first: "demonstration",
  reaction: "discovery",
  curiosity: "discovery",
  pattern_interrupt: "other",
  contrast: "objection",
  reveal: "discovery",
  movement: "demonstration",
  surprise: "discovery",
});

// Pesos em milésimos; escala [0, 1_000_000]; roundHalfUp inteiro.
export const PLANNER_WEIGHTS_V1 = deepFreeze({
  relevance: 150,
  commercialFit: 150,
  psychologicalFit: 100,
  creativeFit: 100,
  recipeFit: 100,
  novelty: 150,
  mechanismDiversity: 100,
  memoryDistance: 50,
  creatorFit: 100,
  productionComplexityPenalty: 50,
  recentRepetitionPenalty: 50,
});

export const PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2 = deepFreeze({
  noveltyTargets: { min: 0, max: 3 },
  targetContentCount: { min: 1, max: 10 },
});

// Policy exclusiva do Blueprint — sem noveltyTargets.
export const CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1 = deepFreeze({
  recipeId: { min: 0, max: 1 },
  attentionMechanisms: { min: 1, max: 2 },
  psychologicalEffects: { min: 1, max: 3 },
  format: { min: 1, max: 1 },
  narrativeMoves: { min: 1, max: 6 },
  productRole: { min: 1, max: 1 },
});

// Pesos de similaridade estrutural (÷ 1000) e penalidade MMR.
export const SIMILARITY_WEIGHTS_V1 = deepFreeze({
  commercialEffect: 250,
  psychologicalEffect: 200,
  recipe: 150,
  attentionMechanism: 150,
  format: 100,
  productRole: 50,
  narrativeShape: 100,
  mmrPenalty: 350,
});
