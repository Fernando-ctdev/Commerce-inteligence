import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { GenerationError } from "./errors";
import { ContractError } from "./contract";
import { emitJobEvent, sanitizeGateReports, type JobEventFields, type SanitizedGateReport } from "./observability";
import { prisma } from "../db";
import { extractJobCreatorContext } from "../creator-preferences/service";
import {
  buildEvidenceCatalog,
  createCapabilityTracker,
  ENGINE_VERSION,
  generateSceneSetsForBriefs,
  runFirstGeneration,
  type EngineResult,
  type SceneSetOutcome,
  type UnderstandingCardinalityReduction,
} from "./engine";
import { loadPlatformSkill } from "./platform-skill";
import { GATE_POLICY_VERSION } from "./gates";
import type { ContentBriefVersion } from "./contract";
import { createHttpProvider } from "./provider";
import type { ModelDescription } from "./model-router";
import { QUALITY_PARTS, reasonText, type QualityAudit, type QualityPart } from "./semantic-quality";
import { heartbeat } from "./runtime";

const SAFE_REPAIR_CAUSE_LABELS = ["claim sem suporte", "development invalido"] as const;

/** Fatos essenciais do Product enviados à engine ( Gate 5, item 3). Desconto
 * entra como fato SOMENTE quando existe no Product, exclusivamente do tipado
 * (discountType + discountValue): sem fallback de discountPercentage, valor
 * nunca inventado. Função pura para cobertura factual determinística. */
export function projectEngineFacts(product: {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  priceAmount: Prisma.Decimal | null;
  priceCurrency: string | null;
  discountType: string | null;
  discountValue: string | null;
  discountPercentage: Prisma.Decimal | null;
  features: unknown;
  variants: unknown;
  images: unknown;
  seller: string | null;
  sourceUrl: string | null;
}) {
  return {
    productId: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    brand: product.brand,
    priceAmount: product.priceAmount?.toString(),
    priceCurrency: product.priceCurrency,
    // Desconto só entra como fato quando existe no Product (nunca inventado).
    // Contrato exclusivamente tipado (Gate 5): sem fallback de discountPercentage.
    discount: product.discountType === "PERCENTAGE" && product.discountValue
      ? `${product.discountValue.toString()}% de desconto`
      : product.discountType === "FIXED" && product.discountValue
        ? `${product.priceCurrency ?? ""} ${product.discountValue.toString()} de desconto`.trim()
        : undefined,
    features: product.features,
    variants: product.variants,
    images: product.images,
    seller: product.seller,
    sourceUrl: product.sourceUrl,
  };
}

function projectRepairCauses(source: Record<string, unknown>, sanitized: string[]): string[] {
  const causes = Array.isArray(source.issues) ? source.issues : Array.isArray(source.causes) ? source.causes : [];
  return causes.map((cause, index) => {
    const label = typeof cause === "string" ? cause.trim().toLocaleLowerCase("pt-BR") : "";
    return SAFE_REPAIR_CAUSE_LABELS.find((safe) => safe === label) ?? sanitized[index] ?? "gate_issue";
  });
}

// Forma objetiva completa de GateReport (gates.ts): briefId + issues + enums
// válidos. Registro semântico (contentId/part/round/status) nunca satisfaz —
// nem mesmo com briefId e issues presentes — e nunca vira diagnóstico objetivo.
const OBJECTIVE_GATE_ENUMS: Record<string, readonly string[]> = {
  factualStatus: ["SUPPORTED", "INFERRED_BUT_SAFE", "UNSUPPORTED", "CONTRADICTED"],
  claimType: ["objetivo", "subjetivo"],
  structuralStatus: ["PASS", "FAIL"],
  platformStatus: ["PASS", "FAIL"],
  varietyStatus: ["PASS", "FAIL"],
  decision: ["PASS", "REPAIR", "REJECT"],
};
function isObjectiveGateRecord(item: Record<string, unknown>): boolean {
  if (typeof item.briefId !== "string" || !Array.isArray(item.issues)) return false;
  return Object.entries(OBJECTIVE_GATE_ENUMS).every(([field, allowed]) => allowed.includes(String(item[field])));
}
export function projectFailureDiagnostics(value: unknown): { gateReports: SanitizedGateReport[]; causes: Array<{ briefId: string; causes: string[] }> } {
  const records = Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  // GateDecision REPAIR|REJECT permanece vocabulário objetivo do GateReport;
  // só registro com a forma objetiva completa entra em gateReports/causes.
  const gateSources = records.filter(isObjectiveGateRecord);
  const gateReports = sanitizeGateReports(gateSources);
  return {
    gateReports,
    causes: gateReports.map((report, index) => ({ briefId: report.briefId, causes: projectRepairCauses(gateSources[index], report.causes) })),
  };
}

export function briefPayloadForPersistence(brief: ContentBriefVersion): Prisma.InputJsonObject {
  const { scenes: _legacyScenes, ...payload } = brief as ContentBriefVersion & { scenes?: unknown };
  if (!Array.isArray(payload.development) || payload.development.length < 1 || payload.development.length > 4 || payload.development.some((point) => typeof point !== "string" || !point.trim())) {
    throw new GenerationError("GEN-SCHEMA", "Brief sem development válido não pode ser persistido", false);
  }
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonObject;
}

export function fenceMatches(
  job: { leaseOwnerId: string | null; attempt: number },
  ownerId: string,
  attempt: number,
) {
  return job.leaseOwnerId === ownerId && job.attempt === attempt;
}

