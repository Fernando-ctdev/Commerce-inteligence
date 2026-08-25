// Testes de integração de Entitlements (exige PostgreSQL; skip automático sem DB).
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerUser } from "../identity/service.js";
import {
  CapacityUnavailableError,
  ProductLimitReachedError,
  assertProductCapacity,
  provisionDefaultEntitlement,
  resolveActiveProductsLimit,
} from "./service.js";

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

test("registerUser provisiona entitlement default de forma idempotente", async (t) => {
  if (!dbUp) return t.skip();
  const email = `slice002-ent-${randomBytes(8).toString("hex")}@teste.local`;
  await registerUser(email, "senha-segura-123");
  const tenant = await prisma.tenant.findFirst({
    where: { user: { email } },
    include: { entitlement: true },
  });
  assert.ok(tenant?.entitlement, "entitlement default esperado após registro");
  await provisionDefaultEntitlement(prisma, tenant.id); // repetir não duplica nem falha
  const count = await prisma.entitlement.count({ where: { tenantId: tenant.id } });
  assert.equal(count, 1);
});

test("limite vem exclusivamente de config server-side validada (fail-closed)", async (t) => {
  if (!dbUp) return t.skip();
  const saved = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  try {
    process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "2";
    assert.equal(resolveActiveProductsLimit(), 2);
    process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "0";
    assert.equal(resolveActiveProductsLimit(), 0);
    for (const bad of ["", "abc", "-1", "2.5", undefined]) {
      if (bad === undefined) delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
      else process.env.ENTITLEMENT_ACTIVE_PRODUCTS = bad;
      assert.throws(() => resolveActiveProductsLimit(), CapacityUnavailableError, `esperava falha fechada para ${String(bad)}`);
    }
  } finally {
    if (saved === undefined) delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
    else process.env.ENTITLEMENT_ACTIVE_PRODUCTS = saved;
  }
});

test("capacidade: limite atingido lança sem consumo parcial; concorrência respeita o limite", async (t) => {
  if (!dbUp) return t.skip();
  const email = `slice002-cap-${randomBytes(8).toString("hex")}@teste.local`;
  await registerUser(email, "senha-segura-123");
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });

  const saved = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  try {
    process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "2";
    await prisma.$transaction(async (tx) => {
      await assertProductCapacity(tx, tenant.id); // 0 ativos < 2 → ok
      await tx.product.create({ data: { tenantId: tenant.id, name: "P1", description: "d" } });
    });
    // cria o segundo ativo e tenta dois concorrentes no limite
    await prisma.product.create({ data: { tenantId: tenant.id, name: "P2", description: "d" } });
    const attempts = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        prisma.$transaction(async (tx) => {
          await assertProductCapacity(tx, tenant.id);
          await tx.product.create({ data: { tenantId: tenant.id, name: "P3", description: "d" } });
        })
      )
    );
    const rejected = attempts.filter((r) => r.status === "rejected" && r.reason instanceof ProductLimitReachedError);
    assert.equal(attempts.length - rejected.length, 0, "com limite 2 e 2 ativos, nenhuma criação adicional passa");
    const active = await prisma.product.count({ where: { tenantId: tenant.id, active: true } });
    assert.equal(active, 2); // capacidade final exata, sem consumo parcial
  } finally {
    if (saved !== undefined) process.env.ENTITLEMENT_ACTIVE_PRODUCTS = saved;
  }
});

test("capacidade com config ausente falha fechada sem criar Product", async (t) => {
  if (!dbUp) return t.skip();
  const email = `slice002-cfg-${randomBytes(8).toString("hex")}@teste.local`;
  await registerUser(email, "senha-segura-123");
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
  const saved = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  delete process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  try {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await assertProductCapacity(tx, tenant.id);
        await tx.product.create({ data: { tenantId: tenant.id, name: "X", description: "d" } });
      }),
      CapacityUnavailableError
    );
  } finally {
    if (saved !== undefined) process.env.ENTITLEMENT_ACTIVE_PRODUCTS = saved;
  }
  const count = await prisma.product.count({ where: { tenantId: tenant.id } });
  assert.equal(count, 0); // transação revertida: nenhum Product parcial
});
