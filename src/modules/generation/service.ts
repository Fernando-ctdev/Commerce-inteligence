import { Prisma } from "@prisma/client";

import { prisma } from "../db";
import {
  GeneratedContentsLimitReachedError,
  releaseGeneratedContents,
  reserveGeneratedContents,
} from "../entitlements/generation";
import { IDEMPOTENCY_TTL_MS } from "../entitlements/service";
import { getProductForGeneration, type ProductView } from "../product/service";
import { loadContents, loadPlanPayload } from "../content/service";
import { loadStrategySnapshot } from "../strategy/service";
import {
  FIRST_GENERATION_OPERATION,
  GENERATION_CONTRACT_VERSION,
  generationIntentFingerprint,
  inputSnapshotHash,
  normalizeGenerationRequest,
  type GenerationInputV1,
  type GenerationOutputV1,
  type GenerationRequest,
} from "./contract";
import { isTerminalGenerationStatus, type GenerationStatus } from "./runtime";

export class GenerationValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("Dados de Generation inválidos.");
  }
}
export class GenerationProductNotFoundError extends Error {}
export class GenerationProductNotReadyError extends Error {}
export class GenerationAlreadyActiveError extends Error {}
export class GenerationAlreadySucceededError extends Error {}
export class GenerationRetryRequiredError extends Error {}
export class GenerationIntentConflictError extends Error {}
export class GenerationNotFoundError extends Error {}
export class GenerationStateConflictError extends Error {}

export type GenerationView = {
  id: string;
  productId: string;
  status: GenerationStatus;
  quantity: number;
  objective: string | null;
  previousRunId: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attemptCount: number;
  error: string | null;
  strategy: GenerationOutputV1["strategy"] | null;
  plan: GenerationOutputV1["plan"] | null;
  contents: GenerationOutputV1["contents"];
  provenance: GenerationOutputV1["provenance"] | null;
};

type Db = typeof prisma | Prisma.TransactionClient;
type Run = Prisma.GenerationRunGetPayload<Record<string, never>>;

type RunResults = Pick<GenerationView, "strategy" | "plan" | "contents" | "provenance">;

const NO_RESULTS: RunResults = { strategy: null, plan: null, contents: [], provenance: null };

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function asStatus(value: string): GenerationStatus {
  if (value === "queued" || value === "running" || value === "succeeded" || value === "failed" || value === "cancelled") return value;
  throw new Error("GENERATION_STATUS_INVALID");
}

/**
 * Fail-closed na leitura: uma run `succeeded` somente é exposta como sucesso com Strategy,
 * Plan e exatamente N Contents consistentes. Resultado incompleto nunca vira sucesso na API/UI;
 * o estado terminal original permanece intacto no banco para a operação reconciliar.
 */
function toView(run: Run, results: RunResults): GenerationView {
  const base = {
    id: run.id,
    productId: run.productId,
    quantity: run.quantity,
    objective: run.objective,
    previousRunId: run.previousRunId,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: iso(run.startedAt),
    finishedAt: iso(run.finishedAt),
    attemptCount: run.attemptCount,
  };
  if (asStatus(run.status) === "succeeded" && (!results.strategy || !results.plan || results.contents.length !== run.quantity)) {
    return { ...base, status: "failed", error: "GENERATION_RESULT_INCOMPLETE", ...NO_RESULTS };
  }
  return { ...base, status: asStatus(run.status), error: run.lastError, ...results };
}

/** Resultado carregado pelos limites canônico dos módulos Strategy e Content/Plan. */
async function loadRunResults(db: Db, runId: string): Promise<RunResults> {
  const strategy = await loadStrategySnapshot(db, runId);
  if (!strategy) return NO_RESULTS;
  const [plan, contents] = await Promise.all([loadPlanPayload(db, runId), loadContents(db, runId)]);
  return {
    strategy: strategy.payload as GenerationOutputV1["strategy"],
    plan: plan as GenerationOutputV1["plan"],
    contents,
    provenance: strategy.provenance as GenerationOutputV1["provenance"],
  };
}

async function viewFor(db: Db, run: Run): Promise<GenerationView> {
  return toView(run, await loadRunResults(db, run.id));
}

async function findRun(tx: Prisma.TransactionClient, id: string): Promise<Run | null> {
  return tx.generationRun.findUnique({ where: { id } });
}

function normalizedRequest(value: unknown): GenerationRequest {
  const result = normalizeGenerationRequest(value);
  if ("errors" in result) throw new GenerationValidationError(result.errors);
  return result.request;
}

function ensureKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{22,128}$/.test(value)) {
    throw new GenerationValidationError({ idempotencyKey: "Chave de idempotência inválida." });
  }
  return value;
}

