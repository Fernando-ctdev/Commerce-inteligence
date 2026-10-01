// Etapa 3 — planPortfolio: função pura do harness (ADR-029 vigente; nada
// deste módulo é ligado ao runtime). Sequência normativa: validate input →
// skill binding → enumerate → canonicalize/validate/dedup → capOrderKey →
// candidateCap → score → exact-N. Duration é validada somente aqui, pré-Skill
// e pré-enumeração, e nunca atinge candidate, score, ranking, diversity,
// tie-break, selection ou runtime. Sem Prisma, Tenant, quota, provider, calls,
// persistência, relógio ou aleatoriedade global.
import {
  assertEligibleFormat,
  assertFreeCompositionCooccurrence,
  loadCreativeSystem,
  resolveBlueprint,
  type CreativeSystem,
} from "../creative-system";
import {
  canonicalCandidateKey,
  canonicalOrdered,
  canonicalSerialization,
  canonicalSet,
  compareUtf8,
  memorySignalKey,
  nfc,
  sha256Hex,
  tieHash,
} from "./canonical";
import {
  candidateCap,
  CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1,
  ENUMERATION_POLICY_V1,
  ENUMERATION_POLICY_V2,
  FORMAT_COMPLEXITY_V1,
  HOOK_MECHANISM_PROJECTION_POLICY_V1,
  isRegisteredPlannerPolicyVersion,
  PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2,
  PLANNER_WEIGHTS_V1,
  SIMILARITY_WEIGHTS_V1,
} from "./policies";
import type {
  CandidateScoreInputs,
  CommercialDiscoveryOpportunity,
  CommercialDiscoveryPool,
  CreativeBlueprint,
  EvidenceRef,
  HarnessSkillBinding,
  MemorySnapshotInput,
  PlannerFailure,
  PlannerFailureCode,
  PlannerInput,
  PlannerMemorySignals,
  PlannerOutput,
  PlannedOpportunityV2,
  ScoreFeature,
  ScoreFeatureOrigin,
} from "./types";
import { isEmptyMemorySnapshot, PLANNER_MEMORY_SIGNALS_V1 } from "./types";

const ACCEPTED_SKILL_BINDING = {
  platformSkillVersion: "tiktok-commerce@1.3",
  creativeSystemVersion: "1.3",
  source: "frozen-harness-fixture",
} as const;

const SCALE = 1_000_000;

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

function norm(ratio01: number): number {
  return roundHalfUp(SCALE * Math.min(1, Math.max(0, ratio01)));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function ratio(numerator: number, denominator: number): number {
  return norm(clamp01(numerator / Math.max(1, denominator)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isEvidenceRef(value: unknown): value is EvidenceRef {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.field)
    && isNonEmptyString(value.valueHash);
}

function sameEvidenceRef(a: EvidenceRef, b: EvidenceRef): boolean {
  return a.id === b.id && a.field === b.field && a.valueHash === b.valueHash;
}

function isIntegerInSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
    && value >= 1 && value <= 3600;
}

function arraysEqualCanonical(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function setsEqualCanonical(a: readonly string[], b: readonly string[]): boolean {
  return canonicalSerialization(canonicalSet(a)) === canonicalSerialization(canonicalSet(b));
}

// Score-input inválido é uma falha do harness, nunca exceção de runtime.
class ScoreInputError extends Error {
  readonly harnessScoreInput = true;
}

function feature(value: number, origin: ScoreFeatureOrigin, refs: readonly EvidenceRef[] = []): ScoreFeature {
  if (!Number.isInteger(value) || value < 0 || value > SCALE)
    throw new ScoreInputError("score input fora de [0, 1_000_000]");
  return { value, origin, evidenceRefs: refs };
}

type ValidatedMemory = {
  snapshotBytes: string;
  signals: readonly PlannerMemorySignals[];
};

function harnessFailure(
  code: PlannerFailureCode,
  phase: PlannerFailure["phase"],
  policyVersion: PlannerInput["plannerPolicyVersion"],
  skillBinding: HarnessSkillBinding,
  extras: { field?: string; candidateKey?: string; sourceOpportunityId?: string; message: string; sanitized?: Readonly<Record<string, string | number | boolean | null>> },
): PlannerFailure {
  return {
    code,
    phase,
    ...(extras.field === undefined ? {} : { field: extras.field }),
    ...(extras.candidateKey === undefined ? {} : { candidateKey: extras.candidateKey }),
    ...(extras.sourceOpportunityId === undefined ? {} : { sourceOpportunityId: extras.sourceOpportunityId }),
    message: extras.message,
    sanitized: extras.sanitized ?? {},
    plannerPolicyVersion: policyVersion,
    skillBinding,
  };
}

function isGenerationErrorWithCode(error: unknown, code: string): boolean {
  return isRecord(error) && (error as { name?: unknown }).name === "GenerationError"
    && (error as { code?: unknown }).code === code;
}

// ---------- validatePlannerInput (pré-Skill, pré-enumeração) ----------

type ValidatedInput = {
  targetContentCount: number;
  seed: string;
  memory: ValidatedMemory;
};

function validateMemorySnapshot(input: MemorySnapshotInput, policyVersion: PlannerInput["plannerPolicyVersion"], skillBinding: HarnessSkillBinding): ValidatedMemory {
  const memoryFailure = (message: string, field?: string): PlannerFailure =>
    harnessFailure("GEN-PLANNER-MEMORY", "input", policyVersion, skillBinding, { message, ...(field === undefined ? {} : { field }) });
  const ALLOWED_SNAPSHOT_KEYS = new Set(["signalsSchemaVersion", "signals"]);
  const ALLOWED_SIGNAL_KEYS = new Set([
    "signalsSchemaVersion", "recipeId", "attentionMechanisms", "psychologicalEffects", "format",
    "productRole", "narrativeShape", "commercialEffects", "audienceContext", "proofPattern",
  ]);
  const REQUIRED_SIGNAL_KEYS = ["signalsSchemaVersion", "attentionMechanisms", "psychologicalEffects", "narrativeShape"];
  if (isEmptyMemorySnapshot(input)) return { snapshotBytes: canonicalSerialization(input), signals: [] };
  // Forma não vazia: prototype Object.prototype e chaves próprias exatas.
  // Propriedades herdadas e chaves-símbolo falham: toda chave consumida deve
  // ser own key presente no Set.
  if (!isRecord(input) || Object.getPrototypeOf(input) !== Object.prototype)
    throw memoryFailure("snapshot de memória inválido");
  const ownKeys = Reflect.ownKeys(input);
  const ownSnapshotKeys = new Set(ownKeys.filter((key): key is string => typeof key === "string"));
  if (ownKeys.length !== ownSnapshotKeys.size) throw memoryFailure("chave símbolo não permitida");
  if (ownSnapshotKeys.size !== ALLOWED_SNAPSHOT_KEYS.size
    || ![...ALLOWED_SNAPSHOT_KEYS].every((key) => ownSnapshotKeys.has(key)))
    throw memoryFailure("chaves de snapshot inesperadas");
  for (const field of ALLOWED_SNAPSHOT_KEYS)
    if ((field in input) && !ownSnapshotKeys.has(field))
      throw memoryFailure("campo herdado não é own property", field);
  if (typeof input.signalsSchemaVersion !== "string" || input.signalsSchemaVersion !== PLANNER_MEMORY_SIGNALS_V1)
    throw memoryFailure("signalsSchemaVersion desconhecida", "signalsSchemaVersion");
  if (!Array.isArray(input.signals)) throw memoryFailure("signals inválidos", "signals");
  const signals: PlannerMemorySignals[] = input.signals.map((entry) => {
    if (!isRecord(entry) || Object.getPrototypeOf(entry) !== Object.prototype)
      throw memoryFailure("sinal de memória inválido");
    const ownSignalKeys = new Set(Reflect.ownKeys(entry).filter((key): key is string => typeof key === "string"));
    if (Reflect.ownKeys(entry).length !== ownSignalKeys.size)
      throw memoryFailure("chave símbolo não permitida no sinal");
    if (!REQUIRED_SIGNAL_KEYS.every((key) => ownSignalKeys.has(key)))
      throw memoryFailure("sinal sem dimensão obrigatória");
    for (const field of ALLOWED_SIGNAL_KEYS)
      if ((field in entry) && !ownSignalKeys.has(field))
        throw memoryFailure("campo herdado não é own property", field);
    if (entry.signalsSchemaVersion !== PLANNER_MEMORY_SIGNALS_V1)
      throw memoryFailure("signalsSchemaVersion do sinal desconhecida");
    const stringArray = (value: unknown, field: string): readonly string[] => {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim() !== ""))
        throw memoryFailure(`dimensão ${field} do sinal inválida`, field);
      return (value as string[]).map(nfc);
    };
    const optionalString = (value: unknown, field: string): string | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== "string" || value.trim() === "") throw memoryFailure(`dimensão ${field} do sinal inválida`, field);
      return nfc(value);
    };
    return {
      signalsSchemaVersion: PLANNER_MEMORY_SIGNALS_V1,
      recipeId: optionalString(entry.recipeId, "recipeId"),
      attentionMechanisms: stringArray(entry.attentionMechanisms, "attentionMechanisms"),
      psychologicalEffects: stringArray(entry.psychologicalEffects, "psychologicalEffects"),
      format: optionalString(entry.format, "format"),
      productRole: optionalString(entry.productRole, "productRole"),
      narrativeShape: stringArray(entry.narrativeShape, "narrativeShape"),
      commercialEffects: entry.commercialEffects === undefined ? [] : stringArray(entry.commercialEffects, "commercialEffects"),
      audienceContext: optionalString(entry.audienceContext, "audienceContext"),
      proofPattern: optionalString(entry.proofPattern, "proofPattern"),
    };
  });
  return { snapshotBytes: canonicalSerialization(input), signals };
}

