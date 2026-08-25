// Testes de integração de Product (exige PostgreSQL; skip automático sem DB).
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerUser } from "../identity/service.js";
import { ProductLimitReachedError } from "../entitlements/service.js";
import { createProduct, getProduct, IdempotencyConflictError, StaleVersionError, updateProduct } from "./service.js";
import { validateProductInput } from "./validation.js";

const prisma = new PrismaClient();
let dbUp = false;
const key = () => randomBytes(16).toString("base64url");

test("setup: banco acessível (skip do módulo caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

async function newTenant(): Promise<string> {
  const email = `slice002-prod-${randomBytes(8).toString("hex")}@teste.local`;
  await registerUser(email, "senha-segura-123");
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { user: { email } } });
  return tenant.id;
}

function input(overrides: Record<string, unknown> = {}) {
  const v = validateProductInput({ name: "Sérum Vitamina C", description: "Sérum facial 30ml", ...overrides });
  if (!("input" in v)) throw new Error("input de teste inválido");
  return v.input;
}

test("criação persiste fatos normalizados, BRL em centavos, locale e URL pending", async (t) => {
  if (!dbUp) return t.skip();
  const tenantId = await newTenant();
  const { product, replay } = await createProduct(
    tenantId,
    input({ price: "1.234,56", url: "https://exemplo.com/produto", features: [" Vitamina C 15% "] }),
    key()
  );
  assert.equal(replay, false);
  assert.ok(/^[0-9a-f-]{36}$/.test(product.id), "id UUID não previsível");
  assert.equal(product.priceCents, 123456);
  assert.deepEqual(product.features, ["Vitamina C 15%"]);
  assert.equal(product.locale, "pt-BR");
  assert.equal(product.enrichmentStatus, "pending");
  assert.equal(product.version, 1);
  assert.equal(product.readyForStrategy, false); // sem contexto salvo ainda
});

test("idempotência: mesma chave+payload → mesmo Product; payload diferente → conflito; chaves distintas → Products distintos", async (t) => {
  if (!dbUp) return t.skip();
  const tenantId = await newTenant();
  const k = key();
  const first = await createProduct(tenantId, input(), k);
  const replay = await createProduct(tenantId, input(), k);
  assert.equal(replay.product.id, first.product.id);
  assert.equal(replay.replay, true);

  await assert.rejects(createProduct(tenantId, input({ name: "Outro nome" }), k), IdempotencyConflictError);

  const other = await createProduct(tenantId, input(), key());
  assert.notEqual(other.product.id, first.product.id); // sem unicidade artificial de nome

  // mesma chave+payload com preço em formato diferente = mesmo payload normalizado → replay
  const kPrice = key();
  const a = await createProduct(tenantId, input({ price: "10,00" }), kPrice);
  const b = await createProduct(tenantId, input({ price: 10 }), kPrice);
  assert.equal(b.product.id, a.product.id);
  assert.equal(b.replay, true);
});

test("idempotência expirada inicia nova intenção sem alterar o Product anterior", async (t) => {
  if (!dbUp) return t.skip();
  const tenantId = await newTenant();
  const k = key();
  const first = await createProduct(tenantId, input(), k);
  // simula expiração da retenção de 24h
  await prisma.idempotencyRecord.updateMany({
    where: { tenantId, idempotencyKey: k },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const second = await createProduct(tenantId, input(), k);
  assert.notEqual(second.product.id, first.product.id);
  const old = await getProduct(tenantId, first.product.id);
  assert.ok(old, "Product anterior permanece intacto");
});

test("isolamento: Product de outro Tenant não é lido nem atualizado (uniforme)", async (t) => {
  if (!dbUp) return t.skip();
  const tenantA = await newTenant();
  const tenantB = await newTenant();
  const { product } = await createProduct(tenantA, input(), key());
  assert.equal(await getProduct(tenantB, product.id), null);
  await assert.rejects(
    updateProduct(tenantB, product.id, 1, { name: "hacked" }).catch((e) => {
      if (e instanceof Error && e.message === "PRODUCT_NOT_FOUND") throw e;
      throw e;
    }),
    /PRODUCT_NOT_FOUND/
  );
  const intact = await getProduct(tenantA, product.id);
  assert.equal(intact?.name, "Sérum Vitamina C");
});

test("contexto: upsert no PATCH, prontidão para Strategy e versão otimista", async (t) => {
  if (!dbUp) return t.skip();
  const tenantId = await newTenant();
  const { product } = await createProduct(tenantId, input(), key());

  const v2 = await updateProduct(tenantId, product.id, 1, { context: { goal: "Vender no TikTok", audience: null, style: null, creatorPresence: null, experience: null, constraints: null, market: null, notes: null } as never });
  assert.equal(v2.version, 2);
  assert.equal(v2.readyForStrategy, true);
  assert.equal(v2.context?.goal, "Vender no TikTok");
  assert.equal(v2.context?.locale, "pt-BR");

  await assert.rejects(updateProduct(tenantId, product.id, 1, { name: "edit obsoleta" }), StaleVersionError);
  const latest = await getProduct(tenantId, product.id);
  assert.equal(latest?.version, 2); // edição mais recente preservada
  assert.equal(latest?.name, "Sérum Vitamina C");

  const v3 = await updateProduct(tenantId, product.id, 2, { name: "Sérum VC 20%", context: { goal: "Nova meta", audience: "Creator PT-BR", style: null, creatorPresence: null, experience: null, constraints: null, market: null, notes: null } as never });
  assert.equal(v3.version, 3);
  assert.equal(v3.context?.goal, "Nova meta"); // upsert atualiza sem criar cópia
  const contextCount = await prisma.productContext.count({ where: { productId: product.id } });
  assert.equal(contextCount, 1);
});

test("PATCH parcial preserva campos não enviados", async (t) => {
  if (!dbUp) return t.skip();
  const tenantId = await newTenant();
  const { product } = await createProduct(tenantId, input({ price: "50,00" }), key());
  const v2 = await updateProduct(tenantId, product.id, 1, { name: "Nome novo" });
  assert.equal(v2.name, "Nome novo");
  assert.equal(v2.priceCents, 5000); // preço preservado
  assert.equal(v2.description, "Sérum facial 30ml");
});

test("limite de Products ativos rejeita criação sem estado parcial (via createProduct)", async (t) => {
  if (!dbUp) return t.skip();
  const tenantId = await newTenant();
  const saved = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  try {
    process.env.ENTITLEMENT_ACTIVE_PRODUCTS = "1";
    const first = await createProduct(tenantId, input({ name: "Primeiro" }), key());
    assert.ok(first.product.id);
    await assert.rejects(createProduct(tenantId, input({ name: "Segundo" }), key()), ProductLimitReachedError);
    const count = await prisma.product.count({ where: { tenantId, active: true } });
    assert.equal(count, 1);
    const records = await prisma.idempotencyRecord.count({ where: { tenantId } });
    assert.equal(records, 1); // chave perdedora não deixou registro parcial
  } finally {
    if (saved !== undefined) process.env.ENTITLEMENT_ACTIVE_PRODUCTS = saved;
  }
});
