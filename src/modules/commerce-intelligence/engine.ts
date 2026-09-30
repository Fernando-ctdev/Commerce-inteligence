import {
  assignServerBriefIds,
  CARDINALITY_POLICY_VERSION,
  CARDINALITY_POLICY,
  PARTIAL_FAILURE_CAP,
  validateContentBriefDraft,
  validateContentOpportunity,
  validateContentPlan,
  validatePlanCreativeOpportunity,
  validateContentSceneSetDraft,
  validateCommercialOpportunity,
  validateProductStrategy,
  validateProductUnderstanding,
  validateTargetContentCount,
  ContractError,
  normalizeForVariety,
  type CommercialOpportunity,
  type ContentBriefDraft,
  type ContentBriefVersion,
  type ContentOpportunity,
  type ContentPlan,
  type EvidenceSnapshot,
  type ProductStrategy,
  type ProductUnderstanding,
  type EnginePartial,
  type FailedItemDiagnostic,
  type PartialFailureCheckCode,
  type SceneIdea,
} from "./contract";
import { buildPlanSkeleton, PLAN_POLICY_VERSION, type PlanSkeleton } from "./planner";
import { canonicalSerialization, sha256Hex } from "./planner-harness/canonical";
import {
  loadPlatformSkill,
  projectPlatformSkillSlice,
  classifyCtaFunction,
  classifyHookMechanism,
  HOOK_BUCKET_COUNT,
  type PlatformSkill,
} from "./platform-skill";
import {
  ctaTextFactualIssues,
  GATE_POLICY_VERSION,
  deliverableHookBuckets,
  developmentRequirements,
  parseStructuredDevelopment,
  developmentDiagnosticNeedsRepair,
  gateSceneSet,
  diagnoseDevelopmentPoint,
  validDevelopmentPoint,
  validateBriefSet,
  type DevelopmentBullet,
  type DevelopmentBulletDiagnostic,
  type GatePattern,
  type GateReport,
developmentGroundingTerms,
  type SceneGateResult,
} from "./gates";
import {
  assertProviderOutput,
  ROUTER_MAP,
  type LogicalTask,
  type ModelRouter,
  type ProviderCallMetrics,
  type ProviderReportedCost,
  type ProviderTokenUsage,
} from "./model-router";
import { emitJobEvent, sanitizeGateReports } from "./observability";
import { GenerationError } from "./errors";
import { type GenerationStage } from "./stages";
import { applyQualityRepair, JUDGE_BATCH_MAX, parseQualityAuditBatch, parseQualityRepairBatch, projectQualityFailures, qualityPartsToRepair, QUALITY_PARTS, REPAIR_BATCH_MAX, reasonText, type QualityAudit, type QualityJudgment, type QualityPart } from "./semantic-quality";
import {
  BRIEF_GENERATION_POLICY_V2,
  ENGINE_V2_SKILL_BINDING,
  briefStyleObservations,
  buildRealizationContext,
  buildRealizationInput,
  buildSceneSkeletonSets,
  contentOpportunitiesFromPortfolio,
  parseBriefBatchEnvelopeV2,
  parseDiscoveryEnvelopeV2,
  parseBriefRepairDraftV2,
  parseStructuredBriefDraftV2,
  plannedHandoffV2,
  runPlannerV2,
  v2ConstraintsFromCreatorContext,
  v2NeutralConstraints,
  v2ProductFactsProjection,
} from "./engine-v2";
import type { DiscoveryEnvelopeV2 } from "./engine-v2";
import type { PlannedOpportunityV2 } from "./planner-harness/types";
import type { PlannedOpportunityHandoffV2 } from "./engine-v2";
import type { JudgeExecutionRecord } from "./risk-assessment";

// ADR-019: versão real da engine — substitui o literal estático "slice-003" do
// IntelligenceRun. Bump junto com mudanças comportamentais da engine.
export const ENGINE_VERSION = "3";
export type EngineInput = {
  productId: string;
  jobId: string;
  name: string;
  description: string;
  facts?: Record<string, unknown>;
  creatorContext?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  router?: ModelRouter;
  allowDeterministicTestFallback?: boolean;
  // Test seam: skill controlada para testar pool elegível vazio (ADR-020).
  skill?: PlatformSkill;
  // ADR-021: sinais de memória do último snapshot (retry dos faltantes) e
  // estratégia ACTIVE reutilizada — pula STRATEGY_SYNTHESIS quando presente.
  reuseStrategy?: Record<string, unknown>;
  // Etapa 2 candidata (ADR-033 §3/§12): Discovery persistida resolvida pelo
  // worker (mesmo tenant, hash íntegro). Presente ⇒ Mapping NÃO é re-chamado
  // (resultado intermediário persistido é a fonte); PU permanece no candidato.
  reusedDiscovery?: {
    envelope: Record<string, unknown>;
    discoveryHash: string;
    sourceDiscoveryRef: {
      intelligenceRunId: string;
      discoveryContractVersion: "2";
      discoveryHash: string;
    };
  };
  targetContentCount: number;
  onStage?: (stage: GenerationStage) => Promise<void> | void;
  signal?: AbortSignal;
  attempt?: number;
};
export type CapabilityEvent = {
  task: LogicalTask;
  tier: string;
  instructionVersion?: string;
  instructionHash?: string;
  provider?: string;
  model?: string;
  // Usage real normalizado do provider; metadata legado permanece válido sem o campo.
  usage?: ProviderTokenUsage;
  // Custo monetário relatado pelo provider (ex.: usage.cost OpenRouter); primário sobre snapshots.
  reportedCost?: ProviderReportedCost;
  // Todas as callbacks de métricas da execução (uma por tentativa efetiva do provider,
  // inclusive a sacrificada em fallback); cost-observability achata em registros por tentativa.
  attempts?: ProviderCallMetrics[];
  // Atribuição por item apenas quando a capability é semanticamente de Content único.
  contentId?: string;
  reasoning?: string;
  providerStatus?: number | null;
  durationMs: number;
  contextBytes: number;
  requestBytes?: number;
  trustedContextBytes?: number;
  externalBytes?: number;
  responseBytes: number;
  attempt: number;
  retry: number;
  ok: boolean;
  cardinalityPolicyVersion?: number;
  errorCode?: string;
  // Gate de cenas (CONTENT_SCENE_IDEAS): kept/dropped do gateSceneSet da tentativa.
  kept?: number;
  dropped?: number;
  providerRequestId?: string;
  providerRequestIdSource?: "header" | "body.id";
  fallback?: {
    from: string;
    reason: string;
    providerStatus: number | null;
    requestBytes: number;
    durationMs: number;
  };
};
// Diagnóstico interno de falha de gate (env-gated: GEN_DEBUG_GATE=1): issues EXATAS
// + developmentDiagnostics por bullet, para fechamento de causa raiz. NUNCA cruza
// para o envelope creator-facing; tenant-scoped no metadata do job/run.
const debugGateIssues = (reports: GateReport[], diagnosticsFor: (contentId: string) => DevelopmentBulletDiagnostic[] | undefined) =>
  process.env.GEN_DEBUG_GATE === "1"
    ? reports.map((report) => ({
        briefId: report.briefId,
        decision: report.decision,
        issues: [...report.issues],
        developmentDiagnostics: diagnosticsFor(report.briefId.split(":")[0] ?? "") ?? [],
      }))
    : undefined;
const hardExhaustedDetail = (extra: Record<string, unknown>) => ({
  ...extra,
  ...(process.env.GEN_DEBUG_GATE === "1" ? { genDebugGate: true } : {}),
});

export type EngineResult = {
  productUnderstanding: Record<string, unknown>;
  strategy: Record<string, unknown>;
  plan: Record<string, unknown>;
  planPolicyVersion: number;
  opportunities: Record<string, unknown>[];
  briefs: ContentBriefVersion[];
  reports: GateReport[];
  patternReplacements: PatternReplacement[];
  understandingReductions: UnderstandingCardinalityReduction[];
  sceneSets: SceneSetOutcome[];
  memorySignals: Record<string, unknown>;
  stage: GenerationStage;
  capabilities: CapabilityEvent[];
  repairs: number;
  repairCauses: Array<{ briefId: string; causes: string[] }>;
  qualityAudits: QualityAudit[];
  qualityRepairs: Array<{ contentId: string; part: QualityPart; round: number; criterion: string; outcome: "REPAIRED" }>;
  validated: number;
  briefOpportunityPositions: number[];
  // Cutover v2: bullets estruturados canônicos por contentId ENTREGUE — fonte da
  // persistência v2 (payload.development = bullets); strings são projeção.
  developmentBullets?: Array<{ contentId: string; bullets: DevelopmentBullet[] }>;
  // Etapa 4 V2: handoff planejado (ordem/posição server-side, source/evidence
  // exatas, blueprint resolvido) — allowlisted, sem provider IDs nem catálogo.
  plannedV2?: PlannedOpportunityHandoffV2[];
  // E5: cobertura do Judge + evidência server-owned para risk assessment.
  judgeExecutionRecords: JudgeExecutionRecord[];
  evidenceRefs: string[];
  discoveryV2?: Record<string, unknown>;
  // Etapa 2 candidata (ADR-033 §3/§12): envelope canônico + discoveryHash +
  // IDs server-owned, ou apenas sourceDiscoveryRef no reuso.
  discoveryCanonicalV2?: DiscoveryCanonicalV2;
  v2Policy?: { plannerPolicyVersion: "PLANNER_POLICY_V1"; briefPolicyVersion: "BRIEF_GENERATION_POLICY_V1"; creativeSystemVersion: "1.3" };
  partial: EnginePartial | null;
};

// ADR-019: resultado das cenas por conteúdo. Backfill legado pode ser não-
// bloqueante; conteúdo novo exige status AVAILABLE com pelo menos 2 cenas.
export type SceneSetOutcome = {
  contentId: string;
  briefVersionId: string;
  status: "AVAILABLE" | "FILTERED" | "ERROR";
  scenes: SceneIdea[];
  generated: number;
  dropped: number;
  backfilled: boolean;
  // Telemetria de falha (pós-job ace9e417): códigos agregados do gateSceneSet e
  // status/duração/código por tentativa de CONTENT_SCENE_IDEAS — sempre
  // sanitizados antes de persistir; NUNCA payload/descrição de cena.
  causes?: string[];
  attempts?: Array<{ attempt: number; status: "completed" | "failed"; kept?: number; dropped?: number; errorCode?: string; durationMs: number }>;
};

function batchSize(): number {
  const raw = Number(process.env.GENERATION_BRIEF_BATCH_SIZE ?? 4);
  return Number.isInteger(raw) && raw >= 4 && raw <= 8 ? raw : 4;
}
function mappingOpportunityLimit(): number {
  const raw = Number(process.env.GENERATION_MAPPING_MAX_OPPORTUNITIES ?? 4);
  return Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : 4;
}

// ─── Etapa 2 candidata (ADR-033 §3; SPEC §3.3B; PLAN Task 5B-1) ─────────────
// Discovery V2 canônica + Strategy determinística versionada com proveniência.
// CANDIDATA nesta branch autorizada: runtime default/produção, merge, deploy e
// V2_ACCEPTED NÃO são promovidos por este código; a baseline ADR-029 (E6)
// permanece intocada. Sem capability, agente, serviço, stage público, tabela
// ou migration nova — a capability vigente é COMMERCIAL_OPPORTUNITY_MAPPING.

export const STRATEGY_CONTRACT_VERSION_V2 = "2" as const;
export const STRATEGY_POLICY_VERSION_V1 = "STRATEGY_POLICY_V1" as const;

// Resultado canônico da Etapa 2 no EngineResult: fresh = envelope normalizado
// + hash + IDs server-owned; reused = apenas referência à origem (ADR-033 §12:
// "o run novo pode registrar somente referência à origem").
export type DiscoveryCanonicalV2 =
  | { origin: "fresh"; envelope: Record<string, unknown>; discoveryHash: string; sourceOpportunityIds: string[] }
  | {
      origin: "reused";
      sourceDiscoveryRef: { intelligenceRunId: string; discoveryContractVersion: "2"; discoveryHash: string };
    };

// discoveryHash = sha256Hex(canonicalSerialization(envelope)) — CANONICAL_-
// SERIALIZATION_V1 sobre o MESMO envelope normalizado persistido, sem o hash.
export function discoveryHashV2(envelope: unknown): string {
  return sha256Hex(canonicalSerialization(envelope));
}