function productToInput(product: ProductView, request: GenerationRequest): GenerationInputV1 {
  if (product.locale !== "pt-BR" || !product.active || !product.name || !product.description) {
    throw new GenerationProductNotReadyError();
  }
  const context = product.context;
  return {
    contract_version: GENERATION_CONTRACT_VERSION,
    operation: FIRST_GENERATION_OPERATION,
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price_cents: product.priceCents,
      features: product.features ?? [],
      image_refs: product.imageRefs ?? [],
      notes: product.notes,
      url: product.url,
      locale: "pt-BR",
      version: product.version,
    },
    strategy_context: {
      locale: "pt-BR",
      goal: context?.goal ?? null,
      audience: context?.audience ?? null,
      style: context?.style ?? null,
      creator_presence: context?.creatorPresence ?? null,
      experience: context?.experience ?? null,
      constraints: context?.constraints ?? null,
      market: context?.market ?? null,
      notes: context?.notes ?? null,
    },
    history_snapshot: [],
    request,
  };
}

async function readIntentReplay(tenantId: string, key: string, fingerprint: string, now: Date): Promise<GenerationView | null> {
  const intent = await prisma.generationIntent.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
  if (!intent || intent.expiresAt.getTime() <= now.getTime()) return null;
  if (intent.intentFingerprint !== fingerprint) throw new GenerationIntentConflictError();
  const run = await prisma.generationRun.findFirst({ where: { id: intent.generationRunId, tenantId } });
  if (!run) throw new GenerationNotFoundError();
  return viewFor(prisma, run);
}

/** Violação de unicidade que não é replay de intenção: índice parcial de run ativa por Product. */
async function rejectIfActiveRun(tenantId: string, productId: string, error: unknown): Promise<never> {
  const active = await prisma.generationRun.findFirst({
    where: { tenantId, productId, operation: FIRST_GENERATION_OPERATION, status: { in: ["queued", "running"] } },
  });
  if (active) throw new GenerationAlreadyActiveError();
  throw error;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function startTransaction(tenantId: string, productId: string, request: GenerationRequest, key: string, now: Date): Promise<{ run: GenerationView; replay: boolean }> {
  const fingerprint = generationIntentFingerprint(productId, request.quantity, request.objective);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.generationIntent.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
    if (existing && existing.expiresAt.getTime() > now.getTime()) {
      if (existing.intentFingerprint !== fingerprint) throw new GenerationIntentConflictError();
      const run = await findRun(tx, existing.generationRunId);
      if (!run) throw new GenerationNotFoundError();
      return { run: await viewFor(tx, run), replay: true };
    }

    const product = await getProductForGeneration(tenantId, productId, tx);
    if (!product) throw new GenerationProductNotFoundError();
    if (!product.active || product.locale !== "pt-BR") throw new GenerationProductNotReadyError();
    const [succeeded, active, anyRun] = await Promise.all([
      tx.generationRun.findFirst({ where: { tenantId, productId, operation: FIRST_GENERATION_OPERATION, status: "succeeded" } }),
      tx.generationRun.findFirst({ where: { tenantId, productId, operation: FIRST_GENERATION_OPERATION, status: { in: ["queued", "running"] } } }),
      tx.generationRun.findFirst({ where: { tenantId, productId, operation: FIRST_GENERATION_OPERATION } }),
    ]);
    if (succeeded) throw new GenerationAlreadySucceededError();
    if (active) throw new GenerationAlreadyActiveError();
    if (anyRun) throw new GenerationRetryRequiredError();

    const input = productToInput(product, request);
    const snapshotHash = inputSnapshotHash(input);
    const run = await tx.generationRun.create({
      data: {
        tenantId,
        productId,
        operation: FIRST_GENERATION_OPERATION,
        status: "queued",
        quantity: request.quantity,
        objective: request.objective,
        contractVersion: GENERATION_CONTRACT_VERSION,
        inputSnapshot: input as unknown as Prisma.InputJsonValue,
        inputSnapshotHash: snapshotHash,
        historySnapshot: [] as unknown as Prisma.InputJsonValue,
        queuedAt: now,
        nextAttemptAt: now,
        createdAt: now,
      },
    });
    await reserveGeneratedContents(tx, tenantId, run.id, request.quantity, now);
    const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
    if (existing) {
      await tx.generationIntent.update({ where: { id: existing.id }, data: { intentFingerprint: fingerprint, inputSnapshotHash: snapshotHash, generationRunId: run.id, createdAt: now, expiresAt } });
    } else {
      await tx.generationIntent.create({ data: { tenantId, idempotencyKey: key, intentFingerprint: fingerprint, inputSnapshotHash: snapshotHash, generationRunId: run.id, createdAt: now, expiresAt } });
    }
    return { run: await viewFor(tx, run), replay: false };
  });
}

