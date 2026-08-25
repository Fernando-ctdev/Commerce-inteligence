import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { assertGenerationEngineAvailable, finishSuccess, sanitizeGenerationError } from "./worker.js";
import { collectGenerationMetrics } from "./metrics.js";
import { registerUser } from "../identity/service.js";
import { GenerationAlreadyActiveError, cancelGeneration, getGeneration, retryGeneration, startGeneration } from "./service.js";
import { claimNextGeneration, processNextGeneration, recoverExpiredLeases } from "./worker.js";
import type { GenerationInputV1, GenerationOutputV1 } from "./contract.js";

const prisma = new PrismaClient();
let dbUp = false;

test("setup: banco acessível para worker (skip do módulo caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de worker pulados");
  }
});

test("engine permanece bloqueada sem gold-standard aprovado e erros são sanitizados", () => {
  assert.throws(() => assertGenerationEngineAvailable(false, undefined), /gold-standard/i);
  assert.equal(sanitizeGenerationError(new Error("provider secret token=abc")), "GENERATION_PROVIDER_FAILED");
  assert.equal(sanitizeGenerationError("timeout"), "GENERATION_FAILED");
});

function validOutputFor(claim: { id: string; inputSnapshotHash: string; inputSnapshot: { product: { id: string } } }): GenerationOutputV1 {
  return {
    contract_version: "1",
    provenance: { generation_run_id: claim.id, product_id: claim.inputSnapshot.product.id, input_snapshot_hash: claim.inputSnapshotHash, taxonomy_version: "1", engine_version: "test", generated_at: new Date().toISOString() },
    strategy: {
      analysis: {
        problem: "Um problema claro",
        functional_benefits: ["Benefício funcional"],
        emotional_benefits: ["Benefício emocional"],
        differentiators: ["Diferencial"],
        relevant_characteristics: ["Característica"],
        use_cases: ["Uso"],
        usage_context: ["Contexto"],
        purchase_triggers: ["Gatilho"],
        purchase_barriers: ["Barreira"],
        communication_risks: ["Risco"],
        sales_arguments: ["Argumento"],
      },
      dimensions: {
        audiences: [{ id: "audience-1", label: "Público" }],
        pains: [{ id: "pain-1", label: "Dor" }],
        desires: [{ id: "desire-1", label: "Desejo" }],
        benefits: [{ id: "benefit-1", label: "Benefício" }],
        objections: [{ id: "objection-1", label: "Objeção" }],
        angles: [{ id: "angle-1", label: "Ângulo" }],
      },
    },
    plan: { explanation: "Distribuição coerente", distribution: [{ dimension_id: "angle-1", quantity: 1, rationale: "Única oportunidade" }] },
    contents: [{
      id: "content-1",
      position: 1,
      audience_id: "audience-1",
      pain_id: "pain-1",
      desire_id: "desire-1",
      benefit_id: "benefit-1",
      objection_id: "objection-1",
      angle_id: "angle-1",
      hook: "Uma solução para hoje",
      structure: "Demonstração curta",
      script: "Fala e ação graváveis",
      scenes: ["Mostrar o produto"],
      cta: "Conheça o produto",
      explanation: "Trabalha a dor principal",
    }],
  };
}

test("fencing: finalização com lease perdido não persiste resultado nem confirma uso", async (t) => {
  if (!dbUp) return t.skip();
  const savedProducts = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  const savedContents = process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "10";
  process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "10";
  const config = { leaseTtlMs: 60_000, maxAttempts: 2, retryBackoffMs: 10, stuckJobAfterMs: 5000 };
  try {
    const email = `slice003-fencing-${randomBytes(8).toString("hex")}@teste.local`;
    await registerUser(email, "senha-segura-123");
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: "Fencing", description: "Descrição", context: { create: { audience: "Público", locale: "pt-BR" } } } });
    const created = await startGeneration(tenant.id, product.id, { quantity: 1, objective: null }, randomBytes(16).toString("base64url"));
    // Claim determinística da própria run (a fila global pode conter runs de outros testes).
    const leaseToken = randomBytes(16).toString("base64url");
    await prisma.generationRun.update({ where: { id: created.run.id }, data: { status: "running", attemptCount: 1, leaseToken, leaseExpiresAt: new Date(Date.now() + config.leaseTtlMs), startedAt: new Date() } });
    const run = await prisma.generationRun.findUniqueOrThrow({ where: { id: created.run.id } });
    const claim = { id: run.id, tenantId: run.tenantId, inputSnapshot: run.inputSnapshot as unknown as GenerationInputV1, inputSnapshotHash: run.inputSnapshotHash, attemptCount: 1, leaseToken };

    // Cancelamento vence a corrida terminal antes da finalização do worker obsoleto.
    await cancelGeneration(tenant.id, created.run.id);
    const persisted = await finishSuccess(claim, validOutputFor(claim), new Date());
    assert.equal(persisted, false);
    assert.equal(await prisma.strategy.count({ where: { generationRunId: created.run.id } }), 0);
    assert.equal(await prisma.plan.count({ where: { generationRunId: created.run.id } }), 0);
    assert.equal(await prisma.content.count({ where: { generationRunId: created.run.id } }), 0);
    assert.equal(await getGeneration(tenant.id, created.run.id).then((run) => run?.status), "cancelled");
    assert.equal(await prisma.generationUsageReservation.count({ where: { generationRunId: created.run.id, status: "confirmed" } }), 0);
  } finally {
    if (savedProducts === undefined) delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    else process.env.ENTITLEMENT_ACTIVE_PRODUCTS = savedProducts;
    if (savedContents === undefined) delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
    else process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = savedContents;
  }
});

