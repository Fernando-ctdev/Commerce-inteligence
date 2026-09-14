import {
  assignServerBriefIds,
  CARDINALITY_POLICY_VERSION,
  CARDINALITY_POLICY,
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
  deliverableHookBuckets,
  developmentGroundingTerms,
  gateSceneSet,
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
import { applyQualityRepair, parseQualityAudit, projectQualityFailures, qualityPartsToRepair, QUALITY_PARTS, reasonText, type QualityAudit, type QualityPart } from "./semantic-quality";

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
    try {
      const draft = await params.track(
        "CONTENT_SCENE_IDEAS",
        sceneContext,
        (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
          callCapability(
            params.router!,
            "CONTENT_SCENE_IDEAS",
            project("CONTENT_SCENE_IDEAS", sceneContext, {}),
            params.signal,
            onMetrics,
          ),
        (output: Record<string, unknown>) =>
          validateContentSceneSetDraft(output),
      );
      const gated = gateSceneSet(
        draft,
        brief,
        params.evidence,
        projectCreatorContext("CONTENT_SCENE_IDEAS", params.creatorContext),
      );
      outcomes.push(
        gated.kept.length
          ? { ...empty, status: "AVAILABLE", scenes: gated.kept, generated: draft.length, dropped: gated.dropped }
          : { ...empty, status: "FILTERED", generated: draft.length, dropped: gated.dropped },
      );
    } catch {
      outcomes.push(empty);
    }
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
  ctaVariety?: true;
  soloProduction?: true;
};
const BRIEF_CHECKLIST_PREFIXES: ReadonlyArray<readonly [string, keyof BriefRepairChecklist]> = [
  ["development deve orientar", "developmentAction"],
  ["claim", "removeUnsupportedClaim"],
  ["development contém claim sem evidência", "removeUnsupportedClaim"],
  ["script contém claim factual", "removeUnsupportedClaim"],
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

// Tracker de capability extraído de runFirstGeneration (ADR-019): a geração de
// cenas — tanto in-job quanto no backfill do worker — registra os mesmos
// CapabilityEvents/telemetria do pipeline principal. Corpo idêntico ao original.
export type TrackFn = <T, R = T>(
  task: LogicalTask,
  context: unknown,
  run: (onMetrics?: (metrics: ProviderCallMetrics) => void) => Promise<T>,
  validate?: (output: T) => R,
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
        discountPercentage: facts.discountPercentage,
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
      if (!isMissingOpportunitiesError(error)) throw error;
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
    strategyOutput = await track(
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
      memoryConstraints: {},
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
      memoryConstraints: {},
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
  let repaired = candidates.map((c) => c.brief);
  let finalReports = validateBriefSet(
    repaired,
    evidence,
    "tiktok-commerce",
    skill.version,
    selectedPatterns,
    projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
  );
  if (
    repaired.length !== count ||
    finalReports.some((report) => report.decision !== "PASS")
  )
    throw new GenerationError(
      "GEN-REPAIR-EXHAUSTED",
      "Repair não produziu briefing válido",
      true,
      {
        task: "CONTENT_BRIEF_GENERATION",
        rounds: repairRounds,
        expected: count,
        received: repaired.length,
        rejected: sanitizeGateReports(
          finalReports.filter((report) => report.decision !== "PASS"),
        ),
      },
    );
  // ADR-019: cenas são obrigatórias para a curadoria semântica; sets indisponíveis
  // ou com menos de duas cenas válidas bloqueiam o sucesso do job.
  const sceneSets = await generateSceneSetsForBriefs({
    jobId: input.jobId,
    productId: input.productId,
    briefs: repaired,
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
  if (input.router) {
    const judgeContent = async (index: number, round: number): Promise<QualityAudit> => {
      const candidate = candidates[index];
      const scenes = sceneSets[index];
      const context = {
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
        relevantFacts: evidence.facts,
        creatorContext: projectCreatorContext("CONTENT_QUALITY_JUDGE", input.creatorContext),
        skillSlice: projectPlatformSkillSlice(skill, "brief"),
      };
      return track(
        "CONTENT_QUALITY_JUDGE",
        context,
        (onMetrics?: (metrics: ProviderCallMetrics) => void) => callCapability(
          input.router!,
          "CONTENT_QUALITY_JUDGE",
          project("CONTENT_QUALITY_JUDGE", context, {}),
          input.signal,
          onMetrics,
        ),
        (output) => parseQualityAudit(output, candidate.brief.contentId, round),
      );
    };
    const hardGateComposition = (updatedIndex: number) => {
      const current = candidates[updatedIndex].brief;
      const hardReports = validateBriefSet(
        candidates.map(({ brief }) => brief), evidence, "tiktok-commerce", skill.version,
        selectedPatterns, projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
      );
      const scene = sceneSets[updatedIndex];
      const gatedScenes = gateSceneSet(
        scene.scenes,
        current,
        evidence,
        projectCreatorContext("CONTENT_SCENE_IDEAS", input.creatorContext),
      );
      const rejectedReports = hardReports.filter((report) => report.decision !== "PASS");
      const scenesInvalid = gatedScenes.kept.length < 2 || gatedScenes.dropped > 0;
      if (scenesInvalid) rejectedReports.push({
        briefId: `${current.contentId}:${current.briefVersionId}`,
        decision: "REJECT",
        issues: ["scene_set_invalid"],
      } as typeof hardReports[number]);
      if (rejectedReports.length)
        throw new GenerationError("GEN-REPAIR-EXHAUSTED", "Composição reprovada no hard gate", true, {
          task: "CONTENT_PART_REPAIR", contentId: current.contentId,
          rejected: sanitizeGateReports(rejectedReports),
        });
    };

    let currentQualityAudits = await Promise.all(candidates.map((_, index) => judgeContent(index, 0)));
    qualityAudits.push(...currentQualityAudits);
    let qualityRepairRounds = 0;
    for (let round = 1; round <= 2 && currentQualityAudits.some((audit) => qualityPartsToRepair(audit).length); round++) {
      qualityRepairRounds = round;
      const pending = currentQualityAudits.flatMap((audit, index) =>
        qualityPartsToRepair(audit).map((judgment) => ({ index, part: judgment.part })),
      ).sort((left, right) => Number(left.part !== "scenes" && sceneSets[left.index].status !== "AVAILABLE") - Number(right.part !== "scenes" && sceneSets[right.index].status !== "AVAILABLE"));
      for (const { index, part } of pending) {
        const judgment = currentQualityAudits[index].parts.find((item) => item.part === part)!;
        if (judgment.status !== "REPAIR") continue;
        const candidate = candidates[index];
        const scene = sceneSets[index];
        const oldContent = part === "scenes" ? scene.scenes.map(({ description }) => description) : candidate.brief[part];
        const context = {
          contentId: candidate.brief.contentId,
          part,
          content: oldContent,
          criterion: judgment.criterion,
          reason: reasonText(judgment.reason),
          opportunity: { angle: candidate.opportunity.angle, commercialObjective: candidate.opportunity.commercialObjective, coreMessage: candidate.opportunity.coreMessage },
          relevantFacts: evidence.facts,
          creatorContext: projectCreatorContext("CONTENT_PART_REPAIR", input.creatorContext),
          skillSlice: projectPlatformSkillSlice(skill, "brief"),
        };
        const replacement = await track(
          "CONTENT_PART_REPAIR",
          context,
          (onMetrics?: (metrics: ProviderCallMetrics) => void) => callCapability(
            input.router!, "CONTENT_PART_REPAIR", project("CONTENT_PART_REPAIR", context, {}), input.signal, onMetrics,
          ),
          (output) => {
            if (Object.keys(output).length !== 1 || !Object.hasOwn(output, "content"))
              throw new GenerationError("GEN-SCHEMA", "Quality repair retornou contrato inválido", true, { task: "CONTENT_PART_REPAIR", part });
            if (part === "scenes") return validateContentSceneSetDraft({ scenes: output.content });
            const value = output.content;
            return validateContentBriefDraft({
              angle: candidate.brief.angle, hook: part === "hook" ? value : candidate.brief.hook,
              development: part === "development" ? value : candidate.brief.development,
              script: part === "script" ? value : candidate.brief.script,
              cta: part === "cta" ? value : candidate.brief.cta,
            })[part];
          },
        );
        const composed = applyQualityRepair(candidate.brief, scene.scenes, part, replacement);
        if (part === "scenes") {
          const repairedScenes = replacement as SceneIdea[];
          sceneSets[index] = { ...scene, status: "AVAILABLE", scenes: repairedScenes, generated: repairedScenes.length, dropped: 0 };
        } else candidates[index] = { ...candidate, brief: composed.brief };
        hardGateComposition(index);
        const audit = await judgeContent(index, round);
        currentQualityAudits[index] = audit;
        qualityAudits.push(audit);
        qualityRepairs.push({ contentId: candidate.brief.contentId, part, round, criterion: judgment.criterion, outcome: "REPAIRED" });
      }
    }
    if (currentQualityAudits.some((audit) => audit.parts.some(({ status }) => status !== "PASS")) || sceneSets.some((set) => set.status !== "AVAILABLE" || set.scenes.length < 2))
      throw new GenerationError("GEN-REPAIR-EXHAUSTED", "Judge semântico rejeitou parte ou a curadoria esgotou os dois rounds", true, {
        task: "CONTENT_QUALITY_JUDGE", rounds: qualityRepairRounds,
        rejected: projectQualityFailures(currentQualityAudits),
      });
  }
  repaired = candidates.map((candidate) => candidate.brief);
  finalReports = validateBriefSet(
    repaired,
    evidence,
    "tiktok-commerce",
    skill.version,
    selectedPatterns,
    projectCreatorContext("CONTENT_BRIEF_GENERATION", input.creatorContext),
  );
  if (repaired.length !== count || finalReports.some((report) => report.decision !== "PASS"))
    throw new GenerationError("GEN-REPAIR-EXHAUSTED", "Briefing inválido após curadoria semântica", true, { task: "CONTENT_QUALITY_JUDGE", expected: count, received: repaired.length });
  await emit("FINALIZING");
  return {
    productUnderstanding: understanding ?? {},
    strategy,
    plan,
    opportunities,
    briefs: repaired,
    reports: finalReports,
    patternReplacements,
    understandingReductions,
    sceneSets,
    memorySignals: {
      generatedCount: count,
      platformSkillVersion: skill.version,
      cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
    },
    stage: "FINALIZING",
    capabilities,
    repairs: repairCount,
    repairCauses,
    qualityAudits,
    qualityRepairs,
    validated: candidates.length,
  };
}
