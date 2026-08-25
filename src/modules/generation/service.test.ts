import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { registerUser } from "../identity/service.js";
import { GeneratedContentsLimitReachedError } from "../entitlements/generation.js";
import { GenerationAlreadyActiveError, cancelGeneration, getGeneration, startGeneration, retryGeneration } from "./service.js";

const prisma = new PrismaClient();
let dbUp = false;

test("setup: banco acessível (skip do módulo caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

test("mesma intenção retorna a mesma run e retry do creator cria nova run uma vez", async (t) => {
  if (!dbUp) return t.skip();
  const savedProducts = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  const savedContents = process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "10";
  process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "50";
  try {
    const email = `slice003-${randomBytes(8).toString("hex")}@teste.local`;
    await registerUser(email, "senha-segura-123");
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: "Produto de teste",
        description: "Descrição suficiente",
        context: { create: { audience: "Pessoas adultas", locale: "pt-BR" } },
      },
    });
    const key = randomBytes(16).toString("base64url");
    const first = await startGeneration(tenant.id, product.id, { quantity: 2, objective: null }, key);
    const replay = await startGeneration(tenant.id, product.id, { quantity: 2, objective: null }, key);
    assert.equal(first.run.id, replay.run.id);
    assert.equal(replay.replay, true);

    await prisma.generationRun.update({ where: { id: first.run.id }, data: { status: "failed", finishedAt: new Date(), lastError: "blocked" } });
    const retryKey = randomBytes(16).toString("base64url");
    const retry = await retryGeneration(tenant.id, first.run.id, retryKey);
    const retryReplay = await retryGeneration(tenant.id, first.run.id, retryKey);
    assert.notEqual(retry.run.id, first.run.id);
    assert.equal(retry.run.previousRunId, first.run.id);
    assert.equal(retryReplay.run.id, retry.run.id);
  } finally {
    if (savedProducts === undefined) delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    else process.env.ENTITLEMENT_ACTIVE_PRODUCTS = savedProducts;
    if (savedContents === undefined) delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
    else process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = savedContents;
  }
});

test("quota de Contents é compartilhada pelo Tenant e cancelamento libera a reserva", async (t) => {
  if (!dbUp) return t.skip();
  const savedProducts = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  const savedContents = process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "10";
  process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "3";
  try {
    const email = `slice003-quota-${randomBytes(8).toString("hex")}@teste.local`;
    await registerUser(email, "senha-segura-123");
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
    const products = await Promise.all(["P1", "P2"].map((name) => prisma.product.create({ data: { tenantId: tenant.id, name, description: "Descrição", context: { create: { audience: "Público", locale: "pt-BR" } } } })));
    const first = await startGeneration(tenant.id, products[0].id, { quantity: 2, objective: null }, randomBytes(16).toString("base64url"));
    await assert.rejects(startGeneration(tenant.id, products[1].id, { quantity: 2, objective: null }, randomBytes(16).toString("base64url")), GeneratedContentsLimitReachedError);
    assert.equal(await prisma.generationUsageReservation.count({ where: { tenantId: tenant.id, status: "reserved" } }), 1);
    await cancelGeneration(tenant.id, first.run.id);
    const second = await startGeneration(tenant.id, products[1].id, { quantity: 2, objective: null }, randomBytes(16).toString("base64url"));
    assert.equal(second.run.productId, products[1].id);
    assert.equal(await getGeneration(tenant.id, first.run.id).then((run) => run?.status), "cancelled");
  } finally {
    if (savedProducts === undefined) delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    else process.env.ENTITLEMENT_ACTIVE_PRODUCTS = savedProducts;
    if (savedContents === undefined) delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
    else process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = savedContents;
  }
});

test("índice parcial impede segunda run ativa por Product mesmo sob chaves concorrentes", async (t) => {
  if (!dbUp) return t.skip();
  process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "10";
  process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "50";
  try {
    const email = `slice003-active-idx-${randomBytes(8).toString("hex")}@teste.local`;
    await registerUser(email, "senha-segura-123");
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: "Idx", description: "Descrição", context: { create: { audience: "Público", locale: "pt-BR" } } } });
    const first = await startGeneration(tenant.id, product.id, { quantity: 1, objective: null }, randomBytes(16).toString("base64url"));

    // Simula a corrida que passou pelas verificações de aplicação: o banco reprova a segunda run ativa.
    await assert.rejects(
      prisma.generationRun.create({
        data: {
          tenantId: tenant.id,
          productId: product.id,
          operation: "first_strategy_plan",
          status: "queued",
          quantity: 1,
          inputSnapshot: first.run,
          inputSnapshotHash: "race-hash",
          historySnapshot: [],
        },
      }),
      (error: unknown) => error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002"
    );

    // Retry após terminal continua permitido: run terminal sai do índice parcial.
    await prisma.generationRun.update({ where: { id: first.run.id }, data: { status: "cancelled", finishedAt: new Date() } });
    await prisma.generationUsageReservation.updateMany({ where: { generationRunId: first.run.id }, data: { status: "released" } });
    const retry = await retryGeneration(tenant.id, first.run.id, randomBytes(16).toString("base64url"));
    assert.equal(retry.run.status, "queued");
  } finally {
    delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  }
});

test("succeeded com resultado incompleto nunca é exposto como sucesso (fail-closed na leitura)", async (t) => {
  if (!dbUp) return t.skip();
  process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "10";
  process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "50";
  try {
    const email = `slice003-incomplete-${randomBytes(8).toString("hex")}@teste.local`;
    await registerUser(email, "senha-segura-123");
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, name: "Incomplete", description: "Descrição", context: { create: { audience: "Público", locale: "pt-BR" } } } });
    const created = await startGeneration(tenant.id, product.id, { quantity: 3, objective: null }, randomBytes(16).toString("base64url"));

    // Corrupção simulada: run marcada succeeded sem Strategy/Plan/Contents persistidos.
    await prisma.generationRun.update({ where: { id: created.run.id }, data: { status: "succeeded", finishedAt: new Date() } });
    const view = await getGeneration(tenant.id, created.run.id);
    assert.equal(view?.status, "failed");
    assert.equal(view?.error, "GENERATION_RESULT_INCOMPLETE");
    assert.equal(view?.contents.length, 0);
    // O estado terminal original permanece intacto para a operação reconciliar.
    const raw = await prisma.generationRun.findUniqueOrThrow({ where: { id: created.run.id } });
    assert.equal(raw.status, "succeeded");
  } finally {
    delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  }
});
