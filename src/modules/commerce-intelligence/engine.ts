import {
  assignServerBriefIds,
  CARDINALITY_POLICY_VERSION,
  CARDINALITY_POLICY,
  PARTIAL_FAILURE_CAP,
  validateCommercialOpportunityMappingEnvelope,
  validateContentBriefDraft,
  validateContentOpportunity,
  validateContentPlan,
  validateContentSceneSetDraft,
  validateProductStrategy,
  validateProductUnderstanding,
  validateTargetContentCount,
  ContractError,
  normalizeForVariety,
  type CommercialOpportunityMappingEnvelope,
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
import {
  loadPlatformSkill,
  projectPlatformSkillSlice,
  classifyCtaFunction,
  classifyHookMechanism,
  HOOK_BUCKET_COUNT,
  type PlatformSkill,
} from "./platform-skill";
import {
  DEVELOPMENT_ACTION_STEMS,
  DEVELOPMENT_CONNECTORS,
  DEVELOPMENT_RATIONALE,
  ctaTextFactualIssues,
  GATE_POLICY_VERSION,
  deliverableHookBuckets,
  developmentGroundingTerms,
  gateSceneSet,
  diagnoseDevelopmentPoint,
  validDevelopmentPoint,
  validateBriefSet,
  type GatePattern,
  type GateReport,
} from "./gates";
import {
  assertProviderOutput,
  ROUTER_MAP,
  type LogicalTask,
  type ModelRouter,
  type ProviderCallMetrics,
} from "./model-router";
import { emitJobEvent, sanitizeGateReports } from "./observability";
import { GenerationError } from "./errors";
import { type GenerationStage } from "./stages";
import { applyQualityRepair, JUDGE_BATCH_MAX, parseQualityAuditBatch, parseQualityRepairBatch, projectQualityFailures, qualityPartsToRepair, QUALITY_PARTS, REPAIR_BATCH_MAX, reasonText, type QualityAudit, type QualityJudgment, type QualityPart } from "./semantic-quality";

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
  model?: string;
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
export type EngineResult = {
  productUnderstanding: Record<string, unknown>;
  strategy: Record<string, unknown>;
  plan: Record<string, unknown>;
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
};

function batchSize(): number {
  const raw = Number(process.env.GENERATION_BRIEF_BATCH_SIZE ?? 4);
  return Number.isInteger(raw) && raw >= 4 && raw <= 8 ? raw : 4;
}
function mappingOpportunityLimit(): number {
  const raw = Number(process.env.GENERATION_MAPPING_MAX_OPPORTUNITIES ?? 4);
  return Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : 4;
}
function selectBriefPatterns(
  opportunity: ContentOpportunity,
  position: number,
  skill: PlatformSkill,
  evidence: EvidenceSnapshot,
  eligibleHooks: readonly GatePattern[],
  productCategory?: string,
  bucketRotation = 0,
): { pattern: { opportunityId: string; hook: Record<string, unknown>; cta: Record<string, unknown> }; replacements: PatternReplacement[] } {
  const hooks = eligibleHooks;
  const ctaCategories = [
    ...new Set(skill.creativeCatalog.ctas.map(({ category }) => category)),
  ];
  const ctas = skill.creativeCatalog.ctas.filter(
    ({ type, category }) =>
      type === "cta" &&
      category ===
        (ctaCategories.includes("commerce") ? "commerce" : ctaCategories[0]),
  );
  // ADR-020 — pré-seleção segura: cada pattern do catálogo é pré-checado contra
  // a evidência com o MESMO classificador do gate (ctaTextFactualIssues) ANTES
  // de qualquer geração. Sem isso, a instrução "use o CTA literalmente"
  // reproduz a mesma violação em todo round de repair (causa raiz do e26d108f).
  // Hook NUNCA troca silenciosamente o mecanismo planejado (blocker do
  // Arquiteto): pool deliverable do bucket do hookMechanism vazio → GEN-PATTERN
  // antes da LLM, zero chamadas — em vez de hook de outro bucket. CTA pode
  // rotacionar entre funções deliverable com replacement registrado
  // ({replacedWithId, reason}; nunca texto original) e variedade recalculada
  // sobre o pool deliverable. Sem NENHUM pattern deliverable → GEN-PATTERN;
  // nunca fabricar fallback.
  const replacements: PatternReplacement[] = [];
  const deliverable = (pattern: GatePattern) =>
    ctaTextFactualIssues(String(pattern.text ?? ""), evidence).decision === "deliverable";
  const deliverableHooks = hooks.filter(deliverable);
  const deliverableCtas = ctas.filter(deliverable);
  if (deliverableCtas.length === 0)
    throw new ContractError(
      "GEN-PATTERN",
      "Nenhum padrão de CTA do catálogo é deliverable para a evidência autorizada",
      "cta",
    );
  const hookBucket = classifyHookMechanism(opportunity.hookMechanism);
  const bucketHooks = deliverableHooks.filter(
    (pattern) => classifyHookMechanism(String(pattern.text ?? "")) === hookBucket,
  );
  if (bucketHooks.length === 0)
    throw new ContractError(
      "GEN-PATTERN",
      `Nenhum hook deliverable no catálogo para o mecanismo "${hookBucket}" do plano`,
      "hook",
    );
  const hook = bucketHooks[bucketRotation % bucketHooks.length];
  const allFunctionBuckets = [
    ...new Set(ctas.map(({ text }) => classifyCtaFunction(text))),
  ];
  const wantedBucket = allFunctionBuckets[position % allFunctionBuckets.length];
  const unfilteredPool = ctas.filter(
    ({ text }) => classifyCtaFunction(text) === wantedBucket,
  );
  const rotationIndex =
    Math.floor(position / Math.max(1, allFunctionBuckets.length)) %
    unfilteredPool.length;
  const original = unfilteredPool[rotationIndex];
  // Replacement quando o pattern que a rotação ADR-019 escolheria não é
  // deliverable: primeiro deliverable do MESMO bucket; bucket inteiro
  // não-deliverable → rotaciona entre buckets deliverable (ordem estável).
  let chosen = original;
  if (!deliverable(original)) {
    const deliverableInBucket = unfilteredPool.filter(deliverable);
    if (deliverableInBucket.length) {
      chosen = deliverableInBucket[0];
      replacements.push({
        field: "cta",
        replacedWithId: chosen.id,
        reason: `pattern '${original.id}' contém claim não sustentado pela evidência; substituído por pattern deliverable da mesma função`,
      });
    } else {
      const deliverableBuckets = [
        ...new Set(deliverableCtas.map(({ text }) => classifyCtaFunction(text))),
      ];
      const fallbackBucket =
        deliverableBuckets[(position + 1) % deliverableBuckets.length];
      chosen = deliverableCtas.filter(
        ({ text }) => classifyCtaFunction(text) === fallbackBucket,
      )[0];
      replacements.push({
        field: "cta",
        replacedWithId: chosen.id,
        reason: `função '${wantedBucket}' sem pattern deliverable para a evidência; substituído por '${fallbackBucket}'`,
      });
    }
  }
  return {
    pattern: {
      opportunityId: opportunity.id,
      hook: { ...hook },
      cta: {
        ...chosen,
      },
    },
    replacements,
  };
}

// ADR-020 (blocker): pool ELEGÍVEL de hooks (catálogo global filtrado por
// categoria do produto) computado UMA vez no engine e passado para
// deliverableHookBuckets e selectBriefPatterns — seleção e disponibilidade
// jamais divergem de categoria.
function eligibleHookPatterns(
  skill: PlatformSkill,
  productCategory?: string,
): GatePattern[] {
  const isApparel =
    /roupa|vestu|vestuário|vestuario|moda|confecção|confeccao|calçado|calcado/.test(
      (productCategory ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR"),
    );
  return skill.creativeCatalog.hooks.filter(
    ({ type, category, categoryScope }) =>
      type === "hook" &&
      ((category === "general" && categoryScope === "global") ||
        (isApparel && category === "apparel" && categoryScope === "apparel")),
  );
}

// ADR-020 adendo 5 (último recurso pós-retry de PU): arrays de HIPÓTESES do
// ProductUnderstanding acima da CARDINALITY_POLICY são reduzidos deterministicamente
// para os primeiros max itens (ordem do próprio model = seu ranking de sustentação).
// Nada é fabricado ou reordenado; nenhuma chamada nova; redução LOUD
// (EngineResult/IntelligenceRun) e o validator revalida TUDO depois. Nunca aplica
// a briefs (política de não-truncamento de ADR-012 permanece para conteúdo).
export type UnderstandingCardinalityReduction = {
  field: string;
  received: number;
  kept: number;
};
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

// Proveniência de pré-seleção (blocker do Arquiteto): id + motivo apenas —
// nunca texto original nem conteúdo bruto.
// nunca texto original nem conteúdo bruto.
export type PatternReplacement = {
  field: "cta" | "hook";
  replacedWithId: string;
  reason: string;
};

function buildSelectedPatterns(
  entries: Array<{ opportunity: ContentOpportunity; position: number }>,
  skill: PlatformSkill,
  evidence: EvidenceSnapshot,
  eligibleHooks: readonly GatePattern[],
  productCategory?: string,
): { patterns: Array<{ hook: GatePattern; cta: GatePattern }>; replacements: PatternReplacement[] } {
  const rotations = new Map<string, number>();
  const replacements: PatternReplacement[] = [];
  const patterns = entries.map(({ opportunity, position }) => {
    const bucket = classifyHookMechanism(opportunity.hookMechanism);
    const rotation = rotations.get(bucket) ?? 0;
    rotations.set(bucket, rotation + 1);
    const { pattern, replacements: itemReplacements } = selectBriefPatterns(
      opportunity,
      position - 1,
      skill,
      evidence,
      eligibleHooks,
      productCategory,
      rotation,
    );
    replacements.push(...itemReplacements);
    return pattern;
  });
  return { patterns, replacements };
}

// Resumo determinístico dos irmãos para variedade no repair per-item (ADR-020):
// hooks normalizados APENAS de irmãos que passaram o gate (texto aprovado pode
// ir ao provider) e funções de CTA de todos os irmãos — o repair per-item é
// cego ao conjunto; o summary dá o contexto mínimo sem vazar texto reprovado.
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
// ADR-020 adendo 2: requirements server-derived do development — projeção das
// constantes/predicados do PRÓPRIO gate (reuso, sem critério novo); efêmero.
function developmentRequirements(evidence: EvidenceSnapshot) {
  return {
    allowedActionStems: DEVELOPMENT_ACTION_STEMS,
    connectors: DEVELOPMENT_CONNECTORS,
    factRefs: evidence.facts
      .map((value, index) => ({ value, ref: evidence.refs[index] }))
      .filter(({ ref }) => ref !== "product:name")
      .map(({ value, ref }) => ({
        ref,
        value,
        terms: developmentGroundingTerms(value),
      })),
    noShotList: true,
    minGrounding: {
      factTermsInPoint: 2,
      factTermsInRationale: 2,
      contextTerms: 1,
    },
  };
}

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

// Output contract do CONTENT_BRIEF_REPAIR (adendo 2): partes estruturadas por
// bullet {text, action, factRef, rationale}; SOMENTE text é projetado para o
// ContentBriefVersion canônico. Partes NUNCA autorizam texto falho — após as
// checagens de partes, o texto passa por validateContentBriefDraft e o conjunto
// por validateBriefSet (gate é a autoridade).
export function parseStructuredRepairDraft(
  output: Record<string, unknown>,
  evidence: EvidenceSnapshot,
): ContentBriefDraft {
  if (!Array.isArray(output.development))
    throw new ContractError("GEN-SCHEMA", "development estruturado inválido", "development");
  const texts = output.development.map((item): string => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new ContractError("GEN-SCHEMA", "bullet estruturado inválido", "development");
    const bullet = item as Record<string, unknown>;
    const factRef = typeof bullet.factRef === "string" ? bullet.factRef : undefined;
    const action = typeof bullet.action === "string" ? bullet.action : undefined;
    const rationale = typeof bullet.rationale === "string" ? bullet.rationale : undefined;
    const text = typeof bullet.text === "string" ? bullet.text.trim() : undefined;
    if (!text)
      throw new ContractError("GEN-SCHEMA", "bullet sem text", "development");
    if (!factRef || factRef === "product:name" || !evidence.refs.includes(factRef))
      throw new ContractError(
        "GEN-SCHEMA",
        `factRef fora do snapshot autorizado (${factRef ?? "ausente"})`,
        "development",
      );
    if (!action || !DEVELOPMENT_ACTION_STEMS.some((stem) => action.toLowerCase().startsWith(stem)))
      throw new ContractError("GEN-SCHEMA", "action fora do repertório do gate", "development");
    if (!rationale || !DEVELOPMENT_RATIONALE.test(rationale))
      throw new ContractError("GEN-SCHEMA", "rationale sem conector do gate", "development");
    return text;
  });
  return validateContentBriefDraft({ ...output, development: texts });
}

// ADR-019: geração de cenas por conteúdo — entrada é o briefing INTEIRO +
// evidências + creatorContext projetado; chamada única por conteúdo, fora de
// transação, sempre após briefs PASS. Falha de capability vira set ERROR; o gate
// filtra cenas individualmente e sets abaixo de 2 viram FILTERED. A curadoria
// semântica exige cada set AVAILABLE com pelo menos 2 cenas para concluir o job.
export async function generateSceneSetsForBriefs(params: {
  jobId: string;
  productId: string;
  briefs: Array<{
    contentId: string;
    briefVersionId: string;
    angle: string;
    hook: string;
    development: string[];
    script: string;
    cta: string;
  }>;
  evidence: EvidenceSnapshot;
  creatorContext: unknown;
  router?: ModelRouter;
  skill: PlatformSkill;
  signal?: AbortSignal;
  attempt: number;
  track: TrackFn;
  backfilled: boolean;
}): Promise<SceneSetOutcome[]> {
  const outcomes: SceneSetOutcome[] = [];
  // Feedback determinístico do gateSceneSet para o retry guiado (ADR-020):
  // requisitos são os MESMOS predicados do gate — nunca critério novo.
  const sceneGateFeedback = (causes: string[]): string => {
    const summary = causes.length ? causes.join(", ") : "set descartado";
    return `O conjunto anterior de cenas foi integralmente descartado pelo gate estrutural (motivos: ${summary}). Cada cena deve: começar com verbo de ação observável (mostre, pegue, vire, abra, calce, teste, compare); citar nominalmente o produto ou parte/objeto citado no briefing (ancora lexical); usar somente fatos de relevantFacts, sem claim objetivo sem suporte; ser gravavel por creator sozinho com celular.`;
  };
  for (const brief of params.briefs) {
    const empty: SceneSetOutcome = {
      contentId: brief.contentId,
      briefVersionId: brief.briefVersionId,
      status: "ERROR",
      scenes: [],
      generated: 0,
      dropped: 0,
      backfilled: params.backfilled,
    };
    if (!params.router) {
      outcomes.push(empty);
      continue;
    }
    const sceneContext = {
      productId: params.productId,
      brief: {
        angle: brief.angle,
        hook: brief.hook,
        development: brief.development,
        script: brief.script,
        cta: brief.cta,
      },
      relevantFacts: params.evidence.facts.map((value, index) => ({
        value,
        ref: params.evidence.refs[index],
      })),
      evidence: { refs: params.evidence.refs },
      creatorContext: projectCreatorContext(
        "CONTENT_SCENE_IDEAS",
        params.creatorContext,
      ),
      skillSlice: projectPlatformSkillSlice(params.skill, "brief"),
    };
    // ADR-021: retry único por conteúdo — falha de schema/validação re-solicita
    // com o mesmo contexto; set integralmente descartado pelo gateSceneSet
    // re-solicita UMA vez guiado pelas causas do gate (mesmo padrão do retry de
    // schema). Segunda falha de qualquer tipo -> fail-closed (FILTERED/ERROR),
    // sem inventar cenas.
    let outcome: SceneSetOutcome | null = null;
    let lastGate: ReturnType<typeof gateSceneSet> | null = null;
    for (let sceneAttempt = 0; sceneAttempt < 2 && !outcome; sceneAttempt++) {
      const attemptContext =
        lastGate && lastGate.kept.length === 0
          ? { ...sceneContext, gateFeedback: sceneGateFeedback(lastGate.causes) }
          : sceneContext;
      try {
        const draft = await params.track(
          "CONTENT_SCENE_IDEAS",
        attemptContext,
        (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
          callCapability(
            params.router!,
            "CONTENT_SCENE_IDEAS",
            project("CONTENT_SCENE_IDEAS", attemptContext, {}),
            params.signal,
            onMetrics,
          ),
          (output: Record<string, unknown>) =>
            validateContentSceneSetDraft(output),
          // kept/dropped da própria tentativa no capability.completed/run.
          (validated) => {
            const gated = gateSceneSet(
              validated,
              brief,
              params.evidence,
              projectCreatorContext("CONTENT_SCENE_IDEAS", params.creatorContext),
            );
            return { kept: gated.kept.length, dropped: gated.dropped };
          },
        );
        const gated = gateSceneSet(
          draft,
          brief,
          params.evidence,
          projectCreatorContext("CONTENT_SCENE_IDEAS", params.creatorContext),
        );
        lastGate = gated;
        if (gated.kept.length) {
          outcome = { ...empty, status: "AVAILABLE", scenes: gated.kept, generated: draft.length, dropped: gated.dropped };
        } else if (sceneAttempt === 1) {
          // Fail-closed: gate persistente na 2ª tentativa — set descartado.
          outcome = { ...empty, status: "FILTERED", generated: draft.length, dropped: gated.dropped };
        }
      } catch {
        if (sceneAttempt === 1) outcome = empty;
      }
    }
    outcomes.push(outcome ?? empty);
  }
  return outcomes;
}
// Catálogo autorizado de evidências com ids estáveis fornecidos ao provider (não IDs inventados).
// refs validam contra este catálogo; o provider recebe a lista para retornar apenas refs válidos.
export function buildEvidenceCatalog(input: {
  name?: string;
  description?: string;
  facts?: Record<string, unknown>;
}): EvidenceSnapshot {
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
  CONTENT_PLAN_GENERATION: [
    "language",
    "market",
    "preferredDurationSeconds",
    "executionStyle",
    "restrictions",
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
  CONTENT_SCENE_IDEAS: [
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
function findBriefItemIssue(
  items: unknown[],
): { item: number; issue: string } | null {
  for (const [index, draft] of items.entries()) {
    try {
      validateContentBriefDraft(draft);
    } catch (error) {
      if (error instanceof ContractError)
        return { item: index + 1, issue: error.message };
      throw error;
    }
  }
  return null;
}
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
    error.code === "GEN-VARIETY" &&
    /hookMechanism/.test(error.message)
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
  ): Promise<R> => {
    const startedAt = Date.now();
    const contextBytes = Buffer.byteLength(JSON.stringify(context), "utf8");
    let captured: ProviderCallMetrics | undefined;
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
        captured = metrics;
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
        model: captured?.model ?? effectiveModel(task),
        reasoning: captured?.reasoning,
        providerStatus: captured?.providerStatus ?? null,
        durationMs,
        contextBytes,
        requestBytes: captured?.requestBytes,
        trustedContextBytes: captured?.trustedContextBytes,
        externalBytes: captured?.externalBytes,
        responseBytes,
        attempt: opts.attempt,
        retry: captured?.retry ?? 0,
        ok: true,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        kept: extras?.kept,
        dropped: extras?.dropped,
        providerRequestId: captured?.providerRequestId,
        providerRequestIdSource: captured?.providerRequestIdSource,
        fallback: captured?.fallback,
      });
      emitJobEvent("capability.completed", {
        jobId: opts.jobId,
        attempt: opts.attempt,
        task,
        tier: ROUTER_MAP[task],
        model: captured?.model ?? effectiveModel(task),
        instructionHash: opts.router?.hash?.(task),
        durationMs,
        requestBytes: captured?.requestBytes,
        trustedContextBytes: captured?.trustedContextBytes,
        externalBytes: captured?.externalBytes,
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
        providerRequestId: captured?.providerRequestId,
        providerRequestIdSource: captured?.providerRequestIdSource,
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
        model: captured?.model ?? effectiveModel(task),
        reasoning: captured?.reasoning,
        providerStatus: captured?.providerStatus ?? null,
        durationMs,
        contextBytes,
        requestBytes: captured?.requestBytes,
        trustedContextBytes: captured?.trustedContextBytes,
        externalBytes: captured?.externalBytes,
        responseBytes: captured?.responseBytes ?? 0,
        attempt: opts.attempt,
        retry: captured?.retry ?? 0,
        ok: false,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        errorCode,
        providerRequestId: captured?.providerRequestId,
        providerRequestIdSource: captured?.providerRequestIdSource,
        fallback: captured?.fallback,
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
        model: captured?.model ?? effectiveModel(task),
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
  for (const issue of report.issues) {
    if (/duplicata|repetid/.test(issue)) continue;
    if (/claim sem evidência|sem evidência autorizada|contradito|sem suporte|sem evidência verificável/.test(issue))
      checkCodes.add("unverified_claim");
    if (/script contém claim factual/.test(issue)) checkCodes.add("script_claim_missing");
    if (/orientar comunicação|lista de features|planos de gravação/.test(issue)) {
      checkCodes.add("feature_list");
      for (const point of brief.development) {
        const d = diagnoseDevelopmentPoint(point, evidence);
        if (!d.actionPresent) checkCodes.add("action_stem_missing");
        if (d.shotList) checkCodes.add("feature_list");
        if (!d.connectorPresent) checkCodes.add("connector_missing");
        if (d.connectorPresent && d.minGroundingMatched < d.minGroundingExpected) checkCodes.add("grounding_below_min");
        if (d.unverified) checkCodes.add("unverified_claim");
        if (!d.valid) {
          diagnostic.actionPresent = diagnostic.actionPresent && d.actionPresent;
          diagnostic.connectorPresent = diagnostic.connectorPresent && d.connectorPresent;
          diagnostic.minGroundingMatched = Math.min(diagnostic.minGroundingMatched, d.minGroundingMatched);
        }
      }
    }
  }
  return {
    contentId: brief.contentId,
    position,
    reason,
    checkCodes: [...checkCodes],
    issues: [...report.issues],
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
  let strategyOutput: ProductStrategy | null = null;
  const understandingReductions: UnderstandingCardinalityReduction[] = [];
  let opportunityOutput: ContentPlan | null = null;
  const commercialOpportunities: Record<string, unknown>[] = [];

  let mappingEvidence: EvidenceSnapshot = { facts: [], refs: [] };
  // ADR-020 (blocker): pool ELEGÍVEL computado UMA vez; disponibilidade de
  // mecanismo deriva dele (mesma lista usada pela seleção — jamais divergem).
  const eligibleHooks = eligibleHookPatterns(
    skill,
    typeof facts.category === "string" ? facts.category : undefined,
  );
  const baseEvidence = buildEvidenceCatalog({ ...input, facts });
  const deliverableHookMechanisms = deliverableHookBuckets(baseEvidence, eligibleHooks);
  if (deliverableHookMechanisms.length === 0)
    throw new ContractError(
      "GEN-PATTERN",
      "Nenhum mecanismo de hook do catálogo elegível é deliverable para a evidência autorizada",
      "hookMechanism",
    );
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
        // Fato do desconto (string projetada pelo worker, só quando existe).
        // Contrato exclusivamente tipado (Gate 5): a chave é "discount".
        discount: facts.discount,
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
    // Mapping envelope do provider é não confiável: um único retry de contrato re-solicita
    // opportunities quando o corpo veio sem elas (200 com prosa/arrays vazios). Falha fechada
    // depois do retry — sem inventar oportunidades.
    let envelope: CommercialOpportunityMappingEnvelope;
    const mappingCall = (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
      callCapability(
        input.router!,
        "COMMERCIAL_OPPORTUNITY_MAPPING",
        project("COMMERCIAL_OPPORTUNITY_MAPPING", mappingContext, {}),
        input.signal,
        onMetrics,
      );
    const validateMapping = (output: Record<string, unknown>) =>
      validateCommercialOpportunityMappingEnvelope(output, mappingEvidence);
    try {
      envelope = await track(
        "COMMERCIAL_OPPORTUNITY_MAPPING",
        mappingContext,
        mappingCall,
        validateMapping,
      );
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
    // IDs de oportunidade comercial são server-derived.
    envelope.opportunities.forEach((opportunity, index) => {
      commercialOpportunities.push({
        ...opportunity,
        id: `${input.jobId}-commercial-${index + 1}`,
      });
    });
    const strategyContext = {
      productId: input.productId,
      understanding,
      commercialOpportunities,
      skill: skill.validationRules,
      evidenceRefsCatalog: mappingEvidence.refs,
      creatorContext: projectCreatorContext(
        "STRATEGY_SYNTHESIS",
        input.creatorContext,
      ),
    };
    await emit("BUILDING_STRATEGY");
    strategyOutput = input.reuseStrategy
      ? // ADR-021: retry dos faltantes reutiliza a Strategy ACTIVE (decisões
        // preservadas; vínculo canônico re-carimbado para o job atual).
        validateProductStrategy(
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
        )
      : await track(
      "STRATEGY_SYNTHESIS",
      strategyContext,
      (onMetrics) =>
        callCapability(
          input.router!,
          "STRATEGY_SYNTHESIS",
          project("STRATEGY_SYNTHESIS", strategyContext, {}),
          input.signal,
          onMetrics,
        ),
      (output) => validateProductStrategy(
        {
          ...output,
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
    );
    const strategy = strategyOutput;
    const planContext = {
      productId: input.productId,
      deliverableHookMechanisms,
      strategySlice: {
        primaryPositioning: strategy.primaryPositioning,
        audiences: strategy.audiences,
        priorityBenefits: strategy.priorityBenefits,
        priorityObjections: strategy.priorityObjections,
        priorityArguments: strategy.priorityArguments,
        priorityAngles: strategy.priorityAngles,
        communicationPrinciples: strategy.communicationPrinciples,
      },
      plannerSkillSlice: projectPlatformSkillSlice(skill, "planner"),
      creatorContext: projectCreatorContext(
        "CONTENT_PLAN_GENERATION",
        input.creatorContext,
      ),
      // ADR-021: retry dos faltantes reutiliza memória — sinais do último
      // snapshot (entregues) restringem mecanismo/função já publicados.
      memoryConstraints: input.memory ?? {},
      targetContentCount: count,
    };
    await emit("BUILDING_CONTENT_PLAN");
    // Retry único de contrato para o plano: corpo raiz inválido (array/não-objeto) ou
    // opportunities ausentes são re-solicitados uma vez com o mesmo contexto; depois,
    // fail-closed. Sem inventar oportunidades.
    const planCall = (context: unknown) => (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
      callCapability(
        input.router!,
        "CONTENT_PLAN_GENERATION",
        project("CONTENT_PLAN_GENERATION", context, {}),
        input.signal,
        onMetrics,
      );
    const allowedSourceIds = new Set(commercialOpportunities.map((opportunity) => String(opportunity.id)));
    const validatePlan = (
      value: Record<string, unknown>,
      enforceHookVariety = true,
    ): ContentPlan => {
      if (!Array.isArray(value.opportunities)) throw new ContractError("GEN-SCHEMA", "Plano sem opportunities", "opportunities");
      // ADR-020: recompute dos fatos atuais — mecanismo sem repertório
      // deliverable é rejeitado no PLANO (cedo, causa acionável, retry causal
      // existente via isHookVarietyError), nunca fallback silencioso.
      const deliverableNow = deliverableHookBuckets(baseEvidence, eligibleHooks);
      for (const opportunity of value.opportunities) {
        const mechanism = opportunity && typeof opportunity === "object" && typeof (opportunity as Record<string, unknown>).hookMechanism === "string"
          ? String((opportunity as Record<string, unknown>).hookMechanism)
          : "";
        if (!deliverableNow.includes(classifyHookMechanism(mechanism)))
          throw new ContractError(
            "GEN-VARIETY",
            `hookMechanism "${mechanism}" sem repertório deliverable no catálogo para a evidência atual`,
            "hookMechanism",
          );
      }
      const opportunities = value.opportunities.map((opportunity, index) =>
        validateContentOpportunity(
          {
            ...(opportunity && typeof opportunity === "object" ? opportunity as Record<string, unknown> : {}),
            id: `${input.jobId}-opportunity-${index + 1}`,
          },
          allowedSourceIds,
        ),
      );
      return validateContentPlan(
        {
          ...value,
          id: `${input.jobId}-plan`,
          productId: input.productId,
          strategyVersion: 1,
          targetContentCount: count,
          platformId: skill.id,
          platformSkillVersion: skill.version,
          opportunities,
        },
        // ADR-019/P5: hookMechanism no plano respeita teto ceil(N/M) por bucket
        // determinístico — monocultura de mecanismo é GEN-VARIETY com retry único
        // causal. No retry (última chance do contrato) o teto não é reimpingido:
        // a violação fica registrada no tracker e é entregue como causa ao
        // provider; encerrar a geração por concentração após o retry único
        // bloquearia o job inteiro — a variedade estrutural dos briefs é
        // garantida pela seleção estratificada por bucket.
        enforceHookVariety
          ? { classify: classifyHookMechanism, buckets: HOOK_BUCKET_COUNT }
          : undefined,
      );
    };
    let planVarietyCauses: string[] | null = null;
    let planProducer: ContentPlan | null = null;
    try {
      planProducer = await track(
        "CONTENT_PLAN_GENERATION",
        planContext,
        planCall(planContext),
        validatePlan,
      );
    } catch (error) {
      // Corpo raiz inválido (array/não-objeto) ou variedade de hookMechanism
      // (GEN-VARIETY) viram retry único de contrato; o retry de variedade
      // recebe as causas no contexto. Demais erros: fail-closed imediato.
      if (isRootShapeSchemaError(error)) planVarietyCauses = [];
      else if (isHookVarietyError(error)) planVarietyCauses = [error.message];
      else throw error;
    }
    if (!planProducer) {
      const retryPlanContext = planVarietyCauses?.length
        ? { ...planContext, varietyCauses: planVarietyCauses }
        : planContext;
      planProducer = await track(
        "CONTENT_PLAN_GENERATION",
        retryPlanContext,
        planCall(retryPlanContext),
        (output: Record<string, unknown>) => validatePlan(output, false),
      );
    }
    opportunityOutput = planProducer;
  }

  const opportunities = opportunityOutput?.opportunities
    ? opportunityOutput.opportunities
    : Array.from({ length: count }, (_, index) => ({
        id: `${input.jobId}-opportunity-${index + 1}`,
        commercialObjective: "Demonstrar valor do produto",
        angle: `Ângulo ${index + 1}`,
        coreMessage: input.name,
        // Fallback determinístico de teste: mecanismos rotativos por bucket —
        // o caminho sem provider também respeita a variedade estrutural.
        hookMechanism: ["problema concreto", "descoberta inesperada", "demonstração direta", "quebra de objeção"][index % 4],
        noveltyTargets: [`angle-${index + 1}`],
      }));

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
  const plan = opportunityOutput ?? validateContentPlan({
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
  const { patterns: selectedPatternsAll, replacements: patternReplacements } =
    buildSelectedPatterns(
      opportunities.map((opportunity, index) => ({ opportunity, position: index + 1 })),
      skill,
      evidence,
      eligibleHooks,
      typeof facts.category === "string" ? facts.category : undefined,
    );
  await emit("GENERATING_BRIEFS");
  const generateBatch = async (
    entries: Array<{
      opportunity: ContentOpportunity;
      causes?: string[];
      position: number;
    }>,
  ): Promise<BriefCandidate[]> => {
    const batchContext = {
      productId: input.productId,
      productReference: { name: input.name },
      opportunities: entries.map(({ opportunity }) => ({
        commercialObjective: opportunity.commercialObjective,
        angle: opportunity.angle,
        coreMessage: opportunity.coreMessage,
        ...(opportunity.benefit ? { benefit: opportunity.benefit } : {}),
        hookMechanism: opportunity.hookMechanism,
        noveltyTargets: opportunity.noveltyTargets,
      })),
      relevantFacts: evidence.facts.map((value, index) => ({
        value,
        ref: evidence.refs[index],
      })),
      evidence: { refs: evidence.refs },
      creatorContext: projectCreatorContext(
        "CONTENT_BRIEF_GENERATION",
        input.creatorContext,
      ),
      memoryConstraints: input.memory ?? {},
      skillSlice: projectPlatformSkillSlice(skill, "brief"),
      // ADR-020 adendo 2: requirements server-derived no brief inicial (MID) —
      // alinha a expectativa antes do primeiro repair; orientação, não regra.
      developmentRequirements: developmentRequirements(evidence),
      selectedPatterns: entries.map(
        (entry) => selectedPatternsAll[entry.position - 1],
      ),
      repairContrast: entries.map(({ causes, opportunity }, offset) => {
        if (!causes?.length) return null;
        const grounding = evidence.facts.filter(
          (_fact, index) => evidence.refs[index] !== "product:name",
        );
        return buildRepairContrast(grounding, offset, opportunity, evidence);
      }),
      variety: { dimensions: ["angle", "hook", "structure", "cta"] },
      causes: entries.map((e) => e.causes ?? []),
      // ADR-019/espec consensual: checklist por item, alinhado por entry, derivado
      // SÓ dos issues do próprio report (startsWith em constantes do gates) —
      // nunca compartilhado entre itens; o gate revalida igual após o repair.
      repairChecklist: entries.map(({ causes }) =>
        briefItemChecklist(causes ?? []),
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
      const extractItems = (producer: Record<string, unknown>): unknown[] =>
        Array.isArray(producer.items) ? producer.items : [];
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
          : findBriefItemIssue(items);
      const validateBatch = (producer: Record<string, unknown>) => {
        const items = extractItems(producer);
        const issue = batchIssue(items);
        if (issue) throw new GenerationError(
          "GEN-SCHEMA",
          "Lote de briefings invalido",
          true,
          { task: "CONTENT_BRIEF_GENERATION", item: issue.item, issue: issue.issue, expected: entries.length, received: items.length },
        );
        return { items: assignServerBriefIds(items, input.jobId, 0) };
      };
      const generateValidatedBatch = () => track(
        "CONTENT_BRIEF_GENERATION",
        batchContext,
        batchCall,
        validateBatch,
      );
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
          throw new GenerationError(
            "GEN-SCHEMA",
            "Lote de briefings invalido",
            true,
            { ...detail, retried: true },
          );
        }
      }
      rawBatch = validatedBatch;
    } else {
      rawBatch = entries.map((entry) => {
        const position = entry.position;
        return {
          angle: `Ângulo ${position}`,
          hook: `Veja como ${input.name} pode ajudar`,
          development: [
            "Mostre o produto real em uso",
            "Comente o benefício principal observável",
          ],
          script: `Apresente ${input.name} de forma natural e demonstre o uso.`,
          cta: "Confira o produto.",
        };
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
    );
  let reports = validateCandidates();
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
      const repairContext = {
        productId: input.productId,
        productReference: { name: input.name },
        opportunity: {
          commercialObjective: c.opportunity.commercialObjective,
          angle: c.opportunity.angle,
          coreMessage: c.opportunity.coreMessage,
          hookMechanism: c.opportunity.hookMechanism,
          noveltyTargets: c.opportunity.noveltyTargets,
        },
        relevantFacts: evidence.facts.map((value, index) => ({
          value,
          ref: evidence.refs[index],
        })),
        evidence: { refs: evidence.refs },
        selectedPattern: selectedPatterns[i],
        issues: causes,
        repairChecklist: briefItemChecklist(causes),
        // ADR-020 adendo 2: requirements + contraste determinístico PRÉ-VALIDADO
        // pelo validDevelopmentPoint (efêmero); NUNCA previousBrief (ancora a
        // paráfrase inválida).
        developmentRequirements: developmentRequirements(evidence),
        repairContrast: buildRepairContrast(
          evidence.facts.filter(
            (_fact, index) => evidence.refs[index] !== "product:name",
          ),
          i,
          c.opportunity,
          evidence,
        ),
        siblingSummary: siblingSummary(candidates, reports, i),
        creatorContext: projectCreatorContext(
          "CONTENT_BRIEF_REPAIR",
          input.creatorContext,
        ),
        skillSlice: projectPlatformSkillSlice(skill, "brief"),
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
            const draft = parseStructuredRepairDraft(output, evidence);
            return {
              ...draft,
              contentId: `${input.jobId}-content-${i + 1}`,
              briefVersionId: `${input.jobId}-brief-${i + 1}`,
              version: 1 as const,
            } satisfies ContentBriefVersion;
          },
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
      },
    );
  const hard = hardIdx.map((i) => candidates[i]);
  // ADR-019: cenas são obrigatórias para a curadoria semântica; sets indisponíveis
  // ou com menos de duas cenas válidas bloqueiam o sucesso do job.
  const sceneSets = await generateSceneSetsForBriefs({
    jobId: input.jobId,
    productId: input.productId,
    briefs: hard.map(({ brief }) => brief),
    evidence,
    creatorContext: input.creatorContext,
    router: input.router,
    skill,
    signal: input.signal,
    attempt,
    track,
    backfilled: false,
  });
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
    const currentQualityAudits: Array<QualityAudit | undefined> = hard.map(() => undefined);
    const judgeBatchFailed = new Set<number>();
    const judgeItemContext = (index: number) => {
      const candidate = hard[index];
      const scenes = sceneSets[index];
      return {
        contentId: candidate.brief.contentId,
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
          for (const index of chunk) judgeBatchFailed.add(index);
        }
      }
    };
    const hardGateComposition = (updatedIndex: number) => {
      const current = hard[updatedIndex].brief;
      const hardReports = validateBriefSet(
        hard.map(({ brief }) => brief), evidence, "tiktok-commerce", skill.version,
        selectedPatterns, projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
      );
      const scene = sceneSets[updatedIndex];
      const gatedScenes = gateSceneSet(
        scene.scenes,
        current,
        evidence,
        projectCreatorContext("CONTENT_SCENE_IDEAS", input.creatorContext),
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
          relevantFacts: evidence.facts,
          creatorContext: projectCreatorContext("CONTENT_PART_REPAIR", input.creatorContext),
          skillSlice: projectPlatformSkillSlice(skill, "brief"),
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
          // ADR-025 §1: validação individual da parte retornada — falha isola o
          // item (a parte original é preservada), nunca os irmãos do lote.
          let replacement: unknown;
          try {
            replacement = part === "scenes"
              ? validateContentSceneSetDraft({ scenes: content })
              : validateContentBriefDraft({
                  angle: candidate.brief.angle, hook: part === "hook" ? content : candidate.brief.hook,
                  development: part === "development" ? content : candidate.brief.development,
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
          } else hard[index] = { ...candidate, brief: composed.brief };
          const compositionReports = hardGateComposition(index);
          if (compositionReports.length) {
            // ADR-021: composição reprovada falha o item, não o job.
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
    );
  }
  const failedCount = count - delivered.length;
  if (delivered.length === 0 || failedCount > PARTIAL_FAILURE_CAP)
    throw new GenerationError(
      "GEN-REPAIR-EXHAUSTED",
      "Validação objetiva não aprovou itens suficientes",
      true,
      {
        task: "CONTENT_QUALITY_JUDGE",
        expected: count,
        received: delivered.length,
        // A curadoria semântica é consultiva e nunca derruba item: toda falha
        // terminal é objetiva (hard gate, composição, cena ou variedade).
        rejected: [
          ...candidateReports.filter((_, i) => hardFailIdx.includes(i)),
          ...deliveredReports.filter((report) => report.decision !== "PASS"),
          ...compositionDiagnostics,
          ...sceneDiagnostics,
        ],
      },
    );
  // Assinatura residual por item (ADR-021 decisão 5): checkCodes da cascata +
  // diagnóstico determinístico; nunca payload do provider.
  const failedItems: FailedItemDiagnostic[] = [
    ...hardFailIdx.map((i) => diagnoseFailure(candidates[i].brief, candidateReports[i], evidence, "HARD_GATE", i + 1, [])),
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
    },
    stage: "FINALIZING",
    capabilities,
    repairs: repairCount,
    repairCauses,
    qualityAudits,
    qualityRepairs,
    validated: delivered.length,
    briefOpportunityPositions: delivered.map((i) => hardIdx[i]),
    partial: failedCount > 0 ? { expectedCount: count, deliveredCount: delivered.length, failedCount, failedItems } : null,
  };
}
