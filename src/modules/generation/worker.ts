import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "../db";
import { confirmGeneratedContents, releaseGeneratedContents } from "../entitlements/generation";
import { persistPlanAndContents, countContents, countPlans } from "../content/service";
import { persistStrategySnapshot, countStrategySnapshots } from "../strategy/service";
import { getGeneration } from "./service";
import { validateGenerationOutput, type GenerationInputV1, type GenerationOutputV1 } from "./contract";
import { readGenerationRuntimeConfig, type GenerationRuntimeConfig } from "./runtime";
import { collectGenerationMetrics } from "./metrics";

export const WORKER_STATE_ID = "default";

/** Heartbeat persistido: o worker roda em processo separado do HTTP — memória de módulo não é observável. */
export async function persistWorkerHeartbeat(now = new Date()): Promise<void> {
  await prisma.generationWorkerState.upsert({
    where: { id: WORKER_STATE_ID },
    create: { id: WORKER_STATE_ID, lastHeartbeatAt: now },
    update: { lastHeartbeatAt: now },
  });
}

export async function loadWorkerHeartbeat(): Promise<Date | null> {
  const state = await prisma.generationWorkerState.findUnique({ where: { id: WORKER_STATE_ID } });
  return state?.lastHeartbeatAt ?? null;
}

export type GenerationEngine = {
  generate(input: GenerationInputV1): Promise<unknown>;
};

export class GenerationEngineBlockedError extends Error {
  constructor() {
    super("A engine de Generation está bloqueada até o gold-standard externo ser aprovado.");
    this.name = "GenerationEngineBlockedError";
  }
}

export function assertGenerationEngineAvailable(goldStandardApproved: boolean, engine: GenerationEngine | undefined): asserts engine is GenerationEngine {
  if (!goldStandardApproved || !engine) throw new GenerationEngineBlockedError();
}

export function sanitizeGenerationError(error: unknown): string {
  if (error instanceof GenerationEngineBlockedError) return "GENERATION_ENGINE_BLOCKED_GOLD_STANDARD";
  if (error instanceof Error) return "GENERATION_PROVIDER_FAILED";
  return "GENERATION_FAILED";
}

type Claim = {
  id: string;
  tenantId: string;
  inputSnapshot: GenerationInputV1;
  inputSnapshotHash: string;
  attemptCount: number;
  leaseToken: string;
};

export async function claimNextGeneration(now = new Date(), config = readGenerationRuntimeConfig()): Promise<Claim | null> {
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.generationRun.findFirst({ where: { status: "queued", nextAttemptAt: { lte: now } }, orderBy: { queuedAt: "asc" } });
    if (!candidate) return null;
    const leaseToken = randomBytes(16).toString("base64url");
    const updated = await tx.generationRun.updateMany({
      where: { id: candidate.id, status: "queued", nextAttemptAt: { lte: now } },
      data: { status: "running", attemptCount: { increment: 1 }, leaseToken, leaseExpiresAt: new Date(now.getTime() + config.leaseTtlMs), startedAt: candidate.startedAt ?? now, lastError: null },
    });
    if (updated.count === 0) return null;
    return { id: candidate.id, tenantId: candidate.tenantId, inputSnapshot: candidate.inputSnapshot as unknown as GenerationInputV1, inputSnapshotHash: candidate.inputSnapshotHash, attemptCount: candidate.attemptCount + 1, leaseToken };
  });
}

async function finishFailure(claim: Claim, code: string, retryable: boolean, now: Date, config: GenerationRuntimeConfig): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const shouldRetry = retryable && claim.attemptCount < config.maxAttempts;
    const updated = await tx.generationRun.updateMany({
      where: { id: claim.id, tenantId: claim.tenantId, status: "running", leaseToken: claim.leaseToken },
      data: shouldRetry
        ? { status: "queued", nextAttemptAt: new Date(now.getTime() + config.retryBackoffMs), leaseToken: null, leaseExpiresAt: null, lastError: code }
        : { status: "failed", finishedAt: now, leaseToken: null, leaseExpiresAt: null, lastError: code },
    });
    if (updated.count && !shouldRetry) await releaseGeneratedContents(tx, claim.id, code);
  });
}

