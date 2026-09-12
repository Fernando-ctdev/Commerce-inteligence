import { randomUUID } from "node:crypto";
import { GenerationError } from "./errors";
import { emitJobEvent, sanitizeGateReports } from "./observability";
import { prisma } from "../db";
import { extractJobCreatorContext } from "../creator-preferences/service";
import { runFirstGeneration } from "./engine";
import { createHttpProvider } from "./provider";
import type { ModelDescription } from "./model-router";
import { heartbeat } from "./runtime";

export function fenceMatches(
  job: { leaseOwnerId: string | null; attempt: number },
  ownerId: string,
  attempt: number,
) {
  return job.leaseOwnerId === ownerId && job.attempt === attempt;
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
// Margem do fallback LOW→MID→HIGH (provider): no pior caso cada chamada MID custa uma
// chamada extra — 2 fundacionais MID (understanding, mapping) + ceil(N/batch) lotes de
// brief (MID). Tarefas HIGH não caem em fallback; revisar se tarefas LOW entrarem no
// ROUTER_MAP (aí a cadeia pode custar 2 extras por chamada).
export function fallbackCallBudget(count: number): number {
  return 2 + Math.ceil(count / batchSizeForBudget());
}
export function attemptDeadlineMsFor(count: number): number {
  const derived =
    (callBudget(count) + fallbackCallBudget(count)) * providerTimeoutMs() +
    finalizeMarginMs();
  const configured = Number(process.env.GENERATION_ATTEMPT_DEADLINE_MS ?? 0);
  return Number.isFinite(configured) && configured > derived
    ? configured
    : derived;
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

export async function claimGeneration(
  now = new Date(),
  ownerId = randomUUID(),
) {
  const job = await prisma.commerceIntelligenceJob.findFirst({
    where: { status: "QUEUED", nextAttemptAt: { lte: now } },
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
      attempt: { increment: 1 },
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
          attempt: job.attempt + 1,
          timeoutMs: attemptDeadlineMsFor(job.targetContentCount),
        });
        return {
          ...job,
          ownerId,
          leaseDeadlineAt,
          attemptDeadlineAt,
          attempt: job.attempt + 1,
        };
      })()
    : null;
}

export async function reclaimExpiredGenerations(now = new Date()) {
  const cap = maxAttempts();
  const expired = await prisma.commerceIntelligenceJob.findMany({
    where: { status: "RUNNING", leaseDeadlineAt: { lt: now } },
    select: { id: true, attempt: true },
  });
  for (const job of expired) {
    await prisma.$transaction(async (tx) => {
      const terminal = job.attempt >= cap;
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
              internalErrorCode: "GEN-ATTEMPTS",
              publicErrorMessage:
                "Não foi possível concluir a análise. Tente novamente.",
              leaseOwnerId: null,
              leaseDeadlineAt: null,
            }
          : {
              status: "QUEUED",
              leaseOwnerId: null,
              leaseDeadlineAt: null,
              nextAttemptAt: new Date(
                now.getTime() + Math.min(300000, 1000 * 2 ** job.attempt),
              ),
            },
      });
      if (changed.count && terminal)
        await tx.generationUsageReservation.updateMany({
          where: { jobId: job.id, status: "RESERVED" },
          data: { status: "RELEASED", reason: "GEN-ATTEMPTS" },
        });
    });
  }
  return expired.length;
}

export async function failJobAndReleaseReservation(
  jobId: string,
  code = "GEN-PROVIDER",
  ownerId?: string,
  attempt?: number,
  internalDetail?: unknown,
) {
  await prisma.$transaction(async (tx) => {
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
    if (result.count)
      await tx.generationUsageReservation.updateMany({
        where: { jobId, status: "RESERVED" },
        data: { status: "RELEASED", reason: code },
      });
  });
}

function runMetadata(
  attempt: number,
  describe: () => ModelDescription,
  capabilities: unknown[],
  repairs: number,
  validated: number,
): Record<string, unknown> {
  try {
    const d = describe();
    return {
      attempt,
      provider: d.provider,
      model: d.model,
      instructionVersion: d.instructionVersion,
      capabilities,
      repairs,
      validated,
    };
  } catch {
    return { attempt, capabilities, repairs, validated };
  }
}

