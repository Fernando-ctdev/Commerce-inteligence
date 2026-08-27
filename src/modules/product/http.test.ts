// Testes de integração dos handlers HTTP de Product (exige PostgreSQL; skip automático sem DB).
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

process.env.APP_ORIGIN = "http://localhost:3000";

const { registerUser } = require("../identity/service") as typeof import("../identity/service");
const { handleCreateProduct, handleGetProduct, handleListProducts, handleUpdateProduct } = require("./http") as typeof import("./http");

const prisma = new PrismaClient();
let dbUp = false;
const ORIGIN = process.env.APP_ORIGIN;
const key = () => randomBytes(16).toString("base64url");

test("setup: banco acessível (skip do módulo caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

async function newUser(): Promise<{ cookie: string }> {
  const email = `slice002-http-${randomBytes(8).toString("hex")}@teste.local`;
  const token = await registerUser(email, "senha-segura-123");
  return { cookie: `ci_session=${token}` };
}

function req(cookie: string, path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json", origin: ORIGIN, cookie, "idempotency-key": key() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createProductViaHttp(cookie: string, name: string): Promise<string> {
  const res = await handleCreateProduct(req(cookie, "/api/products", "POST", { name, description: "Descrição de teste" }));
  assert.equal(res.status, 201, `setup create falhou: ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

test("PATCH parcial factual: campos estendidos são persistidos e Product fica pronto para Strategy", async (t) => {
  if (!dbUp) return t.skip();
  const { cookie } = await newUser();
  const id = await createProductViaHttp(cookie, "Sérum HTTP");

  const patched = await handleUpdateProduct(req(cookie, `/api/products/${id}`, "PATCH", {
    expectedVersion: 1,
    brand: "Marca HTTP",
    seller: "Vendedor HTTP",
    variants: ["30ml"],
  }), { params: Promise.resolve({ id }) });
  const patchedBody = (await patched.json()) as { version: number; readyForStrategy: boolean };
  assert.equal(patched.status, 200, `esperado 200, veio ${patched.status}: ${JSON.stringify(patchedBody)}`);
  assert.equal(patchedBody.version, 2);
  assert.equal(patchedBody.readyForStrategy, true);

  const view = await handleGetProduct(req(cookie, `/api/products/${id}`, "GET"), { params: Promise.resolve({ id }) });
  const product = (await view.json()) as { name: string; description: string; brand: string; seller: string; variants: string[] };
  assert.equal(product.name, "Sérum HTTP"); // campos não enviados preservados
  assert.equal(product.description, "Descrição de teste");
  assert.equal(product.brand, "Marca HTTP");
  assert.equal(product.seller, "Vendedor HTTP");
  assert.deepEqual(product.variants, ["30ml"]);
});

test("PATCH parcial: versão obsoleta retorna 409 mesmo com payload parcial", async (t) => {
  if (!dbUp) return t.skip();
  const { cookie } = await newUser();
  const id = await createProductViaHttp(cookie, "Creme HTTP");

  const first = await handleUpdateProduct(req(cookie, `/api/products/${id}`, "PATCH", { expectedVersion: 1, notes: "primeira edição" }), {
    params: Promise.resolve({ id }),
  });
  assert.equal(first.status, 200); // v1 → v2

  const stale = await handleUpdateProduct(req(cookie, `/api/products/${id}`, "PATCH", { expectedVersion: 1, name: "Obsoleta" }), {
    params: Promise.resolve({ id }),
  });
  assert.equal(stale.status, 409, `esperado 409, veio ${stale.status}: ${JSON.stringify(await stale.json())}`);
});

test("PATCH cross-tenant retorna 404 uniforme com payload parcial", async (t) => {
  if (!dbUp) return t.skip();
  const a = await newUser();
  const id = await createProductViaHttp(a.cookie, "Produto de A");
  const b = await newUser();

  const crossPatch = await handleUpdateProduct(req(b.cookie, `/api/products/${id}`, "PATCH", { expectedVersion: 1, name: "hack" }), {
    params: Promise.resolve({ id }),
  });
  assert.equal(crossPatch.status, 404, `esperado 404, veio ${crossPatch.status}: ${JSON.stringify(await crossPatch.json())}`);
});

test("PATCH com name presente vazio retorna 400 e não apaga o nome", async (t) => {
  if (!dbUp) return t.skip();
  const { cookie } = await newUser();
  const id = await createProductViaHttp(cookie, "Nome original");

  const blanked = await handleUpdateProduct(req(cookie, `/api/products/${id}`, "PATCH", { expectedVersion: 1, name: "   " }), {
    params: Promise.resolve({ id }),
  });
  assert.equal(blanked.status, 400, `esperado 400, veio ${blanked.status}: ${JSON.stringify(await blanked.json())}`);

  const view = await handleGetProduct(req(cookie, `/api/products/${id}`, "GET"), { params: Promise.resolve({ id }) });
  const product = (await view.json()) as { name: string; version: number };
  assert.equal(product.name, "Nome original"); // invariante preservado, sem mutação
  assert.equal(product.version, 1);
});

test("GET /api/products lista somente Products do Tenant da sessão", async (t) => {
  if (!dbUp) return t.skip();
  const a = await newUser();
  const idA1 = await createProductViaHttp(a.cookie, "Produto A1");
  const idA2 = await createProductViaHttp(a.cookie, "Produto A2");
  const b = await newUser();
  await createProductViaHttp(b.cookie, "Produto B1");

  const listA = await handleListProducts(req(a.cookie, "/api/products", "GET"));
  assert.equal(listA.status, 200);
  const bodyA = (await listA.json()) as { products: { id: string; name: string; tenantId?: string }[] };
  assert.equal(bodyA.products.length, 2);
  assert.deepEqual(bodyA.products.map((p) => p.id).sort(), [idA1, idA2].sort());
  assert.ok(bodyA.products.every((p) => p.name.startsWith("Produto A")));
  assert.ok(bodyA.products.every((p) => p.tenantId === undefined)); // tenant não é exposto

  const listB = await handleListProducts(req(b.cookie, "/api/products", "GET"));
  const bodyB = (await listB.json()) as { products: { id: string; name: string }[] };
  assert.equal(bodyB.products.length, 1);
  assert.equal(bodyB.products[0].name, "Produto B1");
});

test("GET /api/products: empty state é lista vazia e tenant_id do cliente é ignorado", async (t) => {
  if (!dbUp) return t.skip();
  const a = await newUser();
  const productId = await createProductViaHttp(a.cookie, "Produto de A");
  const tenantA = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { tenantId: true } });

  const empty = await newUser();
  const emptyRes = await handleListProducts(req(empty.cookie, "/api/products", "GET"));
  assert.equal(emptyRes.status, 200);
  assert.deepEqual((await emptyRes.json()).products, []); // empty state, não erro

  // B envia tenant_id de A: autoridade continua sendo a sessão — nada vaza
  const spoof = await handleListProducts(
    new Request(`http://localhost:3000/api/products?tenant_id=${encodeURIComponent(tenantA.tenantId)}`, {
      headers: { origin: ORIGIN, cookie: empty.cookie },
    })
  );
  assert.equal(spoof.status, 200);
  assert.deepEqual((await spoof.json()).products, []);
});

test("GET /api/products sem sessão retorna 401", async () => {
  const res = await handleListProducts(new Request("http://localhost:3000/api/products", { headers: { origin: ORIGIN } }));
  assert.equal(res.status, 401);
});