export async function finishSuccess(claim: Claim, output: GenerationOutputV1, now: Date): Promise<boolean> {
  const validation = validateGenerationOutput(claim.inputSnapshot, output);
  if ("errors" in validation) {
    await finishFailure(claim, "GENERATION_OUTPUT_INVALID", false, now, readGenerationRuntimeConfig());
    return false;
  }
  if (output.provenance.generation_run_id !== claim.id || output.provenance.input_snapshot_hash !== claim.inputSnapshotHash) {
    await finishFailure(claim, "GENERATION_PROVENANCE_INVALID", false, now, readGenerationRuntimeConfig());
    return false;
  }
  return prisma.$transaction(async (tx) => {
    // Fencing primeiro: somente a tentativa com o lease atual confirma a transição terminal.
    // Se a corrida for perdida (cancelamento ou lease substituído), nada é persistido.
    const claimed = await tx.generationRun.updateMany({
      where: { id: claim.id, tenantId: claim.tenantId, status: "running", leaseToken: claim.leaseToken },
      data: { status: "succeeded", finishedAt: now, leaseToken: null, leaseExpiresAt: null, lastError: null, engineVersion: output.provenance.engine_version, provider: output.provenance.provider, model: output.provenance.model },
    });
    if (claimed.count === 0) return false;
    const current = await tx.generationRun.findUniqueOrThrow({ where: { id: claim.id } });
    // Persistência pelos limites canônico dos módulos Strategy e Content/Plan — o worker não cruza a fronteira.
    const strategyId = await persistStrategySnapshot(tx, {
      tenantId: claim.tenantId,
      productId: current.productId,
      generationRunId: claim.id,
      contractVersion: output.contract_version,
      payload: output.strategy as unknown as Prisma.InputJsonValue,
      provenance: output.provenance as unknown as Prisma.InputJsonValue,
    });
    await persistPlanAndContents(tx, {
      tenantId: claim.tenantId,
      productId: current.productId,
      generationRunId: claim.id,
      strategyId,
      contractVersion: output.contract_version,
      plan: output.plan,
      contents: output.contents,
      provenance: output.provenance as unknown as Prisma.InputJsonValue,
    });
    // Fail-closed: sem confirmação efetiva da reserva, a transação inteira rola back e a run não vira succeeded.
    if ((await confirmGeneratedContents(tx, claim.id)) === 0) throw new Error("GENERATION_RESERVATION_CONFIRM_MISSED");
    return true;
  });
}

export async function processNextGeneration(options: { now?: Date; config?: GenerationRuntimeConfig; goldStandardApproved: boolean; engine?: GenerationEngine }): Promise<void> {
  const now = options.now ?? new Date();
  const config = options.config ?? readGenerationRuntimeConfig();
  const claim = await claimNextGeneration(now, config);
  if (!claim) return;
  try {
    assertGenerationEngineAvailable(options.goldStandardApproved, options.engine);
    const raw = await options.engine.generate(claim.inputSnapshot);
    await finishSuccess(claim, raw as GenerationOutputV1, now);
  } catch (error) {
    if (error instanceof GenerationEngineBlockedError) await finishFailure(claim, sanitizeGenerationError(error), false, now, config);
    else await finishFailure(claim, sanitizeGenerationError(error), true, now, config);
  }
  console.info(JSON.stringify({ event: "generation.processed", generation_run_id: claim.id, attempt: claim.attemptCount }));
}

