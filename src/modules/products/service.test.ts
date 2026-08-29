// Testes comportamentais do Slice 002 (backend): validação, caso de uso e API de Products.
// Integração exige PostgreSQL em DATABASE_URL; faz skip automático se o banco estiver inacessível.
// Executar: npx tsx --test src/modules/products/service.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE } from "../identity/http.js";
import { registerUser, resolveSession } from "../identity/service.js";
import { handleCreateProduct, handleListProducts } from "./http.js";
import { ProductValidationError, validateManualProductInput } from "./service.js";

const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
const prisma = new PrismaClient();
let dbUp = false;

test("setup: banco acessível (skip dos testes de integração caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

const validInput = {
  name: "Curso de Excel",
  description: "Curso completo de planilhas",
};

test("validação: nome e descrição obrigatórios após trim, com código do primeiro erro", () => {
  assert.throws(
    () => validateManualProductInput({ ...validInput, name: "   " }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-NAME-REQUIRED");
      assert.ok(error.fieldErrors.name);
      return true;
    },
  );
  assert.throws(
    () => validateManualProductInput({ ...validInput, description: "" }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-DESCRIPTION-REQUIRED");
      return true;
    },
  );
});

test("validação: preço/moeda como par opcional, formato não negativo", () => {
  assert.throws(
    () => validateManualProductInput({ ...validInput, price: "29,90" }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-PRICE-CURRENCY-PAIR");
      return true;
    },
  );
  assert.throws(
    () => validateManualProductInput({ ...validInput, priceCurrency: "BRL" }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-PRICE-CURRENCY-PAIR");
      return true;
    },
  );
  assert.throws(
    () => validateManualProductInput({ ...validInput, price: "-5", priceCurrency: "BRL" }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-PRICE-FORMAT");
      return true;
    },
  );

  const semPar = validateManualProductInput(validInput);
  assert.equal(semPar.priceAmount, null);
  assert.equal(semPar.priceCurrency, null);

  const comPar = validateManualProductInput({ ...validInput, price: "1.234,56", priceCurrency: "brl" });
  assert.equal(comPar.priceAmount, "1234.56"); // pt-BR: ponto de milhar sai, vírgula vira ponto decimal

  const simples = validateManualProductInput({ ...validInput, price: "29,90", priceCurrency: "USD" });
  assert.equal(simples.priceAmount, "29.90");
  assert.equal(simples.priceCurrency, "USD");
  assert.equal(comPar.priceCurrency, "BRL");
});

test("validação: preparação com defaults 20/Tanto faz e limites 1–30/300", () => {
  const defaults = validateManualProductInput(validInput);
  assert.equal(defaults.targetContentCount, 20);
  assert.deepEqual(defaults.generationConstraints, { creatorPresence: "either" });

  for (const quantity of [0, 31, 2.5]) {
    assert.throws(
      () => validateManualProductInput({ ...validInput, targetContentCount: quantity }),
      (error: unknown) => {
        assert.ok(error instanceof ProductValidationError);
        assert.equal(error.code, "VAL-QUANTITY-RANGE");
        return true;
      },
    );
  }
  assert.throws(
    () => validateManualProductInput({ ...validInput, creatorPresence: "selfie" }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-CREATOR-FORMAT");
      return true;
    },
  );
  assert.throws(
    () => validateManualProductInput({ ...validInput, constraints: "x".repeat(301) }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-NOTES-LENGTH");
      return true;
    },
  );

  const preparado = validateManualProductInput({
    ...validInput,
    targetContentCount: 30,
    creatorPresence: "on_camera",
    constraints: "sem gírias",
    features: ["  50 aulas ", "", "certificado"],
  });
  assert.equal(preparado.targetContentCount, 30);
  assert.deepEqual(preparado.generationConstraints, { creatorPresence: "on_camera", constraints: "sem gírias" });
  assert.deepEqual(preparado.features, ["50 aulas", "certificado"]);
});

// —— Integração (banco) ——

const email = () => `slice002-${randomBytes(8).toString("hex")}@teste.local`;

async function tenantOf() {
  const token = await registerUser(email(), "senha-segura-123");
  const session = await resolveSession(token);
  assert.ok(session);
  return { token, tenantId: session.tenantId };
}

const post = (token: string, body: unknown, key?: string) =>
  new Request(`${ORIGIN}/api/products`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      cookie: `${SESSION_COOKIE}=${token}`,
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: JSON.stringify(body),
  });