type ValidatedInputFull = {
  fixtureId: string;
  targetContentCount: number;
  seed: string;
  memory: ValidatedMemory;
};

function validatePlannerInput(input: PlannerInput): ValidatedInputFull {
  const inputFailure = (field: string, message: string): PlannerFailure =>
    harnessFailure("GEN-PLANNER-INPUT", "input", input.plannerPolicyVersion, input.skillBinding, { field, message });
  if (!isRegisteredPlannerPolicyVersion(input.plannerPolicyVersion))
    throw harnessFailure("GEN-PLANNER-POLICY", "input", "PLANNER_POLICY_V1", input.skillBinding,
      { field: "plannerPolicyVersion", message: "policy version desconhecida" });
  if (!isNonEmptyString(input.fixtureId)) throw inputFailure("fixtureId", "fixtureId obrigatório");
  const countPolicy = PLANNED_OPPORTUNITY_CARDINALITY_POLICY_V2.targetContentCount;
  if (!Number.isInteger(input.targetContentCount)
    || input.targetContentCount < countPolicy.min || input.targetContentCount > countPolicy.max)
    throw inputFailure("targetContentCount", `targetContentCount deve ser inteiro ${countPolicy.min}..${countPolicy.max}`);
  if (!isNonEmptyString(input.seed)) throw inputFailure("seed", "seed obrigatório");
  if (!isRecord(input.productFacts) || !Array.isArray(input.productFacts.evidenceRefs)
    || !input.productFacts.evidenceRefs.every(isEvidenceRef))
    throw inputFailure("productFacts", "productFacts inválido");
  if (!isRecord(input.commercialDiscovery) || !isRecord(input.commercialDiscovery.evidenceCatalog)
    || !Array.isArray(input.commercialDiscovery.evidenceCatalog.refs)
    || !input.commercialDiscovery.evidenceCatalog.refs.every(isEvidenceRef)
    || !Array.isArray(input.commercialDiscovery.opportunities))
    throw inputFailure("commercialDiscovery", "commercialDiscovery inválido");
  for (const opportunity of input.commercialDiscovery.opportunities) {
    if (!isRecord(opportunity))
      throw inputFailure("commercialDiscovery.opportunities", "oportunidade inválida");
    // Falha fechada ANTES de qualquer map/spread/score: campos consumidos
    // pela enumeração, projeção e score nunca chegam inválidos ao pipeline.
    if (!isNonEmptyString(opportunity.sourceOpportunityId))
      throw harnessFailure("GEN-PLANNER-SOURCE", "input", input.plannerPolicyVersion, input.skillBinding,
        { field: "commercialDiscovery.opportunities", message: "sourceOpportunityId ausente" });
    if (!isNonEmptyString(opportunity.commercialObjective)
      || !isNonEmptyString(opportunity.angle)
      || !isNonEmptyString(opportunity.coreMessage))
      throw inputFailure("commercialDiscovery.opportunities", "campos comerciais obrigatórios ausentes ou inválidos");
    if (!Array.isArray(opportunity.commercialEffects)
      || !opportunity.commercialEffects.every((effect: unknown) => isNonEmptyString(effect)))
      throw inputFailure("commercialEffects", "commercialEffects deve ser array de strings não vazias");
    for (const optionalField of ["desiredViewerResponse", "audienceContext", "proofPattern"] as const) {
      const value = opportunity[optionalField];
      if (value !== undefined && !isNonEmptyString(value))
        throw inputFailure(`commercialDiscovery.opportunities.${optionalField}`, `${optionalField} inválido`);
    }
    if (!Array.isArray(opportunity.evidenceRefs) || opportunity.evidenceRefs.length === 0
      || !opportunity.evidenceRefs.every(isEvidenceRef))
      throw inputFailure("commercialDiscovery.opportunities", "oportunidade da Discovery inválida");
  }
  const seenPoolSources = new Set<string>();
  for (const opportunity of input.commercialDiscovery.opportunities) {
    if (seenPoolSources.has(opportunity.sourceOpportunityId as string))
      throw harnessFailure("GEN-PLANNER-SOURCE", "input", input.plannerPolicyVersion, input.skillBinding,
        { field: "commercialDiscovery.opportunities", sourceOpportunityId: String(opportunity.sourceOpportunityId), message: "sourceOpportunityId repetido na Discovery" });
    seenPoolSources.add(opportunity.sourceOpportunityId as string);
  }
  const constraints = input.creatorConstraints;
  if (!isRecord(constraints)
    || !Array.isArray(constraints.allowedFormats) || !constraints.allowedFormats.every(isNonEmptyString)
    || !Array.isArray(constraints.allowedProductRoles) || !constraints.allowedProductRoles.every(isNonEmptyString)
    || !Array.isArray(constraints.disallowedFormats) || !constraints.disallowedFormats.every(isNonEmptyString)
    || !Array.isArray(constraints.disallowedProductRoles) || !constraints.disallowedProductRoles.every(isNonEmptyString))
    throw inputFailure("creatorConstraints", "creatorConstraints inválido");
  for (const [field, value] of [
    ["creatorConstraints.maxDurationSeconds", constraints.maxDurationSeconds],
    ["productionConstraints.maxDurationSeconds", input.productionConstraints?.maxDurationSeconds],
  ] as const) {
    if (value !== undefined && !isIntegerInSeconds(value))
      throw inputFailure(field, "maxDurationSeconds deve ser inteiro em segundos 1..3600");
  }
  const creatorMax = constraints.maxDurationSeconds;
  const productionMax = input.productionConstraints?.maxDurationSeconds;
  if (creatorMax !== undefined && productionMax !== undefined && creatorMax > productionMax)
    throw harnessFailure("GEN-CS-ELIGIBILITY", "input", input.plannerPolicyVersion, input.skillBinding,
      { field: "maxDurationSeconds", message: "creator maxDurationSeconds maior que production" });
  if (!isRecord(input.skillBinding)
    || !isNonEmptyString((input.skillBinding as HarnessSkillBinding).platformSkillVersion)
    || !isNonEmptyString((input.skillBinding as HarnessSkillBinding).creativeSystemVersion)
    || (input.skillBinding as HarnessSkillBinding).source !== (input.plannerPolicyVersion === "PLANNER_POLICY_V2" ? "runtime-skill" : "frozen-harness-fixture"))
    throw inputFailure("skillBinding", "skillBinding inválido");
  return {
    fixtureId: input.fixtureId,
    targetContentCount: input.targetContentCount,
    seed: input.seed,
    memory: validateMemorySnapshot(input.inputMemorySnapshot, input.plannerPolicyVersion, input.skillBinding),
  };
}

// ---------- Blueprint: schema/cardinalidade do harness ----------

const BLUEPRINT_FIELDS: Readonly<Record<string, true>> = {
  recipeId: true,
  attentionMechanisms: true,
  psychologicalEffects: true,
  format: true,
  narrativeMoves: true,
  productRole: true,
};

