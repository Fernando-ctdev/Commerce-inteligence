// Testes HTTP do endpoint de conteúdos publicados (Slice 013, Task 2): autenticação,
// isolamento de Tenant, validação segura de paginação, erros estáveis e resposta
// paginada. Integração exige PostgreSQL em DATABASE_URL; skip automático se inacessível.
// Executar: npx tsx --test src/modules/products/published-content-http.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE } from "../identity/http.js";
import { registerUser, resolveSession } from "../identity/service.js";
import { createManualProduct } from "./service.js";
import { syncShowcaseProducts } from "./sync.js";
import {
  PUBLISHED_VIDEO_ANALYTICS_PAGES,
} from "./published-content-fixtures.js";
import { handleGetLinkedContents } from "./http.js";

const ORIGIN = (process.env.APP_ORIGIN ?? "http://localhost:3000")
  .split(",")[0]
  .trim();
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

const PRODUCT_A = "1736673359055521380"; // ↔ vídeo 7685499159243230472 (fixture)
const ITEM_A = "7685499159243230472";

const email = () => `qa-lc-${randomBytes(8).toString("hex")}@teste.local`;

async function tenantOf() {
  const token = await registerUser("Creator", email(), "Senha123");
  const session = await resolveSession(token);
  assert.ok(session);
  return { token, tenantId: session.tenantId };
}

const getRequest = (token: string, id: string, query = "") =>
  new Request(`${ORIGIN}/api/products/${id}/linked-contents${query}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });

const showproductId = async (tenantId: string, sourceId: string) => {
  const product = await prisma.product.findUniqueOrThrow({
    where: {
      tenantId_createIdempotencyKey: {
        tenantId,
        createIdempotencyKey: `showcase-${sourceId}`,
      },
    },
  });
  return product.id;
};

test("sem sessão responde 401 com envelope estável AUTH-SESSION", async (t) => {
  if (!dbUp) return t.skip();
  const response = await handleGetLinkedContents(
    new Request(`${ORIGIN}/api/products/p1/linked-contents`),
    "p1",
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Sessão necessária para acessar conteúdos publicados.",
    code: "AUTH-SESSION",
  });
});

test("Product de outro Tenant responde 404 sem vazar existência", async (t) => {
  if (!dbUp) return t.skip();
  const dono = await tenantOf();
  await syncShowcaseProducts(dono.tenantId);
  const id = await showproductId(dono.tenantId, PRODUCT_A);

  const intruso = await tenantOf();
  const response = await handleGetLinkedContents(
    getRequest(intruso.token, id),
    id,
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "Product não encontrado.",
    code: "PRODUCT-NOT-FOUND",
  });
});

test("Product manual (sem sourceId) responde coleção vazia com 200", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const manual = await createManualProduct(
    tenantId,
    {
      name: "Curso de Excel",
      description: "Curso completo de planilhas",
      category: "Educação",
      price: "29,90",
      priceCurrency: "R$",
    },
    "manual-curso-excel-qa-lc-01",
  );
  const response = await handleGetLinkedContents(
    getRequest(token, manual.product.id),
    manual.product.id,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.productId, manual.product.id);
  assert.equal(body.externalProductId, "");
  assert.deepEqual(body.videos, []);
  assert.equal(body.total, 0);
  assert.equal(body.hasMore, false);
});

test("query ausente usa defaults page=1 e pageSize=20", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  await syncShowcaseProducts(tenantId);
  const id = await showproductId(tenantId, PRODUCT_A);
  const response = await handleGetLinkedContents(getRequest(token, id), id);
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 20);
});

test("paginação inválida responde 400 LINKED-CONTENTS-PAGINATION sem consultar Product", async (t) => {
  if (!dbUp) return t.skip();
  const { token } = await tenantOf();
  const casos = [
    "?page=0",
    "?page=1.5",
    "?page=-1",
    "?page=abc",
    "?page=",
    "?pageSize=0",
    "?pageSize=51",
    "?pageSize=2.5",
    "?pageSize=-3",
    "?pageSize=xyz",
    "?page=10001",
    "?page=99999999999999999999999",
    "?pageSize=99999999999999999999999",
    "?page=1&page=2",
    "?pageSize=20&pageSize=30",
  ];
  for (const query of casos) {
    const response = await handleGetLinkedContents(
      getRequest(token, "qualquer-id", query),
      "qualquer-id",
    );
    assert.equal(response.status, 400, query);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, "LINKED-CONTENTS-PAGINATION", query);
  }
});

test("sucesso: Product da Vitrine recebe o vídeo associado com paginação", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  await syncShowcaseProducts(tenantId);
  const id = await showproductId(tenantId, PRODUCT_A);
  const response = await handleGetLinkedContents(
    getRequest(token, id, "?page=1&pageSize=5"),
    id,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    productId: string;
    externalProductId: string;
    showcaseProduct?: { externalProductId: string };
    videos: Array<{ itemId: string; playbackUrl?: string }>;
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  assert.equal(body.productId, id);
  assert.equal(body.externalProductId, PRODUCT_A);
  assert.equal(body.showcaseProduct?.externalProductId, PRODUCT_A);
  assert.deepEqual(body.videos.map((video) => video.itemId), [ITEM_A]);
  assert.equal(body.page, 1);
  assert.equal(body.pageSize, 5);
  assert.equal(body.total, 1);
  assert.equal(body.hasMore, false);
});

test("página além do fim responde 200 com videos vazio e total preservado", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  await syncShowcaseProducts(tenantId);
  const id = await showproductId(tenantId, PRODUCT_A);
  const response = await handleGetLinkedContents(
    getRequest(token, id, "?page=7"),
    id,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(body.videos, []);
  assert.equal(body.total, 1);
  assert.equal(body.hasMore, false);
});

test("fixture inválida responde 500 LINKED-CONTENTS-UNAVAILABLE sanitizado", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  await syncShowcaseProducts(tenantId);
  const id = await showproductId(tenantId, PRODUCT_A);

  // Corrompe a fixture padrão em memória (mesma instância usada pelo handler) e
  // restaura no finally: item_id duplicado dispara a validação fail-closed.
  const pages = PUBLISHED_VIDEO_ANALYTICS_PAGES;
  const originalItem = pages[0]!.items[0]!;
  pages[0]!.items.push({ ...originalItem });
  try {
    const response = await handleGetLinkedContents(getRequest(token, id), id);
    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: string; code: string };
    assert.equal(body.code, "LINKED-CONTENTS-UNAVAILABLE");
    assert.equal(Object.keys(body).sort().join(","), "code,error");
    assert.equal(/item_id|fixture|Prisma/i.test(body.error), false);
  } finally {
    pages[0]!.items.length = 5;
    assert.equal(pages[0]!.items[0]!.item_id, originalItem.item_id);
  }
});
