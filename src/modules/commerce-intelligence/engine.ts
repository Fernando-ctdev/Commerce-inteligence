import { assignServerBriefIds, validateCommercialOpportunityMappingEnvelope, validateContentBriefDraft, validateContentOpportunity, validateContentPlan, validateProductStrategy, validateProductUnderstanding, validateTargetContentCount, ContractError, type CommercialOpportunityMappingEnvelope, type ContentBriefVersion, type ContentOpportunity, type EvidenceSnapshot, type ProductUnderstanding } from "./contract";
import { loadPlatformSkill } from "./platform-skill";
import { validateBriefSet, type GateReport } from "./gates";
import { emitJobEvent, sanitizeGateReports } from "./observability";
import { GenerationError } from "./errors";
import { type GenerationStage } from "./stages";
import { assertProviderOutput, ROUTER_MAP, type LogicalTask, type ModelRouter, type ProviderCallMetrics } from "./model-router";
export type EngineInput = { productId: string; jobId: string; name: string; description: string; facts?: Record<string, unknown>; creatorContext?: Record<string, unknown>; memory?: Record<string, unknown>; router?: ModelRouter; allowDeterministicTestFallback?: boolean; targetContentCount: number; onStage?: (stage: GenerationStage) => Promise<void> | void; signal?: AbortSignal; attempt?: number };
export type CapabilityEvent = { task: LogicalTask; tier: string; instructionVersion?: string; instructionHash?: string; model?: string; reasoning?: string; providerStatus?: number | null; durationMs: number; contextBytes: number; requestBytes?: number; trustedContextBytes?: number; externalBytes?: number; responseBytes: number; attempt: number; retry: number; ok: boolean; errorCode?: string; providerRequestId?: string; providerRequestIdSource?: "header" | "body.id" };
export type EngineResult = { productUnderstanding: Record<string, unknown>; strategy: Record<string, unknown>; plan: Record<string, unknown>; opportunities: Record<string, unknown>[]; briefs: ContentBriefVersion[]; reports: GateReport[]; memorySignals: Record<string, unknown>; stage: GenerationStage; capabilities: CapabilityEvent[]; repairs: number; validated: number };

function batchSize(): number { const raw = Number(process.env.GENERATION_BRIEF_BATCH_SIZE ?? 4); return Number.isInteger(raw) && raw >= 4 && raw <= 8 ? raw : 4; }
function mappingOpportunityLimit(): number { const raw = Number(process.env.GENERATION_MAPPING_MAX_OPPORTUNITIES ?? 4); return Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : 4; }
// Catálogo autorizado de evidências com ids estáveis fornecidos ao provider (não IDs inventados).
// refs validam contra este catálogo; o provider recebe a lista para retornar apenas refs válidos.
export function buildEvidenceCatalog(input: { name?: string; description?: string; facts?: Record<string, unknown> }): EvidenceSnapshot {
  const facts: string[] = [];
  const refs: string[] = [];
  if (input.name && input.name.trim()) { facts.push(input.name); refs.push("product:name"); }
  if (input.description && input.description.trim()) { facts.push(input.description); refs.push("product:description"); }
  const factsMap = input.facts ?? {};
  for (const [key, value] of Object.entries(factsMap)) {
    const values = typeof value === "string" ? [value] : Array.isArray(value) && value.every((item): item is string => typeof item === "string") ? value : [];
    const nonEmptyValues = values.filter((item) => item.trim());
    if (nonEmptyValues.length > 0) { facts.push(...nonEmptyValues); refs.push(`fact:${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`); }
  }
  return { facts, refs };
}
// Projeções allowlistadas por capability: contexto confirmado separado de dados externos.
// O sistema (instruction server-side) é confiável por construção; a capability recebe só o necessário.
function project(task: string, confirmed: unknown, external: unknown): Parameters<ModelRouter["complete"]>[1] {
  void task;
  return { trustedContext: confirmed, externalData: external };
}
function isRootShapeSchemaError(error: unknown): boolean {
  return error instanceof GenerationError && error.code === "GEN-SCHEMA" && /deve ser um objeto JSON/.test(error.message);
}
// Primeira violação estrutural de item do lote (ex.: scenes ausente/não-array/vazio/fora
// de 2–6), com issue sanitizada (mensagem determinística do contrato, sem payload).
function findBriefItemIssue(items: unknown[]): { item: number; issue: string } | null {
  for (const [index, draft] of items.entries()) {
    try { validateContentBriefDraft(draft); } catch (error) {
      if (error instanceof ContractError) return { item: index + 1, issue: error.message };
      throw error;
    }
  }
  return null;
}
function isMissingOpportunitiesError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as { code?: unknown }).code === "GEN-SCHEMA" && /sem oportunidades/.test(error.message);
}
async function callCapability(router: ModelRouter, task: Parameters<ModelRouter["complete"]>[0], input: Parameters<ModelRouter["complete"]>[1], signal?: AbortSignal, onMetrics?: (metrics: ProviderCallMetrics) => void) {
  try { return assertProviderOutput(await router.complete(task, input, signal, onMetrics)); } catch (error) { const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "GEN-PROVIDER"; throw error instanceof GenerationError ? error : new GenerationError(code ?? "GEN-PROVIDER", error instanceof Error ? error.message : "Capability falhou"); }
}

