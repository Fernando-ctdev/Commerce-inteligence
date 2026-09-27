// Etapa 3 — tipos fechados do harness (ADR-033 / etapa3-requisitos §1.2).
// Função pura de harness: sem engine, worker, runtime, provider, Prisma, Tenant,
// quota, persistência, relógio, aleatoriedade global ou efeitos colaterais.
// Nenhum tipo aqui é persistido e nenhum runtime é alterado por esta etapa.

export type FixtureRef = string;

export type EvidenceRef = {
  id: string;
  field: string;
  valueHash: string;
};

export type InputEvidenceCatalog = {
  refs: readonly EvidenceRef[];
};

export type FactValue = string | number | boolean | null;

export type ProductFactsProjection = {
  fixtureProductRef: FixtureRef;
  fields: Readonly<Record<string, FactValue | readonly FactValue[]>>;
  evidenceRefs: readonly EvidenceRef[];
};

export type CommercialDiscoveryOpportunity = {
  sourceOpportunityId: string;
  commercialObjective: string;
  angle: string;
  coreMessage: string;
  desiredViewerResponse?: string;
  commercialEffects: readonly string[];
  audienceContext?: string;
  proofPattern?: string;
  evidenceRefs: readonly EvidenceRef[];
};

export type CommercialDiscoveryPool = {
  evidenceCatalog: InputEvidenceCatalog;
  opportunities: readonly CommercialDiscoveryOpportunity[];
};

export type CreatorConstraints = {
  allowedFormats: readonly string[];
  allowedProductRoles: readonly string[];
  disallowedFormats: readonly string[];
  disallowedProductRoles: readonly string[];
  maxDurationSeconds?: number;
  notes?: string;
};

export type ProductionConstraints = {
  maxDurationSeconds?: number;
};

export const PLANNER_MEMORY_SIGNALS_V1 = "PLANNER_MEMORY_SIGNALS_V1";

// Nove sinais aditivos, versão única vigente. Snapshot legado sem campo
// permanece sem campo; nenhuma retrofabricação de sinais.
export type PlannerMemorySignals = {
  signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1";
  recipeId?: string;
  attentionMechanisms: readonly string[];
  psychologicalEffects: readonly string[];
  format?: string;
  productRole?: string;
  narrativeShape: readonly string[];
  commercialEffects?: readonly string[];
  audienceContext?: string;
  proofPattern?: string;
};

export type EmptyMemorySnapshot = Record<string, never>;

export type MemorySnapshotInput = EmptyMemorySnapshot | {
  signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1";
  signals: readonly PlannerMemorySignals[];
};

// Runtime exato: apenas o objeto vazio literal. null, array, chave própria
// (string ou símbolo) ou prototype diferente falham.
export function isEmptyMemorySnapshot(value: unknown): value is EmptyMemorySnapshot {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === 0;
}

export type HarnessSkillBinding = {
  platformSkillVersion: string;
  creativeSystemVersion: string;
  source: "frozen-harness-fixture";
};

export type AcceptedHarnessSkillBinding = {
  platformSkillVersion: "tiktok-commerce@1.3";
  creativeSystemVersion: "1.3";
  source: "frozen-harness-fixture";
};

// Blueprint estrutural — decision data, nunca texto final. `noveltyTargets`
// NÃO pertence ao Blueprint; Blueprint com o campo é GEN-CS-SCHEMA.
export type CreativeBlueprint = {
  recipeId?: string;
  attentionMechanisms: readonly string[];
  psychologicalEffects: readonly string[];
  format: string;
  narrativeMoves: readonly string[];
  productRole: string;
};

export type CreativeBlueprintEnvelope = {
  blueprintContractVersion: "1";
  blueprint: CreativeBlueprint;
  creativeSystemVersion: "1.3";
  platformSkillVersion: "tiktok-commerce@1.3";
};

export type PlannedOpportunityV2 = {
  opportunityContractVersion: "2";
  candidateKey: string;
  position: number;
  sourceOpportunityId: string;
  evidenceRefs: readonly EvidenceRef[];
  commercialObjective: string;
  angle: string;
  coreMessage: string;
  desiredViewerResponse?: string;
  noveltyTargets: readonly string[];
  blueprint: CreativeBlueprintEnvelope;
  hookMechanism: string;
};

// Policy fechada: único valor registrado; desconhecido falha
// GEN-PLANNER-POLICY antes da enumeração.
export type PlannerPolicyVersion = "PLANNER_POLICY_V1";

export type PlannerInput = {
  fixtureId: string;
  targetContentCount: number;
  productFacts: ProductFactsProjection;
  commercialDiscovery: CommercialDiscoveryPool;
  creatorConstraints: CreatorConstraints;
  productionConstraints: ProductionConstraints;
  skillBinding: HarnessSkillBinding;
  inputMemorySnapshot: MemorySnapshotInput;
  seed: string;
  plannerPolicyVersion: PlannerPolicyVersion;
};

export type PlannerOutput = {
  opportunities: readonly PlannedOpportunityV2[];
  plannerPolicyVersion: PlannerPolicyVersion;
  skillBinding: AcceptedHarnessSkillBinding;
  seed: string;
};

// Exatamente 17 códigos (12 GEN-PLANNER-* + 5 GEN-CS-*). Falha é retorno
// tipado do harness — nunca estado persistido, nunca erro de infraestrutura,
// nunca reconciliação de quota.
export type PlannerFailureCode =
  | "GEN-PLANNER-INPUT"
  | "GEN-PLANNER-CANONICAL"
  | "GEN-PLANNER-ENUMERATION-LIMIT"
  | "GEN-PLANNER-SOURCE"
  | "GEN-PLANNER-EVIDENCE"
  | "GEN-PLANNER-SCORE-INPUT"
  | "GEN-PLANNER-MEMORY"
  | "GEN-PLANNER-NO-CANDIDATES"
  | "GEN-PLANNER-INSUFFICIENT-CANDIDATES"
  | "GEN-PLANNER-DIVERSITY"
  | "GEN-PLANNER-POLICY"
  | "GEN-PLANNER-HOOK-PROJECTION"
  | "GEN-CS-VERSION"
  | "GEN-CS-SCHEMA"
  | "GEN-CS-REF"
  | "GEN-CS-COMPAT"
  | "GEN-CS-ELIGIBILITY";

export type PlannerFailurePhase = "input" | "skill" | "enumeration" | "eligibility" | "selection";

export type PlannerFailure = {
  code: PlannerFailureCode;
  phase: PlannerFailurePhase;
  field?: string;
  candidateKey?: string;
  sourceOpportunityId?: string;
  message: string;
  sanitized: Readonly<Record<string, string | number | boolean | null>>;
  plannerPolicyVersion: PlannerPolicyVersion;
  skillBinding: HarnessSkillBinding;
};

export type ScoreFeatureOrigin =
  | "validated-evidence"
  | "creative-system"
  | "planner-policy"
  | "validated-memory"
  | "creator-constraints";

export type ScoreFeature = {
  value: number; // inteiro [0, 1_000_000]
  origin: ScoreFeatureOrigin;
  evidenceRefs: readonly EvidenceRef[];
};

export type CandidateScoreInputs = {
  relevance: ScoreFeature;
  commercialFit: ScoreFeature;
  psychologicalFit: ScoreFeature;
  creativeFit: ScoreFeature;
  recipeFit: ScoreFeature;
  novelty: ScoreFeature;
  mechanismDiversity: ScoreFeature;
  memoryDistance: ScoreFeature;
  creatorFit: ScoreFeature;
  productionComplexity: ScoreFeature;
  recentRepetition: ScoreFeature;
};