function validateBlueprintShapeAndCardinality(
  blueprint: Record<string, unknown>,
  policyVersion: PlannerInput["plannerPolicyVersion"],
  skillBinding: HarnessSkillBinding,
  sourceOpportunityId: string,
): void {
  const schemaFailure = (field: string, message: string): PlannerFailure =>
    harnessFailure("GEN-CS-SCHEMA", "eligibility", policyVersion, skillBinding,
      { field, sourceOpportunityId, message });
  for (const key of Object.keys(blueprint))
    if (!(key in BLUEPRINT_FIELDS))
      throw schemaFailure(key, `campo ${key} não pertence ao Blueprint`);
  const card = CREATIVE_BLUEPRINT_CARDINALITY_POLICY_V1;
  const attention = blueprint.attentionMechanisms;
  if (!Array.isArray(attention) || attention.length < card.attentionMechanisms.min
    || attention.length > card.attentionMechanisms.max)
    throw schemaFailure("attentionMechanisms", "attentionMechanisms deve ter 1..2 IDs");
  const effects = blueprint.psychologicalEffects;
  if (!Array.isArray(effects) || effects.length < card.psychologicalEffects.min || effects.length > card.psychologicalEffects.max)
    throw schemaFailure("psychologicalEffects", "psychologicalEffects deve ter 1..3 IDs");
  const moves = blueprint.narrativeMoves;
  if (!Array.isArray(moves) || moves.length < card.narrativeMoves.min || moves.length > card.narrativeMoves.max)
    throw schemaFailure("narrativeMoves", "narrativeMoves deve ter 1..6 moves ordenados");
  if (typeof blueprint.format !== "string" || blueprint.format.trim() === "")
    throw schemaFailure("format", "format inválido");
  if (typeof blueprint.productRole !== "string" || blueprint.productRole.trim() === "")
    throw schemaFailure("productRole", "productRole inválido");
  if (blueprint.recipeId !== undefined && (typeof blueprint.recipeId !== "string" || blueprint.recipeId.trim() === ""))
    throw schemaFailure("recipeId", "recipeId inválido");
}

// ---------- Candidato interno e enumeração ----------

type RawCandidate = {
  sourceOpportunityId: string;
  source: CommercialDiscoveryOpportunity;
  evidenceRefs: readonly EvidenceRef[];
  blueprint: CreativeBlueprint;
  noveltyTargets: readonly string[];
};

function enumerateRawCandidates(input: PlannerInput, creativeSystemValue: CreativeSystem): RawCandidate[] {
  const raw: RawCandidate[] = [];
  const sources = [...input.commercialDiscovery.opportunities]
    .sort((a, b) => compareUtf8(a.sourceOpportunityId, b.sourceOpportunityId));
  const recipes = [...creativeSystemValue.recipes].sort((a, b) => compareUtf8(a.id, b.id));
  const attentionVariants = [...creativeSystemValue.attentionMechanisms].sort((a, b) => compareUtf8(a, b));
  const effectVariants = [...creativeSystemValue.psychologicalEffects].sort((a, b) => compareUtf8(a, b));
  const variantCount = Math.min(2, attentionVariants.length, effectVariants.length);
  const matrix = creativeSystemValue.compatibility.formatsByProductRole;
  for (const source of sources) {
    for (const recipe of recipes) {
      // Recipe-backed: attentionMechanisms é ORDERED — preserva a ordem
      // declarada da recipe; o primário é o declarado [0]. Effects são
      // set-like e preservam a declaração sem reordenação.
      raw.push({
        sourceOpportunityId: source.sourceOpportunityId,
        source,
        evidenceRefs: source.evidenceRefs,
        blueprint: {
          recipeId: recipe.id,
          attentionMechanisms: [...recipe.attentionMechanisms].slice(0, 2),
          psychologicalEffects: [...recipe.psychologicalEffects].slice(0, 3),
          format: [...recipe.formats][0]!,
          narrativeMoves: [...recipe.narrativeMoves],
          productRole: [...recipe.productRoles][0]!,
        },
        noveltyTargets: [],
      });
    }
    // Free composition: pares declarados na matriz da Skill, três variantes
    // (atenção primária × efeito psicológico). Enumeração isolada de
    // format/role nunca é suficiente.
    for (const role of Object.keys(matrix).sort(compareUtf8)) {
      for (const format of [...(matrix[role] ?? [])].sort((a, b) => compareUtf8(a, b))) {
        for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
          const attention = attentionVariants[variantIndex % attentionVariants.length]!;
          const psychologicalEffect = effectVariants[variantIndex % effectVariants.length]!;
          raw.push({
            sourceOpportunityId: source.sourceOpportunityId,
            source,
            evidenceRefs: source.evidenceRefs,
            blueprint: {
              attentionMechanisms: [attention],
              psychologicalEffects: [psychologicalEffect],
              format,
              narrativeMoves: ["setup", "payoff"],
              productRole: role,
            },
            noveltyTargets: [],
          });
        }
      }
    }
    if (isEnumerationLimitExceeded(raw.length))
      throw harnessFailure("GEN-PLANNER-ENUMERATION-LIMIT", "enumeration", input.plannerPolicyVersion, input.skillBinding,
        { message: "maxRawCandidates excedido antes de dedup/cap", sanitized: { rawCandidates: raw.length, maxRawCandidates: ENUMERATION_POLICY_V1.maxRawCandidates, sources: sources.length } });
  }
  if (isEnumerationLimitExceeded(raw.length))
    throw harnessFailure("GEN-PLANNER-ENUMERATION-LIMIT", "enumeration", input.plannerPolicyVersion, input.skillBinding,
      { message: "maxRawCandidates excedido antes de dedup/cap", sanitized: { rawCandidates: raw.length, maxRawCandidates: ENUMERATION_POLICY_V1.maxRawCandidates, sources: sources.length } });
  return raw;
}

// Predicado puro do limite (seam de teste e uso interno no enumerate).
export function isEnumerationLimitExceeded(rawCandidates: number): boolean {
  return rawCandidates > ENUMERATION_POLICY_V1.maxRawCandidates;
}

type EligibilityContext = {
  pool: ReadonlyMap<string, CommercialDiscoveryOpportunity>;
  catalogRefs: readonly EvidenceRef[];
  creatorConstraints: PlannerInput["creatorConstraints"];
  creativeSystemValue: CreativeSystem;
  policyVersion: PlannerInput["plannerPolicyVersion"];
  skillBinding: HarnessSkillBinding;
};

// Identity de EvidenceRef: serialização canônica estruturada — nunca
// concatenação delimitada (NUL/vírgula), que seria ambígua para IDs contendo
// os delimitadores. id/field/valueHash são preservados exatamente.
function evidenceRefKey(ref: EvidenceRef): string {
  return canonicalSerialization({
    id: ref.id,
    field: ref.field,
    valueHash: ref.valueHash,
  });
}