// Chaves canônicas da hipótese normalizada: as do parser V2 + sourceOpportunityId
// (server-owned — o parser já rejeita a chave no envelope do provider).
const CANONICAL_HYPOTHESIS_KEYS_V2: readonly string[] = [
  "sourceOpportunityId",
  "commercialObjective", "angle", "coreMessage", "desiredViewerResponse",
  "audience", "situation", "desire", "identification", "curiosity",
  "aspiration", "humorPotential", "visualPotential", "pain", "objection",
  "desiredOutcome", "relevantCapabilities", "benefits", "proofOptions",
  "commercialEffects", "evidenceRefs", "confidence",
];
const CANONICAL_NULLABLE_KEYS_V2: readonly string[] = [
  "desiredViewerResponse", "audience", "situation", "desire",
  "identification", "curiosity", "aspiration", "humorPotential",
  "visualPotential", "pain", "objection", "desiredOutcome",
];

type CanonicalHypothesisV2 = Record<string, unknown> & {
  sourceOpportunityId: string;
  commercialObjective: string;
  angle: string;
  coreMessage: string;
  relevantCapabilities: string[];
  benefits: string[];
  proofOptions: string[];
  commercialEffects: string[];
  evidenceRefs: string[];
  confidence: number;
};

const canonicalText = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim())
    throw new ContractError("GEN-SCHEMA", `Discovery canônica: ${field} obrigatório`, field);
  return value;
};

// Valida a forma canônica do envelope (persistido ou reutilizado): versão,
// chaves exatas, obrigatórios não vazios, commercialEffects ≥1, refs citáveis
// e IDs server-owned não repetidos. Falha fechado (GEN-SCHEMA).
function canonicalHypothesesOf(envelope: unknown): CanonicalHypothesisV2[] {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope))
    throw new ContractError("GEN-SCHEMA", "Discovery canônica deve ser um objeto");
  const record = envelope as Record<string, unknown>;
  if (record.discoveryContractVersion !== "2")
    throw new ContractError("GEN-SCHEMA", "Discovery canônica exige discoveryContractVersion=2", "discoveryContractVersion");
  if (!Array.isArray(record.hypotheses) || record.hypotheses.length === 0)
    throw new ContractError("GEN-SCHEMA", "Discovery canônica sem hypotheses", "hypotheses");
  const seen = new Set<string>();
  return record.hypotheses.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new ContractError("GEN-SCHEMA", `Discovery canônica: hypothesis ${index + 1} inválida`, "hypotheses");
    const h = raw as Record<string, unknown>;
    for (const key of Object.keys(h))
      if (!CANONICAL_HYPOTHESIS_KEYS_V2.includes(key))
        throw new ContractError("GEN-SCHEMA", `Discovery canônica: campo desconhecido "${key}" na hypothesis ${index + 1}`, key);
    const sourceOpportunityId = canonicalText(h.sourceOpportunityId, "sourceOpportunityId");
    if (seen.has(sourceOpportunityId))
      throw new ContractError("GEN-SCHEMA", `Discovery canônica: sourceOpportunityId repetido ${sourceOpportunityId}`, "sourceOpportunityId");
    seen.add(sourceOpportunityId);
    for (const key of ["commercialObjective", "angle", "coreMessage"] as const)
      canonicalText(h[key], key);
    if (!Array.isArray(h.commercialEffects) || h.commercialEffects.length === 0 || !h.commercialEffects.every((e) => typeof e === "string" && e.trim()))
      throw new ContractError("GEN-SCHEMA", `Discovery canônica: hypothesis ${index + 1} sem commercialEffects`, "commercialEffects");
    if (!Array.isArray(h.evidenceRefs) || h.evidenceRefs.length === 0 || !h.evidenceRefs.every((r) => typeof r === "string" && r.trim()))
      throw new ContractError("GEN-SCHEMA", `Discovery canônica: hypothesis ${index + 1} sem evidenceRefs`, "evidenceRefs");
    if (typeof h.confidence !== "number" || h.confidence < 0 || h.confidence > 1)
      throw new ContractError("GEN-SCHEMA", `Discovery canônica: hypothesis ${index + 1} com confidence inválido`, "confidence");
    for (const key of ["relevantCapabilities", "benefits", "proofOptions"] as const)
      if (!Array.isArray(h[key]) || !h[key].every((v) => typeof v === "string" && v.trim()))
        throw new ContractError("GEN-SCHEMA", `Discovery canônica: hypothesis ${index + 1} com ${key} inválido`, key);
    for (const key of CANONICAL_NULLABLE_KEYS_V2)
      if (h[key] !== undefined && (typeof h[key] !== "string" || !(h[key] as string).trim()))
        throw new ContractError("GEN-SCHEMA", `Discovery canônica: ${key} presente deve ser string não vazia (ausente é omitido)`, key);
    return h as CanonicalHypothesisV2;
  });
}

// Normaliza o envelope validado do parser em forma JSON-safe (ADR-033 §3):
// opcionais ausentes/undefined são OMITIDOS (nunca null/string vazia);
// todas as hipóteses, dimensões presentes, confidence, refs e IDs
// server-owned são preservados. IDs são atribuídos por posição e estáveis na
// Discovery persistida, Strategy, Planner e Opportunity.
export function normalizeDiscoveryEnvelopeV2(parsed: DiscoveryEnvelopeV2, jobId: string): {
  envelope: Record<string, unknown>;
  discoveryHash: string;
  sourceOpportunityIds: string[];
  hypotheses: CanonicalHypothesisV2[];
} {
  const hypotheses: CanonicalHypothesisV2[] = parsed.hypotheses.map((h, index) => {
    const canonical: Record<string, unknown> = { sourceOpportunityId: `${jobId}-commercial-${index + 1}` };
    canonical.commercialObjective = h.commercialObjective;
    canonical.angle = h.angle;
    canonical.coreMessage = h.coreMessage;
    for (const key of CANONICAL_NULLABLE_KEYS_V2) {
      const value = h[key as keyof typeof h] as string | null | undefined;
      if (typeof value === "string" && value.trim()) canonical[key] = value;
    }
    canonical.relevantCapabilities = [...h.relevantCapabilities];
    canonical.benefits = [...h.benefits];
    canonical.proofOptions = [...h.proofOptions];
    canonical.commercialEffects = [...h.commercialEffects];
    canonical.evidenceRefs = [...h.evidenceRefs];
    canonical.confidence = h.confidence;
    return canonical as CanonicalHypothesisV2;
  });
  const envelope: Record<string, unknown> = { discoveryContractVersion: "2", hypotheses };
  return {
    envelope,
    discoveryHash: discoveryHashV2(envelope),
    sourceOpportunityIds: hypotheses.map((h) => h.sourceOpportunityId),
    hypotheses,
  };
}

// Ponte canônica v1↔v2: coreMessage é o sellingArgument canônico (a mesma
// ponte usada pelo adapter do Planner) — não é troca de papéis semânticos.
// refs fora do catálogo autorizado e obrigatórios vazios falham fechado.
export function commercialOpportunitiesFromDiscoveryV2(envelope: unknown, evidence: EvidenceSnapshot): CommercialOpportunity[] {
  const hypotheses = canonicalHypothesesOf(envelope);
  const allowedRefs = new Set(evidence.refs);
  return hypotheses.map((h) => {
    for (const ref of h.evidenceRefs)
      if (!allowedRefs.has(ref))
        throw new ContractError("GEN-SCHEMA", `Discovery canônica cita evidência fora do catálogo autorizado: ${ref}`, "evidenceRefs");
    return validateCommercialOpportunity(
      {
        id: h.sourceOpportunityId,
        ...(typeof h.audience === "string" ? { audience: h.audience } : {}),
        ...(typeof h.situation === "string" ? { situation: h.situation } : {}),
        ...(typeof h.pain === "string" ? { pain: h.pain } : {}),
        ...(typeof h.desire === "string" ? { desire: h.desire } : {}),
        ...(typeof h.desiredOutcome === "string" ? { desiredOutcome: h.desiredOutcome } : {}),
        ...(typeof h.objection === "string" ? { objection: h.objection } : {}),
        relevantCapabilities: [...h.relevantCapabilities],
        benefits: [...h.benefits],
        proofOptions: [...h.proofOptions],
        sellingArgument: h.coreMessage,
        confidence: h.confidence,
        evidenceRefs: [...h.evidenceRefs],
      },
      evidence,
    );
  });
}

// Strategy V2 determinística versionada (ADR-033 §3): agrega, seleciona,
// ordena e projeta a Discovery validada. Policy STRATEGY_POLICY_V1: seleção =
// todas as hipóteses validadas, na ordem da Discovery (determinística);
// subsetting/ranking futuro exige bump de STRATEGY_POLICY_VERSION. Não copia
// o pool: payload carrega IDs selecionados + projeções normativas.
export function buildDeterministicStrategyV2(input: {
  envelope: Record<string, unknown>;
  jobId: string;
  productId: string;
  platformId: string;
  platformSkillVersion: string;
  // Fonte versionada da Skill (skill.principles) — sem hardcode na engine.
  principles: readonly string[];
  evidence: EvidenceSnapshot;
}): {
  strategy: ProductStrategy;
  strategyContractVersion: typeof STRATEGY_CONTRACT_VERSION_V2;
  strategyPolicyVersion: typeof STRATEGY_POLICY_VERSION_V1;
  sourceOpportunityIds: string[];
} {
  const hypotheses = canonicalHypothesesOf(input.envelope);
  const dedupeStable = (values: string[]): string[] => [...new Set(values)];
  const strategy = validateProductStrategy(
    {
      id: `${input.jobId}-strategy`,
      productId: input.productId,
      jobId: input.jobId,
      version: 1,
      status: "ACTIVE",
      platformId: input.platformId,
      platformSkillVersion: input.platformSkillVersion,
      // primaryPositioning = coreMessage da PRIMEIRA hipótese selecionada.
      primaryPositioning: canonicalText(hypotheses[0]!.coreMessage, "coreMessage"),
      // Projeções normativas: cada campo de UMA fonte semântica, dedup estável
      // na ordem selecionada; campo opcional sem sustentação vira [].
      audiences: dedupeStable(hypotheses.flatMap((h) => (typeof h.audience === "string" ? [h.audience] : []))),
      priorityBenefits: dedupeStable(hypotheses.flatMap((h) => [...h.benefits])),
      priorityObjections: dedupeStable(hypotheses.flatMap((h) => (typeof h.objection === "string" ? [h.objection] : []))),
      priorityArguments: dedupeStable(hypotheses.map((h) => h.coreMessage)),
      priorityAngles: dedupeStable(hypotheses.map((h) => h.angle)),
      // Deriva dos principles versionados da Skill (sem effects/copy inventada).
      communicationPrinciples: [...input.principles],
      opportunities: commercialOpportunitiesFromDiscoveryV2(input.envelope, input.evidence),
    },
    input.evidence,
  );
  return {
    strategy,
    strategyContractVersion: STRATEGY_CONTRACT_VERSION_V2,
    strategyPolicyVersion: STRATEGY_POLICY_VERSION_V1,
    sourceOpportunityIds: hypotheses.map((h) => h.sourceOpportunityId),
  };
}

// Reader canônico de reuso (ADR-033 §3): valida versão/hash/IDs/refs da
// Discovery persistida contra o estado atual — divergência falha fechado.
export function validateDiscoveryReuseV2(
  reuse: { envelope: unknown; discoveryHash: string; sourceOpportunityIds: readonly unknown[] },
  evidence: EvidenceSnapshot,
): { envelope: Record<string, unknown>; discoveryHash: string; sourceOpportunityIds: string[]; opportunities: CommercialOpportunity[] } {
  const hypotheses = canonicalHypothesesOf(reuse.envelope);
  if (typeof reuse.discoveryHash !== "string" || reuse.discoveryHash !== discoveryHashV2(reuse.envelope))
    throw new ContractError("GEN-SCHEMA", "Discovery reutilizada: discoveryHash divergente do envelope", "discoveryHash");
  const knownIds = new Set(hypotheses.map((h) => h.sourceOpportunityId));
  const selected = reuse.sourceOpportunityIds.map((id, index) => {
    if (typeof id !== "string" || !id.trim())
      throw new ContractError("GEN-SCHEMA", `Discovery reutilizada: sourceOpportunityIds[${index}] inválido`, "sourceOpportunityIds");
    return id;
  });
  if (new Set(selected).size !== selected.length)
    throw new ContractError("GEN-SCHEMA", "Discovery reutilizada: sourceOpportunityIds repetidos", "sourceOpportunityIds");
  for (const id of selected)
    if (!knownIds.has(id))
      throw new ContractError("GEN-SCHEMA", `Discovery reutilizada: id selecionado fora do envelope: ${id}`, "sourceOpportunityIds");
  const opportunities = commercialOpportunitiesFromDiscoveryV2(reuse.envelope, evidence);
  const selectedSet = new Set(selected);
  return {
    envelope: reuse.envelope as Record<string, unknown>,
    discoveryHash: reuse.discoveryHash,
    sourceOpportunityIds: selected,
    opportunities: opportunities.filter((opportunity) => selectedSet.has(opportunity.id)),
  };
}