export async function recoverExpiredLeases(now = new Date(), config = readGenerationRuntimeConfig()): Promise<number> {
  const stale = await prisma.generationRun.findMany({ where: { status: "running", leaseExpiresAt: { lte: now } }, select: { id: true, tenantId: true, leaseToken: true, attemptCount: true } });
  let recovered = 0;
  for (const run of stale) {
    await prisma.$transaction(async (tx) => {
      const retry = run.attemptCount < config.maxAttempts;
      const updated = await tx.generationRun.updateMany({
        where: { id: run.id, tenantId: run.tenantId, status: "running", leaseToken: run.leaseToken, leaseExpiresAt: { lte: now } },
        data: retry
          ? { status: "queued", nextAttemptAt: new Date(now.getTime() + config.retryBackoffMs), leaseToken: null, leaseExpiresAt: null, lastError: "GENERATION_LEASE_EXPIRED" }
          : { status: "failed", finishedAt: now, leaseToken: null, leaseExpiresAt: null, lastError: "GENERATION_LEASE_EXPIRED" },
      });
      if (updated.count) {
        recovered += 1;
        if (!retry) await releaseGeneratedContents(tx, run.id, "GENERATION_LEASE_EXPIRED");
      }
    });
  }
  return recovered;
}

export async function reconcileGenerationReservations(): Promise<{ checked: number; reconciled: number; issues: number }> {
  const pending = await prisma.generationUsageReservation.findMany({ where: { status: "reserved" }, include: { generationRun: true } });
  let reconciled = 0;
  let issues = 0;
  for (const reservation of pending) {
    await prisma.$transaction(async (tx) => {
      const run = await tx.generationRun.findUnique({ where: { id: reservation.generationRunId } });
      if (!run || (run.status !== "succeeded" && run.status !== "failed" && run.status !== "cancelled")) return;
      if (run.status === "failed" || run.status === "cancelled") {
        await releaseGeneratedContents(tx, run.id, `reconciliation_${run.status}`);
        reconciled += 1;
        return;
      }
      const [contentCount, strategyCount, planCount] = await Promise.all([
        countContents(tx, run.id),
        countStrategySnapshots(tx, run.id),
        countPlans(tx, run.id),
      ]);
      if (contentCount !== run.quantity || strategyCount !== 1 || planCount !== 1) {
        issues += 1;
        console.error(JSON.stringify({ event: "generation.reconciliation_issue", generation_run_id: run.id, reason: "succeeded_result_incomplete" }));
        return;
      }
      await confirmGeneratedContents(tx, run.id, "reconciliation_succeeded");
      reconciled += 1;
    });
  }
  return { checked: pending.length, reconciled, issues };
}

let backlogSince: Date | null = null; // janela de persistência do backlog entre iterações do worker

export async function generationWorkerIteration(options: { goldStandardApproved: boolean; engine?: GenerationEngine; now?: Date }): Promise<void> {
  const config = readGenerationRuntimeConfig();
  const now = options.now ?? new Date();
  await persistWorkerHeartbeat(now);
  await prisma.generationIntent.deleteMany({ where: { expiresAt: { lt: now } } }); // retenção canônica de 24h
  await recoverExpiredLeases(now, config);
  await reconcileGenerationReservations();
  await processNextGeneration({ ...options, now, config });
  const runs = await prisma.generationRun.findMany({ select: { status: true, queuedAt: true, startedAt: true, finishedAt: true, attemptCount: true } });
  const metrics = collectGenerationMetrics(runs as never, now, config.stuckJobAfterMs);
  // Backlog persistente: não-terminais acima do limiar pela janela operacional consecutiva, não um pico isolado.
  const aboveThreshold = metrics.backlog.non_terminal > 0 && metrics.backlog.max_age_ms >= config.stuckJobAfterMs;
  if (!aboveThreshold) backlogSince = null;
  else if (backlogSince === null) backlogSince = now;
  const persistent = aboveThreshold && backlogSince !== null && now.getTime() - backlogSince.getTime() >= config.stuckJobAfterMs;
  console.info(JSON.stringify({ event: "generation.metrics", ...metrics, backlog_persistent: persistent }));
  if (persistent) console.error(JSON.stringify({ event: "generation.backlog_persistent", backlog: metrics.backlog, runbook: "investigar provider/worker/banco/lease/quota" }));
}

export async function inspectWorkerRun(tenantId: string, generationRunId: string) {
  return getGeneration(tenantId, generationRunId);
}