// Test seam e passo de elegibilidade do planPortfolio. Falhas de dados
// (source/ref/schema/compat/projeção/production policy) são terminais;
// GEN-CS-ELIGIBILITY de creator constraints apenas elimina o candidate
// (retorno null) — o exact-N continua com os elegíveis.
export function evaluateCandidateEligibility(candidate: RawCandidate, context: EligibilityContext): EligibleCandidate | null {
  const fail = (code: PlannerFailureCode, field: string, message: string): PlannerFailure =>
    harnessFailure(code, "eligibility", context.policyVersion, context.skillBinding,
      { field, sourceOpportunityId: candidate.sourceOpportunityId, message });
  const source = context.pool.get(candidate.sourceOpportunityId);
  if (source === undefined) throw fail("GEN-CS-REF", "sourceOpportunityId", "origem inexistente na Discovery");
  if (candidate.evidenceRefs.length === 0) throw fail("GEN-PLANNER-EVIDENCE", "evidenceRefs", "evidenceRefs ausentes");
  validateBlueprintShapeAndCardinality(candidate.blueprint as Record<string, unknown>, context.policyVersion, context.skillBinding, candidate.sourceOpportunityId);
  const catalog = new Map<string, EvidenceRef>();
  for (const ref of context.catalogRefs) catalog.set(evidenceRefKey(ref), ref);
  const validated: EvidenceRef[] = [];
  for (const ref of candidate.evidenceRefs) {
    const known = catalog.get(evidenceRefKey(ref));
    if (known === undefined) throw fail("GEN-PLANNER-EVIDENCE", "evidenceRefs", "ref fora da fronteira autorizada");
    validated.push(known);
  }
  try {
    resolveBlueprint(context.creativeSystemValue, {
      ...(candidate.blueprint.recipeId === undefined ? {} : { recipeId: candidate.blueprint.recipeId }),
      attentionMechanisms: candidate.blueprint.attentionMechanisms,
      psychologicalEffects: candidate.blueprint.psychologicalEffects,
      format: candidate.blueprint.format,
      narrativeMoves: candidate.blueprint.narrativeMoves,
      productRole: candidate.blueprint.productRole,
    });
    if (context.policyVersion === "PLANNER_POLICY_V2" && candidate.blueprint.recipeId === undefined)
      assertFreeCompositionCooccurrence(context.creativeSystemValue, candidate.blueprint);
    if (FORMAT_COMPLEXITY_V1[candidate.blueprint.format] === undefined) {
      const formatInSkill = context.creativeSystemValue.formats.includes(candidate.blueprint.format);
      throw fail(formatInSkill ? "GEN-CS-ELIGIBILITY" : "GEN-CS-REF", "format", "formato sem production policy");
    }
    const primary = candidate.blueprint.attentionMechanisms[0]!;
    const hookMechanism = HOOK_MECHANISM_PROJECTION_POLICY_V1[primary];
    if (hookMechanism === undefined)
      throw fail("GEN-PLANNER-HOOK-PROJECTION", "attentionMechanisms", "attention primário sem projeção legada");
    const allowedFormats = context.creatorConstraints.allowedFormats;
    if (allowedFormats.length > 0 && !allowedFormats.includes(candidate.blueprint.format)) return null;
    const allowedRoles = context.creatorConstraints.allowedProductRoles;
    if (allowedRoles.length > 0 && !allowedRoles.includes(candidate.blueprint.productRole)) return null;
    if (context.creatorConstraints.disallowedFormats.includes(candidate.blueprint.format)
      || context.creatorConstraints.disallowedProductRoles.includes(candidate.blueprint.productRole)) return null;
    const candidateKey = canonicalCandidateKey({
      sourceOpportunityId: candidate.sourceOpportunityId,
      evidenceRefs: validated,
      recipeId: candidate.blueprint.recipeId,
      attentionMechanisms: candidate.blueprint.attentionMechanisms,
      psychologicalEffects: candidate.blueprint.psychologicalEffects,
      format: candidate.blueprint.format,
      narrativeMoves: candidate.blueprint.narrativeMoves,
      productRole: candidate.blueprint.productRole,
      angle: source.angle,
      noveltyTargets: candidate.noveltyTargets,
    });
    return { ...candidate, hookMechanism, candidateKey, validatedEvidenceRefs: validated };
  } catch (error: unknown) {
    for (const code of ["GEN-CS-SCHEMA", "GEN-CS-REF", "GEN-CS-COMPAT"] as const)
      if (isGenerationErrorWithCode(error, code))
        throw harnessFailure(code, "eligibility", context.policyVersion, context.skillBinding,
          { field: "blueprint", sourceOpportunityId: candidate.sourceOpportunityId, message: "Blueprint rejeitado pelo resolvedor Creative System" });
    throw error;
  }
}

// ---------- Score ----------

// Similaridade por campo: effects (comercial/psicológico) e atenção são
// SET-LIKE (igualdade canônica de conjunto, ordem irrelevante);
// narrativeShape é ORDERED (mesma sequência); recipe/format/role são escalares.
function fieldSimilarity(a: readonly string[], b: readonly string[], mode: "set" | "ordered"): number {
  if (a.length === 0 || b.length === 0) return 0;
  const equal = mode === "set" ? setsEqualCanonical(a, b) : arraysEqualCanonical(a, b);
  return equal ? SCALE : 0;
}

function scalarSimilarity(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined || a === "" || b === "") return 0;
  return a === b ? SCALE : 0;
}

function structuralSimilarity(candidate: EligibleCandidate, signal: PlannerMemorySignals): number {
  const w = SIMILARITY_WEIGHTS_V1;
  const signalCommercial = signal.commercialEffects ?? [];
  const weighted =
    w.commercialEffect * fieldSimilarity([...candidate.source.commercialEffects], [...signalCommercial], "set")
    + w.psychologicalEffect * fieldSimilarity([...candidate.blueprint.psychologicalEffects], [...signal.psychologicalEffects], "set")
    + w.recipe * scalarSimilarity(candidate.blueprint.recipeId, signal.recipeId)
    + w.attentionMechanism * scalarSimilarity(candidate.blueprint.attentionMechanisms[0]!, signal.attentionMechanisms[0])
    + w.format * scalarSimilarity(candidate.blueprint.format, signal.format)
    + w.productRole * scalarSimilarity(candidate.blueprint.productRole, signal.productRole)
    + w.narrativeShape * fieldSimilarity([...candidate.blueprint.narrativeMoves], [...signal.narrativeShape], "ordered");
  return roundHalfUp(weighted / 1000);
}

function memoryDimensionMatches(candidate: EligibleCandidate, signals: readonly PlannerMemorySignals[]): boolean[] {
  const blueprint = candidate.blueprint;
  const setCoincide = (
    candidateValue: readonly string[],
    read: (signal: PlannerMemorySignals) => readonly string[] | undefined,
  ): boolean =>
    candidateValue.length > 0
    && signals.some((signal) => {
      const value = read(signal);
      return value !== undefined && value.length > 0 && setsEqualCanonical(candidateValue, value);
    });
  const orderedCoincide = (
    candidateValue: readonly string[],
    read: (signal: PlannerMemorySignals) => readonly string[] | undefined,
  ): boolean =>
    candidateValue.length > 0
    && signals.some((signal) => {
      const value = read(signal);
      return value !== undefined && value.length > 0 && arraysEqualCanonical(candidateValue, value);
    });
  const scalarCoincide = (
    candidateValue: string | undefined,
    read: (signal: PlannerMemorySignals) => string | undefined,
  ): boolean =>
    candidateValue !== undefined && candidateValue !== ""
    && signals.some((signal) => read(signal) === candidateValue);
  // Nove dimensões: effects (comercial/psicológico) são SET-LIKE; atenção é
  // comparada pelo PRIMÁRIO ordered; narrativeShape é ORDERED; escalares por
  // igualdade exata.
  return [
    scalarCoincide(blueprint.recipeId, (signal) => signal.recipeId),
    scalarCoincide(blueprint.attentionMechanisms[0]!, (signal) => signal.attentionMechanisms[0]),
    setCoincide([...blueprint.psychologicalEffects], (signal) => signal.psychologicalEffects),
    scalarCoincide(blueprint.format, (signal) => signal.format),
    scalarCoincide(blueprint.productRole, (signal) => signal.productRole),
    orderedCoincide(blueprint.narrativeMoves, (signal) => signal.narrativeShape),
    setCoincide([...candidate.source.commercialEffects], (signal) => signal.commercialEffects),
    scalarCoincide(candidate.source.audienceContext, (signal) => signal.audienceContext),
    scalarCoincide(candidate.source.proofPattern, (signal) => signal.proofPattern),
  ];
}

type ScoredCandidate = { candidate: EligibleCandidate; rankScore: number; inputs: CandidateScoreInputs };

export type EligibleCandidate = RawCandidate & {
  candidateKey: string;
  hookMechanism: string;
  validatedEvidenceRefs: readonly EvidenceRef[];
};