// ─── Fim da seção Etapa 2 candidata ─────────────────────────────────────────

export function normalizeUnderstandingCardinality(
  output: unknown,
): { output: Record<string, unknown>; reductions: UnderstandingCardinalityReduction[] } {
  if (!output || typeof output !== "object" || Array.isArray(output))
    return { output: output as Record<string, unknown>, reductions: [] };
  const record = output as Record<string, unknown>;
  const reductions: UnderstandingCardinalityReduction[] = [];
  const normalized: Record<string, unknown> = { ...record };
  for (const [field, value] of Object.entries(normalized)) {
    if (!Array.isArray(value)) continue;
    const max = CARDINALITY_POLICY[field]?.max ?? 0;
    if (value.length > max) {
      normalized[field] = value.slice(0, max);
      reductions.push({ field, received: value.length, kept: max });
    }
  }
  return { output: normalized, reductions };
}

export type UnderstandingCardinalityReduction = {
  field: string;
  received: number;
  kept: number;
};

// Proveniência de pré-seleção (blocker do Arquiteto): id + motivo apenas —
// nunca texto original nem conteúdo bruto.
// nunca texto original nem conteúdo bruto.
export type PatternReplacement = { field: "cta" | "hook"; replacedWithId: string; reason: string };
function siblingSummary(
  candidates: Array<{ brief: ContentBriefVersion }>,
  reports: GateReport[],
  skipIndex: number,
) {
  return {
    hooks: candidates
      .map((c, index) => (index === skipIndex ? null : normalizeForVariety(c.brief.hook)))
      .filter((hook): hook is string => hook !== null),
    ctaFunctions: candidates.flatMap((c, index) =>
      index === skipIndex ? [] : [classifyCtaFunction(c.brief.cta)],
    ),
  };
}
// ADR-020 adendo 2: requirements server-derived do development vivem NO GATE
// (fonte única dos predicados); engine apenas importa developmentRequirements.

// Contraste determinístico por item, PRÉ-VALIDADO pelo gate
// (validDevelopmentPoint): contexto efêmero — nunca persistência/fabricação.
// Fato por entrada (rotação) + ângulo da própria oportunidade; razão nomeia os
// termos do fato (formato genérico reinstruiria o próprio erro).
function buildRepairContrast(
  grounding: string[],
  offset: number,
  opportunity: ContentOpportunity,
  evidence: EvidenceSnapshot,
): { featureList: string; actionWithReason: string } | undefined {
  if (grounding.length === 0) return undefined;
  const multiTerm = grounding.filter((fact) => /\s/.test(fact));
  const pool = multiTerm.length > 0 ? multiTerm : grounding;
  const fact = pool[offset % pool.length];
  const example = {
    featureList: fact,
    actionWithReason: `Comente ${fact} para conectar ${fact} ao angulo ${opportunity.angle}`,
  };
  return validDevelopmentPoint(example.actionWithReason, evidence)
    ? example
    : undefined;
}

// Contrato canônico compartilhado (cutover v2 — Blueprint): entrada de provider é
// SEMPRE DevelopmentBullet[] {text, action, rationale, factRefs[], cta}; string[]
// NÃO é aceito em jobs novos (GEN-SCHEMA) — leitura de histórico legado é papel do
// leitor versionado (projectBriefPayload). O texto projetado passa por
// validateContentBriefDraft e o conjunto por validateBriefSet (autoridade final).
export function parseStructuredBriefDraft(
  output: Record<string, unknown>,
  evidence: EvidenceSnapshot,
): { draft: ContentBriefDraft; bullets: DevelopmentBullet[] } {
  const { texts, bullets } = parseStructuredDevelopment(output.development, evidence);
  return { draft: validateContentBriefDraft({ ...output, development: texts }), bullets };
}

// Compat: repair projeta apenas o draft; bullets ficam disponíveis via parseStructuredBriefDraft.
export function parseStructuredRepairDraft(
  output: Record<string, unknown>,
  evidence: EvidenceSnapshot,
): ContentBriefDraft {
  return parseStructuredBriefDraft(output, evidence).draft;
}

// ADR-019: geração de cenas por conteúdo — entrada é o briefing INTEIRO +
// evidências + creatorContext projetado; chamada única por conteúdo, fora de
// transação, sempre após briefs PASS. Falha de capability vira set ERROR; o gate
// filtra cenas individualmente e sets abaixo de 2 viram FILTERED. A curadoria
// semântica exige cada set AVAILABLE com pelo menos 2 cenas para concluir o job.
export function buildEvidenceCatalog(params: {
  input?: { name?: string; description?: string; facts?: Record<string, unknown> };
  name?: string;
  description?: string;
  facts?: Record<string, unknown>;
}): EvidenceSnapshot {
  // Aceita tanto a forma aninhada (input) quanto a plana (spread do EngineInput).
  const resolved = params.input ?? {
    name: params.name,
    description: params.description,
    facts: params.facts,
  };
  const input = {
    name: resolved.name ?? "",
    description: resolved.description ?? "",
    facts: resolved.facts ?? {},
  };
  const facts: string[] = [];
  const refs: string[] = [];
  if (input.name && input.name.trim()) {
    facts.push(input.name);
    refs.push("product:name");
  }
  if (input.description && input.description.trim()) {
    facts.push(input.description);
    refs.push("product:description");
  }
  const factsMap = input.facts ?? {};
  for (const [key, value] of Object.entries(factsMap)) {
    const values =
      typeof value === "string"
        ? [value]
        : Array.isArray(value) &&
            value.every((item): item is string => typeof item === "string")
          ? value
          : [];
    const nonEmptyValues = values.filter((item) => item.trim());
    // Relação 1:1 entre fatos e refs: cada valor recebe uma ref própria, mantendo o
    // alinhamento por índice exigido pela proveniência (refFor). A primeira ref mantém
    // o id estável `fact:<chave>` (compatibilidade histórica); as demais recebem sufixo
    // posicional `fact:<chave>:<n>`.
    if (nonEmptyValues.length > 0) {
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
      nonEmptyValues.forEach((item, index) => {
        facts.push(item);
        refs.push(
          index === 0 ? `fact:${safeKey}` : `fact:${safeKey}:${index + 1}`,
        );
      });
    }
  }
  return { facts, refs };
}
const COMMISSION_KEYS: Record<string, true> = {
  commissionType: true,
  commissionValue: true,
  commissionRate: true,
  commissionAmount: true,
};
function stripCommission(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCommission);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !COMMISSION_KEYS[key])
      .map(([key, nested]) => [key, stripCommission(nested)]),
  );
}
// Slice 011 (ADR-018/SPEC): projeção allowlisted do CreatorContext por capability.
// O agregado persistente nunca é enviado ao provider; userId, tenantId, quota,
// targetContentCount e qualquer campo fora da lista ficam de fora.
const CREATOR_CONTEXT_ALLOWLIST: Record<LogicalTask, readonly string[]> = {
  PRODUCT_UNDERSTANDING: [],
  COMMERCIAL_OPPORTUNITY_MAPPING: [
    "language",
    "market",
    "tone",
    "executionStyle",
    "restrictions",
  ],
  STRATEGY_SYNTHESIS: [
    "language",
    "market",
    "tone",
    "executionStyle",
    "restrictions",
    "notes",
  ],
  CONTENT_BRIEF_GENERATION: [
    "language",
    "market",
    "appearsOnCamera",
    "prefersVoiceOver",
    "preferredDurationSeconds",
    "tone",
    "executionStyle",
    "recordingEquipment",
    "recordingSupport",
    "recordsAlone",
    "restrictions",
    "notes",
  ],
  CONTENT_BRIEF_REPAIR: [
    "language",
    "market",
    "appearsOnCamera",
    "prefersVoiceOver",
    "preferredDurationSeconds",
    "tone",
    "executionStyle",
    "recordingEquipment",
    "recordingSupport",
    "recordsAlone",
    "restrictions",
    "notes",
  ],
  CONTENT_QUALITY_JUDGE: ["tone", "executionStyle", "recordingEquipment", "recordingSupport", "recordsAlone", "restrictions", "notes"],
  CONTENT_PART_REPAIR: ["tone", "executionStyle", "recordingEquipment", "recordingSupport", "recordsAlone", "restrictions", "notes"],
};
export function projectCreatorContext(
  task: LogicalTask,
  context: unknown,
): Record<string, unknown> {
  const source =
    context && typeof context === "object" && !Array.isArray(context)
      ? (context as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    CREATOR_CONTEXT_ALLOWLIST[task]
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}
// Projeções allowlistadas por capability: contexto confirmado separado de dados externos.
// O sistema (instruction server-side) é confiável por construção; a capability recebe só o necessário.
function project(
  task: string,
  confirmed: unknown,
  external: unknown,
): Parameters<ModelRouter["complete"]>[1] {
  void task;
  return { trustedContext: confirmed, externalData: external };
}
function isRootShapeSchemaError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "GEN-SCHEMA" && "message" in error && typeof error.message === "string" && /deve ser um objeto JSON|Plano sem opportunities/.test(error.message));
}
// Primeira violação estrutural do item do lote, com issue sanitizada e sem payload.
function isBriefBatchSchemaError(error: unknown): error is GenerationError {
  return error instanceof GenerationError && error.code === "GEN-SCHEMA" &&
    Boolean(error.detail && typeof error.detail === "object" && "task" in error.detail && (error.detail as { task?: unknown }).task === "CONTENT_BRIEF_GENERATION");
}
function isMissingOpportunitiesError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "GEN-SCHEMA" &&
    /sem oportunidades/.test(error.message)
  );
}
// Retry único de contrato para PRODUCT_UNDERSTANDING: SÓ violação GEN-SCHEMA da
// validação server-side (ContractError cru emitido pelo validate no track —
// erros de validador não passam por callCapability, logo não são embrulhados)
// é re-solicitada. GenerationError GEN-SCHEMA (raiz do provider via
// assertProviderOutput/adapter) é falha do provider: uma única chamada e
// propaga — fail-closed. GEN-FACT, provider e abort idem (blocker do Arquiteto).
function isUnderstandingSchemaError(error: unknown): error is ContractError {
  return error instanceof ContractError && error.code === "GEN-SCHEMA";
}
// contractRepair determinístico para o retry de PU: field do erro (fallback
// purchaseBarriers, campo do incidente d0545503), limites da CARDINALITY_POLICY
// vigente e received medido do output bruto da tentativa — nada fabricado.
function contractRepairDetail(
  error: unknown,
  rawOutput: unknown,
): { field: string; min: number | null; max: number; received: number | null } {
  const field =
    error instanceof ContractError && typeof error.field === "string" && error.field
      ? error.field
      : "purchaseBarriers";
  const rule = CARDINALITY_POLICY[field];
  const record = rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput)
    ? rawOutput as Record<string, unknown>
    : undefined;
  const received = record && Array.isArray(record[field]) ? record[field].length : null;
  return {
    field,
    min: rule ? rule.minWithEvidence : null,
    max: rule ? rule.max : 0,
    received,
  };
}

// Checklist determinístico por item do repair de briefings (especificação
export type BriefRepairChecklist = {
  developmentAction?: true;
  removeUnsupportedClaim?: true;
  removeSceneMetacomment?: true;
  removeLocator?: true;
  ctaVariety?: true;
  soloProduction?: true;
};
const BRIEF_CHECKLIST_PREFIXES: ReadonlyArray<readonly [string, keyof BriefRepairChecklist]> = [
  ["development deve orientar", "developmentAction"],
  ["claim", "removeUnsupportedClaim"],
  ["development contém claim sem evidência", "removeUnsupportedClaim"],
  ["script contém claim factual", "removeUnsupportedClaim"],
  ["script contém metainstrução de cena", "removeSceneMetacomment"],
  ["locator interno de evidência", "removeLocator"],
  ["atributo objetivo", "removeUnsupportedClaim"],
  ["função de CTA repetida", "ctaVariety"],
  ["CTA usado como hook", "ctaVariety"],
  ["hook usado como CTA", "ctaVariety"],
  ["produção incompatível", "soloProduction"],
];
export function briefItemChecklist(issues: readonly string[]): BriefRepairChecklist {
  const checklist: BriefRepairChecklist = {};
  for (const [prefix, flag] of BRIEF_CHECKLIST_PREFIXES)
    if (issues.some((issue) => issue.startsWith(prefix))) checklist[flag] = true;
  return checklist;
}

async function callCapability(
  router: ModelRouter,
  task: Parameters<ModelRouter["complete"]>[0],
  input: Parameters<ModelRouter["complete"]>[1],
  signal?: AbortSignal,
  onMetrics?: (metrics: ProviderCallMetrics) => void,
) {
  try {
    return assertProviderOutput(
      await router.complete(task, input, signal, onMetrics),
    );
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "GEN-PROVIDER";
    throw error instanceof GenerationError
      ? error
      : new GenerationError(
          code ?? "GEN-PROVIDER",
          error instanceof Error ? error.message : "Capability falhou",
        );
  }
}