test("retry do creator não cria segunda run ativa para o mesmo Product", async (t) => {
  if (!dbUp) return t.skip();
  const savedProducts = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  const savedContents = process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "10";
  process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "10";
  try {
    const email = `slice003-guard-${randomBytes(8).toString("hex")}@teste.local`;
    await registerUser(email, "senha-segura-123");
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: "Guard", description: "Descrição", context: { create: { audience: "Público", locale: "pt-BR" } } } });
    const created = await startGeneration(tenant.id, product.id, { quantity: 1, objective: null }, randomBytes(16).toString("base64url"));
    await prisma.generationRun.update({ where: { id: created.run.id }, data: { status: "failed", finishedAt: new Date(), lastError: "blocked" } });

    const retry = await retryGeneration(tenant.id, created.run.id, randomBytes(16).toString("base64url"));
    assert.equal(retry.run.status, "queued");
    // Nova chave + run anterior terminal, mas já existe run ativa: bloqueado no servidor.
    await assert.rejects(retryGeneration(tenant.id, created.run.id, randomBytes(16).toString("base64url")), GenerationAlreadyActiveError);
    await assert.rejects(startGeneration(tenant.id, product.id, { quantity: 1, objective: null }, randomBytes(16).toString("base64url")), GenerationAlreadyActiveError);
  } finally {
    if (savedProducts === undefined) delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    else process.env.ENTITLEMENT_ACTIVE_PRODUCTS = savedProducts;
    if (savedContents === undefined) delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
    else process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = savedContents;
  }
});

test("métricas operacionais medem fila, duração, tentativas, erro e backlog", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  const metrics = collectGenerationMetrics([
    { status: "queued", queuedAt: new Date("2026-08-25T11:59:00.000Z"), startedAt: null, finishedAt: null, attemptCount: 0 },
    { status: "succeeded", queuedAt: new Date("2026-08-25T11:55:00.000Z"), startedAt: new Date("2026-08-25T11:56:00.000Z"), finishedAt: new Date("2026-08-25T11:58:00.000Z"), attemptCount: 2 },
    { status: "failed", queuedAt: new Date("2026-08-25T11:50:00.000Z"), startedAt: new Date("2026-08-25T11:51:00.000Z"), finishedAt: new Date("2026-08-25T11:52:00.000Z"), attemptCount: 1 },
  ], now, 30_000);
  assert.equal(metrics.queue_age_ms.max, 60_000);
  assert.equal(metrics.duration_ms.max, 120_000);
  assert.equal(metrics.attempts.max, 2);
  assert.equal(metrics.error_rate, 1 / 2); // failed entre runs terminais (succeeded + failed), não entre todas
  assert.equal(metrics.backlog.non_terminal, 1); // backlog inclui queued E running, não apenas queued
  assert.equal(metrics.backlog.max_age_ms, 60_000);
  assert.equal(metrics.backlog_persistent, true);
});

test("heartbeat do worker é persistido e observável entre processos", async (t) => {
  if (!dbUp) return t.skip();
  const { persistWorkerHeartbeat, loadWorkerHeartbeat } = await import("./worker.js");
  const at = new Date("2026-08-25T12:00:00.000Z");
  await persistWorkerHeartbeat(at);
  assert.equal((await loadWorkerHeartbeat())?.getTime(), at.getTime());
  const newer = new Date("2026-08-25T12:00:05.000Z");
  await persistWorkerHeartbeat(newer);
  assert.equal((await loadWorkerHeartbeat())?.getTime(), newer.getTime());
});

test("retry operacional mantém a mesma run e lease expirado reencaminha sem duplicar reserva", async (t) => {
  if (!dbUp) return t.skip();
  const savedProducts = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  const savedContents = process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "10";
  process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "10";
  const config = { leaseTtlMs: 1000, maxAttempts: 2, retryBackoffMs: 10, stuckJobAfterMs: 5000 };
  try {
    const email = `slice003-worker-${randomBytes(8).toString("hex")}@teste.local`;
    await registerUser(email, "senha-segura-123");
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: "Worker", description: "Descrição", context: { create: { audience: "Público", locale: "pt-BR" } } } });
    const startedAt = new Date("2026-08-25T12:00:00.000Z");
    const created = await startGeneration(tenant.id, product.id, { quantity: 1, objective: null }, randomBytes(16).toString("base64url"), startedAt);
    await processNextGeneration({ now: startedAt, config, goldStandardApproved: true, engine: { generate: async () => { throw new Error("transient provider failure"); } } });
    const afterRetry = await getGeneration(tenant.id, created.run.id);
    assert.equal(afterRetry?.id, created.run.id);
    assert.equal(afterRetry?.status, "queued");
    assert.equal(afterRetry?.attemptCount, 1);

    const claim = await claimNextGeneration(new Date("2026-08-25T12:00:00.020Z"), config);
    assert.equal(claim?.id, created.run.id);
    assert.equal(await recoverExpiredLeases(new Date("2026-08-25T12:00:02.000Z"), config), 1);
    const afterLease = await getGeneration(tenant.id, created.run.id);
    assert.equal(afterLease?.id, created.run.id);
    assert.equal(afterLease?.status, "failed");
    assert.equal(afterLease?.attemptCount, 2);
    assert.equal(await prisma.generationUsageReservation.count({ where: { generationRunId: created.run.id, status: "released" } }), 1);
  } finally {
    if (savedProducts === undefined) delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    else process.env.ENTITLEMENT_ACTIVE_PRODUCTS = savedProducts;
    if (savedContents === undefined) delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
    else process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = savedContents;
  }
});