function scoreCappedCandidate(
  candidate: EligibleCandidate,
  poolP: readonly EligibleCandidate[],
  memory: ValidatedMemory,
  productFactsRefs: readonly EvidenceRef[],
  skillPsychologicalEffects: readonly string[],
  creatorConstraints: PlannerInput["creatorConstraints"],
): ScoredCandidate {
  const refs = candidate.validatedEvidenceRefs;
  const relevanceRefs = refs.filter((ref) => productFactsRefs.some((factRef) => sameEvidenceRef(ref, factRef)));
  const source = candidate.source;
  const blueprint = candidate.blueprint;
  const primaryAttention = blueprint.attentionMechanisms[0]!;
  const poolPrimaryCount = poolP.filter((peer) => peer.blueprint.attentionMechanisms[0] === primaryAttention).length;
  const mechanismDiversity = poolP.length <= 1
    ? SCALE
    : norm((poolP.length - poolPrimaryCount) / Math.max(1, poolP.length - 1));
  const maxMemorySimilarity = memory.signals.length === 0
    ? 0
    : Math.max(...memory.signals.map((signal) => structuralSimilarity(candidate, signal)));
  const creatorChecks: boolean[] = [
    ...creatorConstraints.allowedFormats.map((format) => blueprint.format === format),
    ...creatorConstraints.allowedProductRoles.map((role) => blueprint.productRole === role),
    ...creatorConstraints.disallowedFormats.map((format) => blueprint.format !== format),
    ...creatorConstraints.disallowedProductRoles.map((role) => blueprint.productRole !== role),
  ];
  const creatorFit = creatorChecks.length === 0
    ? SCALE
    : ratio(creatorChecks.filter(Boolean).length, creatorChecks.length);
  const inputs: CandidateScoreInputs = {
    relevance: feature(ratio(relevanceRefs.length, refs.length), "validated-evidence", refs),
    commercialFit: feature(ratio(new Set(source.commercialEffects.map(nfc)).size, 3), "validated-evidence", refs),
    psychologicalFit: feature(ratio(blueprint.psychologicalEffects.filter((effect) => skillPsychologicalEffects.includes(effect)).length, blueprint.psychologicalEffects.length), "creative-system"),
    creativeFit: feature(SCALE, "creative-system"),
    recipeFit: feature(blueprint.recipeId === undefined ? 0 : SCALE, "creative-system"),
    novelty: feature(norm(1 - memoryDimensionMatches(candidate, memory.signals).filter(Boolean).length / 9), "validated-memory"),
    mechanismDiversity: feature(mechanismDiversity, "planner-policy"),
    memoryDistance: feature(SCALE - maxMemorySimilarity, "validated-memory"),
    creatorFit: feature(creatorFit, "creator-constraints"),
    productionComplexity: feature(FORMAT_COMPLEXITY_V1[blueprint.format]!, "planner-policy"),
    recentRepetition: feature(maxMemorySimilarity, "validated-memory"),
  };
  const w = PLANNER_WEIGHTS_V1;
  const baseScore = roundHalfUp((w.relevance * inputs.relevance.value
    + w.commercialFit * inputs.commercialFit.value
    + w.psychologicalFit * inputs.psychologicalFit.value
    + w.creativeFit * inputs.creativeFit.value
    + w.recipeFit * inputs.recipeFit.value
    + w.novelty * inputs.novelty.value
    + w.mechanismDiversity * inputs.mechanismDiversity.value
    + w.memoryDistance * inputs.memoryDistance.value
    + w.creatorFit * inputs.creatorFit.value) / 1000);
  const rankScore = baseScore
    - roundHalfUp(w.productionComplexityPenalty * inputs.productionComplexity.value / 1000)
    - roundHalfUp(w.recentRepetitionPenalty * inputs.recentRepetition.value / 1000);
  return { candidate, rankScore, inputs };
}

// ---------- Seleção MMR com restrições ----------

function selectionSignal(candidate: EligibleCandidate): PlannerMemorySignals {
  return {
    signalsSchemaVersion: PLANNER_MEMORY_SIGNALS_V1,
    recipeId: candidate.blueprint.recipeId,
    attentionMechanisms: [candidate.blueprint.attentionMechanisms[0]!],
    psychologicalEffects: candidate.blueprint.psychologicalEffects,
    format: candidate.blueprint.format,
    productRole: candidate.blueprint.productRole,
    narrativeShape: candidate.blueprint.narrativeMoves,
    commercialEffects: candidate.source.commercialEffects,
    audienceContext: candidate.source.audienceContext,
    proofPattern: candidate.source.proofPattern,
  };
}

type SelectionOrder = { marginalNeg: number; rankNeg: number; tie: string; key: string };

function compareSelectionOrder(a: SelectionOrder, b: SelectionOrder): number {
  if (a.marginalNeg !== b.marginalNeg) return a.marginalNeg - b.marginalNeg;
  if (a.rankNeg !== b.rankNeg) return a.rankNeg - b.rankNeg;
  const tie = compareUtf8(a.tie, b.tie);
  if (tie !== 0) return tie;
  return compareUtf8(a.key, b.key);
}