export function internalFailureMetadata(code: string, stage: string | null, detail: unknown): Record<string, unknown> {
  const source = detail && typeof detail === "object" && !Array.isArray(detail)
    ? detail as Record<string, unknown>
    : {};
  const safeDetail: Record<string, string | number | boolean> = {};
  for (const key of ["task", "rounds", "expected", "received", "retried", "item", "issue", "field", "errorName"]) {
    const value = source[key];
    if (typeof value === "string") safeDetail[key] = value.slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean") safeDetail[key] = value;
  }
  if (typeof source.message === "string" && safeDetail.issue === undefined) safeDetail.issue = source.message.slice(0, 200);
  const diagnostics = projectFailureDiagnostics(source.rejected);
  return {
    code,
    stage,
    ...(Object.keys(safeDetail).length ? { detail: safeDetail } : {}),
    ...(diagnostics.gateReports.length ? {
      gateReports: diagnostics.gateReports,
      causes: diagnostics.causes,
    } : {}),
  };
}

// Decisão pura do heartbeat por tick: nunca renovar além do deadline da tentativa.
// "abort" interrompe o heartbeat e aborta a tentativa (cobre provider que ignora o
// AbortSignal); "skip" é no-op pós-fence-perdido; "renew" renova apenas antes do deadline.
export function heartbeatAction(
  nowMs: number,
  attemptDeadlineMs: number,
  fencingLost: boolean,
): "renew" | "abort" | "skip" {
  if (fencingLost) return "skip";
  return nowMs >= attemptDeadlineMs ? "abort" : "renew";
}