const get = (token: string) =>
  new Request(`${ORIGIN}/api/products`, {
    method: "GET",
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });

test("POST sem Idempotency-Key é rejeitado antes de persistir", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const res = await handleCreateProduct(post(token, validInput));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code?: string };
  assert.equal(body.code, "VAL-IDEMPOTENCY-KEY");
  assert.equal(await prisma.product.count({ where: { tenantId } }), 0);
});

test("POST válido persiste Product no tenant da sessão e POST repetido com a mesma chave dá replay", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const body = {
    ...validInput,
    category: "Educação",
    price: "29,90",
    priceCurrency: "BRL",
    features: ["50 aulas", "certificado"],
    targetContentCount: 7,
    creatorPresence: "on_camera",
    constraints: "sem gírias",
  };
  const key = randomBytes(16).toString("base64url");

  const first = await handleCreateProduct(post(token, body, key));
  assert.equal(first.status, 200);
  const created = (await first.json()) as { id: string; version: number; replay: boolean };
  assert.deepEqual(created, { id: created.id, version: 1, replay: false });

  const row = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(row.tenantId, tenantId);
  assert.equal(row.targetContentCount, 7);
  const provenance = row.provenance;
  assert.ok(typeof provenance === "object" && provenance !== null && "origin" in provenance);
  assert.equal(provenance.origin, "manual");
  assert.deepEqual(row.generationConstraints, { creatorPresence: "on_camera", constraints: "sem gírias" });
  assert.equal(row.priceCurrency, "BRL");

  const replayRes = await handleCreateProduct(post(token, body, key));
  assert.equal(replayRes.status, 200);
  const replayed = (await replayRes.json()) as { id: string; version: number; replay: boolean };
  assert.equal(replayed.id, created.id);
  assert.equal(replayed.version, created.version);
  assert.equal(replayed.replay, true);
  assert.equal(await prisma.product.count({ where: { tenantId } }), 1);
});

test("retries concorrentes com a mesma chave criam uma única linha", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const key = randomBytes(16).toString("base64url");
  const results = await Promise.all(
    [0, 1, 2].map(() => handleCreateProduct(post(token, validInput, key))),
  );
  const payload = await Promise.all(results.map((res) => res.json() as Promise<{ id: string }>));
  assert.equal(new Set(payload.map((item) => item.id)).size, 1);
  assert.equal(await prisma.product.count({ where: { tenantId } }), 1);
});

test("mesma chave em tenants diferentes não colide; listagem isola por tenant", async (t) => {
  if (!dbUp) return t.skip();
  const a = await tenantOf();
  const b = await tenantOf();
  const key = randomBytes(16).toString("base64url");

  const resA = await handleCreateProduct(post(a.token, { ...validInput, name: "Produto A" }, key));
  const resB = await handleCreateProduct(post(b.token, { ...validInput, name: "Produto B" }, key));
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);
  const idA = ((await resA.json()) as { id: string }).id;
  const idB = ((await resB.json()) as { id: string }).id;
  assert.notEqual(idA, idB);

  const listA = await handleListProducts(get(a.token));
  assert.equal(listA.status, 200);
  const viewA = (await listA.json()) as { products: Array<Record<string, unknown>> };
  assert.equal(viewA.products.length, 1);
  assert.equal(viewA.products[0]!.id, idA);
  assert.equal(viewA.products[0]!.name, "Produto A");

  const listB = await handleListProducts(get(b.token));
  const viewB = (await listB.json()) as { products: Array<{ id: string }> };
  assert.deepEqual(viewB.products.map((product) => product.id), [idB]);
});

test("GET sem sessão responde 401 AUTH-SESSION; validação via API devolve fieldErrors", async (t) => {
  if (!dbUp) return t.skip();
  const unauthorized = await handleListProducts(new Request(`${ORIGIN}/api/products`));
  assert.equal(unauthorized.status, 401);
  assert.equal(((await unauthorized.json()) as { code?: string }).code, "AUTH-SESSION");

  const { token } = await tenantOf();
  const invalid = await handleCreateProduct(post(token, { description: "sem nome" }, randomBytes(16).toString("base64url")));
  assert.equal(invalid.status, 400);
  const body = (await invalid.json()) as { code?: string; fieldErrors?: Record<string, string> };
  assert.equal(body.code, "VAL-NAME-REQUIRED");
  assert.ok(body.fieldErrors?.name);
});