function selectExactN(
  capped: readonly ScoredCandidate[],
  poolP: readonly EligibleCandidate[],
  n: number,
  seed: string,
  policyVersion: PlannerInput["plannerPolicyVersion"],
  skillBinding: HarnessSkillBinding,
): readonly EligibleCandidate[] {
  const selected: ScoredCandidate[] = [];
  const remaining = [...capped];
  const maxSame = Math.max(1, Math.ceil(n / 2));
  const rankOf = (entry: ScoredCandidate): number => entry.rankScore;
  const tieOf = (entry: ScoredCandidate): string => tieHash(seed, entry.candidate.candidateKey);
  const distinctFailure = (message: string): PlannerFailure =>
    harnessFailure("GEN-PLANNER-DIVERSITY", "selection", policyVersion, skillBinding, { message });
  // Disponibilidade (suporte) vem do POLO CAPADO; o pool pré-cap (poolP) é
  // usado exclusivamente por mechanismDiversity.
  const distinctValues = (candidates: readonly EligibleCandidate[], idsOf: (candidate: EligibleCandidate) => readonly string[]): string[] =>
    [...new Set(candidates.flatMap(idsOf))];
  const attentionIdsOf = (candidate: EligibleCandidate): readonly string[] => [candidate.blueprint.attentionMechanisms[0]!];
  const commercialIdsOf = (candidate: EligibleCandidate): readonly string[] => [...candidate.source.commercialEffects];
  const psychologicalIdsOf = (candidate: EligibleCandidate): readonly string[] => [...candidate.blueprint.psychologicalEffects];
  const sourceIdsOf = (candidate: EligibleCandidate): readonly string[] => [candidate.sourceOpportunityId];
  const feasibilityConstraints: ReadonlyArray<{ name: string; idsOf: (candidate: EligibleCandidate) => readonly string[]; minimum: number }> = [
    ...(n <= 1 ? [] : [
      { name: "attention", idsOf: attentionIdsOf, minimum: Math.min(n, 2) },
      { name: "commercial", idsOf: commercialIdsOf, minimum: Math.min(n, 3) },
      { name: "psychological", idsOf: psychologicalIdsOf, minimum: Math.min(n, 3) },
    ]),
    { name: "source", idsOf: sourceIdsOf, minimum: n },
  ];
  assertPoolSupport(capped.map((entry) => entry.candidate), n, policyVersion, skillBinding);
  while (selected.length < n) {
    let best: ScoredCandidate | undefined;
    let bestOrder: SelectionOrder | undefined;
    let skippedSource = 0;
    let skippedRecipe = 0;
    let skippedFormat = 0;
    let skippedInfeasible = 0;
    let firstInfeasible: string | undefined;
    let debugFirstInfeasible: Record<string, string | number> | undefined;
    for (const entry of remaining) {
      if (selected.some((chosen) => chosen.candidate.sourceOpportunityId === entry.candidate.sourceOpportunityId)) {
        skippedSource += 1;
        continue;
      }
      const blueprint = entry.candidate.blueprint;
      if (blueprint.recipeId !== undefined
        && selected.filter((chosen) => chosen.candidate.blueprint.recipeId === blueprint.recipeId).length >= maxSame) {
        skippedRecipe += 1;
        continue;
      }
      if (selected.filter((chosen) => chosen.candidate.blueprint.format === blueprint.format).length >= maxSame) {
        skippedFormat += 1;
        continue;
      }
      // Viabilidade dos mínimos distintos e da capacidade de sources
      // restantes: adicionar o candidate não pode tornar impossível fechar
      // o exact-N com a diversidade exigida.
      const infeasible = feasibilityConstraints.find(({ idsOf, minimum }) => {
        const achieved = distinctValues([...selected.map((chosen) => chosen.candidate), entry.candidate], idsOf).length;
        const globalAvailable = distinctValues(capped.map((entry2) => entry2.candidate), idsOf).length;
        const remainingSlots = n - selected.length - 1;
        return achieved + Math.min(remainingSlots, globalAvailable - achieved) < minimum;
      });
      if (infeasible !== undefined) {
        skippedInfeasible += 1;
        if (firstInfeasible === undefined) {
          firstInfeasible = infeasible.name;
          const achievedNow = distinctValues([entry.candidate], infeasible.idsOf).length;
          const globalNow = distinctValues(capped.map((entry2) => entry2.candidate), infeasible.idsOf).length;
          if (debugFirstInfeasible === undefined)
            debugFirstInfeasible = { constraint: infeasible.name, achieved: achievedNow, global: globalNow, minimum: infeasible.minimum };
        }
        continue;
      }
      const marginal = selected.length === 0
        ? rankOf(entry)
        : rankOf(entry) - roundHalfUp(SIMILARITY_WEIGHTS_V1.mmrPenalty
          * Math.max(...selected.map((chosen) => structuralSimilarity(entry.candidate, selectionSignal(chosen.candidate)))) / 1000);
      const order: SelectionOrder = { marginalNeg: -marginal, rankNeg: -rankOf(entry), tie: tieOf(entry), key: entry.candidate.candidateKey };
      if (bestOrder === undefined || compareSelectionOrder(order, bestOrder) < 0) {
        best = entry;
        bestOrder = order;
      }
    }
    if (best === undefined)
      throw harnessFailure("GEN-PLANNER-DIVERSITY", "selection", policyVersion, skillBinding,
        { message: "restrições de diversidade não fecham", sanitized: { selected: selected.length, remaining: remaining.length, n, poolSize: poolP.length, cappedSize: capped.length, cappedSources: distinctValues(capped.map((entry2) => entry2.candidate), sourceIdsOf).length, skippedSource, skippedRecipe, skippedFormat, skippedInfeasible, firstInfeasible: firstInfeasible ?? null, ...(debugFirstInfeasible ?? {}) } });
    selected.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  assertDistinctMinimums(selected.map((entry) => entry.candidate), n, policyVersion, skillBinding);
  return selected.map((entry) => entry.candidate);
}

function distinctCount(values: readonly string[]): number {
  return new Set(values.filter((value) => value !== "")).size;
}

function assertDistinctMinimums(
  selected: readonly EligibleCandidate[],
  n: number,
  policyVersion: PlannerInput["plannerPolicyVersion"],
  skillBinding: HarnessSkillBinding,
): void {
  if (n <= 1) return;
  const diversityFailure = (sanitized: Record<string, number>): PlannerFailure =>
    harnessFailure("GEN-PLANNER-DIVERSITY", "selection", policyVersion, skillBinding,
      { message: "mínimos de diversidade não atingidos", sanitized });
  const distinctAttention = distinctCount(selected.map((candidate) => candidate.blueprint.attentionMechanisms[0]!));
  const distinctCommercial = distinctCount(selected.flatMap((candidate) => [...candidate.source.commercialEffects]));
  const distinctPsychological = distinctCount(selected.flatMap((candidate) => [...candidate.blueprint.psychologicalEffects]));
  if (distinctAttention < Math.min(n, 2) || distinctCommercial < Math.min(n, 3) || distinctPsychological < Math.min(n, 3))
    throw diversityFailure({ distinctAttention, distinctCommercial, distinctPsychological, n });
}

function assertPoolSupport(
  poolP: readonly EligibleCandidate[],
  n: number,
  policyVersion: PlannerInput["plannerPolicyVersion"],
  skillBinding: HarnessSkillBinding,
): void {
  if (n <= 1) return;
  const diversityFailure = (): PlannerFailure =>
    harnessFailure("GEN-PLANNER-DIVERSITY", "selection", policyVersion, skillBinding,
      { message: "pool não suporta os mínimos de diversidade" });
  const distinctAttention = distinctCount(poolP.map((candidate) => candidate.blueprint.attentionMechanisms[0]!));
  const distinctCommercial = distinctCount(poolP.flatMap((candidate) => [...candidate.source.commercialEffects]));
  const distinctPsychological = distinctCount(poolP.flatMap((candidate) => [...candidate.blueprint.psychologicalEffects]));
  if (distinctAttention < Math.min(n, 2) || distinctCommercial < Math.min(n, 3) || distinctPsychological < Math.min(n, 3))
    throw diversityFailure();
}

// ---------- Merge de memória (in-memory; nunca persistido) ----------

export function mergeMemorySignalsCanonical(
  previous: readonly PlannerMemorySignals[],
  delivered: readonly PlannerMemorySignals[],
): readonly PlannerMemorySignals[] {
  const byKey = new Map<string, PlannerMemorySignals>();
  for (const signal of [...previous, ...delivered]) {
    const key = memorySignalKey(signal);
    const existing = byKey.get(key);
    if (existing === undefined) byKey.set(key, signal);
    else if (compareUtf8(canonicalSerialization(signal), canonicalSerialization(existing)) < 0) byKey.set(key, signal);
  }
  return [...byKey.values()];
}

// ---------- planPortfolio ----------

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value))
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export function planPortfolio(input: PlannerInput): { ok: true; value: PlannerOutput } | { ok: false; error: PlannerFailure } {
  try {
    const validated = validatePlannerInput(input);
    if (input.plannerPolicyVersion === "PLANNER_POLICY_V2") return planPortfolioV2(input, validated);
    if (input.skillBinding.platformSkillVersion !== ACCEPTED_SKILL_BINDING.platformSkillVersion
      || input.skillBinding.creativeSystemVersion !== ACCEPTED_SKILL_BINDING.creativeSystemVersion)
      throw harnessFailure("GEN-CS-VERSION", "skill", input.plannerPolicyVersion, input.skillBinding,
        { field: "skillBinding", message: "Skill binding incompatível com o bundle congelado do harness" });
    let creativeSystemValue: CreativeSystem;
    try {
      creativeSystemValue = loadCreativeSystem(input.skillBinding.platformSkillVersion);
    } catch (error: unknown) {
      if (isGenerationErrorWithCode(error, "GEN-CS-VERSION"))
        throw harnessFailure("GEN-CS-VERSION", "skill", input.plannerPolicyVersion, input.skillBinding,
          { message: "Creative System indisponível para o binding" });
      throw error;
    }
    const raw = enumerateRawCandidates(input, creativeSystemValue);
    const context: EligibilityContext = {
      pool: new Map(input.commercialDiscovery.opportunities.map((opportunity) => [opportunity.sourceOpportunityId, opportunity])),
      catalogRefs: [...input.commercialDiscovery.evidenceCatalog.refs, ...input.productFacts.evidenceRefs],
      creatorConstraints: input.creatorConstraints,
      creativeSystemValue,
      policyVersion: input.plannerPolicyVersion,
      skillBinding: input.skillBinding,
    };
    const eligible: EligibleCandidate[] = [];
    const seenKeys = new Set<string>();
    for (const candidate of raw) {
      const eligibleCandidate = evaluateCandidateEligibility(candidate, context);
      if (eligibleCandidate === null) continue;
      if (seenKeys.has(eligibleCandidate.candidateKey)) continue;
      seenKeys.add(eligibleCandidate.candidateKey);
      eligible.push(eligibleCandidate);
    }
    if (eligible.length === 0)
      throw harnessFailure("GEN-PLANNER-NO-CANDIDATES", "selection", input.plannerPolicyVersion, input.skillBinding,
        { message: "nenhum candidate elegível" });
    const ordered = [...eligible].sort(capOrderCompare);
    const capped = ordered.slice(0, candidateCap(validated.targetContentCount));
    if (capped.length < validated.targetContentCount)
      throw harnessFailure("GEN-PLANNER-INSUFFICIENT-CANDIDATES", "selection", input.plannerPolicyVersion, input.skillBinding,
        { message: "candidates insuficientes após cap" });
    const scored = capped.map((candidate) => scoreCappedCandidate(
      candidate,
      eligible,
      validated.memory,
      input.productFacts.evidenceRefs,
      creativeSystemValue.psychologicalEffects,
      input.creatorConstraints,
    ));
    const selected = selectExactN(scored, eligible, validated.targetContentCount, validated.seed, input.plannerPolicyVersion, input.skillBinding);
    const opportunities: PlannedOpportunityV2[] = selected.map((candidate, index) => {
      const source = candidate.source;
      return {
        opportunityContractVersion: "2" as const,
        candidateKey: candidate.candidateKey,
        position: index + 1,
        sourceOpportunityId: candidate.sourceOpportunityId,
        evidenceRefs: [...candidate.validatedEvidenceRefs],
        commercialObjective: source.commercialObjective,
        angle: source.angle,
        coreMessage: source.coreMessage,
        ...(source.desiredViewerResponse === undefined ? {} : { desiredViewerResponse: source.desiredViewerResponse }),
        noveltyTargets: [...candidate.noveltyTargets],
        blueprint: {
          blueprintContractVersion: "1" as const,
          blueprint: {
            ...(candidate.blueprint.recipeId === undefined ? {} : { recipeId: candidate.blueprint.recipeId }),
            attentionMechanisms: [...candidate.blueprint.attentionMechanisms],
            psychologicalEffects: [...candidate.blueprint.psychologicalEffects],
            format: candidate.blueprint.format,
            narrativeMoves: [...candidate.blueprint.narrativeMoves],
            productRole: candidate.blueprint.productRole,
          },
          creativeSystemVersion: "1.3" as const,
          platformSkillVersion: "tiktok-commerce@1.3" as const,
        },
        hookMechanism: candidate.hookMechanism,
      };
    });
    return {
      ok: true,
      value: deepFreeze({
        opportunities,
        plannerPolicyVersion: input.plannerPolicyVersion,
        skillBinding: { ...ACCEPTED_SKILL_BINDING },
        seed: input.seed,
      }),
    };
  } catch (error: unknown) {
    if (error instanceof ScoreInputError)
      return { ok: false, error: harnessFailure("GEN-PLANNER-SCORE-INPUT", "enumeration", "PLANNER_POLICY_V1", ACCEPTED_SKILL_BINDING, { message: "score input inválido" }) };
    if (error instanceof TypeError)
      return { ok: false, error: harnessFailure("GEN-PLANNER-INPUT", "input", input.plannerPolicyVersion, input.skillBinding, { message: "entrada causou acesso inválido; TypeError nunca é exposto" }) };
    if (isRecord(error) && typeof error.code === "string" && error.code.startsWith("GEN-"))
      return { ok: false, error: error as unknown as PlannerFailure };
    throw error;
  }
}