export async function processGeneration(jobId: string, ownerId: string) {
  const job = await prisma.commerceIntelligenceJob.findFirst({
    where: { id: jobId, status: "RUNNING", leaseOwnerId: ownerId },
  });
  if (!job) return false;
  const product = await prisma.product.findFirst({
    where: { tenantId: job.tenantId, id: job.productId },
  });
  if (!product) {
    await failJobAndReleaseReservation(
      jobId,
      "GEN-PRODUCT",
      ownerId,
      job.attempt,
    );
    return false;
  }
  const attempt = job.attempt;
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
    const router = createHttpProvider();
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
      },
      facts: {
        productId: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        brand: product.brand,
        priceAmount: product.priceAmount?.toString(),
        priceCurrency: product.priceCurrency,
        // Desconto só entra como fato quando existe no Product (nunca inventado).
        // Com unidade "%" para o Quality Gate validar claims percentuais contra ele.
        discountPercentage: product.discountPercentage
          ? `${product.discountPercentage.toString()}% de desconto`
          : undefined,
        features: product.features,
        variants: product.variants,
        images: product.images,
        seller: product.seller,
        sourceUrl: product.sourceUrl,
      },
      // Slice 011 (ADR-018): CreatorContext vem do snapshot imutável capturado no Job —
      // retry técnico reutiliza o mesmo snapshot; GenerationConstraints do Product não
      // substitui preferências de estilo.
      creatorContext: extractJobCreatorContext(job.inputSnapshot),
      memory: {},
    });
    if (!(await checkFence()))
      throw new GenerationError(
        "GEN-FENCE",
        "Fencing perdido antes da finalização",
      );
    const runData = runMetadata(
      attempt,
      () => router.describe(),
      output.capabilities,
      output.repairs,
      output.validated,
    );
    emitJobEvent("job.finalizing", {
      jobId: job.id,
      attempt,
      stage: "FINALIZING",
    });
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
      await tx.intelligenceRun.create({
        data: {
          tenantId: job.tenantId,
          jobId: job.id,
          productId: job.productId,
          engineVersion: "slice-003",
          platformSkillVersion: String(output.strategy.platformSkillVersion),
          metadata: runData as never,
          inputMemorySnapshot: {},
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
        const opportunity = output.opportunities[index];
        const content = await tx.content.create({
          data: {
            id: brief.contentId,
            tenantId: job.tenantId,
            productId: job.productId,
            jobId: job.id,
            planId: plan.id,
            // P0-2: proveniência server-derived — Content vinculado à ContentOpportunity da mesma posição.
            opportunityId: opportunity ? String(opportunity.id) : null,
            position: index + 1,
            payload: JSON.parse(JSON.stringify(brief)),
          },
        });
        const version = await tx.contentBriefVersion.create({
          data: {
            id: brief.briefVersionId,
            tenantId: job.tenantId,
            productId: job.productId,
            jobId: job.id,
            contentId: content.id,
            payload: JSON.parse(JSON.stringify(brief)),
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
      await tx.productMemorySnapshot.create({
        data: {
          tenantId: job.tenantId,
          productId: job.productId,
          sourceJobId: job.id,
          signals: JSON.parse(JSON.stringify(output.memorySignals)),
        },
      });
      await tx.generationUsageReservation.updateMany({
        where: { jobId: job.id, status: "RESERVED" },
        data: { status: "CONFIRMED" },
      });
      await tx.commerceIntelligenceJob.updateMany({
        where: {
          id: job.id,
          status: "RUNNING",
          leaseOwnerId: ownerId,
          attempt,
        },
        data: {
          status: "SUCCEEDED",
          stage: "FINALIZING",
          finishedAt: new Date(),
          leaseOwnerId: null,
          leaseDeadlineAt: null,
        },
      });
    });
    emitJobEvent("job.terminal", {
      jobId: job.id,
      attempt,
      errorCode: "SUCCEEDED",
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
        : error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error);
    console.info("[generation-worker] job failed", {
      tenantId: job.tenantId,
      userId: job.userId,
      jobId: job.id,
      code,
      databaseCode,
      detail,
    });
    await failJobAndReleaseReservation(job.id, code, ownerId, attempt, detail);
    const rejected =
      detail &&
      typeof detail === "object" &&
      "rejected" in detail &&
      Array.isArray((detail as { rejected: unknown }).rejected)
        ? sanitizeGateReports(
            (detail as { rejected: Array<Record<string, unknown>> }).rejected,
          )
        : undefined;
    emitJobEvent("job.terminal", {
      jobId: job.id,
      attempt,
      errorCode: code,
      reservationAction: "RELEASED",
      gateReports: rejected,
    });
    return false;
  } finally {
    clearTimeout(expireTimer);
    clearInterval(heartbeatTimer);
  }
}