// GEN-VARIETY do plano (teto de hookMechanism por bucket): alimenta o retry
// único com causas — nunca passa silencioso (ADR-019/P5).
function isHookVarietyError(error: unknown): error is ContractError {
  return (
    error instanceof ContractError &&
    /hookMechanism/.test(error.message) &&
    (error.code === "GEN-VARIETY" || (error.code === "GEN-PATTERN" && /fora do allowlist/.test(error.message)))
  );
}
// ADR-025 §1 + B-003-11 (fail-closed): falha isolável por lote é SOMENTE a tipada
// de provider (falha/timeout) ou schema (contrato malformado). Abort/fencing
// repropagam antes; qualquer outro erro — fatal, infraestrutura, bug — repropaga
// e falha o job com seu código tipado, nunca vira SUCCEEDED_PARTIAL silencioso.
function isIsolatableBatchError(error: unknown): error is GenerationError {
  return error instanceof GenerationError && (error.code === "GEN-SCHEMA" || error.code === "GEN-PROVIDER");
}

// Tracker de capability extraído de runFirstGeneration (ADR-019): a geração de
// cenas — tanto in-job quanto no backfill do worker — registra os mesmos
// CapabilityEvents/telemetria do pipeline principal. Corpo idêntico ao original.
export type TrackFn = <T, R = T>(
  task: LogicalTask,
  context: unknown,
  run: (onMetrics?: (metrics: ProviderCallMetrics) => void) => Promise<T>,
  validate?: (output: T) => R,
  // Observabilidade determinística pós-validação (ex.: kept/dropped do
  // gateSceneSet) — mesclada no CapabilityEvent e no capability.completed.
  annotate?: (output: R) => { kept?: number; dropped?: number } | undefined,
  // Atribuição opcional de Content (capabilitidades de item único).
  contentId?: string,
) => Promise<R>;
export type CapabilityTracker = { track: TrackFn; capabilities: CapabilityEvent[] };

export function createCapabilityTracker(opts: {
  jobId: string;
  attempt: number;
  router?: ModelRouter;
}): CapabilityTracker {
  const capabilities: CapabilityEvent[] = [];
  const instructionVersion = opts.router?.describe().instructionVersion;
  const effectiveModel = (task: LogicalTask) =>
    opts.router?.modelFor?.(task) ?? opts.router?.describe().model;
  const track: TrackFn = async <T, R = T>(
    task: LogicalTask,
    context: unknown,
    run: (
      onMetrics?: (metrics: ProviderCallMetrics) => void,
    ) => Promise<T>,
    validate?: (output: T) => R,
    annotate?: (output: R) => { kept?: number; dropped?: number } | undefined,
    contentId?: string,
  ): Promise<R> => {
    const startedAt = Date.now();
    const contextBytes = Buffer.byteLength(JSON.stringify(context), "utf8");
    // TODAS as callbacks de métricas são preservadas: fallback/retry do provider emitem
    // uma callback por tentativa HTTP efetiva e nenhuma pode ser perdida para o custo.
    const capturedAll: ProviderCallMetrics[] = [];
    const captured = () => capturedAll[capturedAll.length - 1];
    emitJobEvent("capability.started", {
      jobId: opts.jobId,
      attempt: opts.attempt,
      task,
      tier: ROUTER_MAP[task],
      model: effectiveModel(task),
      instructionHash: opts.router?.hash?.(task),
      timeoutMs: Number(process.env.GENERATION_PROVIDER_TIMEOUT_MS ?? 180000),
      requestBytes: contextBytes,
      trustedContextBytes: contextBytes,
    });
    try {
      const rawOutput = await run((metrics) => {
        capturedAll.push(metrics);
      });
      const output = validate ? validate(rawOutput) : rawOutput as unknown as R;
      const outputRecord = output && typeof output === "object" && !Array.isArray(output)
        ? output as Record<string, unknown>
        : {};
      const durationMs = Date.now() - startedAt;
      const responseBytes = Buffer.byteLength(JSON.stringify(output), "utf8");
      const extras = annotate?.(output);
      capabilities.push({
        task,
        tier: ROUTER_MAP[task],
        instructionVersion,
        instructionHash: opts.router?.hash?.(task),
        contentId,
        provider: captured()?.provider,
        model: captured()?.model ?? effectiveModel(task),
        usage: captured()?.usage,
        reportedCost: captured()?.reportedCost,
        attempts: capturedAll.length > 0 ? capturedAll : undefined,
        reasoning: captured()?.reasoning,
        providerStatus: captured()?.providerStatus ?? null,
        durationMs,
        contextBytes,
        requestBytes: captured()?.requestBytes,
        trustedContextBytes: captured()?.trustedContextBytes,
        externalBytes: captured()?.externalBytes,
        responseBytes,
        attempt: opts.attempt,
        retry: captured()?.retry ?? 0,
        ok: true,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        kept: extras?.kept,
        dropped: extras?.dropped,
        providerRequestId: captured()?.providerRequestId,
        providerRequestIdSource: captured()?.providerRequestIdSource,
        fallback: captured()?.fallback,
      });
      emitJobEvent("capability.completed", {
        jobId: opts.jobId,
        attempt: opts.attempt,
        task,
        tier: ROUTER_MAP[task],
        model: captured()?.model ?? effectiveModel(task),
        instructionHash: opts.router?.hash?.(task),
        durationMs,
        requestBytes: captured()?.requestBytes,
        trustedContextBytes: captured()?.trustedContextBytes,
        externalBytes: captured()?.externalBytes,
        responseBytes,
        arrayLength: Array.isArray(outputRecord.opportunities)
          ? outputRecord.opportunities.length
          : Array.isArray(outputRecord.items)
            ? outputRecord.items.length
            : Array.isArray(outputRecord.scenes)
              ? outputRecord.scenes.length
              : undefined,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        kept: extras?.kept,
        dropped: extras?.dropped,
        providerRequestId: captured()?.providerRequestId,
        providerRequestIdSource: captured()?.providerRequestIdSource,
      });
      return output;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "GEN-PROVIDER";
      capabilities.push({
        task,
        tier: ROUTER_MAP[task],
        instructionVersion,
        contentId,
        provider: captured()?.provider,
        model: captured()?.model ?? effectiveModel(task),
        usage: captured()?.usage,
        reportedCost: captured()?.reportedCost,
        attempts: capturedAll.length > 0 ? capturedAll : undefined,
        reasoning: captured()?.reasoning,
        providerStatus: captured()?.providerStatus ?? null,
        durationMs,
        contextBytes,
        requestBytes: captured()?.requestBytes,
        trustedContextBytes: captured()?.trustedContextBytes,
        externalBytes: captured()?.externalBytes,
        responseBytes: captured()?.responseBytes ?? 0,
        attempt: opts.attempt,
        retry: captured()?.retry ?? 0,
        ok: false,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        errorCode,
        providerRequestId: captured()?.providerRequestId,
        providerRequestIdSource: captured()?.providerRequestIdSource,
        fallback: captured()?.fallback,
      });
      const safe =
        error instanceof GenerationError &&
        error.detail &&
        typeof error.detail === "object"
          ? (error.detail as Record<string, unknown>)
          : error instanceof ContractError
            ? { issue: error.message, field: error.field }
            : {};
      emitJobEvent("capability.failed", {
        jobId: opts.jobId,
        attempt: opts.attempt,
        task,
        tier: ROUTER_MAP[task],
        model: captured()?.model ?? effectiveModel(task),
        durationMs,
        errorCode,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        errorName: error instanceof Error ? error.name : "unknown",
        issue: typeof safe.issue === "string" ? safe.issue.slice(0, 200) : undefined,
        field: error instanceof ContractError ? error.field : undefined,
        expected: typeof safe.expected === "number" ? safe.expected : undefined,
        received: typeof safe.received === "number" ? safe.received : undefined,
        item: typeof safe.item === "number" ? safe.item : undefined,
        retry: typeof safe.retry === "number" ? safe.retry : undefined,
        errorKind:
          typeof safe.errorKind === "string" ? safe.errorKind : undefined,
        providerStatus:
          typeof safe.providerStatus === "number"
            ? safe.providerStatus
            : undefined,
        endpoint: typeof safe.endpoint === "string" ? safe.endpoint : undefined,
        providerRequestId:
          typeof safe.providerRequestId === "string"
            ? safe.providerRequestId
            : undefined,
        providerRequestIdSource:
          typeof safe.providerRequestIdSource === "string"
            ? safe.providerRequestIdSource
            : undefined,
        rate:
          safe.rate && typeof safe.rate === "object"
            ? (safe.rate as Record<string, string>)
            : undefined,
      });
      throw error;
    }
  };
  return { track, capabilities };
}