// capOrder: comparação direta por UTF-8 na tupla normativa —
// sourceOpportunityId → recipeId (presente antes de ausente) → format →
// productRole → narrativeMoves canônicos → canonicalCandidateKey.
// Sem hash: a ordem é estável e "a < a" é sempre falso (reflexiva).
export function capOrderCompare(a: EligibleCandidate, b: EligibleCandidate): number {
  const source = compareUtf8(a.sourceOpportunityId, b.sourceOpportunityId);
  if (source !== 0) return source;
  const recipePresence = (c: EligibleCandidate): 0 | 1 => (c.blueprint.recipeId === undefined ? 1 : 0);
  if (recipePresence(a) !== recipePresence(b)) return recipePresence(a) - recipePresence(b);
  if (a.blueprint.recipeId !== undefined) {
    const recipe = compareUtf8(a.blueprint.recipeId, b.blueprint.recipeId!);
    if (recipe !== 0) return recipe;
  }
  const format = compareUtf8(a.blueprint.format, b.blueprint.format);
  if (format !== 0) return format;
  const role = compareUtf8(a.blueprint.productRole, b.blueprint.productRole);
  if (role !== 0) return role;
  const moves = compareUtf8(JSON.stringify(canonicalOrdered(a.blueprint.narrativeMoves)), JSON.stringify(canonicalOrdered(b.blueprint.narrativeMoves)));
  if (moves !== 0) return moves;
  return compareUtf8(a.candidateKey, b.candidateKey);
}

export { isEmptyMemorySnapshot, PLANNER_MEMORY_SIGNALS_V1 };
export type { CommercialDiscoveryPool, EvidenceRef, MemorySnapshotInput, PlannerInput, PlannerMemorySignals };

// Test seam: score determinístico exposto para os testes estruturais da
// Etapa 3 (11 features/origens/rounding). Nenhum caminho de runtime depende dele.
export function scoreCandidateForHarnessTest(parts: {
  candidate: EligibleCandidate;
  poolP: readonly EligibleCandidate[];
  inputMemorySnapshot: MemorySnapshotInput;
  productFactsRefs: readonly EvidenceRef[];
  skillPsychologicalEffects: readonly string[];
  creatorConstraints: PlannerInput["creatorConstraints"];
  policyVersion: PlannerInput["plannerPolicyVersion"];
  skillBinding: HarnessSkillBinding;
}): { inputs: CandidateScoreInputs; rankScore: number } {
  const memory = validateMemorySnapshot(parts.inputMemorySnapshot, parts.policyVersion, parts.skillBinding);
  const scored = scoreCappedCandidate(
    parts.candidate,
    parts.poolP,
    memory,
    parts.productFactsRefs,
    parts.skillPsychologicalEffects,
    parts.creatorConstraints,
  );
  return { inputs: scored.inputs, rankScore: scored.rankScore };
}

// V2 não altera o percurso V1: enumera todas as combinações sustentadas, antes
// de dedup/creator, e seleciona no pool elegível inteiro sem quotas artificiais.
function subsets(ids: readonly string[], max: number, ordered: boolean): string[][] {
  const results: string[][] = [];
  const visit = (picked: string[]): void => {
    if (picked.length) results.push([...picked]);
    if (picked.length === max) return;
    for (const id of ids) {
      if (picked.includes(id) || (!ordered && picked.length && compareUtf8(id, picked[picked.length - 1]!) <= 0)) continue;
      visit([...picked, id]);
    }
  };
  visit([]);
  return results;
}

export function enumerateV2(input: PlannerInput, system: CreativeSystem): RawCandidate[] {
  const variants: CreativeBlueprint[] = [];
  const narratives = new Map<string, string[]>();
  for (const recipe of system.recipes) {
    const attentionVariants = subsets(recipe.attentionMechanisms, 2, true);
    const effectVariants = subsets([...recipe.psychologicalEffects].sort(compareUtf8), 3, false);
    narratives.set(canonicalSerialization(recipe.narrativeMoves), [...recipe.narrativeMoves]);
    for (const a of attentionVariants)
      for (const e of effectVariants)
        for (const format of recipe.formats)
          for (const productRole of recipe.productRoles)
            if (system.compatibility.formatsByProductRole[productRole]?.includes(format))
              variants.push({ recipeId: recipe.id, attentionMechanisms: a, psychologicalEffects: e,
                format, productRole, narrativeMoves: recipe.narrativeMoves });
  }
  const supported = (left: "attentionMechanisms" | "psychologicalEffects" | "formats" | "productRoles" | "narrativeMoves",
    a: string, right: "attentionMechanisms" | "psychologicalEffects" | "formats" | "productRoles" | "narrativeMoves",
    b: string): boolean => system.recipes.some((recipe) => recipe[left].includes(a) && recipe[right].includes(b));
  const roles = Object.keys(system.compatibility.formatsByProductRole).sort(compareUtf8);
  for (const productRole of roles)
    for (const format of system.compatibility.formatsByProductRole[productRole]!)
      for (const narrativeMoves of narratives.values()) {
        if (narrativeMoves.some((move) =>
          !supported("formats", format, "narrativeMoves", move)
          || !supported("productRoles", productRole, "narrativeMoves", move))) continue;
        const viable = (dimension: "attentionMechanisms" | "psychologicalEffects", id: string) =>
          supported(dimension, id, "formats", format)
          && supported(dimension, id, "productRoles", productRole)
          && narrativeMoves.every((move) => supported(dimension, id, "narrativeMoves", move));
        const att = system.attentionMechanisms.filter((id) => viable("attentionMechanisms", id));
        const psy = system.psychologicalEffects.filter((id) => viable("psychologicalEffects", id));
        for (const a of subsets(att, 2, true))
          for (const e of subsets([...psy].sort(compareUtf8), 3, false))
            if (a.every((id) => e.every((effect) =>
              supported("attentionMechanisms", id, "psychologicalEffects", effect))))
              variants.push({ attentionMechanisms: a, psychologicalEffects: e, format, productRole, narrativeMoves });
      }
  const raw: RawCandidate[] = [];
  for (const source of [...input.commercialDiscovery.opportunities].sort((a, b) => compareUtf8(a.sourceOpportunityId, b.sourceOpportunityId)))
    for (const blueprint of variants) {
      raw.push({ sourceOpportunityId: source.sourceOpportunityId, source,
        evidenceRefs: source.evidenceRefs, blueprint, noveltyTargets: [] });
      if (raw.length > ENUMERATION_POLICY_V2.maxRawCandidates)
        throw harnessFailure("GEN-PLANNER-ENUMERATION-LIMIT", "enumeration", input.plannerPolicyVersion, input.skillBinding,
          { message: "maxRawCandidates V2 excedido antes de dedup/elegibilidade",
            sanitized: { rawCandidates: raw.length, maxRawCandidates: ENUMERATION_POLICY_V2.maxRawCandidates } });
    }
  return raw;
}

