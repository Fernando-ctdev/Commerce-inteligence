// Testes comportamentais da sincronização da Vitrine (backend): upsert idempotente
// por Tenant, atualização em vez de duplicação e preservação de Products manuais.
// Integração exige PostgreSQL em DATABASE_URL; faz skip automático se inacessível.
// Executar: npx tsx --test src/modules/products/sync.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE } from "../identity/http.js";
import { registerUser, resolveSession } from "../identity/service.js";
import { createManualProduct } from "./service.js";
import { syncShowcaseProducts } from "./sync.js";
import { listShowcaseItems } from "./showcase.js";
import { handleGetProduct, handleSyncShowcaseProducts } from "./http.js";

// APP_ORIGIN pode ser lista separada por vírgula; o runtime valida contra o conjunto.
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

const email = () => `qa-sync-${randomBytes(8).toString("hex")}@teste.local`;

async function tenantOf() {
  const token = await registerUser("Creator", email(), "Senha123");
  const session = await resolveSession(token);
  assert.ok(session);
  return { token, tenantId: session.tenantId };
}

const syncRequest = (token: string, origin = ORIGIN) =>
  new Request(`${ORIGIN}/api/products/sync`, {
    method: "POST",
    headers: {
      origin,
      "sec-fetch-site": origin === ORIGIN ? "same-origin" : "cross-site",
      cookie: `${SESSION_COOKIE}=${token}`,
    },
  });

const getProduct = (token: string, id: string) =>
  new Request(`${ORIGIN}/api/products/${id}`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });

test("http: sync exige same-origin e sessão", async () => {
  const crossOrigin = await handleSyncShowcaseProducts(
    syncRequest("token-qualquer", "https://evil.example"),
  );
  assert.equal(crossOrigin.status, 403);
  const semSessao = await handleSyncShowcaseProducts(
    new Request(`${ORIGIN}/api/products/sync`, {
      method: "POST",
      headers: { origin: ORIGIN, "sec-fetch-site": "same-origin" },
    }),
  );
  assert.equal(semSessao.status, 401);
});

test("sync: cria os itens da Vitrine com fatos normalizados, provenance showcase e sem job", async (t) => {
  if (!dbUp) return t.skip();
  const { tenantId } = await tenantOf();
  const items = listShowcaseItems();

  const synced = await syncShowcaseProducts(tenantId);
  assert.equal(synced.length, items.length);
  assert.equal(
    await prisma.commerceIntelligenceJob.count({ where: { tenantId } }),
    0,
  );

  const primeiro = synced[0]!;
  const item = items[0]!;
  assert.equal(primeiro.createIdempotencyKey, `showcase-${item.id}`);
  assert.equal(primeiro.name, item.title);
  assert.equal(
    primeiro.description,
    "Produto importado da Vitrine TikTok Shop.",
  );
  assert.equal(primeiro.category, item.categoryName ?? "Vitrine TikTok Shop");
  assert.ok(primeiro.priceAmount);
  assert.equal(primeiro.priceAmount.toString(), "109.99");
  assert.equal(primeiro.priceCurrency, "R$");
  assert.equal(primeiro.sourceUrl, `https://shop.tiktok.com/product/${item.id}`);
  assert.equal(primeiro.seller, "malikmodas");
  assert.deepEqual(primeiro.provenance, {
    origin: "showcase",
    sourceId: item.id,
    commissionWithCurrency: "R$ 9,90",
    commissionRate: 900,
    stockCount: 283,
    labels: ["31% off"],
  });
  assert.equal(primeiro.targetContentCount, 5);
  assert.deepEqual(primeiro.generationConstraints, {
    creatorPresence: "either",
    constraints:
      "Importado da Vitrine TikTok Shop; revise os dados antes de gerar.",
  });
  const imagens = primeiro.images as string[];
  assert.equal(imagens.length, 1);
  assert.ok(imagens[0]!.startsWith("https://"));
});

test("sync repetido: idempotente, atualiza em vez de duplicar e preserva manuais", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const items = listShowcaseItems();
  await syncShowcaseProducts(tenantId);

  const manual = await createManualProduct(
    tenantId,
    {
      name: "Curso de Excel",
      description: "Curso completo de planilhas",
      category: "Educação",
      price: "29,90",
      priceCurrency: "R$",
    },
    "manual-curso-excel-qa-sync-01",
  );
  assert.equal(manual.replay, false);

  // Edição fora da Vitrine simula drift; a sincronização seguinte restaura os fatos
  // na mesma linha (update da tabela inteira) em vez de criar outro Product.
  const alvo = await prisma.product.findUniqueOrThrow({
    where: {
      tenantId_createIdempotencyKey: {
        tenantId,
        createIdempotencyKey: `showcase-${items[0]!.id}`,
      },
    },
  });
  await prisma.product.update({
    where: { id: alvo.id },
    data: { name: "Editado fora da Vitrine", priceAmount: "1.00" },
  });

  const segunda = await syncShowcaseProducts(tenantId);
  assert.equal(segunda.length, items.length);
  assert.equal(
    await prisma.product.count({ where: { tenantId } }),
    items.length + 1,
  );

  const atualizado = segunda.find((produto) => produto.id === alvo.id)!;
  assert.equal(atualizado.name, items[0]!.title);
  assert.ok(atualizado.priceAmount);
  assert.equal(atualizado.priceAmount.toString(), "109.99");
  assert.equal(atualizado.version, alvo.version + 1);
  assert.equal(atualizado.lifecycle, "ACTIVE");

  const manualDepois = await prisma.product.findUniqueOrThrow({
    where: { id: manual.product.id },
  });
  assert.equal(manualDepois.name, "Curso de Excel");
  assert.ok(manualDepois.priceAmount);
  assert.equal(manualDepois.priceAmount.toString(), "29.9");
  assert.deepEqual(manualDepois.provenance, { origin: "manual" });
  assert.equal(
    manualDepois.createIdempotencyKey,
    "manual-curso-excel-qa-sync-01",
  );

  const manualView = await handleGetProduct(
    getProduct(token, manual.product.id),
    manual.product.id,
  );
  assert.equal(manualView.status, 200);
  const manualBody = (await manualView.json()) as Record<string, unknown>;
  assert.equal(manualBody.origin, "manual");
  assert.equal(manualBody.commission, null);
  assert.equal(manualBody.commissionRate, null);
  assert.equal(manualBody.stockCount, null);
  assert.deepEqual(manualBody.labels, []);
});

test("http: sync autenticado responde {products: ProductView[]}", async (t) => {
  if (!dbUp) return t.skip();
  const { token } = await tenantOf();
  const res = await handleSyncShowcaseProducts(syncRequest(token));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    products: Array<Record<string, unknown>>;
  };
  assert.equal(body.products.length, listShowcaseItems().length);
  const primeiro = body.products[0]!;
  assert.equal(primeiro.origin, "showcase");
  assert.equal(primeiro.commission, "R$ 9,90");
  assert.equal(primeiro.commissionRate, 900);
  assert.equal(primeiro.stockCount, 283);
  assert.deepEqual(primeiro.labels, ["31% off"]);
  assert.equal(primeiro.price, "109.99");
  assert.equal(primeiro.priceCurrency, "R$");
  assert.equal(primeiro.readiness, "PENDING");
  assert.equal(primeiro.active, true);
  assert.equal(primeiro.notes, "Importado da Vitrine TikTok Shop; revise os dados antes de gerar.");
  assert.equal(primeiro.creatorPresence, "either");
  assert.equal(primeiro.targetContentCount, 5);
});
