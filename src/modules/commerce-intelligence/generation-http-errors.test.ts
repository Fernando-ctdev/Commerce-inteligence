// Gate 6 (item 7, rev. 2): semântica HTTP única para GEN-CAPACITY — 429 nos
// DOIS callers (POST /api/generations e recuperação /retry + /complete), via
// generationErrorStatus (errors.ts). Integração exige PostgreSQL em
// DATABASE_URL; faz skip automático caso contrário.
// Executar: npx tsx --test src/modules/commerce-intelligence/generation-http-errors.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { handleStartGeneration } from "./http.js";
import { handleRetry, handleCompleteMissing } from "./http-status.js";
import { generationErrorStatus, publicGenerationError } from "./errors.js";
import { monthUtc } from "../entitlements/generation.js";

const prisma = new PrismaClient();
let dbUp = false;

test.after(() => prisma.$disconnect());

test("setup: banco acessível (skip dos testes de integração caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

// Mapeamento único: 409 conflito de estado, 429 capacidade, 400 demais.
test("generationErrorStatus: 409 conflitos, 429 GEN-CAPACITY, 400 demais", () => {
  assert.equal(generationErrorStatus("GEN-ACTIVE"), 409);
  assert.equal(generationErrorStatus("GEN-READY"), 409);
  assert.equal(generationErrorStatus("GEN-PRODUCT-CAPACITY"), 409);
  assert.equal(generationErrorStatus("GEN-CAPACITY"), 429);
  assert.equal(generationErrorStatus("GEN-PRODUCT"), 400);
  assert.equal(generationErrorStatus("GEN-IDEMPOTENCY"), 400);
});

const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
// [A-Za-z0-9._~-]{16,128}
const idempotencyKey = "test-key-0123456789abcdefghij";

async function fixture() {
  const email = `cap-${randomUUID()}@teste.local`;
  const user = await prisma.user.create({ data: { email, passwordHash: "teste" } });
  const tenant = await prisma.tenant.create({ data: { userId: user.id } });
  await prisma.session.create({
    data: { userId: user.id, tenantId: tenant.id, tokenHash, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id, name: "Produto capacidade", description: "Descrição suficiente",
      features: [], images: [], provenance: {}, targetContentCount: 1,
      generationConstraints: { tom: "oral" },
    },
  });
  // Job terminal de preenchimento: reserva RESERVED que esgota a capacidade do
  // mês (limite 1) sem bloquear como job ativo (FAILED não entra em activeJobWhere).
  const filler = await prisma.commerceIntelligenceJob.create({
    data: {
      tenantId: tenant.id, userId: user.id, productId: product.id,
      idempotencyKey: randomUUID(), fingerprint: randomUUID(), targetContentCount: 1,
      generatedContentsMonth: monthUtc(), status: "FAILED",
      internalErrorCode: "GEN-PROVIDER", publicErrorMessage: "teste",
      finishedAt: new Date(),
    },
  });
  await prisma.generationUsageReservation.create({
    data: { tenantId: tenant.id, jobId: filler.id, generatedContentsMonth: monthUtc(), quantity: 1 },
  });
  const limpar = async () => {
    await prisma.generationUsageReservation.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.commerceIntelligenceJob.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.user.delete({ where: { id: user.id } });
  };
  return { tenant, user, product, limpar };
}

const headers = {
  "content-type": "application/json",
  "sec-fetch-site": "same-origin",
  cookie: `ci_session=${token}`,
  "idempotency-key": idempotencyKey,
};

test("POST /api/generations com capacidade esgotada responde 429 GEN-CAPACITY, sem criar job", async (t) => {
  if (!dbUp) return t.skip();
  const limite = process.env.GENERATED_CONTENTS_MONTH_LIMIT;
  process.env.GENERATED_CONTENTS_MONTH_LIMIT = "1";
  const { tenant, product, limpar } = await fixture();
  try {
    const response = await handleStartGeneration(
      new Request("http://localhost/api/generations", { method: "POST", headers, body: JSON.stringify({ productId: product.id }) }),
    );
    assert.equal(response.status, 429);
    const body = (await response.json()) as { code?: string; error?: string };
    assert.equal(body.code, "GEN-CAPACITY");
    assert.equal(body.error, publicGenerationError("GEN-CAPACITY"));
    assert.equal(await prisma.commerceIntelligenceJob.count({ where: { tenantId: tenant.id, status: "QUEUED" } }), 0, "rejeição não cria job");
  } finally {
    if (limite === undefined) delete process.env.GENERATED_CONTENTS_MONTH_LIMIT;
    else process.env.GENERATED_CONTENTS_MONTH_LIMIT = limite;
    await limpar();
  }
});

test("/retry e /complete com capacidade esgotada respondem 429 GEN-CAPACITY", async (t) => {
  if (!dbUp) return t.skip();
  const limite = process.env.GENERATED_CONTENTS_MONTH_LIMIT;
  process.env.GENERATED_CONTENTS_MONTH_LIMIT = "1";
  const { tenant, user, product, limpar } = await fixture();
  try {
    // Retry: job terminal CANCELLED autorizado.
    const cancelled = await prisma.commerceIntelligenceJob.create({
      data: {
        tenantId: tenant.id, userId: user.id, productId: product.id,
        idempotencyKey: randomUUID(), fingerprint: randomUUID(), targetContentCount: 1,
        generatedContentsMonth: monthUtc(), status: "CANCELLED", finishedAt: new Date(),
      },
    });
    // Complete: parcial com 1 faltante (expected 2, delivered 1 → F=1).
    const partial = await prisma.commerceIntelligenceJob.create({
      data: {
        tenantId: tenant.id, userId: user.id, productId: product.id,
        idempotencyKey: randomUUID(), fingerprint: randomUUID(), targetContentCount: 2,
        generatedContentsMonth: monthUtc(), status: "SUCCEEDED_PARTIAL", finishedAt: new Date(),
        metadata: { expectedCount: 2, deliveredCount: 1, failedCount: 1, failedItems: [] },
      },
    });
    for (const [handle, id, modo] of [
      [handleRetry, cancelled.id, "retry"],
      [handleCompleteMissing, partial.id, "complete"],
    ] as const) {
      const response = await handle(new Request(`http://localhost/api/generations/${id}/${modo}`, { method: "POST", headers }), id);
      assert.equal(response.status, 429, `${modo} com capacidade esgotada`);
      const body = (await response.json()) as { code?: string };
      assert.equal(body.code, "GEN-CAPACITY", `${modo} expõe o código`);
    }
  } finally {
    if (limite === undefined) delete process.env.GENERATED_CONTENTS_MONTH_LIMIT;
    else process.env.GENERATED_CONTENTS_MONTH_LIMIT = limite;
    await limpar();
  }
});

test("POST /api/generations para identity slice002-*@teste.local é bloqueada (403 GEN-IDENTITY-BLOCKED) sem enqueue", async (t) => {
  if (!dbUp) return t.skip();
  const email = `slice002-${randomUUID()}@teste.local`;
  const user = await prisma.user.create({ data: { email, passwordHash: "teste" } });
  const tenant = await prisma.tenant.create({ data: { userId: user.id } });
  await prisma.session.create({
    data: { userId: user.id, tenantId: tenant.id, tokenHash, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id, name: "Produto bloqueado", description: "Descrição suficiente",
      features: [], images: [], provenance: {}, targetContentCount: 1,
      generationConstraints: { tom: "oral" },
    },
  });
  const blockedHeaders = {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    cookie: `ci_session=${token}`,
    "idempotency-key": "blocked-key-0123456789abcdefghij",
  };
  try {
    const response = await handleStartGeneration(
      new Request("http://localhost/api/generations", { method: "POST", headers: blockedHeaders, body: JSON.stringify({ productId: product.id }) }),
    );
    assert.equal(response.status, 403);
    const body = (await response.json()) as { code?: string; error?: string };
    assert.equal(body.code, "GEN-IDENTITY-BLOCKED");
    assert.equal(body.error, publicGenerationError("GEN-IDENTITY-BLOCKED"), "erro sanitizado, sem detalhe interno");
    assert.equal(await prisma.commerceIntelligenceJob.count({ where: { tenantId: tenant.id } }), 0, "nenhum job enfileirado");
    assert.equal(await prisma.generationUsageReservation.count({ where: { tenantId: tenant.id } }), 0, "nenhuma reserva criada");
  } finally {
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