export async function runFirstGeneration(input: EngineInput): Promise<EngineResult> {
  const count = validateTargetContentCount(input.targetContentCount);
  const skill = loadPlatformSkill();
  if (!input.router && !input.allowDeterministicTestFallback) throw new GenerationError("GEN-PROVIDER", "Provider não configurado");
  const emit: (stage: GenerationStage) => Promise<void> = async (stage) => { emitJobEvent("stage.started", { jobId: input.jobId, attempt, stage }); if (input.onStage) await input.onStage(stage); emitJobEvent("stage.completed", { jobId: input.jobId, attempt, stage }); };
  const facts = input.facts ?? {};
  const instructionVersion = input.router?.describe().instructionVersion;
  const capabilities: CapabilityEvent[] = [];
  const attempt = input.attempt ?? 1;
  const effectiveModel = (task: LogicalTask) => input.router?.modelFor?.(task) ?? input.router?.describe().model;
  const track = async (task: LogicalTask, context: unknown, run: (onMetrics?: (metrics: ProviderCallMetrics) => void) => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> => {
    const startedAt = Date.now();
    const contextBytes = Buffer.byteLength(JSON.stringify(context), "utf8");
    let captured: ProviderCallMetrics | undefined;
    emitJobEvent("capability.started", { jobId: input.jobId, attempt, task, tier: ROUTER_MAP[task], model: effectiveModel(task), instructionHash: input.router?.hash?.(task), timeoutMs: Number(process.env.GENERATION_PROVIDER_TIMEOUT_MS ?? 180000), requestBytes: contextBytes, trustedContextBytes: contextBytes });
    try {
      const output = await run((metrics) => { captured = metrics; });
      const durationMs = Date.now() - startedAt;
      const responseBytes = Buffer.byteLength(JSON.stringify(output), "utf8");
      capabilities.push({ task, tier: ROUTER_MAP[task], instructionVersion, instructionHash: input.router?.hash?.(task), model: captured?.model ?? effectiveModel(task), reasoning: captured?.reasoning, providerStatus: captured?.providerStatus ?? null, durationMs, contextBytes, requestBytes: captured?.requestBytes, trustedContextBytes: captured?.trustedContextBytes, externalBytes: captured?.externalBytes, responseBytes, attempt, retry: 0, ok: true, providerRequestId: captured?.providerRequestId, providerRequestIdSource: captured?.providerRequestIdSource });
      emitJobEvent("capability.completed", { jobId: input.jobId, attempt, task, tier: ROUTER_MAP[task], model: captured?.model ?? effectiveModel(task), instructionHash: input.router?.hash?.(task), durationMs, requestBytes: captured?.requestBytes, trustedContextBytes: captured?.trustedContextBytes, externalBytes: captured?.externalBytes, responseBytes, arrayLength: Array.isArray(output.opportunities) ? output.opportunities.length : Array.isArray(output.items) ? output.items.length : undefined, providerRequestId: captured?.providerRequestId, providerRequestIdSource: captured?.providerRequestIdSource });
      return output;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorCode = error instanceof GenerationError ? error.code : "GEN-PROVIDER";
      capabilities.push({ task, tier: ROUTER_MAP[task], instructionVersion, model: captured?.model ?? effectiveModel(task), reasoning: captured?.reasoning, providerStatus: captured?.providerStatus ?? null, durationMs, contextBytes, requestBytes: captured?.requestBytes, trustedContextBytes: captured?.trustedContextBytes, externalBytes: captured?.externalBytes, responseBytes: captured?.responseBytes ?? 0, attempt, retry: 0, ok: false, errorCode, providerRequestId: captured?.providerRequestId, providerRequestIdSource: captured?.providerRequestIdSource });
      // Repropaga no evento apenas campos sanitizados do detail (ADR-017: endpoint/correlação/rate).
      const safe = error instanceof GenerationError && error.detail && typeof error.detail === "object" ? error.detail as Record<string, unknown> : {};
      emitJobEvent("capability.failed", { jobId: input.jobId, attempt, task, tier: ROUTER_MAP[task], model: captured?.model ?? effectiveModel(task), durationMs, errorName: error instanceof Error ? error.name : "unknown", errorCode, errorKind: typeof safe.errorKind === "string" ? safe.errorKind : undefined, providerStatus: typeof safe.providerStatus === "number" ? safe.providerStatus : undefined, endpoint: typeof safe.endpoint === "string" ? safe.endpoint : undefined, providerRequestId: typeof safe.providerRequestId === "string" ? safe.providerRequestId : undefined, providerRequestIdSource: typeof safe.providerRequestIdSource === "string" ? safe.providerRequestIdSource : undefined, rate: safe.rate && typeof safe.rate === "object" ? safe.rate as Record<string, string> : undefined });
      throw error;
    }
  };
  let understanding: ProductUnderstanding | null = null;
  let strategyOutput: Record<string, unknown> | null = null;
  let opportunityOutput: Record<string, unknown> | null = null;
  const commercialOpportunities: Record<string, unknown>[] = [];

  if (input.router) {
    const baseEvidence = buildEvidenceCatalog(input);
    const understandingContext = { productId: input.productId, facts, evidenceRefsCatalog: baseEvidence.refs };
    await emit("UNDERSTANDING_PRODUCT");
    understanding = validateProductUnderstanding(await track("PRODUCT_UNDERSTANDING", understandingContext, (onMetrics) => callCapability(input.router!, "PRODUCT_UNDERSTANDING", project("PRODUCT_UNDERSTANDING", understandingContext, {}), input.signal, onMetrics)));
    const mappingEvidence: EvidenceSnapshot = { facts: [...baseEvidence.facts, ...(understanding?.evidenceRefs ?? [])], refs: [...baseEvidence.refs, ...(understanding?.evidenceRefs ?? [])] };
    // Projeção compacta e allowlisted para o mapping: fatos essenciais do Product,
    // catálogo de evidências e campos necessários do understanding. Sem agregado bruto
    // de facts, Strategy, Plan, Skill completa ou memória histórica.
    const mappingContext = {
      productId: input.productId,
      product: { name: input.name, description: input.description, category: facts.category, brand: facts.brand, priceAmount: facts.priceAmount, priceCurrency: facts.priceCurrency },
      understanding: { category: understanding?.category, coreUseCases: understanding?.coreUseCases, functionalBenefits: understanding?.functionalBenefits, emotionalBenefits: understanding?.emotionalBenefits, desiredOutcomes: understanding?.desiredOutcomes, purchaseTriggers: understanding?.purchaseTriggers, purchaseBarriers: understanding?.purchaseBarriers, evidenceRefs: understanding?.evidenceRefs },
      evidenceRefsCatalog: mappingEvidence.refs,
      maxOpportunities: mappingOpportunityLimit(),
    };
    await emit("MAPPING_COMMERCIAL_OPPORTUNITIES");
    // Mapping envelope do provider é não confiável: um único retry de contrato re-solicita
    // opportunities quando o corpo veio sem elas (200 com prosa/arrays vazios). Falha fechada
    // depois do retry — sem inventar oportunidades.
    let producer = await track("COMMERCIAL_OPPORTUNITY_MAPPING", mappingContext, (onMetrics) => callCapability(input.router!, "COMMERCIAL_OPPORTUNITY_MAPPING", project("COMMERCIAL_OPPORTUNITY_MAPPING", mappingContext, {}), input.signal, onMetrics));
    let envelope: CommercialOpportunityMappingEnvelope;
    try {
      envelope = validateCommercialOpportunityMappingEnvelope(producer, mappingEvidence);
    } catch (error) {
      // Retry único e específico: envelope 200 sem `opportunities` é re-solicitado uma vez
      // com o mesmo contexto; qualquer outro erro segue fail-closed. Sem inventar dados.
      if (!isMissingOpportunitiesError(error)) throw error;
      producer = await track("COMMERCIAL_OPPORTUNITY_MAPPING", mappingContext, (onMetrics) => callCapability(input.router!, "COMMERCIAL_OPPORTUNITY_MAPPING", project("COMMERCIAL_OPPORTUNITY_MAPPING", mappingContext, {}), input.signal, onMetrics));
      envelope = validateCommercialOpportunityMappingEnvelope(producer, mappingEvidence);
    }
    // IDs de oportunidade comercial são server-derived.
    envelope.opportunities.forEach((opportunity, index) => { commercialOpportunities.push({ ...opportunity, id: `${input.jobId}-commercial-${index + 1}` }); });
    const strategyContext = { productId: input.productId, understanding, commercialOpportunities, skill: skill.validationRules, evidenceRefsCatalog: mappingEvidence.refs };
    await emit("BUILDING_STRATEGY");
    strategyOutput = await track("STRATEGY_SYNTHESIS", strategyContext, (onMetrics) => callCapability(input.router!, "STRATEGY_SYNTHESIS", project("STRATEGY_SYNTHESIS", strategyContext, {}), input.signal, onMetrics));
    const planContext = { productId: input.productId, strategy: strategyOutput, targetContentCount: count };
    await emit("BUILDING_CONTENT_PLAN");
    // Retry único de contrato para o plano: corpo raiz inválido (array/não-objeto) ou
    // opportunities ausentes são re-solicitados uma vez com o mesmo contexto; depois,
    // fail-closed. Sem inventar oportunidades.
    const planCall = (onMetrics?: (metrics: ProviderCallMetrics) => void) => callCapability(input.router!, "CONTENT_PLAN_GENERATION", project("CONTENT_PLAN_GENERATION", planContext, {}), input.signal, onMetrics);
    let planProducer: Record<string, unknown> | null = null;
    try {
      planProducer = (await track("CONTENT_PLAN_GENERATION", planContext, planCall)) as Record<string, unknown> | null;
    } catch (error) {
      // Corpo raiz inválido (array/não-objeto) vira retry único de contrato; erros
      // sem essa assinatura seguem fail-closed imediato.
      if (!isRootShapeSchemaError(error)) throw error;
    }
    const planShapeValid = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { opportunities?: unknown }).opportunities));
    if (!planShapeValid(planProducer)) {
      planProducer = (await track("CONTENT_PLAN_GENERATION", planContext, planCall)) as Record<string, unknown> | null;
      if (!planShapeValid(planProducer)) throw new GenerationError("GEN-SCHEMA", "Plano do provider inválido", true, { task: "CONTENT_PLAN_GENERATION", retried: true });
    }
    opportunityOutput = planProducer;
  }

  const rawOpportunities = opportunityOutput?.opportunities;
  if (input.router && !Array.isArray(rawOpportunities)) throw new GenerationError("GEN-SCHEMA", "Plano do provider inválido");
  // Vínculo do provider a oportunidade comercial só vale se existir no conjunto server-derived
  // da Strategy; referência órfã falha fechado em GEN-SCHEMA (sem fabricar vínculo).
  const allowedSourceIds = new Set(commercialOpportunities.map((opportunity) => String(opportunity.id)));
  const opportunities = Array.isArray(rawOpportunities) ? rawOpportunities.map((value, index) => validateContentOpportunity({ ...(value && typeof value === "object" ? value as Record<string, unknown> : {}), id: `${input.jobId}-opportunity-${index + 1}` }, input.router ? allowedSourceIds : undefined)) : Array.from({ length: count }, (_, index) => ({ id: `${input.jobId}-opportunity-${index + 1}`, commercialObjective: "Demonstrar valor do produto", angle: `Ângulo ${index + 1}`, coreMessage: input.name, hookMechanism: "demonstração direta", noveltyTargets: [`angle-${index + 1}`] }));

  const strategy = strategyOutput ? validateProductStrategy({ ...strategyOutput, id: `${input.jobId}-strategy`, productId: input.productId, jobId: input.jobId, version: 1, status: "ACTIVE", platformId: skill.id, platformSkillVersion: skill.version, opportunities: commercialOpportunities }) : { id: `${input.jobId}-strategy`, productId: input.productId, jobId: input.jobId, version: 1, status: "ACTIVE", platformId: skill.id, platformSkillVersion: skill.version, primaryPositioning: input.description, audiences: ["pessoas interessadas no produto"], priorityBenefits: [], priorityObjections: [], priorityArguments: [], priorityAngles: [], communicationPrinciples: [], communicationRisks: [], opportunities: commercialOpportunities };
  const plan = validateContentPlan({ ...(opportunityOutput ?? {}), id: `${input.jobId}-plan`, productId: input.productId, strategyVersion: 1, targetContentCount: count, platformId: skill.id, platformSkillVersion: skill.version, opportunities });

  // Brief Generator: batches sequenciais de 4-8, um lote por vez (sem Promise.all ilimitado).
  // Cada item mantém vínculo com a oportunidade de conteúdo correspondente para repair causal.
  interface BriefCandidate { brief: ContentBriefVersion; opportunity: ContentOpportunity; }
  const candidates: BriefCandidate[] = [];
  const size = batchSize();
  const evidence = buildEvidenceCatalog(input);
  await emit("GENERATING_BRIEFS");
  const generateBatch = async (entries: Array<{ opportunity: ContentOpportunity; causes?: string[]; position: number }>): Promise<BriefCandidate[]> => {
    const batchContext = { productId: input.productId, strategy, opportunities: entries.map((e) => e.opportunity), creatorContext: input.creatorContext ?? {}, skill: skill.validationRules, causes: entries.map((e) => e.causes ?? []), evidenceRefsCatalog: evidence.refs };
    let rawBatch: unknown[];
    if (input.router) {
      const batchCall = (onMetrics?: (metrics: ProviderCallMetrics) => void) => callCapability(input.router!, "CONTENT_BRIEF_GENERATION", project("CONTENT_BRIEF_GENERATION", batchContext, {}), input.signal, onMetrics);
      const extractItems = (producer: Record<string, unknown>): unknown[] => Array.isArray(producer.items) ? producer.items : [];
      // Retry único de contrato para o lote: cardinalidade divergente OU item estruturalmente
      // inválido (ex.: scenes ausente/não-array/vazio/fora de 2–6) re-solicita uma vez com o
      // mesmo contexto; persistindo, GEN-SCHEMA tipado com detail sanitizado e fail-closed.
      const batchIssue = (items: unknown[]): { item: number; issue: string } | null => items.length !== entries.length ? { item: 0, issue: `cardinalidade divergente: esperado ${entries.length}, recebido ${items.length}` } : findBriefItemIssue(items);
      let producer = (await track("CONTENT_BRIEF_GENERATION", batchContext, batchCall)) as Record<string, unknown>;
      rawBatch = extractItems(producer);
      let issue = batchIssue(rawBatch);
      if (issue) {
        producer = (await track("CONTENT_BRIEF_GENERATION", batchContext, batchCall)) as Record<string, unknown>;
        rawBatch = extractItems(producer);
        issue = batchIssue(rawBatch);
        if (issue) {
          const detail = { task: "CONTENT_BRIEF_GENERATION", item: issue.item, issue: issue.issue, expected: entries.length, received: rawBatch.length, retried: true };
          emitJobEvent("capability.failed", { jobId: input.jobId, attempt, task: "CONTENT_BRIEF_GENERATION", tier: ROUTER_MAP.CONTENT_BRIEF_GENERATION, model: effectiveModel("CONTENT_BRIEF_GENERATION"), errorCode: "GEN-SCHEMA", item: issue.item, issue: issue.issue, expected: entries.length, received: rawBatch.length, retry: 1 });
          throw new GenerationError("GEN-SCHEMA", "Lote de briefings inválido", true, detail);
        }
      }
    } else {
      rawBatch = entries.map((entry) => { const position = entry.position; return { angle: `Ângulo ${position}`, hook: `Veja como ${input.name} pode ajudar`, script: `Apresente ${input.name} de forma natural e demonstre o uso.`, scenes: ["Apresentação", "Demonstração"], cta: "Confira o produto." }; });
    }
    const assigned = assignServerBriefIds(rawBatch, input.jobId, 0);
    return assigned.map((brief, index) => { const position = entries[index].position; return { brief: { ...brief, contentId: `${input.jobId}-content-${position}`, briefVersionId: `${input.jobId}-brief-${position}` }, opportunity: entries[index].opportunity }; });
  };
  for (let start = 0; start < opportunities.length; start += size) {
    const batch = opportunities.slice(start, start + size).map((opportunity, offset) => ({ opportunity, position: start + offset + 1 }));
    candidates.push(...await generateBatch(batch));
  }
  // Repair causal e limitado: somente itens rejeitados recebem nova geração, com causas + oportunidade original.
  let reports = validateBriefSet(candidates.map((c) => c.brief), evidence);
  const maxRepairs = Number(process.env.GENERATION_MAX_REPAIRS ?? 2);
  let repairCount = 0;
  let repairRounds = 0;
  for (let round = 0; round < maxRepairs; round++) {
    const rejected = candidates.map((c, i) => ({ c, i, report: reports[i] })).filter(({ report }) => report?.decision === "REPAIR" || report?.decision === "REJECT");
    if (rejected.length === 0) break;
    repairCount += rejected.length;
    repairRounds += 1;
    emitJobEvent("repair.started", { jobId: input.jobId, attempt, expected: rejected.length, retry: round });
    const repairStartedAt = Date.now();
    // Preserva PASS; regenera apenas rejeitados no lote.
    const replacements = await generateBatch(rejected.map(({ c, report, i }) => ({ opportunity: c.opportunity, causes: report?.issues ?? [], position: i + 1 })));
    const passSet = new Set(rejected.map((r) => r.i));
    Array.from(passSet).sort((a, b) => a - b).forEach((index, offset) => { candidates[index] = replacements[offset]; });
    reports = validateBriefSet(candidates.map((c) => c.brief), evidence);
    emitJobEvent("repair.completed", { jobId: input.jobId, attempt, durationMs: Date.now() - repairStartedAt, expected: rejected.length, received: replacements.length, retry: round, gateReports: sanitizeGateReports(reports.filter((_, index) => passSet.has(index))) });
  }
  const repaired = candidates.map((c) => c.brief);
  const finalReports = validateBriefSet(repaired, evidence);
  if (repaired.length !== count || finalReports.some((report) => report.decision !== "PASS")) throw new GenerationError("GEN-REPAIR-EXHAUSTED", "Repair não produziu briefing válido", true, { task: "CONTENT_BRIEF_GENERATION", rounds: repairRounds, expected: count, received: repaired.length, rejected: sanitizeGateReports(finalReports.filter((report) => report.decision !== "PASS")) });
  await emit("FINALIZING");
  return { productUnderstanding: understanding ?? {}, strategy, plan, opportunities, briefs: repaired, reports: finalReports, memorySignals: { generatedCount: count, platformSkillVersion: skill.version }, stage: "FINALIZING", capabilities, repairs: repairCount, validated: candidates.length };
}