export function similarityV2(left: PlannerMemorySignals, right: PlannerMemorySignals): number {
  const w = SIMILARITY_WEIGHTS_V1;
  const dimensions: Array<[number, boolean, boolean]> = [
    [w.commercialEffect, !!left.commercialEffects?.length && !!right.commercialEffects?.length,
      setsEqualCanonical(left.commercialEffects ?? [], right.commercialEffects ?? [])],
    [w.psychologicalEffect, !!left.psychologicalEffects.length && !!right.psychologicalEffects.length,
      setsEqualCanonical(left.psychologicalEffects, right.psychologicalEffects)],
    [w.recipe, !!left.recipeId && !!right.recipeId, left.recipeId === right.recipeId],
    [w.attentionMechanism, !!left.attentionMechanisms[0] && !!right.attentionMechanisms[0],
      left.attentionMechanisms[0] === right.attentionMechanisms[0]],
    [w.format, !!left.format && !!right.format, left.format === right.format],
    [w.productRole, !!left.productRole && !!right.productRole, left.productRole === right.productRole],
    [w.narrativeShape, !!left.narrativeShape.length && !!right.narrativeShape.length,
      arraysEqualCanonical(left.narrativeShape, right.narrativeShape)],
  ];
  const applicable = dimensions.reduce((sum, [weight, present]) => sum + (present ? weight : 0), 0);
  return applicable === 0 ? 0 : Math.floor(
    dimensions.reduce((sum, [weight, present, match]) => sum + (present && match ? weight * SCALE : 0), 0) / applicable + 0.5);
}

function planPortfolioV2(input: Extract<PlannerInput, { plannerPolicyVersion: "PLANNER_POLICY_V2" }>, validated: ValidatedInputFull):
  { ok: true; value: PlannerOutput } {
  if (input.skillBinding.platformSkillVersion !== ACCEPTED_SKILL_BINDING.platformSkillVersion
    || input.skillBinding.creativeSystemVersion !== ACCEPTED_SKILL_BINDING.creativeSystemVersion)
    throw harnessFailure("GEN-CS-VERSION", "skill", input.plannerPolicyVersion, input.skillBinding,
      { field: "skillBinding", message: "Skill binding V2 incompatível" });
  const system = loadCreativeSystem(input.skillBinding.platformSkillVersion);
  if (input.compatibilityPolicyVersion !== "CREATIVE_COMPATIBILITY_V2"
    || input.creativeSystemHash !== sha256Hex(canonicalSerialization(system)))
    throw harnessFailure("GEN-CS-VERSION", "skill", input.plannerPolicyVersion, input.skillBinding,
      { field: "creativeSystemHash", message: "Proveniência de compatibilidade V2 divergente" });
  const raw = enumerateV2(input, system);
  const context: EligibilityContext = {
    pool: new Map(input.commercialDiscovery.opportunities.map((source) => [source.sourceOpportunityId, source])),
    catalogRefs: [...input.commercialDiscovery.evidenceCatalog.refs, ...input.productFacts.evidenceRefs],
    creatorConstraints: input.creatorConstraints, creativeSystemValue: system,
    policyVersion: input.plannerPolicyVersion, skillBinding: input.skillBinding,
  };
  const eligible: EligibleCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    const result = evaluateCandidateEligibility(candidate, context);
    if (result && !seen.has(result.candidateKey)) {
      eligible.push(result);
      seen.add(result.candidateKey);
    }
  }
  if (eligible.length === 0)
    throw harnessFailure(raw.length === 0 ? "GEN-CS-COMPAT" : "GEN-PLANNER-NO-CANDIDATES",
      "selection", input.plannerPolicyVersion, input.skillBinding, { message: "nenhum candidate elegível" });
  if (new Set(eligible.map((item) => item.sourceOpportunityId)).size < validated.targetContentCount)
    throw harnessFailure("GEN-PLANNER-DIVERSITY", "selection", input.plannerPolicyVersion, input.skillBinding,
      { message: "menos de N origens elegíveis" });
  const refs = new Set(input.productFacts.evidenceRefs.map(evidenceRefKey));
  const ranks = eligible.map((candidate) => {
    const signal = selectionSignal(candidate);
    const matches = memoryDimensionMatches(candidate, validated.memory.signals).filter(Boolean).length;
    const memoryMax = validated.memory.signals.reduce((max, historic) => Math.max(max, similarityV2(signal, historic)), 0);
    return {
      candidate, signal,
      relevance: ratio(candidate.validatedEvidenceRefs.filter((ref) => refs.has(evidenceRefKey(ref))).length,
        candidate.validatedEvidenceRefs.length),
      commercialFit: ratio(new Set(candidate.source.commercialEffects.map(nfc)).size, 3),
      novelty: norm(1 - matches / 9),
      memoryDistance: SCALE - memoryMax,
      tie: tieHash(validated.seed, candidate.candidateKey),
    };
  });
  const selected: typeof ranks = [];
  const usedSources = new Set<string>();
  const usedIds = new Set<string>();
  while (selected.length < validated.targetContentCount) {
    let best: (typeof ranks)[number] | undefined;
    let bestOrder: readonly (number | string)[] | undefined;
    for (const entry of ranks) {
      if (usedSources.has(entry.candidate.sourceOpportunityId)) continue;
      const blueprint = entry.candidate.blueprint;
      const fresh = [...blueprint.attentionMechanisms, blueprint.format,
        ...(blueprint.recipeId ? [blueprint.recipeId] : [])].filter((id) => !usedIds.has(id)).length;
      const mmr = SCALE - selected.reduce((max, prior) => Math.max(max, similarityV2(entry.signal, prior.signal)), 0);
      // Recipe preference breaks only commercial/memory/diversity ties; free exploration stays eligible.
      const recipeFit = blueprint.recipeId === undefined ? 0 : 1;
      const order = [-entry.relevance, -entry.commercialFit, -entry.novelty, -entry.memoryDistance,
        -fresh, -mmr, -recipeFit, entry.tie, entry.candidate.candidateKey] as const;
      const previous = bestOrder;
      const before = previous ? order.findIndex((value, index) => value !== previous[index]) : -1;
      if (!previous || (before >= 0
        && (typeof order[before] === "number"
          ? (order[before] as number) < (previous[before] as number)
          : compareUtf8(String(order[before]), String(previous[before])) < 0))) {
        best = entry;
        bestOrder = order;
      }
    }
    if (!best) throw harnessFailure("GEN-PLANNER-DIVERSITY", "selection", input.plannerPolicyVersion, input.skillBinding,
      { message: "menos de N origens distintas" });
    selected.push(best);
    usedSources.add(best.candidate.sourceOpportunityId);
    for (const id of [...best.candidate.blueprint.attentionMechanisms, best.candidate.blueprint.format,
      ...(best.candidate.blueprint.recipeId ? [best.candidate.blueprint.recipeId] : [])]) usedIds.add(id);
  }
  const opportunities: PlannedOpportunityV2[] = selected.map(({ candidate }, index) => ({
    opportunityContractVersion: "2", candidateKey: candidate.candidateKey,
    position: index + 1, sourceOpportunityId: candidate.sourceOpportunityId,
    evidenceRefs: [...candidate.validatedEvidenceRefs],
    commercialObjective: candidate.source.commercialObjective,
    angle: candidate.source.angle, coreMessage: candidate.source.coreMessage,
    ...(candidate.source.desiredViewerResponse === undefined ? {} : { desiredViewerResponse: candidate.source.desiredViewerResponse }),
    noveltyTargets: [],
    blueprint: { blueprintContractVersion: "1",
      blueprint: { ...candidate.blueprint, attentionMechanisms: [...candidate.blueprint.attentionMechanisms],
        psychologicalEffects: [...candidate.blueprint.psychologicalEffects], narrativeMoves: [...candidate.blueprint.narrativeMoves] },
      creativeSystemVersion: "1.3", platformSkillVersion: "tiktok-commerce@1.3" },
    hookMechanism: candidate.hookMechanism,
  }));
  return { ok: true, value: deepFreeze({ opportunities, plannerPolicyVersion: "PLANNER_POLICY_V2",
    skillBinding: { ...input.skillBinding, platformSkillVersion: "tiktok-commerce@1.3", creativeSystemVersion: "1.3" },
    seed: input.seed }) };
}