// ADR-021: diagnóstico determinístico por item falho — mapeia issues do gate
// para a cascata de checkCodes com os MESMOS predicados (sem payload bruto).
function diagnoseFailure(
  brief: ContentBriefVersion,
  report: GateReport,
  evidence: EvidenceSnapshot,
  reason: FailedItemDiagnostic["reason"],
  position: number,
  quality: FailedItemDiagnostic["quality"],
): FailedItemDiagnostic {
  const checkCodes = new Set<PartialFailureCheckCode>();
  const diagnostic = { actionPresent: true, connectorPresent: true, minGroundingExpected: 2, minGroundingMatched: 2 };
  // Issues de failedItems são rótulos FIXOS mapeados por regex da própria cascata —
  // nunca o texto original (que pode embutir claim/fato/provider).
  const labels = new Set<string>();
  for (const issue of report.issues) {
    if (/duplicata|repetid/.test(issue)) { labels.add("variety_duplicate"); continue; }
    if (/claim sem evidência|sem evidência autorizada|contradito|sem suporte|sem evidência verificável/.test(issue)) {
      labels.add("unverified_claim");
      checkCodes.add("unverified_claim");
    }
    if (/script contém claim factual/.test(issue)) { labels.add("script_claim_missing"); checkCodes.add("script_claim_missing"); }
    if (/script contém metainstrução de cena|metacomentário/.test(issue)) labels.add("script_scene_metacomment");
    if (/orientar comunicação|lista de features|planos de gravação/.test(issue)) {
      // feature_list (label + checkCode) deriva SOMENTE de shotList=true real —
      // nunca da regex do issue (que também cobre ação/razão ausentes).
      let anyShotList = false;
      for (const point of brief.development) {
        const d = diagnoseDevelopmentPoint(point, evidence);
        anyShotList = anyShotList || d.shotList;
        if (!d.actionPresent) checkCodes.add("action_stem_missing");
        if (!d.connectorPresent) checkCodes.add("connector_missing");
        if (d.connectorPresent && d.minGroundingMatched < d.minGroundingExpected) checkCodes.add("grounding_below_min");
        if (d.unverified) checkCodes.add("unverified_claim");
        if (!d.valid) {
          diagnostic.actionPresent = diagnostic.actionPresent && d.actionPresent;
          diagnostic.connectorPresent = diagnostic.connectorPresent && d.connectorPresent;
          diagnostic.minGroundingMatched = Math.min(diagnostic.minGroundingMatched, d.minGroundingMatched);
        }
      }
      labels.add(anyShotList ? "feature_list" : "gate_issue");
      if (anyShotList) checkCodes.add("feature_list");
    } else if (/termos do fato apontado por factRef/.test(issue)) {
      // Ancoragem factRef (v2): checkCode próprio da cascata, sem payload.
      labels.add("factref_grounding");
      checkCodes.add("factref_grounding_below_min");
    } else if (/bullets com cta sem suporte/.test(issue)) {
      // CTA por bullet (v2): checkCode próprio da cascata, sem payload.
      labels.add("cta_invalid");
      checkCodes.add("cta_invalid");
    } else {
      labels.add("gate_issue"); // issue sem mapeamento fixo: rótulo genérico, texto nunca copiado
    }
  }
  return {
    contentId: brief.contentId,
    position,
    reason,
    checkCodes: [...checkCodes],
    issues: [...labels],
    ...(quality && quality.length ? { quality } : {}),
    diagnostic,
  };
}
export async function runFirstGeneration(
  input: EngineInput,
): Promise<EngineResult> {
  const count = validateTargetContentCount(input.targetContentCount);
  const skill = input.skill ?? loadPlatformSkill();
  if (!input.router && !input.allowDeterministicTestFallback)
    throw new GenerationError("GEN-PROVIDER", "Provider não configurado");
  const emit: (stage: GenerationStage) => Promise<void> = async (stage) => {
    emitJobEvent("stage.started", { jobId: input.jobId, attempt, stage });
    if (input.onStage) await input.onStage(stage);
    emitJobEvent("stage.completed", { jobId: input.jobId, attempt, stage });
  };
  const facts = stripCommission(input.facts ?? {}) as Record<string, unknown>;
  let understanding: ProductUnderstanding | null = null;
  const attempt = input.attempt ?? 1;
  const { track, capabilities } = createCapabilityTracker({
    jobId: input.jobId,
    attempt,
    router: input.router,
  });
  // Etapa 2: payload carrega campos versionados além do canônico ProductStrategy.
  let strategyOutput: (ProductStrategy & Record<string, unknown>) | null = null;
  // Etapa 2 candidata: seleção de Discovery e resultado canônico do run.
  let strategySourceOpportunityIds: string[] = [];
  let discoveryCanonicalResult: DiscoveryCanonicalV2 | undefined;
  const understandingReductions: UnderstandingCardinalityReduction[] = [];
  const commercialOpportunities: Record<string, unknown>[] = [];

  let mappingEvidence: EvidenceSnapshot = { facts: [], refs: [] };
  const baseEvidence = buildEvidenceCatalog({ ...input, facts });
  // Cutover E6: o Planner determinístico (harness Etapa 3) é o caminho de
  // produção — o catálogo literal e os mecanismos deliverables do plano V1
  // não participam mais da seleção.
  let plannedV2: PlannedOpportunityV2[] = [];
  // E5: cobertura do Judge — estado de execução por candidate (execução, não
  // resultado semântico; auditors só preenchem EXECUTED com audit real).
  const judgeBatchFailed = new Set<number>();
  const judgeFailureCodes = new Map<number, "GEN-SCHEMA" | "GEN-PROVIDER">();
  let currentQualityAudits: Array<QualityAudit | undefined> = [];
  if (input.router) {
    const understandingContext = {
      productId: input.productId,
      facts,
      evidenceRefsCatalog: baseEvidence.refs,
    };
    await emit("UNDERSTANDING_PRODUCT");
    // Retry único de contrato para PU: cada tentativa normaliza cardinalidade
    // deterministicamente antes da validação; outros GEN-SCHEMA podem re-solicitar
    // uma vez em outro track com contractRepair {field,min,max,received}.
    // GEN-FACT, provider e abort não retentam — fail-closed imediato (ADR-012).
    let lastPuOutput: unknown;
    const understandingCall = (context: unknown) => (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
      callCapability(
        input.router!,
        "PRODUCT_UNDERSTANDING",
        project("PRODUCT_UNDERSTANDING", context, {}),
        input.signal,
        onMetrics,
      );
    try {
      understanding = await track(
        "PRODUCT_UNDERSTANDING",
        understandingContext,
        understandingCall(understandingContext),
        (output) => {
          lastPuOutput = output;
          const normalized = normalizeUnderstandingCardinality(output);
          understandingReductions.push(...normalized.reductions);
          return validateProductUnderstanding(normalized.output, baseEvidence);
        },
      );
    } catch (error) {
      if (!isUnderstandingSchemaError(error)) throw error;
      const retryContext = {
        ...understandingContext,
        contractRepair: contractRepairDetail(error, lastPuOutput),
      };
      understanding = await track(
        "PRODUCT_UNDERSTANDING",
        retryContext,
        understandingCall(retryContext),
        (output) => {
          // ADR-020 adendo 5: violação de cardinalidade persistindo após o retry
          // → redução determinística first-N (loud), depois validator revalida;
          // falhas NÃO-cardinalidade continuam fail-closed.
          const normalized = normalizeUnderstandingCardinality(output);
          understandingReductions.push(...normalized.reductions);
          return validateProductUnderstanding(normalized.output, baseEvidence);
        },
      );
    }
    mappingEvidence = {
      facts: [...baseEvidence.facts, ...(understanding?.evidenceRefs ?? [])],
      refs: [...baseEvidence.refs, ...(understanding?.evidenceRefs ?? [])],
    };
    // Projeção compacta e allowlisted para o mapping: fatos essenciais do Product,
    // catálogo de evidências e campos necessários do understanding. Sem agregado bruto
    // de facts, Strategy, Plan, Skill completa ou memória histórica.
    const mappingContext = {
      productId: input.productId,
      product: {
        name: input.name,
        description: input.description,
        category: facts.category,
        brand: facts.brand,
        priceAmount: facts.priceAmount,
        priceCurrency: facts.priceCurrency,
        // Desconto (ADR-031): fora do contrato ativo — não projetado.
      },
      understanding: {
        category: understanding?.category,
        coreUseCases: understanding?.coreUseCases,
        functionalBenefits: understanding?.functionalBenefits,
        emotionalBenefits: understanding?.emotionalBenefits,
        desiredOutcomes: understanding?.desiredOutcomes,
        purchaseTriggers: understanding?.purchaseTriggers,
        purchaseBarriers: understanding?.purchaseBarriers,
        evidenceRefs: understanding?.evidenceRefs,
      },
      evidenceRefsCatalog: mappingEvidence.refs,
      maxOpportunities: mappingOpportunityLimit(),
      creatorContext: projectCreatorContext(
        "COMMERCIAL_OPPORTUNITY_MAPPING",
        input.creatorContext,
      ),
    };
    await emit("MAPPING_COMMERCIAL_OPPORTUNITIES");
    // Etapa 2 candidata (ADR-033 §12): com Discovery persistida resolvida pelo
    // worker, a fonte é o resultado intermediário — Mapping NÃO é re-chamado.
    // PU permanece no candidato (retirada exige A/B da Etapa 6).
    if (input.reusedDiscovery) {
      const selectedIds = Array.isArray(input.reuseStrategy?.sourceOpportunityIds)
        ? (input.reuseStrategy!.sourceOpportunityIds as readonly unknown[])
        : [];
      const reuse = validateDiscoveryReuseV2(
        {
          envelope: input.reusedDiscovery.envelope,
          discoveryHash: input.reusedDiscovery.discoveryHash,
          sourceOpportunityIds: selectedIds,
        },
        mappingEvidence,
      );
      commercialOpportunities.push(...reuse.opportunities);
      strategySourceOpportunityIds = reuse.sourceOpportunityIds;
      discoveryCanonicalResult = { origin: "reused", sourceDiscoveryRef: input.reusedDiscovery.sourceDiscoveryRef };
    } else {
      // Mapping envelope do provider é não confiável: um único retry de contrato re-solicita
      // opportunities quando o corpo veio sem elas (200 com prosa/arrays vazios). Falha fechada
      // depois do retry — sem inventar oportunidades.
      let envelope: Record<string, unknown>;
      const mappingCall = (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
        callCapability(
          input.router!,
          "COMMERCIAL_OPPORTUNITY_MAPPING",
          project("COMMERCIAL_OPPORTUNITY_MAPPING", mappingContext, {}),
          input.signal,
          onMetrics,
        );
      // Cutover E6 Stage 2: Discovery V2 — envelope versionado com hypotheses
      // (commercialEffects/angle/coreMessage por oportunidade) validadas
      // contra o evidenceRefsCatalog. Fail-closed.
      const validateMapping = (output: Record<string, unknown>) => {
        const discovery = parseDiscoveryEnvelopeV2(output, mappingEvidence);
        return discovery;
      };
      try {
        envelope = await track(
          "COMMERCIAL_OPPORTUNITY_MAPPING",
          mappingContext,
          mappingCall,
          validateMapping,
        ) as Record<string, unknown>;
      } catch (error) {
        // Retry único e específico: envelope 200 sem `opportunities` é re-solicitado uma vez
        // com o mesmo contexto; qualquer outro erro segue fail-closed. Sem inventar dados.
        // Decisão Arquiteto: qualquer violação de contrato no mapping (envelope
        // sem opportunities OU campo malformado, ex.: objection inválido) tem UMA
        // re-solicitação com o mesmo contexto; segunda falha segue fail-closed,
        // sem sanitizar nem inventar dados.
        if (!(isMissingOpportunitiesError(error) || error instanceof ContractError)) throw error;
        envelope = await track(
          "COMMERCIAL_OPPORTUNITY_MAPPING",
          mappingContext,
          mappingCall,
          validateMapping,
        );
      }
      // Etapa 2 candidata: normalização JSON-safe com IDs server-owned estáveis,
      // Opportunities validadas contra a evidência autorizada (fail-closed) e
      // hash canônico do envelope persistido (ADR-033 §3).
      const normalized = normalizeDiscoveryEnvelopeV2(envelope as unknown as DiscoveryEnvelopeV2, input.jobId);
      commercialOpportunities.push(...commercialOpportunitiesFromDiscoveryV2(normalized.envelope, mappingEvidence));
      strategySourceOpportunityIds = normalized.sourceOpportunityIds;
      discoveryCanonicalResult = {
        origin: "fresh",
        envelope: normalized.envelope,
        discoveryHash: normalized.discoveryHash,
        sourceOpportunityIds: normalized.sourceOpportunityIds,
      };
    }
    await emit("BUILDING_STRATEGY");
    // Etapa 2 candidata: Strategy determinística versionada (ADR-033 §3) —
    // projeções normativas com proveniência de Discovery; sem LLM.
    // reuseStrategy (ADR-021) preservado: payload de origem + IDs selecionados.
    if (input.reusedDiscovery && input.reuseStrategy) {
      // A linha ACTIVE é reutilizada intacta no finalize; estes campos só
      // alimentam telemetria do run novo (referência, não reescrita).
      const reuseContractVersion = STRATEGY_CONTRACT_VERSION_V2;
      const reusePolicyVersion = typeof input.reuseStrategy.strategyPolicyVersion === "string" && input.reuseStrategy.strategyPolicyVersion
        ? input.reuseStrategy.strategyPolicyVersion
        : STRATEGY_POLICY_VERSION_V1;
      strategyOutput = {
        ...validateProductStrategy(
          {
            ...input.reuseStrategy,
            id: `${input.jobId}-strategy`,
            productId: input.productId,
            jobId: input.jobId,
            version: 1,
            status: "ACTIVE",
            platformId: skill.id,
            platformSkillVersion: skill.version,
            opportunities: commercialOpportunities,
          },
          mappingEvidence,
        ),
        strategyContractVersion: reuseContractVersion,
        strategyPolicyVersion: reusePolicyVersion,
        sourceOpportunityIds: strategySourceOpportunityIds,
      };
    } else {
      const built = buildDeterministicStrategyV2({
        envelope: discoveryCanonicalResult && discoveryCanonicalResult.origin === "fresh"
          ? discoveryCanonicalResult.envelope
          : {},
        jobId: input.jobId,
        productId: input.productId,
        platformId: skill.id,
        platformSkillVersion: skill.version,
        principles: skill.principles,
        evidence: mappingEvidence,
      });
      strategyOutput = {
        ...built.strategy,
        strategyContractVersion: built.strategyContractVersion,
        strategyPolicyVersion: built.strategyPolicyVersion,
        sourceOpportunityIds: built.sourceOpportunityIds,
      };
      strategySourceOpportunityIds = built.sourceOpportunityIds;
    }
    const strategy = strategyOutput;
    // Cutover E6: Planner determinístico (harness Etapa 3) é o plano de
    // produção — CONTENT_PLAN_GENERATION foi removido. Falhas de seleção são
    // fail-closed (sem fallback V1).
    {
      const v2CreatorConstraints = v2ConstraintsFromCreatorContext(input.creatorContext);
      try {
        const portfolio = runPlannerV2({
          jobId: input.jobId,
          productId: input.productId,
          targetContentCount: count,
          commercialOpportunities: commercialOpportunities as CommercialOpportunity[],
          evidence: mappingEvidence,
          memory: input.memory,
          creatorConstraints: v2CreatorConstraints,
        });
        plannedV2 = portfolio.planned;
        emitJobEvent("v2.planner.completed", {
          jobId: input.jobId,
          attempt,
          planned: plannedV2.length,
          plannerPolicyVersion: portfolio.plannerPolicyVersion,
          skillBinding: `${portfolio.binding.platformSkillVersion}/${portfolio.binding.creativeSystemVersion}`,
          briefPolicyVersion: BRIEF_GENERATION_POLICY_V2,
          plannerOutputHash: portfolio.outputHash,
          enginePath: "v2",
        });
      } catch (error) {
        throw error;
      }
    }
  }

  const allowedSourceIds = new Set(commercialOpportunities.map((opportunity) => String(opportunity.id)));
  const opportunities: ContentOpportunity[] = contentOpportunitiesFromPortfolio(plannedV2, input.jobId, allowedSourceIds);

  const strategy = strategyOutput ?? {
        id: `${input.jobId}-strategy`,
        productId: input.productId,
        jobId: input.jobId,
        version: 1,
        status: "ACTIVE",
        platformId: skill.id,
        platformSkillVersion: skill.version,
        primaryPositioning: input.description,
        audiences: ["pessoas interessadas no produto"],
        priorityBenefits: [],
        priorityObjections: [],
        priorityArguments: [],
        priorityAngles: [],
        communicationPrinciples: [],
        opportunities: commercialOpportunities,
      };
  const plan = validateContentPlan({
    id: `${input.jobId}-plan`,
    productId: input.productId,
    strategyVersion: 1,
    targetContentCount: count,
    platformId: skill.id,
    platformSkillVersion: skill.version,
    opportunities,
  });

  // Brief Generator: batches sequenciais de 4-8, um lote por vez (sem Promise.all ilimitado).
  // Cada item mantém vínculo com a oportunidade de conteúdo correspondente para repair causal.
  interface BriefCandidate {
    brief: ContentBriefVersion;
    opportunity: ContentOpportunity;
  }
  const candidates: BriefCandidate[] = [];
  const size = batchSize();
  const evidence = buildEvidenceCatalog({ ...input, facts });
  // Cutover E6: padrões literais do catálogo saem da geração; proxies de
  // estilo (hook-pergunta/função de CTA) são advisory no gate.
  const selectedPatternsAll: Array<{ hook: GatePattern; cta: GatePattern }> = [];
  const patternReplacements: PatternReplacement[] = [];
  const briefGateOptions = { styleAuthority: false };
  await emit("GENERATING_BRIEFS");
  // Bullets estruturados efêmeros por contentId (judge/parte repair); nunca persistidos.
  const bulletsByContentId = new Map<string, DevelopmentBullet[]>();
  // Diagnóstico redigido por bullet para itens que falharam no gate de development.
  const developmentDiagnosticsFor = (contentId: string) => {
    const bullets = bulletsByContentId.get(contentId);
    return bullets ? parseStructuredDevelopment(bullets, evidence).diagnostics : undefined;
  };
  // Alvo do repair (ADR-020): índices dos bullets que falham qualquer critério
  // allowlisted do diagnóstico (design 2026-09-19) — factTermsInRationale conta
  // apenas quando factGroundingApplicable.
  const failedBulletIndexesFor = (contentId: string): number[] =>
    failedBulletTargetsFor(contentId).map(({ index }) => index);
  // Alvo determinístico do repair (v2): para cada bullet falho, os TERMOS
  // autorizados do próprio factRef (de developmentRequirements, sem inventar
  // fatos) — o provider ancora o trecho pós-conector nesses termos.
  const failedBulletTargetsFor = (contentId: string): Array<{ index: number; factRefs: string[]; terms: string[] }> =>
    (developmentDiagnosticsFor(contentId) ?? [])
      .map((d) => ({ d }))
      .filter(({ d }) => developmentDiagnosticNeedsRepair(d))
      .map(({ d }) => {
        const refs = bulletsByContentId.get(contentId)?.[d.index]?.factRefs ?? [];
        const terms = [...new Set(refs.flatMap((ref) => developmentGroundingTerms(evidence.facts[evidence.refs.indexOf(ref)] ?? "")))].slice(0, 12);
        return { index: d.index, factRefs: refs, terms };
      });
  const generateBatch = async (
    entries: Array<{
      opportunity: ContentOpportunity;
      causes?: string[];
      position: number;
    }>,
  ): Promise<BriefCandidate[]> => {
    // Cutover E6: contexto do provider é a allowlist canônica V2 — projeções
    // por oportunidade (blueprint + evidência validada) + platform rules +
    // creatorContext projetado; IDs persistentes, catálogo e selectedPatterns
    // não cruzam.
    const batchContext = {
      realizations: entries.map(({ position }) =>
        buildRealizationContext(buildRealizationInput(plannedV2[position - 1]!, evidence, input.memory, {
          productFacts: v2ProductFactsProjection(evidence),
          creatorConstraints: v2ConstraintsFromCreatorContext(input.creatorContext) ?? v2NeutralConstraints(),
          platformRules: { ...skill.validationRules },
        })),
      ),
      platformRules: { ...skill.validationRules },
      creatorContext: projectCreatorContext(
        "CONTENT_BRIEF_GENERATION",
        input.creatorContext,
      ),
    };
    let rawBatch: unknown[] = [];
    let validatedBatch: ContentBriefVersion[] | null = null;
    if (input.router) {
      const batchCall = (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
        callCapability(
          input.router!,
          "CONTENT_BRIEF_GENERATION",
          project("CONTENT_BRIEF_GENERATION", batchContext, {}),
          input.signal,
          onMetrics,
        );
        // Retry único de contrato para o lote: cardinalidade divergente OU item estruturalmente
      // inválido re-solicita uma vez com o
      // mesmo contexto; persistindo, GEN-SCHEMA tipado com detail sanitizado e fail-closed.
      const batchIssue = (
        items: unknown[],
      ): { item: number; issue: string } | null =>
        items.length !== entries.length
          ? {
              item: 0,
              issue: `cardinalidade divergente: esperado ${entries.length}, recebido ${items.length}`,
          }
          : null;
      const validateBatch = (producer: Record<string, unknown>) => {
        {
          // Cutover E6 (decisão A): envelope exato {developmentSchemaVersion: 2,
          // items} + item/bullet com allowlists exatas — violação → GEN-SCHEMA
          // com retry único e, persistindo, fail-closed (sem projeção silenciosa).
          let itemsV2: unknown[];
          try {
            itemsV2 = parseBriefBatchEnvelopeV2(producer).items;
          } catch (error) {
            if (error instanceof ContractError)
              throw new GenerationError("GEN-SCHEMA", "Lote de briefings invalido", true, { task: "CONTENT_BRIEF_GENERATION", item: 0, issue: error.message, expected: entries.length, received: 0 });
            throw error;
          }
          const issueV2 = batchIssue(itemsV2);
          if (issueV2)
            throw new GenerationError("GEN-SCHEMA", "Lote de briefings invalido", true, { task: "CONTENT_BRIEF_GENERATION", item: issueV2.item, issue: issueV2.issue, expected: entries.length, received: itemsV2.length });
          const parsedV2 = itemsV2.map((item, index) => {
            try {
              return parseStructuredBriefDraftV2(item, evidence);
            } catch (error) {
              if (error instanceof ContractError)
                throw new GenerationError("GEN-SCHEMA", "Lote de briefings invalido", true, { task: "CONTENT_BRIEF_GENERATION", item: index + 1, issue: error.message, expected: entries.length, received: itemsV2.length });
              throw error;
            }
          });
          parsedV2.forEach(({ bullets }, index) => {
            bulletsByContentId.set(`${input.jobId}-content-${entries[index]!.position}`, bullets);
          });
          return { items: assignServerBriefIds(parsedV2.map(({ draft }) => draft), input.jobId, 0) };
        }
      };
      const generateValidatedBatch = () => track(
        "CONTENT_BRIEF_GENERATION",
        batchContext,
        batchCall,
        validateBatch,
      );
      // Retry único de contrato (envelope/allowlists V2) — persistindo, fail-closed.
      try {
        validatedBatch = (await generateValidatedBatch()).items;
      } catch (firstError) {
        if (!isBriefBatchSchemaError(firstError)) throw firstError;
        try {
          validatedBatch = (await generateValidatedBatch()).items;
        } catch (secondError) {
          if (!isBriefBatchSchemaError(secondError)) throw secondError;
          const detail = secondError instanceof GenerationError && secondError.detail && typeof secondError.detail === "object"
            ? secondError.detail as Record<string, unknown>
            : {};
          throw new GenerationError("GEN-SCHEMA", "Lote de briefings invalido", true, { ...detail, retried: true });
        }
      }
      rawBatch = validatedBatch ?? [];
    } else {
      // Fallback determinístico (testes): fixtures COMPLIANTES com o contrato v2 —
      // bullets ancorados no primeiro fato autorizado não-name; sem fato não-name
      // o fallback falha EXPLICITAMENTE (nunca bullets vazios/factRefs vazios).
      const factIndex = evidence.facts.findIndex((_fact, i) => evidence.refs[i] !== "product:name");
      if (factIndex < 0)
        throw new ContractError("GEN-FACT", "Fallback determinístico exige fato autorizado (não product:name) para montar bullets compliantes");
      const fact = String(evidence.facts[factIndex]);
      const ref = String(evidence.refs[factIndex]);
      rawBatch = entries.map((entry) => {
        const position = entry.position;
        return {
          angle: `Ângulo ${position}`,
          hook: `Veja como ${input.name} pode ajudar`,
          development: [
            { text: `Mostre ${fact} para explicar como ${fact} ajuda no uso`, action: "Mostre", rationale: `para explicar como ${fact} ajuda no uso`, factRefs: [ref], cta: "Confira o produto na página." },
            { text: `Comente ${fact} para conectar ${fact} ao dia a dia`, action: "Comente", rationale: `para conectar ${fact} ao dia a dia`, factRefs: [ref], cta: "Confira o produto na página." },
          ],
          script: `Apresente ${input.name} de forma natural e demonstre o uso.`,
          cta: "Confira o produto.",
        };
      });
      (rawBatch as Array<{ development: DevelopmentBullet[] }>).forEach((item, index) => {
        bulletsByContentId.set(`${input.jobId}-content-${entries[index]!.position}`, item.development);
      });
    }
    const assigned = validatedBatch ?? assignServerBriefIds(rawBatch, input.jobId, 0);
    return assigned.map((brief, index) => {
      const position = entries[index].position;
      return {
        brief: {
          ...brief,
          contentId: `${input.jobId}-content-${position}`,
          briefVersionId: `${input.jobId}-brief-${position}`,
        },
        opportunity: entries[index].opportunity,
      };
    });
  };
  for (let start = 0; start < opportunities.length; start += size) {
    const batch = opportunities
      .slice(start, start + size)
      .map((opportunity, offset) => ({
        opportunity,
        position: start + offset + 1,
      }));
    candidates.push(...(await generateBatch(batch)));
  }
  // Repair causal e limitado: somente itens rejeitados recebem nova geração, com causas + oportunidade original.
  const selectedPatterns = selectedPatternsAll;
  const validateCandidates = () =>
    validateBriefSet(
      candidates.map((c) => c.brief),
      evidence,
      "tiktok-commerce",
      skill.version,
      selectedPatterns,
      projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
      // v4: ancoragem factRef revalida com os bullets do próprio item; após o
      // part repair o mapa mantém o factRef ORIGINAL por índice.
      bulletsByContentId,
      briefGateOptions,
    );
  let reports = validateCandidates();
  emitJobEvent("v2.style.observations", {
      jobId: input.jobId,
      attempt,
      enginePath: "v2",
      ...briefStyleObservations(candidates.map(({ brief }) => brief)),
    });
  const maxRepairs = Number(process.env.GENERATION_MAX_REPAIRS ?? 2);
  let repairCount = 0;
  let repairRounds = 0;
  const repairCauses: Array<{ briefId: string; causes: string[] }> = [];
  for (let round = 0; round < maxRepairs; round++) {
    const rejected = candidates
      .map((c, i) => ({ c, i, report: reports[i] }))
      .filter(
        ({ report }) =>
          report?.decision === "REPAIR" || report?.decision === "REJECT",
      );
    if (rejected.length === 0) break;
    repairCount += rejected.length;
    repairRounds += 1;
    emitJobEvent("repair.started", {
      jobId: input.jobId,
      attempt,
      expected: rejected.length,
      retry: round,
    });
    const repairStartedAt = Date.now();
    // ADR-020 — repair PER-ITEM em CONTENT_BRIEF_REPAIR/HIGH: uma oportunidade
    // por chamada (cardinalidade trivial, isolamento de erro), contexto
    // allowlisted (oportunidade/fatos/pattern seguro/issues/checklist/sibling
    // summary determinístico), saída = 1 BriefDraft, substituição por índice e
    // exact-N preservados; o gate revalida o CONJUNTO inteiro ao fim do round.
    const repairedSet = new Set(rejected.map((r) => r.i));
    rejected.forEach(({ c, report }) => {
      repairCauses.push({
        briefId: `${c.brief.contentId}:${c.brief.briefVersionId}`,
        causes: (report?.issues ?? []).slice(0, 8).map((cause) => cause.slice(0, 200)),
      });
    });
    let received = 0;
    for (const { c, report, i } of rejected) {
      const causes = (report?.issues ?? []).slice(0, 8).map((cause) => cause.slice(0, 200));
      // Cutover E6: contexto de repair em allowlist estrita — realização
      // canônica + diagnóstico objetivo do próprio item.
      const repairContext =
        {
            realization: buildRealizationContext(buildRealizationInput(plannedV2[i]!, evidence, input.memory)),
            issues: causes,
            repairChecklist: briefItemChecklist(causes),
            developmentDiagnostics: developmentDiagnosticsFor(c.brief.contentId) ?? [],
            failedBulletIndexes: failedBulletIndexesFor(c.brief.contentId),
            failedBullets: failedBulletTargetsFor(c.brief.contentId),
            siblingSummary: siblingSummary(candidates, reports, i),
            creatorContext: projectCreatorContext("CONTENT_BRIEF_REPAIR", input.creatorContext),
          };

      try {
        const replacement = await track(
          "CONTENT_BRIEF_REPAIR",
          repairContext,
          (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
            callCapability(
              input.router!,
              "CONTENT_BRIEF_REPAIR",
              project("CONTENT_BRIEF_REPAIR", repairContext, {}),
              input.signal,
              onMetrics,
            ),
          (output: Record<string, unknown>) => {
            const parsed = parseBriefRepairDraftV2(output, evidence);
            // Repair legacy string[] NUNCA limpa o mapa de um item estruturado:
            // os bullets originais permanecem por índice e o hard gate segue
            // exigindo a ancoragem factRef no trecho após o conector (sem bypass
            // do gap 4). O mapa só é atualizado com bullets estruturados novos.
            if (parsed.bullets.length > 0)
              bulletsByContentId.set(c.brief.contentId, parsed.bullets);
            return {
              ...parsed.draft,
              contentId: `${input.jobId}-content-${i + 1}`,
              briefVersionId: `${input.jobId}-brief-${i + 1}`,
              version: 1 as const,
            } satisfies ContentBriefVersion;
          },
          undefined,
          c.brief.contentId,
        );
        candidates[i] = { brief: replacement, opportunity: c.opportunity };
        received += 1;
      } catch (error) {
        // Item não substituído neste round (telemetria capability.failed já
        // emitida pelo track): o item reprovado permanece e o gate final decide
        // — GEN-REPAIR-EXHAUSTED com o resumo sanitizado, nunca sucesso parcial.
      }
    }
    reports = validateCandidates();
    emitJobEvent("repair.completed", {
      jobId: input.jobId,
      attempt,
      durationMs: Date.now() - repairStartedAt,
      expected: rejected.length,
      received,
      retry: round,
      gateReports: sanitizeGateReports(
        reports.filter((_, index) => repairedSet.has(index)),
      ),
    });
  }
  // ADR-021: partição declarada — somente itens PASS no hard gate seguem para
  // cenas/judge; falhas viram assinatura residual por item (nunca payload bruto).
  const candidateReports = validateBriefSet(
    candidates.map((c) => c.brief),
    evidence,
    "tiktok-commerce",
    skill.version,
    selectedPatterns,
    projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
    bulletsByContentId,
    briefGateOptions,
  );
  const hardIdx = candidates.map((_, i) => i).filter((i) => candidateReports[i].decision === "PASS");
  const hardFailIdx = candidates.map((_, i) => i).filter((i) => candidateReports[i].decision !== "PASS");
  if (hardIdx.length === 0)
    throw new GenerationError(
      "GEN-REPAIR-EXHAUSTED",
      "Repair não produziu briefing válido",
      true,
      {
        task: "CONTENT_BRIEF_GENERATION",
        rounds: repairRounds,
        expected: count,
        received: 0,
        rejected: sanitizeGateReports(candidateReports.filter((report) => report.decision !== "PASS")),
        ...(debugGateIssues(candidateReports.filter((report) => report.decision !== "PASS"), developmentDiagnosticsFor) ?? {}),
      },
    );
  const hard = hardIdx.map((i) => candidates[i]);
  // ADR-019: cenas são obrigatórias para a curadoria semântica; sets indisponíveis
  // ou com menos de duas cenas válidas bloqueiam o sucesso do job.
  // Etapa 4 V2: Scene Skeleton determinístico cobre a mesma função de
  // CONTENT_SCENE_IDEAS por Content — nenhuma chamada de provider no caminho V2;
  // o set continua separado do brief e persiste somente em ContentSceneSet.
  const sceneSets = buildSceneSkeletonSets(
    hard.map(({ brief }) => brief),
    evidence,
    input.creatorContext ?? {},
  );
    const qualityAudits: QualityAudit[] = [];
  const qualityRepairs: Array<{ contentId: string; part: QualityPart; round: number; criterion: string; outcome: "REPAIRED" }> = [];
  // ADR-021: partições declaradas — índices do subconjunto hard (cenas/judge).
  const objectiveFailureIdx = new Set<number>();
  const compositionFailed = new Set<number>();
  const varietyDropped = new Set<number>();
  const compositionDiagnostics: GateReport[] = [];
  const sceneDiagnostics: GateReport[] = [];
  if (input.router) {
    // ADR-025: curadoria em lote — transporte apenas, nunca mudança semântica; a
    // unidade de decisão permanece Content + QualityPart + round. O lote é
    // homogêneo (mesmo job, evidência, creator context, skill e round) e a
    // identidade da resposta é o contentId server-derived, NUNCA a posição.
    currentQualityAudits = hard.map(() => undefined);
    const judgeItemContext = (index: number) => {
      const candidate = hard[index];
      const scenes = sceneSets[index];
      return {
        contentId: candidate.brief.contentId,
        // Mesmo contrato estruturado efêmero recebido pelo judge (design 2026-09-18);
        // o judge não o avalia factualmente — apenas contexto de leitura.
        development: (bulletsByContentId.get(candidate.brief.contentId) ?? []).map(({ text, factRefs, cta }) => ({ text, factRefs, cta })),
        parts: QUALITY_PARTS.map((part) => ({
          part,
          content: part === "scenes" ? scenes.scenes.map(({ description }) => description) : candidate.brief[part],
        })),
        opportunity: {
          angle: candidate.opportunity.angle,
          commercialObjective: candidate.opportunity.commercialObjective,
          coreMessage: candidate.opportunity.coreMessage,
        },
      };
    };
    const judgeBatch = async (indices: number[], round: number): Promise<void> => {
      for (let start = 0; start < indices.length; start += JUDGE_BATCH_MAX) {
        const chunk = indices.slice(start, start + JUDGE_BATCH_MAX);
        const items = chunk.map(judgeItemContext);
        const context = {
          round,
          relevantFacts: evidence.facts,
          creatorContext: projectCreatorContext("CONTENT_QUALITY_JUDGE", input.creatorContext),
          skillSlice: projectPlatformSkillSlice(skill, "brief"),
          items,
        };
        try {
          const audits = await track(
            "CONTENT_QUALITY_JUDGE",
            context,
            (onMetrics?: (metrics: ProviderCallMetrics) => void) => callCapability(
              input.router!,
              "CONTENT_QUALITY_JUDGE",
              project("CONTENT_QUALITY_JUDGE", context, {}),
              input.signal,
              onMetrics,
            ),
            (output) => parseQualityAuditBatch(output, items.map(({ contentId }) => contentId), round),
          );
          chunk.forEach((index, position) => {
            qualityAudits.push(audits[position]);
            currentQualityAudits[index] = audits[position];
          });
        } catch (error) {
          if (input.signal?.aborted) throw error;
          // ADR-025 §1 + B-003-11: lote indisponível (GEN-PROVIDER) ou malformado
          // (GEN-SCHEMA) não aprova os irmãos nem repete o job inteiro — os itens
          // do lote ficam isolados e não publicam (faltantes no contrato do
          // ADR-021); a telemetria capability.failed do track registra a causa.
          // Erro fatal/desconhecido repropaga: fail-closed, sem parcial indevido.
          if (!isIsolatableBatchError(error)) throw error;
          const judgeErrorCode = error instanceof GenerationError && (error.code === "GEN-SCHEMA" || error.code === "GEN-PROVIDER")
            ? error.code
            : "GEN-PROVIDER";
          for (const index of chunk) {
            judgeBatchFailed.add(index);
            judgeFailureCodes.set(index, judgeErrorCode);
          }
        }
      }
    };
    const hardGateComposition = (updatedIndex: number) => {
      const current = hard[updatedIndex].brief;
      const hardReports = validateBriefSet(
        hard.map(({ brief }) => brief), evidence, "tiktok-commerce", skill.version,
        selectedPatterns, projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
        bulletsByContentId,
        briefGateOptions,
      );
      const scene = sceneSets[updatedIndex];
      const gatedScenes = gateSceneSet(
        scene.scenes,
        current,
        evidence,
        input.creatorContext ?? {},
      );
      const compositionReport = hardReports[updatedIndex];
      const rejectedReports = compositionReport && compositionReport.decision !== "PASS"
        ? [compositionReport]
        : [];
      const scenesInvalid = gatedScenes.kept.length < 2 || gatedScenes.dropped > 0;
      if (scenesInvalid) rejectedReports.push({
        briefId: `${current.contentId}:${current.briefVersionId}`,
        gateVersion: GATE_POLICY_VERSION,
        factualStatus: "SUPPORTED",
        claimType: "objetivo",
        evidenceRefs: [],
        structuralStatus: "PASS",
        platformStatus: "PASS",
        varietyStatus: "PASS",
        issues: ["scene_set_invalid"],
        decision: "REJECT",
      } as typeof hardReports[number]);
      // ADR-021: composição reprovada falha o item; reports viram diagnóstico residual.
      return rejectedReports;
    };

    // ADR-025 §3: repair em lote SOMENTE da mesma QualityPart e do mesmo round —
    // hook, script e cta até 3 itens, development até 2, scenes individual
    // (REPAIR_BATCH_MAX). Resposta {items:[{contentId, content}]} validada contra
    // o conjunto exato de IDs; conteúdo de cada item validado e recomposto
    // individualmente, isolando o item sem derrubar os irmãos.
    const repairPartBatch = async (
      pending: Array<{ index: number; judgment: QualityJudgment }>,
      part: QualityPart,
      round: number,
      modified: Set<number>,
    ): Promise<void> => {
      const batchMax = REPAIR_BATCH_MAX[part];
      for (let start = 0; start < pending.length; start += batchMax) {
        const chunk = pending.slice(start, start + batchMax);
        const items = chunk.map(({ index, judgment }) => ({
          contentId: hard[index].brief.contentId,
          content: part === "scenes" ? sceneSets[index].scenes.map(({ description }) => description) : hard[index].brief[part],
          criterion: judgment.criterion,
          reason: reasonText(judgment.reason),
          opportunity: {
            angle: hard[index].opportunity.angle,
            commercialObjective: hard[index].opportunity.commercialObjective,
            coreMessage: hard[index].opportunity.coreMessage,
          },
        }));
        const context = {
          part,
          round,
          creatorContext: projectCreatorContext("CONTENT_PART_REPAIR", input.creatorContext),
          items,
        };
        let replacements: Array<{ contentId: string; content: unknown }>;
        try {
          replacements = await track(
            "CONTENT_PART_REPAIR",
            context,
            (onMetrics?: (metrics: ProviderCallMetrics) => void) => callCapability(
              input.router!, "CONTENT_PART_REPAIR", project("CONTENT_PART_REPAIR", context, {}), input.signal, onMetrics,
            ),
            (output) => parseQualityRepairBatch(output, items.map(({ contentId }) => contentId), part),
          );
        } catch (error) {
          if (input.signal?.aborted) throw error;
          // ADR-025 §1 + B-003-11: somente falha/timeout de provider (GEN-PROVIDER)
          // ou contrato malformado (GEN-SCHEMA) isola o lote — os itens mantêm a
          // parte original (fallback do engine) e seguem para a validação objetiva
          // final, sem repetir o job e sem virar faltante por causa semântica.
          // Erro fatal ou desconhecido repropaga: fail-closed, sem parcial indevido.
          if (!isIsolatableBatchError(error)) throw error;
          continue;
        }
        for (const { contentId, content } of replacements) {
          const index = chunk.find((item) => hard[item.index].brief.contentId === contentId)!.index;
          const candidate = hard[index];
          const originalCandidate = candidate;
          const originalSceneSet = sceneSets[index];
          const hadOriginalBullets = bulletsByContentId.has(candidate.brief.contentId);
          const originalBullets = bulletsByContentId.get(candidate.brief.contentId);
          // ADR-025 §1: validação individual da parte retornada — falha isola o
          // item (a parte original é preservada), nunca os irmãos do lote.
          // Cutover v2: development chega como DevelopmentBullet[] e é validado
          // pelo parser canônico; o mapa de bullets é atualizado quando a
          // composição passa (nunca com strings).
          let developmentBullets: DevelopmentBullet[] | undefined;
          let replacement: unknown;
          try {
            replacement = part === "scenes"
              ? validateContentSceneSetDraft({ scenes: content })
              : part === "development"
                ? (() => {
                    const parsedDev = parseStructuredDevelopment(content, evidence);
                    developmentBullets = parsedDev.bullets;
                    return parsedDev.texts;
                  })()
                : validateContentBriefDraft({
                    angle: candidate.brief.angle, hook: part === "hook" ? content : candidate.brief.hook,
                    development: candidate.brief.development,
                    script: part === "script" ? content : candidate.brief.script,
                    cta: part === "cta" ? content : candidate.brief.cta,
                  })[part];
          } catch (error) {
            // B-003-11: somente violação de contrato do validador server-side isola
            // o item; qualquer outro erro repropaga (fail-closed).
            if (!(error instanceof ContractError)) throw error;
            continue;
          }
          const composed = applyQualityRepair(candidate.brief, sceneSets[index].scenes, part, replacement);
          if (part === "scenes") {
            const repairedScenes = replacement as SceneIdea[];
            sceneSets[index] = { ...sceneSets[index], status: "AVAILABLE", scenes: repairedScenes, generated: repairedScenes.length, dropped: 0 };
          } else {
            hard[index] = { ...candidate, brief: composed.brief };
            if (part === "development" && developmentBullets)
              bulletsByContentId.set(candidate.brief.contentId, developmentBullets);
          }
          const compositionReports = hardGateComposition(index);
          if (compositionReports.length) {
            // ADR-021: composição reprovada falha o item, não o job.
            hard[index] = originalCandidate;
            sceneSets[index] = originalSceneSet;
            if (hadOriginalBullets) bulletsByContentId.set(candidate.brief.contentId, originalBullets!);
            else bulletsByContentId.delete(candidate.brief.contentId);
            compositionFailed.add(index);
            objectiveFailureIdx.add(index);
            compositionDiagnostics.push(...compositionReports);
            continue;
          }
          modified.add(index);
          const judgment = chunk.find((item) => item.index === index)!.judgment;
          qualityRepairs.push({ contentId, part, round, criterion: judgment.criterion, outcome: "REPAIRED" });
        }
      }
    };
    // ADR-025 §2 simplificado: o judge roda UMA vez para os itens hard-valid; a
    // curadoria é consultiva — passada ÚNICA de repair seletivo sobre as partes
    // REVIEW do audit inicial, sem re-Judge. Itens sem audit (lote isolado) ou
    // com REVIEW/reparo em fallback seguem para a validação objetiva final,
    // única autoridade de bloqueio pós-repair; semântica nunca cria faltante.
    await judgeBatch(hard.map((_, index) => index), 0);
    const modified = new Set<number>();
    for (const part of QUALITY_PARTS) {
      const pending = currentQualityAudits.flatMap((audit, index) =>
        audit && !judgeBatchFailed.has(index)
          ? qualityPartsToRepair(audit)
            .filter((judgment) => judgment.part === part)
            .map((judgment) => ({ index, judgment }))
          : []);
      if (pending.length) await repairPartBatch(pending, part, 0, modified);
    }
  }
  // E5: JudgeExecutionRecords derivados APÓS o judge (blocker do Review:
  // derivação antecida registrava NOT_EXECUTED para itens julgados).
  // Semântica preservada: judge não executado/falho nunca vira PASS; itens
  // fora do hard subset ficam NOT_EXECUTED; sem router, NOT_APPLICABLE.
  const judgeExecutionRecords: JudgeExecutionRecord[] = candidates.map((candidate, index) => {
    const contentId = candidate.brief.contentId;
    if (!input.router) return { contentId, round: 1, execution: "NOT_APPLICABLE", parts: [] };
    if (!hardIdx.includes(index)) return { contentId, round: 1, execution: "NOT_EXECUTED", parts: [] };
    if (judgeBatchFailed.has(index))
      return { contentId, round: 1, execution: "FAILED", parts: [], errorCode: judgeFailureCodes.get(index) ?? "GEN-PROVIDER" };
    const audit = currentQualityAudits[index];
    return audit
      ? { contentId, round: audit.round + 1, execution: "EXECUTED", parts: audit.parts.map(({ part }) => part) }
      : { contentId, round: 1, execution: "NOT_EXECUTED", parts: [] };
  });
  sceneSets.forEach((set, index) => {
    if (set.status !== "AVAILABLE" || set.scenes.length < 2) {
      objectiveFailureIdx.add(index);
      sceneDiagnostics.push({
        briefId: `${hard[index].brief.contentId}:${hard[index].brief.briefVersionId}`,
        gateVersion: GATE_POLICY_VERSION,
        factualStatus: "SUPPORTED",
        claimType: "objetivo",
        evidenceRefs: [],
        structuralStatus: "PASS",
        platformStatus: "PASS",
        varietyStatus: "PASS",
        issues: ["scene_set_invalid"],
        decision: "REJECT",
      });
    }
  });
  // ADR-021 decisão 3: variedade do subconjunto entregue com teto ceil(D/K) —
  // mesmos classificadores do gate; drop determinístico do mais fraco até fechar.
  let delivered = hard.map((_, i) => i).filter((i) => !objectiveFailureIdx.has(i) && !compositionFailed.has(i));
  let deliveredReports = validateBriefSet(
    delivered.map((i) => hard[i].brief),
    evidence,
    "tiktok-commerce",
    skill.version,
    selectedPatterns,
    projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
    bulletsByContentId,
    briefGateOptions,
  );
  const rankOf = (k: number): number[] => {
    const report = deliveredReports[k];
    return [report.issues.length, -report.evidenceRefs.length, hardIdx[delivered[k]]];
  };
  while (deliveredReports.some((report) => report.decision !== "PASS")) {
    const weakest = delivered
      .map((_, k) => k)
      .filter((k) => deliveredReports[k].decision !== "PASS")
      .reduce((worst, k) => {
        const a = rankOf(k);
        const b = rankOf(worst);
        const diff = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
        return diff > 0 ? k : worst;
      });
    varietyDropped.add(delivered[weakest]);
    delivered = delivered.filter((_, k) => k !== weakest);
    deliveredReports = validateBriefSet(
      delivered.map((i) => hard[i].brief),
      evidence,
      "tiktok-commerce",
      skill.version,
      selectedPatterns,
      projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
      bulletsByContentId,
      briefGateOptions,
    );
  }
  const failedCount = count - delivered.length;
  if (delivered.length === 0 || failedCount > PARTIAL_FAILURE_CAP)
    throw new GenerationError(
      "GEN-REPAIR-EXHAUSTED",
      "Validação objetiva não aprovou itens suficientes",
      true,
      {
        task: "HARD_GATE",
        expected: count,
        received: delivered.length,
// A curadoria semântica é consultiva e nunca derruba item: toda falha
        // terminal é objetiva (hard gate, composição, cena ou variedade).
        // ADR-026: telemetria de cenas no caminho de falha — apenas status/
        // contagens/causas agregadas por contentId; NUNCA payload de cena.
        sceneOutcomes: sceneSets.map(({ contentId, status, generated, dropped, causes, attempts }) => ({
          contentId,
          status,
          generated,
          dropped,
          causes: causes ?? [],
          attempts: attempts ?? [],
        })),
        rejected: [
          ...candidateReports.filter((_, i) => hardFailIdx.includes(i)),
          ...deliveredReports.filter((report) => report.decision !== "PASS"),
          ...compositionDiagnostics,
          ...sceneDiagnostics,
        ],
        ...(debugGateIssues(
          [...candidateReports.filter((_, i) => hardFailIdx.includes(i)), ...deliveredReports.filter((report) => report.decision !== "PASS")],
          developmentDiagnosticsFor,
        ) ?? {}),
      },
    );
  // Assinatura residual por item (ADR-021 decisão 5): checkCodes da cascata +
  // diagnóstico determinístico; nunca payload do provider.
  const failedItems: FailedItemDiagnostic[] = [
    ...hardFailIdx.map((i) => ({
      ...diagnoseFailure(candidates[i].brief, candidateReports[i], evidence, "HARD_GATE", i + 1, []),
      developmentDiagnostics: developmentDiagnosticsFor(candidates[i].brief.contentId),
      failedBulletIndexes: failedBulletIndexesFor(candidates[i].brief.contentId),
    })),
    ...[...objectiveFailureIdx].map((i) => ({
      contentId: hard[i].brief.contentId,
      position: hardIdx[i] + 1,
      reason: "HARD_GATE" as const,
      checkCodes: [] as PartialFailureCheckCode[],
      issues: compositionFailed.has(i)
        ? ["composition_rejected"]
        : sceneSets[i] && (sceneSets[i].status !== "AVAILABLE" || sceneSets[i].scenes.length < 2)
          ? ["scene_set_invalid"]
          : [],
      quality: projectQualityFailures(qualityAudits.filter((audit) => audit.contentId === hard[i].brief.contentId))
        .map(({ part, round, criterion, reason }) => ({ part, round, criterion, reason: reasonText(reason) })),
      // part/criterion/status/reason allowlisted (enum original, sem texto livre).
      qualityDiagnostics: qualityAudits
        .filter((audit) => audit.contentId === hard[i].brief.contentId)
        .flatMap((audit) => audit.parts),
    })),
    ...[...varietyDropped].map((i) => ({
      contentId: hard[i].brief.contentId,
      position: hardIdx[i] + 1,
      reason: "VARIETY_CAP" as const,
      checkCodes: [] as PartialFailureCheckCode[],
      issues: ["variety_cap_drop"],
    })),
  ];
  await emit("FINALIZING");
  return {
    productUnderstanding: understanding ?? {},
    strategy,
    plan,
    planPolicyVersion: PLAN_POLICY_VERSION,
    opportunities,
    briefs: delivered.map((i) => hard[i].brief),
    reports: deliveredReports,
    patternReplacements,
    understandingReductions,
    sceneSets: delivered.map((i) => sceneSets[i]),
    memorySignals: {
      generatedCount: delivered.length,
      platformSkillVersion: skill.version,
      cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
      // ADR-021: mecanismos/funções/ângulos dos D ENTREGUES — o planner do
      // retry dos faltantes consome via memoryConstraints e evita repetição.
      deliveredHookMechanisms: delivered.map((i) => String(hard[i].opportunity.hookMechanism)),
      deliveredCtaFunctions: delivered.map((i) => classifyCtaFunction(hard[i].brief.cta)),
      deliveredAngles: delivered.map((i) => String(hard[i].opportunity.angle)),
      // Cutover E6 Stage 3: sinais multidimensionais canônicos a partir do
      // blueprint dos entregues — consumidos pelo planner V2 via
      // mergeMemorySignalsCanonical (dedup idempotente).
      plannerSignals: delivered.flatMap((i) => {
        const planned = plannedV2.find((p) => p.sourceOpportunityId === hard[i].opportunity.sourceOpportunityId);
        if (!planned) return [];
        return [{
          signalsSchemaVersion: "PLANNER_MEMORY_SIGNALS_V1" as const,
          ...(planned.blueprint.blueprint.recipeId !== undefined ? { recipeId: planned.blueprint.blueprint.recipeId } : {}),
          attentionMechanisms: [...planned.blueprint.blueprint.attentionMechanisms],
          psychologicalEffects: [...planned.blueprint.blueprint.psychologicalEffects],
          ...(planned.blueprint.blueprint.format !== undefined ? { format: planned.blueprint.blueprint.format } : {}),
          ...(planned.blueprint.blueprint.productRole !== undefined ? { productRole: planned.blueprint.blueprint.productRole } : {}),
          narrativeShape: [...planned.blueprint.blueprint.narrativeMoves],
          commercialEffects: [hard[i].opportunity.coreMessage],
        }];
      }),
    },
    stage: "FINALIZING",
    capabilities,
    repairs: repairCount,
    repairCauses,
    qualityAudits,
    qualityRepairs,
    validated: delivered.length,
    briefOpportunityPositions: delivered.map((i) => hardIdx[i]),
    developmentBullets: delivered
      .map((i) => ({ contentId: hard[i].brief.contentId, bullets: bulletsByContentId.get(hard[i].brief.contentId) }))
      .filter((entry): entry is { contentId: string; bullets: DevelopmentBullet[] } => Array.isArray(entry.bullets) && entry.bullets.length > 0),
    ...(plannedV2 ? { plannedV2: plannedHandoffV2(plannedV2) } : {}),
    judgeExecutionRecords,
    evidenceRefs: [...evidence.refs],
    ...(plannedV2.length > 0 ? { discoveryV2: { hypotheses: plannedV2.length } } : {}),
    ...(discoveryCanonicalResult ? { discoveryCanonicalV2: discoveryCanonicalResult } : {}),
    ...(plannedV2
      ? {
          v2Policy: {
            plannerPolicyVersion: "PLANNER_POLICY_V1",
            briefPolicyVersion: BRIEF_GENERATION_POLICY_V2,
            creativeSystemVersion: "1.3",
          },
        }
      : {}),
    partial: failedCount > 0 ? { expectedCount: count, deliveredCount: delivered.length, failedCount, failedItems } : null,
  };
}
