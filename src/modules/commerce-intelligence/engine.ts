import {
  assignServerBriefIds,
  CARDINALITY_POLICY_VERSION,
  validateCommercialOpportunityMappingEnvelope,
  validateContentBriefDraft,
  validateContentOpportunity,
  validateContentPlan,
  validateProductStrategy,
  validateProductUnderstanding,
  validateTargetContentCount,
  ContractError,
  type CommercialOpportunityMappingEnvelope,
  type ContentBriefVersion,
  type ContentOpportunity,
  type ContentPlan,
  type EvidenceSnapshot,
  type ProductStrategy,
  type ProductUnderstanding,
} from "./contract";
import { loadPlatformSkill, projectPlatformSkillSlice } from "./platform-skill";
import { validateBriefSet, type GateReport } from "./gates";
import { emitJobEvent, sanitizeGateReports } from "./observability";
import { GenerationError } from "./errors";
import { type GenerationStage } from "./stages";
import {
  assertProviderOutput,
  ROUTER_MAP,
  type LogicalTask,
  type ModelRouter,
  type ProviderCallMetrics,
} from "./model-router";
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
  memorySignals: Record<string, unknown>;
  stage: GenerationStage;
  capabilities: CapabilityEvent[];
  repairs: number;
  repairCauses: Array<{ briefId: string; causes: string[] }>;
  validated: number;
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
  skill: ReturnType<typeof loadPlatformSkill>,
  productCategory?: string,
) {
  const mechanism = opportunity.hookMechanism
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR");
  const hookId =
    [
      ["problem", /problema|dor|dificuld|frustra/],
      ["discovery", /descoberta|surpresa|curios|novidade/],
      ["demonstration", /demonstr|prova|teste|visual|resultado/],
      ["objection", /objeç|objec|dúvida|duvida|receio/],
    ].find(([, pattern]) => (pattern as RegExp).test(mechanism))?.[0] ??
    skill.operationalRepertoire.hookMechanisms[
      position % skill.operationalRepertoire.hookMechanisms.length
    ].id;
  const isApparel =
    /roupa|vestu|vestuário|vestuario|moda|confecção|confeccao|calçado|calcado/.test(
      (productCategory ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR"),
    );
  const hooks = skill.creativeCatalog.hooks.filter(
    ({ type, category, categoryScope }) =>
      type === "hook" &&
      ((category === "general" && categoryScope === "global") ||
        (isApparel && category === "apparel" && categoryScope === "apparel")),
  );
  const ctaCategories = [
    ...new Set(skill.creativeCatalog.ctas.map(({ category }) => category)),
  ];
  const ctas = skill.creativeCatalog.ctas.filter(
    ({ type, category }) =>
      type === "cta" &&
      category ===
        (ctaCategories.includes("commerce") ? "commerce" : ctaCategories[0]),
  );
  return {
    opportunityId: opportunity.id,
    hook: hooks.length
      ? { ...hooks[position % hooks.length] }
      : skill.operationalRepertoire.hookMechanisms.find(
          ({ id }) => id === hookId,
        )!,
    cta: ctas.length
      ? { ...ctas[position % ctas.length] }
      : skill.operationalRepertoire.ctaStrategies[
          position % skill.operationalRepertoire.ctaStrategies.length
        ],
  };
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

export async function runFirstGeneration(
  input: EngineInput,
): Promise<EngineResult> {
  const count = validateTargetContentCount(input.targetContentCount);
  const skill = loadPlatformSkill();
  if (!input.router && !input.allowDeterministicTestFallback)
    throw new GenerationError("GEN-PROVIDER", "Provider não configurado");
  const emit: (stage: GenerationStage) => Promise<void> = async (stage) => {
    emitJobEvent("stage.started", { jobId: input.jobId, attempt, stage });
    if (input.onStage) await input.onStage(stage);
    emitJobEvent("stage.completed", { jobId: input.jobId, attempt, stage });
  };
  const facts = stripCommission(input.facts ?? {}) as Record<string, unknown>;
  const instructionVersion = input.router?.describe().instructionVersion;
  const capabilities: CapabilityEvent[] = [];
  const attempt = input.attempt ?? 1;
  const effectiveModel = (task: LogicalTask) =>
    input.router?.modelFor?.(task) ?? input.router?.describe().model;
  const track = async <T, R = T>(
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
      jobId: input.jobId,
      attempt,
      task,
      tier: ROUTER_MAP[task],
      model: effectiveModel(task),
      instructionHash: input.router?.hash?.(task),
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
        instructionHash: input.router?.hash?.(task),
        model: captured?.model ?? effectiveModel(task),
        reasoning: captured?.reasoning,
        providerStatus: captured?.providerStatus ?? null,
        durationMs,
        contextBytes,
        requestBytes: captured?.requestBytes,
        trustedContextBytes: captured?.trustedContextBytes,
        externalBytes: captured?.externalBytes,
        responseBytes,
        attempt,
        retry: captured?.retry ?? 0,
        ok: true,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        providerRequestId: captured?.providerRequestId,
        providerRequestIdSource: captured?.providerRequestIdSource,
        fallback: captured?.fallback,
      });
      emitJobEvent("capability.completed", {
        jobId: input.jobId,
        attempt,
        task,
        tier: ROUTER_MAP[task],
        model: captured?.model ?? effectiveModel(task),
        instructionHash: input.router?.hash?.(task),
        durationMs,
        requestBytes: captured?.requestBytes,
        trustedContextBytes: captured?.trustedContextBytes,
        externalBytes: captured?.externalBytes,
        responseBytes,
        arrayLength: Array.isArray(outputRecord.opportunities)
          ? outputRecord.opportunities.length
          : Array.isArray(outputRecord.items)
            ? outputRecord.items.length
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
        attempt,
        retry: captured?.retry ?? 0,
        ok: false,
        cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
        errorCode,
        providerRequestId: captured?.providerRequestId,
        providerRequestIdSource: captured?.providerRequestIdSource,
        fallback: captured?.fallback,
      });
      // Repropaga no evento apenas campos sanitizados do detail (ADR-017: endpoint/correlação/rate).
      const safe =
        error instanceof GenerationError &&
        error.detail &&
        typeof error.detail === "object"
          ? (error.detail as Record<string, unknown>)
          : error instanceof ContractError
            ? { issue: error.message, field: error.field }
            : {};
      emitJobEvent("capability.failed", {
        jobId: input.jobId,
        attempt,
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
  let understanding: ProductUnderstanding | null = null;
  let strategyOutput: ProductStrategy | null = null;
  let opportunityOutput: ContentPlan | null = null;
  const commercialOpportunities: Record<string, unknown>[] = [];

  let mappingEvidence: EvidenceSnapshot = { facts: [], refs: [] };
  if (input.router) {
    const baseEvidence = buildEvidenceCatalog({ ...input, facts });
    const understandingContext = {
      productId: input.productId,
      facts,
      evidenceRefsCatalog: baseEvidence.refs,
    };
    await emit("UNDERSTANDING_PRODUCT");
    understanding = await track(
      "PRODUCT_UNDERSTANDING",
      understandingContext,
      (onMetrics) => callCapability(
        input.router!,
        "PRODUCT_UNDERSTANDING",
        project("PRODUCT_UNDERSTANDING", understandingContext, {}),
        input.signal,
        onMetrics,
      ),
      (output) => validateProductUnderstanding(output, baseEvidence),
    );
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
    const planCall = (onMetrics?: (metrics: ProviderCallMetrics) => void) =>
      callCapability(
        input.router!,
        "CONTENT_PLAN_GENERATION",
        project("CONTENT_PLAN_GENERATION", planContext, {}),
        input.signal,
        onMetrics,
      );
    const allowedSourceIds = new Set(commercialOpportunities.map((opportunity) => String(opportunity.id)));
    const validatePlan = (value: Record<string, unknown>): ContentPlan => {
      if (!Array.isArray(value.opportunities)) throw new ContractError("GEN-SCHEMA", "Plano sem opportunities", "opportunities");
      const opportunities = value.opportunities.map((opportunity, index) =>
        validateContentOpportunity(
          {
            ...(opportunity && typeof opportunity === "object" ? opportunity as Record<string, unknown> : {}),
            id: `${input.jobId}-opportunity-${index + 1}`,
          },
          allowedSourceIds,
        ),
      );
      return validateContentPlan({
        ...value,
        id: `${input.jobId}-plan`,
        productId: input.productId,
        strategyVersion: 1,
        targetContentCount: count,
        platformId: skill.id,
        platformSkillVersion: skill.version,
        opportunities,
      });
    };
    let planProducer: ContentPlan | null = null;
    try {
      planProducer = await track(
        "CONTENT_PLAN_GENERATION",
        planContext,
        planCall,
        validatePlan,
      );
    } catch (error) {
      // Corpo raiz inválido (array/não-objeto) vira retry único de contrato; erros
      // sem essa assinatura seguem fail-closed imediato.
      if (!isRootShapeSchemaError(error)) throw error;
    }
    if (!planProducer) {
      planProducer = await track(
        "CONTENT_PLAN_GENERATION",
        planContext,
        planCall,
        validatePlan,
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
        hookMechanism: "demonstração direta",
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
        angle: opportunity.angle,
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
      selectedPatterns: entries.map(({ opportunity, position }) =>
        selectBriefPatterns(
          opportunity,
          position - 1,
          skill,
          typeof facts.category === "string" ? facts.category : undefined,
        ),
      ),
      repairContrast: entries.map(({ causes }) => {
        if (!causes?.length) return null;
        const factIndex = evidence.refs.findIndex((ref) => ref !== "product:name");
        const fact = factIndex >= 0 ? evidence.facts[factIndex] : undefined;
        return fact
          ? {
              featureList: fact,
              actionWithReason: `Comente ${fact} para explicar por que esse fato importa para o angulo.`,
            }
          : null;
      }),
      variety: { dimensions: ["angle", "hook", "structure", "cta"] },
      causes: entries.map((e) => e.causes ?? []),
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
  const selectedPatterns = candidates.map(({ opportunity }, index) =>
    selectBriefPatterns(
      opportunity,
      index,
      skill,
      typeof facts.category === "string" ? facts.category : undefined,
    ),
  );
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
    // Preserva PASS; regenera apenas rejeitados, em chunks limitados por batchSize
    // (respeita o máximo de 8 itens por chamada), mantendo posição — da qual derivam
    // contentId/briefVersionId estáveis.
    const repairedSet = new Set(rejected.map((r) => r.i));
    rejected.forEach(({ c, report }) => {
      repairCauses.push({
        briefId: `${c.brief.contentId}:${c.brief.briefVersionId}`,
        causes: (report?.issues ?? []).slice(0, 8).map((cause) => cause.slice(0, 200)),
      });
    });
    let received = 0;
    for (let start = 0; start < rejected.length; start += size) {
      const slice = rejected
        .slice(start, start + size)
        .map(({ c, report, i }) => ({
          opportunity: c.opportunity,
          causes: report?.issues ?? [],
          position: i + 1,
        }));
      const replacements = await generateBatch(slice);
      received += replacements.length;
      slice.forEach((entry, offset) => {
        candidates[entry.position - 1] = replacements[offset];
      });
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
  const repaired = candidates.map((c) => c.brief);
  const finalReports = validateBriefSet(
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
  await emit("FINALIZING");
  return {
    productUnderstanding: understanding ?? {},
    strategy,
    plan,
    opportunities,
    briefs: repaired,
    reports: finalReports,
    memorySignals: {
      generatedCount: count,
      platformSkillVersion: skill.version,
      cardinalityPolicyVersion: CARDINALITY_POLICY_VERSION,
    },
    stage: "FINALIZING",
    capabilities,
    repairs: repairCount,
    repairCauses,
    validated: candidates.length,
  };
}