export async function startGeneration(tenantId: string, productId: string, value: unknown, idempotencyKey: unknown, now = new Date()): Promise<{ run: GenerationView; replay: boolean }> {
  const request = normalizedRequest(value);
  const key = ensureKey(idempotencyKey);
  try {
    return await startTransaction(tenantId, productId, request, key, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const replay = await readIntentReplay(tenantId, key, generationIntentFingerprint(productId, request.quantity, request.objective), now);
      if (replay) return { run: replay, replay: true };
      return rejectIfActiveRun(tenantId, productId, error);
    }
    throw error;
  }
}

export async function retryGeneration(tenantId: string, previousRunId: string, idempotencyKey: unknown, now = new Date()): Promise<{ run: GenerationView; replay: boolean }> {
  const key = ensureKey(idempotencyKey);
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.generationRun.findFirst({ where: { id: previousRunId, tenantId } });
      if (!previous) throw new GenerationNotFoundError();
      if (previous.status !== "failed" && previous.status !== "cancelled") throw new GenerationStateConflictError();
      const fingerprint = generationIntentFingerprint(previous.productId, previous.quantity, previous.objective, previous.id);
      const existing = await tx.generationIntent.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } } });
      if (existing && existing.expiresAt.getTime() > now.getTime()) {
        if (existing.intentFingerprint !== fingerprint) throw new GenerationIntentConflictError();
        const run = await findRun(tx, existing.generationRunId);
        if (!run) throw new GenerationNotFoundError();
        return { run: await viewFor(tx, run), replay: true };
      }
      // Replay tratado acima: retry de nova chave não pode criar uma segunda run ativa para o mesmo Product.
      const active = await tx.generationRun.findFirst({ where: { tenantId, productId: previous.productId, operation: FIRST_GENERATION_OPERATION, status: { in: ["queued", "running"] } } });
      if (active) throw new GenerationAlreadyActiveError();
      const input = previous.inputSnapshot as unknown as GenerationInputV1;
      const run = await tx.generationRun.create({
        data: {
          tenantId,
          productId: previous.productId,
          operation: FIRST_GENERATION_OPERATION,
          status: "queued",
          quantity: previous.quantity,
          objective: previous.objective,
          contractVersion: previous.contractVersion,
          inputSnapshot: input as unknown as Prisma.InputJsonValue,
          inputSnapshotHash: previous.inputSnapshotHash,
          historySnapshot: previous.historySnapshot as Prisma.InputJsonValue,
          previousRunId: previous.id,
          queuedAt: now,
          nextAttemptAt: now,
          createdAt: now,
        },
      });
      await reserveGeneratedContents(tx, tenantId, run.id, previous.quantity, now);
      const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
      if (existing) {
        await tx.generationIntent.update({ where: { id: existing.id }, data: { intentFingerprint: fingerprint, inputSnapshotHash: previous.inputSnapshotHash, generationRunId: run.id, createdAt: now, expiresAt } });
      } else {
        await tx.generationIntent.create({ data: { tenantId, idempotencyKey: key, intentFingerprint: fingerprint, inputSnapshotHash: previous.inputSnapshotHash, generationRunId: run.id, createdAt: now, expiresAt } });
      }
      return { run: await viewFor(tx, run), replay: false };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const previous = await prisma.generationRun.findFirst({ where: { id: previousRunId, tenantId } });
      if (!previous) throw new GenerationNotFoundError();
      const replay = await readIntentReplay(tenantId, key, generationIntentFingerprint(previous.productId, previous.quantity, previous.objective, previous.id), now);
      if (replay) return { run: replay, replay: true };
      return rejectIfActiveRun(tenantId, previous.productId, error);
    }
    throw error;
  }
}

export async function getGeneration(tenantId: string, generationRunId: string): Promise<GenerationView | null> {
  const run = await prisma.generationRun.findFirst({ where: { id: generationRunId, tenantId } });
  return run ? viewFor(prisma, run) : null;
}

export async function cancelGeneration(tenantId: string, generationRunId: string): Promise<GenerationView> {
  return prisma.$transaction(async (tx) => {
    const current = await findRun(tx, generationRunId);
    if (!current || current.tenantId !== tenantId) throw new GenerationNotFoundError();
    if (isTerminalGenerationStatus(asStatus(current.status))) return viewFor(tx, current);
    const updated = await tx.generationRun.updateMany({
      where: { id: generationRunId, tenantId, status: { in: ["queued", "running"] } },
      data: { status: "cancelled", finishedAt: new Date(), lastError: "GENERATION_CANCELLED" },
    });
    if (updated.count === 0) {
      const winner = await findRun(tx, generationRunId);
      if (!winner) throw new GenerationNotFoundError();
      return viewFor(tx, winner);
    }
    await releaseGeneratedContents(tx, generationRunId, "generation_cancelled");
    const cancelled = await findRun(tx, generationRunId);
    if (!cancelled) throw new GenerationNotFoundError();
    return viewFor(tx, cancelled);
  });
}

export { GeneratedContentsLimitReachedError };