function leaseMs(): number {
  const v = Number(process.env.GENERATION_LEASE_MS ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}
// Deadline global da tentativa derivado do orçamento real de chamadas: 4 chamadas fundacionais
// + ceil(N/batchSize) batches de briefs, cada um limitado pelo timeout do provider, mais margem
// de finalização e heartbeat. Config explícita (GENERATION_ATTEMPT_DEADLINE_MS) é usada se maior.
function providerTimeoutMs(): number {
  const v = Number(process.env.GENERATION_PROVIDER_TIMEOUT_MS ?? 180000);
  return Number.isFinite(v) && v > 0 ? v : 180000;
}
function finalizeMarginMs(): number {
  const v = Number(process.env.GENERATION_FINALIZE_MARGIN_MS ?? 120000);
  return Number.isFinite(v) && v > 0 ? v : 120000;
}
function batchSizeForBudget(): number {
  const v = Number(process.env.GENERATION_BRIEF_BATCH_SIZE ?? 4);
  return Number.isInteger(v) && v >= 4 && v <= 8 ? v : 4;
}
export function callBudget(count: number): number {
  return 4 + Math.ceil(count / batchSizeForBudget());
}
// Margem do fallback MID→HIGH (provider): no pior caso cada chamada MID custa uma
// brief (MID). Tarefas HIGH não caem em fallback; cenas e juízes agora usam HIGH.
export function fallbackCallBudget(count: number): number {
  return 2 + Math.ceil(count / batchSizeForBudget());
}
// N initial judge calls + up to 2 rounds × N items × 5 rejected parts, where
// every part repair is followed by another judge call: N + (2 × N × 5 × 2).
export function semanticQualityCallBudget(count: number): number {
  return count + 2 * count * QUALITY_PARTS.length * 2;
}
export function attemptDeadlineMsFor(count: number): number {
  const derived =
    (callBudget(count) + fallbackCallBudget(count) + semanticQualityCallBudget(count) + 2 * count) * providerTimeoutMs() +
    sceneDeadlineBudgetMs(count) +
    finalizeMarginMs();
  const configured = Number(process.env.GENERATION_ATTEMPT_DEADLINE_MS ?? 0);
  return Number.isFinite(configured) && configured > derived
    ? configured
    : derived;
}

// ADR-019: a seleção e o orçamento usam o mesmo cap do backfill. Cada cena pode
// percorrer LOW→MID→HIGH, usando o timeout efetivo configurado no provider.
export function sceneBackfillLimitFor(count: number): number {
  return 10;
}
export function sceneCallBudget(count: number): number {
  return 3 * (count + sceneBackfillLimitFor(count));
}
function sceneDeadlineBudgetMs(count: number): number {
  return sceneCallBudget(count) * providerTimeoutMs();
}
export function leaseMsFor(count: number): number {
  const derived = attemptDeadlineMsFor(count) + leakMsDefaultMargin();
  return leaseMs() > derived ? leaseMs() : derived;
}
function leakMsDefaultMargin(): number {
  return 120000;
}
function maxAttempts(): number {
  const v = Number(process.env.GENERATION_MAX_ATTEMPTS ?? 2);
  return Number.isInteger(v) && v > 0 ? v : 2;
}

// Validações de parâmetros essenciais no boot (SPEC §B-003-03 / §3.2): rejeita configuração
// inconsistente que tornaria count máximo impossível. Falha fechado somente para limites que
// quebram a viabilidade do orçamento; nunca apenas por ausência de provider/Skill.
export function validateGenerationConfig(): void {
  const batch = batchSizeForBudget();
  const perCall = providerTimeoutMs();
  const budget30 = (callBudget(30) + fallbackCallBudget(30)) * perCall;
  // Deadline explícito menor que o orçamento p/ count 30 tornaria o count máximo inviável.
  // Lease é renovado por heartbeat, então não é restrição dura; deadline é o abort global.
  const configuredDeadline = Number(
    process.env.GENERATION_ATTEMPT_DEADLINE_MS ?? 0,
  );
  if (
    Number.isFinite(configuredDeadline) &&
    configuredDeadline > 0 &&
    configuredDeadline < budget30
  )
    throw new GenerationError(
      "GEN-CONFIG",
      `GENERATION_ATTEMPT_DEADLINE_MS (${configuredDeadline}) menor que o orçamento de chamadas p/ count 30 (${budget30})`,
    );
  const configuredLease = Number(process.env.GENERATION_LEASE_MS ?? 0);
  if (
    Number.isFinite(configuredLease) &&
    configuredLease > 0 &&
    configuredLease <= configuredDeadline
  )
    throw new GenerationError(
      "GEN-CONFIG",
      `GENERATION_LEASE_MS (${configuredLease}) deve exceder GENERATION_ATTEMPT_DEADLINE_MS (${configuredDeadline})`,
    );
}

// Ponto ÚNICO de incremento da tentativa é o reclaim (B-003-03:145): o claim
// executa a tentativa corrente sem incrementar — attempt conta as tentativas
// já terminadas (rotação/esgotamento), nunca dupla contagem claim+reclaim.
// O parâmetro opcional jobId dirige o claim a um job específico (testes e
// operação); sem ele, o claim é global (FIFO por createdAt).
export async function claimGeneration(
  now = new Date(),
  ownerId: string = randomUUID(),
  jobId?: string,
) {
  const job = await prisma.commerceIntelligenceJob.findFirst({
    where: {
      status: "QUEUED",
      nextAttemptAt: { lte: now },
      ...(jobId ? { id: jobId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;
  const leaseDeadlineAt = new Date(
    now.getTime() + leaseMsFor(job.targetContentCount),
  );
  const attemptDeadlineAt = new Date(
    now.getTime() + attemptDeadlineMsFor(job.targetContentCount),
  );
  const result = await prisma.commerceIntelligenceJob.updateMany({
    where: { id: job.id, status: "QUEUED", attempt: job.attempt },
    data: {
      status: "RUNNING",
      leaseOwnerId: ownerId,
      leaseDeadlineAt,
      attemptDeadlineAt,
      startedAt: job.startedAt ?? now,
    },
  });
  return result.count === 1
    ? (() => {
        emitJobEvent("job.claimed", {
          jobId: job.id,
          attempt: job.attempt,
          timeoutMs: attemptDeadlineMsFor(job.targetContentCount),
        });
        return {
          ...job,
          ownerId,
          leaseDeadlineAt,
          attemptDeadlineAt,
          attempt: job.attempt,
        };
      })()
    : null;
}

// Gate 6 item 6: expiração visível — rotação emite job.reclaimed e esgotamento
// emite job.terminal, ambos SOMENTE quando o CAS persiste (mesmo contrato
// evento ⇔ persistência de failJobAndReleaseReservation).
export async function reclaimExpiredGenerations(now = new Date()) {
  const cap = maxAttempts();
  const expired = await prisma.commerceIntelligenceJob.findMany({
    where: { status: "RUNNING", leaseDeadlineAt: { lt: now } },
    select: { id: true, attempt: true, tenantId: true, productId: true, stage: true },
  });
  for (const job of expired) {
    // B-003-03: incremento ÚNICO por tentativa perdida acontece AQUI (o claim
    // não incrementa). Rotação e esgotamento contabilizam a tentativa que
    // terminou; o limite (cap) é o número máximo de execuções: terminal quando
    // esta é a cap-ésima (attempt pós-incremento >= cap).
    const terminal = job.attempt + 1 >= cap;
    const changed = await prisma.$transaction(async (tx) => {
      const changed = await tx.commerceIntelligenceJob.updateMany({
        where: {
          id: job.id,
          status: "RUNNING",
          leaseDeadlineAt: { lt: now },
          attempt: job.attempt,
        },
        data: terminal
          ? {
              status: "FAILED",
              finishedAt: now,
              attempt: { increment: 1 },
              // SPEC slice-003 (código GEN-LEASE-EXPIRED): lease expirado sem
              // conclusão, esgotadas as tentativas — reconciliação única.
              internalErrorCode: "GEN-LEASE-EXPIRED",
              publicErrorMessage:
                "Não foi possível concluir a análise. Tente novamente.",
              leaseOwnerId: null,
              leaseDeadlineAt: null,
            }
          : {
              status: "QUEUED",
              attempt: { increment: 1 },
              leaseOwnerId: null,
              leaseDeadlineAt: null,
              nextAttemptAt: new Date(
                now.getTime() + Math.min(300000, 1000 * 2 ** (job.attempt + 1)),
              ),
            },
      });
      if (changed.count && terminal) {
        await tx.generationUsageReservation.updateMany({
          where: { jobId: job.id, status: "RESERVED" },
          data: { status: "RELEASED", reason: "GEN-LEASE-EXPIRED" },
        });
        // ADR-021 (decisão 5): FAILED também preserva IntelligenceRun com
        // diagnóstico sanitizado — na MESMA transação do CAS terminal, inclusive
        // no lease-expired do reclaim (mesmo contrato do failJob).
        const internalError = internalFailureMetadata("GEN-LEASE-EXPIRED", job.stage ?? null, {});
        const metadata = { attempt: job.attempt + 1, internalError } as never;
        await tx.intelligenceRun.upsert({
          where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } },
          create: {
            tenantId: job.tenantId,
            jobId: job.id,
            productId: job.productId,
            engineVersion: ENGINE_VERSION,
            platformSkillVersion: loadPlatformSkill().version,
            metadata,
            inputMemorySnapshot: {},
          },
          update: { metadata },
        });
      }
      return changed.count;
    });
    if (!changed) continue;
    if (terminal)
      emitJobEvent("job.terminal", {
        jobId: job.id,
        attempt: job.attempt + 1,
        errorCode: "GEN-LEASE-EXPIRED",
        reservationAction: "RELEASED",
      });
    else
      emitJobEvent("job.reclaimed", {
        jobId: job.id,
        attempt: job.attempt + 1,
        errorCode: "GEN-LEASE-EXPIRED",
      });
  }
  return expired.length;
}

// Retorna true somente quando o CAS terminaliza o job (count > 0). Com fence
// perdido (count = 0) nada é persistido e o evento job.terminal NÃO é emitido —
// ele anunciaria reservationAction RELEASED sem persistência correspondente. A
// emissão acontece aqui, condicionada ao CAS real (terminalEvent são os campos
// extras de diagnóstico do chamador).
export async function failJobAndReleaseReservation(
  jobId: string,
  code = "GEN-PROVIDER",
  ownerId?: string,
  attempt?: number,
  internalDetail?: unknown,
  failureRun?: { tenantId: string; productId: string; engineVersion: string; platformSkillVersion: string; metadata: Record<string, unknown> },
  terminalEvent?: Pick<JobEventFields, "stage" | "gateReports">,
): Promise<boolean> {
  const terminalized = await prisma.$transaction(async (tx) => {
    const result = await tx.commerceIntelligenceJob.updateMany({
      where: {
        id: jobId,
        status: { in: ["QUEUED", "RUNNING"] },
        ...(ownerId ? { leaseOwnerId: ownerId } : {}),
        ...(attempt === undefined ? {} : { attempt }),
      },
      data: {
        status: "FAILED",
        internalErrorCode: code,
        publicErrorMessage:
          "Não foi possível concluir a análise. Tente novamente.",
        finishedAt: new Date(),
        leaseOwnerId: null,
        leaseDeadlineAt: null,
        ...(internalDetail === undefined
          ? {}
          : { metadata: { internalError: internalDetail } }),
      },
    });
    if (!result.count) return false;
    await tx.generationUsageReservation.updateMany({
      where: { jobId, status: "RESERVED" },
      data: { status: "RELEASED", reason: code },
    });
    // ADR-021: run de falha gravado na MESMA transação do fence de FAILED —
    // vinculado a leaseOwnerId/attempt exatos; tentativa antiga não grava,
    // mesmo repetindo o código de erro.
    if (failureRun)
      await tx.intelligenceRun.upsert({
        where: { tenantId_jobId: { tenantId: failureRun.tenantId, jobId } },
        create: {
          tenantId: failureRun.tenantId,
          jobId,
          productId: failureRun.productId,
          engineVersion: failureRun.engineVersion,
          platformSkillVersion: failureRun.platformSkillVersion,
          metadata: failureRun.metadata as never,
          inputMemorySnapshot: {},
        },
        update: {
          metadata: failureRun.metadata as never,
        },
      });
    return true;
  });
  if (terminalized)
    emitJobEvent("job.terminal", {
      jobId,
      attempt,
      errorCode: code,
      reservationAction: "RELEASED",
      ...terminalEvent,
    });
  return terminalized;
}

export function runMetadata(
  attempt: number,
  describe: () => ModelDescription,
  capabilities: unknown[],
  repairs: number,
  validated: number,
  repairCauses: Array<{ briefId: string; causes: string[] }>,
  sceneSets: Array<{ status: string; dropped: number; backfilled: boolean }>,
  patternReplacements: Array<{ field: string; replacedWithId: string; reason: string }>,
  qualityAudits: QualityAudit[] = [],
  qualityRepairs: Array<{ contentId: string; part: QualityPart; round: number; criterion: string; outcome: "REPAIRED" }> = [],
  understandingReductions: UnderstandingCardinalityReduction[] = [],
): Record<string, unknown> {
  const scenes = {
    sets: sceneSets.length,
    available: sceneSets.filter((set) => set.status === "AVAILABLE").length,
    filtered: sceneSets.filter((set) => set.status === "FILTERED").length,
    errors: sceneSets.filter((set) => set.status === "ERROR").length,
    dropped: sceneSets.reduce((total, set) => total + set.dropped, 0),
    backfilled: sceneSets.filter((set) => set.backfilled).length,
  };
  try {
    const d = describe();
    return {
      attempt,
      provider: d.provider,
      model: d.model,
      instructionVersion: d.instructionVersion,
      // ADR-019: o run registra a política de gates vigente além da versão da
      // engine — evidência do que governou a validação neste momento.
      engineVersion: ENGINE_VERSION,
      gateVersion: GATE_POLICY_VERSION,
      capabilities,
      repairs,
      repairCauses: repairCauses.map(({ briefId }) => ({ briefId, causes: ["deterministic_gate_repair"] })),
      validated,
      scenes,
      patternReplacements,
      understandingReductions,
      qualityAudits: qualityAudits.map(({ contentId, round, parts }) => ({ contentId, round, parts: parts.map(({ part, status, criterion, reason }) => ({ part, status, criterion, reason: reasonText(reason) })) })),
      qualityRepairs,
    };
  } catch {
    return { attempt, engineVersion: ENGINE_VERSION, gateVersion: GATE_POLICY_VERSION, capabilities, repairs, repairCauses: repairCauses.map(({ briefId }) => ({ briefId, causes: ["deterministic_gate_repair"] })), validated, scenes, patternReplacements, understandingReductions, qualityAudits: qualityAudits.map(({ contentId, round, parts }) => ({ contentId, round, parts: parts.map(({ part, status, criterion, reason }) => ({ part, status, criterion, reason: reasonText(reason) })) })), qualityRepairs };
  }
}


// ADR-021: memorySignals ACUMULATIVOS — mecanismos/funções/ângulos entregues
// fazem merge deduplicado com o snapshot anterior; planner recebe o conjunto
// histórico para não repetir o já publicado.
export function mergeMemorySignals(
  previous: unknown,
  current: {
    generatedCount?: number;
    deliveredHookMechanisms?: string[];
    deliveredCtaFunctions?: string[];
    deliveredAngles?: string[];
    [key: string]: unknown;
  },
): Record<string, unknown> {
  const prev = (previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {}) as Record<string, unknown>;
  const accumulate = (key: string): string[] => [
    ...new Set([
      ...(Array.isArray(prev[key]) ? prev[key].filter((value): value is string => typeof value === "string") : []),
      ...(Array.isArray(current[key]) ? current[key].filter((value): value is string => typeof value === "string") : []),
    ]),
  ];
  const prevCount = typeof prev.generatedCount === "number" ? prev.generatedCount : 0;
  return {
    ...prev,
    ...current,
    generatedCount: prevCount + (typeof current.generatedCount === "number" ? current.generatedCount : 0),
    deliveredHookMechanisms: accumulate("deliveredHookMechanisms"),
    deliveredCtaFunctions: accumulate("deliveredCtaFunctions"),
    deliveredAngles: accumulate("deliveredAngles"),
  };
}

// RI-003-24: leitura do lifecycle com lock de linha (SELECT FOR UPDATE) —
// serializa com transitionTenantProduct/archiveTenantProduct (o UPDATE do
// archive adquire o mesmo lock): ou o archive commita antes e a leitura vê
// ARCHIVED, ou o archive espera o commit da finalização. Um re-SELECT sem
// lock teria janela TOCTOU entre a leitura e as escritas do resultado.
export async function lockProductLifecycle(tx: Prisma.TransactionClient, tenantId: string, productId: string): Promise<string | null> {
  const [row] = await tx.$queryRaw<Array<{ lifecycle: string }>>`
    SELECT "lifecycle" FROM "products"
    WHERE "tenantId" = ${tenantId} AND "id" = ${productId}
    FOR UPDATE`;
  return row?.lifecycle ?? null;
}

// Transação curta de finalização (extraída de processGeneration para cobertura
// determinística — mesmo comportamento, nenhum acesso a provider aqui). Todo o
// bloqueio de fence usa CAS owner+attempt; qualquer count inesperado lança
// GEN-FENCED e reverte TODAS as escritas (strategy/plan/contents/run/memória/reserva).
export async function finalizeGeneration(
  job: { id: string; tenantId: string; productId: string; targetContentCount: number; metadata: unknown },
  ownerId: string,
  attempt: number,
  output: EngineResult,
  sceneSets: SceneSetOutcome[],
  runData: Record<string, unknown>,
): Promise<void> {
  // ADR-021: assinatura residual do parcial vai no metadado do run.
  const runDataWithPartial = output.partial ? { ...runData, partial: output.partial } : runData;
  await prisma.$transaction(async (tx) => {
    const fenced = await tx.commerceIntelligenceJob.updateMany({
      where: {
        id: job.id,
        status: "RUNNING",
        leaseOwnerId: ownerId,
        attempt,
      },
      data: { stage: "FINALIZING" },
    });
    if (fenced.count !== 1)
      throw new GenerationError(
        "GEN-FENCED",
        "Job não pertence mais ao owner/attempt na finalização",
      );
    // RI-003-24: revalida o lifecycle DENTRO da transação de finalização COM
    // lock de linha — archive durante o RUNNING ou entre a leitura e as
    // escritas interrompe a publicação (rollback de strategy/plan/contents/
    // memória/reserva) ou espera o commit desta transação.
    if ((await lockProductLifecycle(tx, job.tenantId, job.productId)) !== "ACTIVE")
      throw new GenerationError("GEN-PRODUCT", "Produto não disponível");
    const strategy = await tx.productStrategy.create({
      data: {
        id: String(output.strategy.id),
        tenantId: job.tenantId,
        productId: job.productId,
        jobId: job.id,
        platformId: String(output.strategy.platformId),
        platformSkillVersion: String(output.strategy.platformSkillVersion),
        payload: JSON.parse(JSON.stringify(output.strategy)),
      },
    });
    const plan = await tx.contentPlan.create({
      data: {
        id: String(output.plan.id),
        tenantId: job.tenantId,
        productId: job.productId,
        jobId: job.id,
        strategyId: strategy.id,
        strategyVersion: 1,
        targetContentCount: job.targetContentCount,
        platformId: String(output.plan.platformId),
        platformSkillVersion: String(output.plan.platformSkillVersion),
        payload: JSON.parse(JSON.stringify(output.plan)),
      },
    });
    await tx.productUnderstanding.create({
      data: {
        tenantId: job.tenantId,
        productId: job.productId,
        jobId: job.id,
        payload: JSON.parse(JSON.stringify(output.productUnderstanding)),
      },
    });
    // ADR-021: run idempotente por job — persistido também em SUCCEEDED_PARTIAL.
    await tx.intelligenceRun.upsert({
      where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } },
      create: {
        tenantId: job.tenantId,
        jobId: job.id,
        productId: job.productId,
        engineVersion: ENGINE_VERSION,
        platformSkillVersion: String(output.strategy.platformSkillVersion),
        metadata: runDataWithPartial as never,
        inputMemorySnapshot: {},
      },
      update: {
        engineVersion: ENGINE_VERSION,
        platformSkillVersion: String(output.strategy.platformSkillVersion),
        metadata: runDataWithPartial as never,
      },
    });
    for (const [index, opportunity] of output.opportunities.entries())
      await tx.contentOpportunity.create({
        data: {
          id: String(opportunity.id),
          tenantId: job.tenantId,
          productId: job.productId,
          planId: plan.id,
          jobId: job.id,
          position: index + 1,
          commercialObjective: String(opportunity.commercialObjective),
          angle: String(opportunity.angle),
          coreMessage: String(opportunity.coreMessage),
          hookMechanism: String(opportunity.hookMechanism),
          noveltyTargets: JSON.parse(
            JSON.stringify(opportunity.noveltyTargets),
          ),
          payload: JSON.parse(JSON.stringify(opportunity)),
        },
      });
    for (const [index, brief] of output.briefs.entries()) {
      // ADR-021: briefs entregues mantêm a oportunidade do plano original.
      const opportunity = output.opportunities[output.briefOpportunityPositions?.[index] ?? index];
      const content = await tx.content.create({
        data: {
          id: brief.contentId,
          tenantId: job.tenantId,
          productId: job.productId,
          jobId: job.id,
          planId: plan.id,
          // P0-2: proveniência server-derived — Content vinculado à ContentOpportunity da mesma posição.
          opportunityId: opportunity ? String(opportunity.id) : null,
          // ADR-021: posição original no plano (N), não renumerada no subconjunto.
          position: (output.briefOpportunityPositions?.[index] ?? index) + 1,
          payload: briefPayloadForPersistence(brief),
        },
      });
      const version = await tx.contentBriefVersion.create({
        data: {
          id: brief.briefVersionId,
          tenantId: job.tenantId,
          productId: job.productId,
          jobId: job.id,
          contentId: content.id,
          payload: briefPayloadForPersistence(brief),
        },
      });
      const report = output.reports[index];
      await tx.content.update({
        where: { id: content.id },
        data: { currentBriefVersionId: version.id },
      });
      await tx.briefValidationReport.create({
        data: {
          id: `${content.id}:${version.id}`,
          tenantId: job.tenantId,
          jobId: job.id,
          productId: job.productId,
          contentId: content.id,
          briefVersionId: version.id,
          briefId: `${content.id}:${version.id}`,
          gateVersion: GATE_POLICY_VERSION,
          factualStatus: report.factualStatus,
          claimType: report.claimType,
          evidenceRefs: JSON.parse(JSON.stringify(report.evidenceRefs)),
          structuralStatus: report.structuralStatus,
          platformStatus: report.platformStatus,
          varietyStatus: report.varietyStatus,
          decision: report.decision,
          issues: report.issues,
        },
      });
    }
    // ADR-019: persistência dos sets de cenas na mesma transação curta de
    // FINALIZING (LLM ficou fora); idempotente pelo unique (tenantId, briefVersionId).
    for (const set of sceneSets) {
      await tx.contentSceneSet.upsert({
        where: {
          tenantId_briefVersionId: {
            tenantId: job.tenantId,
            briefVersionId: set.briefVersionId,
          },
        },
        create: {
          id: `${set.contentId}:${set.briefVersionId}`,
          tenantId: job.tenantId,
          jobId: job.id,
          productId: job.productId,
          contentId: set.contentId,
          briefVersionId: set.briefVersionId,
          status: set.status,
          gatePolicyVersion: GATE_POLICY_VERSION,
          backfilled: set.backfilled,
          payload: {
            scenes: set.scenes,
            generated: set.generated,
            dropped: set.dropped,
          },
        },
        update: {},
      });
    }
    // ADR-021: snapshot ACUMULATIVO — arrays do planner (mecanismos/funções/
    // ângulos) fazem merge deduplicado com o snapshot anterior.
    const previousSnapshot = await tx.productMemorySnapshot.findFirst({
      where: { tenantId: job.tenantId, productId: job.productId },
      orderBy: { createdAt: "desc" },
    });
    await tx.productMemorySnapshot.create({
      data: {
        tenantId: job.tenantId,
        productId: job.productId,
        sourceJobId: job.id,
        signals: JSON.parse(
          JSON.stringify(
            mergeMemorySignals(previousSnapshot?.signals, output.memorySignals),
          ),
        ),
      },
    });
    // ADR-021/ADR-006: parcial confirma D e libera N−D no mês de origem —
    // capacidade agrega RESERVED+CONFIRMED; a quantidade ajustada libera o resto.
    await tx.generationUsageReservation.updateMany({
      where: { jobId: job.id, status: "RESERVED" },
      data: output.partial
        ? { status: "CONFIRMED", quantity: output.partial.deliveredCount }
        : { status: "CONFIRMED" },
    });
    // Fence no commit terminal: se o fencing se perdeu depois do CAS inicial
    // (heartbeat expirou/reclaim reassumiu), count=0 e TODAS as escritas desta
    // transação são revertidas — owner antigo nunca publica estado terminal.
    const terminal = await tx.commerceIntelligenceJob.updateMany({
      where: {
        id: job.id,
        status: "RUNNING",
        leaseOwnerId: ownerId,
        attempt,
      },
      data: {
        status: output.partial ? "SUCCEEDED_PARTIAL" : "SUCCEEDED",
        stage: "FINALIZING",
        finishedAt: new Date(),
        leaseOwnerId: null,
        ...(output.partial
          ? {
              // ADR-021: parcial é DECLARADO — contagens + assinatura por item.
              metadata: {
                ...((job.metadata as Record<string, unknown> | null) ?? {}),
                expectedCount: output.partial.expectedCount,
                deliveredCount: output.partial.deliveredCount,
                failedCount: output.partial.failedCount,
                failedItems: output.partial.failedItems,
              },
            }
          : {}),
        leaseDeadlineAt: null,
      },
    });
    if (terminal.count !== 1)
      throw new GenerationError(
        "GEN-FENCED",
        "Job não pertence mais ao owner/attempt no commit terminal",
      );
  });
}

export async function processGeneration(jobId: string, ownerId: string) {
  const job = await prisma.commerceIntelligenceJob.findFirst({
    where: { id: jobId, status: "RUNNING", leaseOwnerId: ownerId },
  });
  if (!job) return false;
  const product = await prisma.product.findFirst({
    where: { tenantId: job.tenantId, id: job.productId },
  });
  // RI-003-24: geração pertence a Product ACTIVE — inclusive na reentrada de
  // job já claimed após um archive.
  if (!product || product.lifecycle !== "ACTIVE") {
    await failJobAndReleaseReservation(
      jobId,
      "GEN-PRODUCT",
      ownerId,
      job.attempt,
    );
    return false;
  }
  const attempt = job.attempt;
  let currentStage: string | null = job.stage;
  const deadlineAt =
    job.attemptDeadlineAt ??
    new Date(Date.now() + attemptDeadlineMsFor(job.targetContentCount));
  const controller = new AbortController();
  const heartbeatMs = (() => {
    const v = Number(process.env.GENERATION_HEARTBEAT_INTERVAL_MS ?? 5000);
    return Number.isFinite(v) && v > 0 ? v : 5000;
  })();
  let fencingLost = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  const loseFence = () => {
    if (fencingLost) return;
    fencingLost = true;
    clearInterval(heartbeatTimer);
    controller.abort();
  };
  // Deadline da tentativa: aborta SEMPRE, mesmo que o provider ignore o AbortSignal. Ao perder
  // o fence, o heartbeat deixa de renovar o lease, então o reclaim pode reassumir e o checkFence
  // bloqueia qualquer publicação pelo owner vencido.
  const expireTimer = setTimeout(
    loseFence,
    Math.max(0, deadlineAt.getTime() - Date.now()),
  );
  const checkFence = async () => {
    if (fencingLost) return false;
    try {
      const alive = await prisma.commerceIntelligenceJob.findFirst({
        where: {
          id: job.id,
          status: "RUNNING",
          leaseOwnerId: ownerId,
          attempt,
        },
        select: { id: true },
      });
      if (!alive) {
        loseFence();
        return false;
      }
      return true;
    } catch (error) {
      console.info("[generation-worker] fence check datasource failure", {
        jobId: job.id,
        error: error instanceof Error ? error.message : "unknown",
      });
      loseFence();
      throw new GenerationError(
        "GEN-DATASOURCE",
        "Falha de datasource no fencing",
      );
    }
  };
  // Heartbeat condicional: renova o lease somente se ainda detém owner+attempt e a tentativa
  // não venceu; no attemptDeadlineAt interrompe a renovação e aborta a tentativa.
  heartbeatTimer = setInterval(() => {
    void (async () => {
      const action = heartbeatAction(
        Date.now(),
        deadlineAt.getTime(),
        fencingLost,
      );
      if (action === "skip") return;
      if (action === "abort") {
        loseFence();
        return;
      }
      // Renova também o marker local de liveness: durante um job longo o loop principal
      // fica bloqueado em processGeneration e sem isto o healthcheck reiniciaria o container
      // no meio da tentativa.
      heartbeat();
      try {
        const renewed = await prisma.commerceIntelligenceJob.updateMany({
          where: {
            id: job.id,
            status: "RUNNING",
            leaseOwnerId: ownerId,
            attempt,
          },
          data: {
            leaseDeadlineAt: new Date(
              Date.now() + leaseMsFor(job.targetContentCount),
            ),
          },
        });
        if (renewed.count !== 1) loseFence();
      } catch (error) {
        console.info("[generation-worker] heartbeat datasource failure", {
          jobId: job.id,
          error: error instanceof Error ? error.message : "unknown",
        });
        loseFence();
      }
    })();
  }, heartbeatMs);
  heartbeatTimer.unref?.();
  try {
    const engineFacts = projectEngineFacts(product);
    const router = createHttpProvider();
    // ADR-021: modo "complete" reutiliza a Strategy ACTIVE e o último snapshot
    // de memória (itens entregues) — o planner não repete o já publicado.
    const partialMode = (job.metadata as Record<string, unknown> | null)?.mode === "complete";
    const reuseStrategyRow = partialMode
      ? await prisma.productStrategy.findFirst({ where: { tenantId: job.tenantId, productId: job.productId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } })
      : null;
    const memoryRow = partialMode
      ? await prisma.productMemorySnapshot.findFirst({ where: { tenantId: job.tenantId, productId: job.productId }, orderBy: { createdAt: "desc" } })
      : null;
    const reuseStrategy = reuseStrategyRow?.payload as Record<string, unknown> | undefined;
    const memorySignals = (memoryRow?.signals as Record<string, unknown> | undefined) ?? {};
    const output = await runFirstGeneration({
      productId: product.id,
      jobId: job.id,
      name: product.name,
      description: product.description ?? "",
      targetContentCount: job.targetContentCount,
      router,
      signal: controller.signal,
      attempt,
      onStage: async (stage) => {
        if (!(await checkFence()))
          throw new GenerationError(
            "GEN-FENCE",
            "Fencing perdido durante stage",
          );
        await prisma.commerceIntelligenceJob.updateMany({
          where: {
            id: job.id,
            status: "RUNNING",
            leaseOwnerId: ownerId,
            attempt,
          },
          data: { stage: stage as never },
        });
        currentStage = stage;
      },
      facts: engineFacts,
      // Slice 011 (ADR-018): CreatorContext vem do snapshot imutável capturado no Job —
      // retry técnico reutiliza o mesmo snapshot; GenerationConstraints do Product não
      // substitui preferências de estilo.
      creatorContext: extractJobCreatorContext(job.inputSnapshot),
      memory: memorySignals,
      ...(reuseStrategy ? { reuseStrategy } : {}),
    });
    if (!(await checkFence()))
      throw new GenerationError(
        "GEN-FENCE",
        "Fencing perdido antes da finalização",
      );
    // ADR-019: backfill progressivo de cenas — o próximo job do produto também
    // gera sets para até 10 conteúdos existentes não-descartados ainda sem cenas
    // (sobre a briefVersion corrente de cada um). Não-bloqueante e idempotente
    // pelo unique (tenantId, briefVersionId); falhas viram sets ERROR vazios.
    const backfillTracker = createCapabilityTracker({
      jobId: job.id,
      attempt,
      router,
    });
    const backfillTargets = await prisma.content
      .findMany({
        where: {
          tenantId: job.tenantId,
          productId: job.productId,
          jobId: { not: job.id },
          status: { not: "DISCARDED" },
          currentBriefVersionId: { not: null },
          sceneSets: { none: {} },
        },
        orderBy: { createdAt: "desc" },
        take: sceneBackfillLimitFor(job.targetContentCount),
        include: { briefs: { orderBy: { version: "desc" }, take: 1 } },
      })
      .catch(() => []);
    const backfillBriefs = backfillTargets.flatMap((content) => {
      const payload = content.briefs[0]?.payload as
        | Record<string, unknown>
        | undefined;
      if (
        !payload ||
        !Array.isArray(payload.development) ||
        typeof payload.angle !== "string" ||
        typeof payload.hook !== "string" ||
        typeof payload.script !== "string" ||
        typeof payload.cta !== "string"
      )
        return [];
      return [
        {
          contentId: content.id,
          briefVersionId: content.currentBriefVersionId as string,
          angle: payload.angle,
          hook: payload.hook,
          development: payload.development as string[],
          script: payload.script,
          cta: payload.cta,
        },
      ];
    });
    const backfillScenes = backfillBriefs.length
      ? await generateSceneSetsForBriefs({
          jobId: job.id,
          productId: job.productId,
          briefs: backfillBriefs,
          evidence: buildEvidenceCatalog({
            name: product.name,
            description: product.description ?? undefined,
            facts: engineFacts,
          }),
          creatorContext: extractJobCreatorContext(job.inputSnapshot),
          router,
          skill: loadPlatformSkill(),
          signal: controller.signal,
          attempt,
          track: backfillTracker.track,
          backfilled: true,
        })
      : [];
    if (!(await checkFence()))
      throw new GenerationError(
        "GEN-FENCE",
        "Fencing perdido antes da finalização",
      );
    const sceneSets = [...output.sceneSets, ...backfillScenes];
    const runData = runMetadata(
      attempt,
      () => router.describe(),
      [...output.capabilities, ...backfillTracker.capabilities],
      output.repairs,
      output.validated,
      output.repairCauses,
      sceneSets,
      output.patternReplacements,
      output.qualityAudits,
      output.qualityRepairs,
      output.understandingReductions,
    );
    emitJobEvent("job.finalizing", {
      jobId: job.id,
      attempt,
      stage: "FINALIZING",
    });
    // Transação curta de finalização extraída (finalizeGeneration): mesmo
    // bloqueio de fence CAS owner+attempt, rollback total em count inesperado.
    await finalizeGeneration(job, ownerId, attempt, output, sceneSets, runData);
    emitJobEvent("job.terminal", {
      jobId: job.id,
      attempt,
      errorCode: output.partial ? "SUCCEEDED_PARTIAL" : "SUCCEEDED",
      reservationAction: "CONFIRMED",
    });
  } catch (error) {
    const databaseCode =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : null;
    const code =
      error instanceof GenerationError
        ? error.code
        : databaseCode?.startsWith("GEN-")
          ? databaseCode
          : "GEN-PERSISTENCE";
    const detail =
      error instanceof GenerationError
        ? error.detail
        : error instanceof ContractError
          ? { errorName: error.name, message: error.message, field: error.field }
          : error instanceof Error
            ? { errorName: error.name, message: error.message }
          : String(error);
    const internalError = internalFailureMetadata(code, currentStage, detail);
    console.info("[generation-worker] job failed", {
      tenantId: job.tenantId,
      userId: job.userId,
      jobId: job.id,
      code,
      databaseCode,
      detail: internalError,
    });
    // ADR-021: IntelligenceRun em FAILED na MESMA transação do fence de FAILED
    // (leaseOwnerId/attempt exatos) — diagnóstico sem payload bruto; tentativa
    // antiga não grava, mesmo repetindo o código de erro.
    const rejected =
      detail &&
      typeof detail === "object" &&
      "rejected" in detail &&
      Array.isArray((detail as { rejected: unknown }).rejected)
        ? projectFailureDiagnostics((detail as { rejected: unknown }).rejected)
        : undefined;
    // Emissão do job.terminal é interna ao failJob, condicionada ao CAS real —
    // fence perdido não emite evento terminal (evita RELEASED sem persistência).
    await failJobAndReleaseReservation(job.id, code, ownerId, attempt, internalError, {
      tenantId: job.tenantId,
      productId: job.productId,
      engineVersion: ENGINE_VERSION,
      platformSkillVersion: loadPlatformSkill().version,
      metadata: { internalError: internalError, diagnostics: rejected ?? null },
    }, {
      stage: currentStage ?? undefined,
      gateReports: rejected?.gateReports,
    });
    return false;
  } finally {
    clearTimeout(expireTimer);
    clearInterval(heartbeatTimer);
  }
}
