// Testes comportamentais do Slice 002 (backend): validação, caso de uso e API de Products.
// Integração exige PostgreSQL em DATABASE_URL; faz skip automático se o banco estiver inacessível.
// Executar: npx tsx --test src/modules/products/service.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { SESSION_COOKIE } from "../identity/http.js";
import { registerUser, resolveSession } from "../identity/service.js";
import {
  handleArchiveProduct,
  handleCreateProduct,
  handleDeleteProduct,
  handleGetProduct,
  handleListProducts,
  handleReactivateProduct,
  handleUpdateProduct,
} from "./http.js";
import {
  ProductNotFoundError,
  ProductValidationError,
  archiveTenantProduct,
  deleteTenantProduct,
  reactivateTenantProduct,
  validateManualProductInput,
} from "./service.js";
import { failJobAndReleaseReservation } from "../commerce-intelligence/worker.js";
import { monthUtc } from "../entitlements/generation.js";

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

const validInput = {
  name: "Curso de Excel",
  description: "Curso completo de planilhas",
  category: "Educação",
  price: "29,90",
  priceCurrency: "R$",
  features: ["50 aulas", "certificado"],
  constraints: "sem gírias",
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

test("validação: campos obrigatórios retornam códigos VAL-*-REQUIRED", () => {
  const casos: Array<[Record<string, unknown>, string, string]> = [
    [{ ...validInput, name: "   " }, "name", "VAL-NAME-REQUIRED"],
    [
      { ...validInput, description: "" },
      "description",
      "VAL-DESCRIPTION-REQUIRED",
    ],
    [{ ...validInput, category: "" }, "category", "VAL-CATEGORY-REQUIRED"],
    [{ ...validInput, price: "" }, "price", "VAL-PRICE-REQUIRED"],
    [
      { ...validInput, priceCurrency: "" },
      "priceCurrency",
      "VAL-CURRENCY-REQUIRED",
    ],
    [{ ...validInput, features: [] }, "features", "VAL-FEATURES-REQUIRED"],
    [
      { ...validInput, features: ["", "   "] },
      "features",
      "VAL-FEATURES-REQUIRED",
    ],
  ];
  for (const [input, field, code] of casos) {
    assert.throws(
      () => validateManualProductInput(input),
      (error: unknown) => {
        assert.ok(error instanceof ProductValidationError);
        assert.equal(error.code, code);
        assert.ok(error.fieldErrors[field]);
        return true;
      },
    );
  }
  assert.doesNotThrow(() =>
    validateManualProductInput({ ...validInput, constraints: "" }),
  );
});

test("validação: discountPercentage é opcional, factual e limitado a 0–100 com até duas casas", () => {
  // Ausente/vazio → null: produtos existentes sem desconto permanecem compatíveis.
  assert.equal(validateManualProductInput(validInput).discountPercentage, null);
  assert.equal(
    validateManualProductInput({ ...validInput, discountPercentage: "   " })
      .discountPercentage,
    null,
  );
  // Presente: vírgula vira ponto; 0 e 100 são aceitos (faixa 0–100).
  assert.equal(
    validateManualProductInput({ ...validInput, discountPercentage: "12,5" })
      .discountPercentage,
    "12.5",
  );
  assert.equal(
    validateManualProductInput({ ...validInput, discountPercentage: "0" })
      .discountPercentage,
    "0",
  );
  assert.equal(
    validateManualProductInput({ ...validInput, discountPercentage: "100" })
      .discountPercentage,
    "100",
  );
  // Campo presente em tipo não-string é rejeitado (desconto factual chega como texto).
  const formatos: unknown[] = ["abc", "-5", "1,2,3", "20%", 20, { value: 20 }, true];
  for (const discountPercentage of formatos) {
    assert.throws(
      () =>
        validateManualProductInput({ ...validInput, discountPercentage }),
      (error: unknown) => {
        assert.ok(error instanceof ProductValidationError);
        assert.equal(error.code, "VAL-DISCOUNT-FORMAT");
        assert.ok(error.fieldErrors.discountPercentage);
        return true;
      },
    );
  }
  const faixas = ["150", "100.01", "1.234"];
  for (const discountPercentage of faixas) {
    assert.throws(
      () =>
        validateManualProductInput({ ...validInput, discountPercentage }),
      (error: unknown) => {
        assert.ok(error instanceof ProductValidationError);
        assert.equal(error.code, "VAL-DISCOUNT-RANGE");
        return true;
      },
    );
  }
});

test("validação: preço não negativo, moeda válida e normalização preservada", () => {
  assert.throws(
    () =>
      validateManualProductInput({
        ...validInput,
        price: "-5",
        priceCurrency: "R$",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-PRICE-FORMAT");
      return true;
    },
  );
  assert.throws(
    () =>
      validateManualProductInput({
        ...validInput,
        price: "23.4567",
        priceCurrency: "R$",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-PRICE-FORMAT");
      return true;
    },
  );

  const comPar = validateManualProductInput({
    ...validInput,
    price: "1.234,56",
    priceCurrency: "R$",
  });
  assert.equal(comPar.priceAmount, "1234.56"); // pt-BR: ponto de milhar sai, vírgula vira ponto decimal
  assert.equal(comPar.priceCurrency, "R$");

  const simples = validateManualProductInput({
    ...validInput,
    price: "29,90",
    priceCurrency: "USD",
  });
  assert.equal(simples.priceAmount, "29.90");
  assert.equal(simples.priceCurrency, "USD");
});
test("validação: comissão opcional aceita percentual ou valor financeiro", () => {
  const percent = validateManualProductInput({
    ...validInput,
    commissionType: "PERCENT",
    commissionValue: "10,50",
  });
  assert.equal(percent.commissionType, "PERCENT");
  assert.equal(percent.commissionValue, "10.50");

  const amount = validateManualProductInput({
    ...validInput,
    commissionType: "AMOUNT",
    commissionValue: "4,50",
  });
  assert.equal(amount.commissionType, "AMOUNT");
  assert.equal(amount.commissionValue, "4.50");
  assert.equal(validateManualProductInput(validInput).commissionType, null);
  assert.equal(validateManualProductInput(validInput).commissionValue, null);
});

test("validação: comissão rejeita valor negativo, percentual fora de 0–100 e tipo inválido", () => {
  for (const input of [
    { commissionType: "PERCENT", commissionValue: "-1" },
    { commissionType: "PERCENT", commissionValue: "100,01" },
    { commissionType: "AMOUNT", commissionValue: "-0,01" },
    { commissionType: "OTHER", commissionValue: "1" },
    { commissionType: "PERCENT", commissionValue: "" },
  ]) {
    assert.throws(
      () => validateManualProductInput({ ...validInput, ...input }),
      (error: unknown) => {
        assert.ok(error instanceof ProductValidationError);
        assert.ok(error.fieldErrors.commissionType || error.fieldErrors.commissionValue);
        return true;
      },
    );
  }
});

test("validação: aceita preço decimal com ponto", () => {
  const result = validateManualProductInput({
    ...validInput,
    price: "23.44",
    priceCurrency: "R$",
  });
  assert.equal(result.priceAmount, "23.44");
});

test("validação: normaliza milhar pt-BR sem casas decimais", () => {
  const milhar = validateManualProductInput({ ...validInput, price: "1.234" });
  assert.equal(milhar.priceAmount, "1234");

  const milharMaior = validateManualProductInput({
    ...validInput,
    price: "1.234.567",
  });
  assert.equal(milharMaior.priceAmount, "1234567");
});

test("validação: preparação com defaults 5/Tanto faz e limites 1–10/300", () => {
  const defaults = validateManualProductInput(validInput);
  assert.equal(defaults.targetContentCount, 5);
  assert.deepEqual(defaults.generationConstraints, {
    creatorPresence: "either",
    constraints: "sem gírias",
  });

  for (const quantity of [0, 11, 2.5]) {
    assert.throws(
      () =>
        validateManualProductInput({
          ...validInput,
          targetContentCount: quantity,
        }),
      (error: unknown) => {
        assert.ok(error instanceof ProductValidationError);
        assert.equal(error.code, "VAL-QUANTITY-RANGE");
        return true;
      },
    );
  }
  assert.throws(
    () =>
      validateManualProductInput({ ...validInput, creatorPresence: "selfie" }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-CREATOR-FORMAT");
      return true;
    },
  );
  assert.throws(
    () =>
      validateManualProductInput({
        ...validInput,
        constraints: "x".repeat(301),
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-NOTES-LENGTH");
      return true;
    },
  );

  const preparado = validateManualProductInput({
    ...validInput,
    targetContentCount: 10,
    creatorPresence: "on_camera",
    constraints: "sem gírias",
    imageRefs: ["https://cdn.exemplo.com/produto.png"],
    url: "https://exemplo.com/produto",
    features: ["  50 aulas ", "", "certificado"],
  });
  assert.equal(preparado.targetContentCount, 10);
  assert.deepEqual(preparado.generationConstraints, {
    creatorPresence: "on_camera",
    constraints: "sem gírias",
  });
  assert.deepEqual(preparado.features, ["50 aulas", "certificado"]);
});

test("validação: imageRefs aceita http(s) e data URL de imagem, rejeita outros esquemas e excessos", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const aceito = validateManualProductInput({
    ...validInput,
    imageRefs: ["https://cdn.exemplo.com/foto.jpg", png],
  });
  assert.deepEqual(aceito.imageRefs, ["https://cdn.exemplo.com/foto.jpg", png]);

  const invalidos = [
    "ftp://cdn.exemplo.com/foto.jpg",
    "javascript:alert(1)",
    "/uploads/local.png",
    "data:text/html;base64,PGI+aGk8L2I+",
    "data:image/png,sem-base64",
    "data:image/png;base64,###",
  ];
  for (const imageRef of invalidos) {
    assert.throws(
      () =>
        validateManualProductInput({ ...validInput, imageRefs: [imageRef] }),
      (error: unknown) => {
        assert.ok(error instanceof ProductValidationError);
        assert.equal(error.code, "VAL-IMAGE-INVALID");
        assert.ok(error.fieldErrors.imageRefs);
        return true;
      },
      `esperava VAL-IMAGE-INVALID para ${imageRef}`,
    );
  }

  const excesso = Array.from(
    { length: 7 },
    () => "https://cdn.exemplo.com/foto.jpg",
  );
  assert.throws(
    () => validateManualProductInput({ ...validInput, imageRefs: excesso }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-IMAGE-LIMIT");
      return true;
    },
  );

  const gigante = `data:image/png;base64,${"A".repeat(2_800_000)}`; // ~2,1 MB decodificados
  assert.throws(
    () => validateManualProductInput({ ...validInput, imageRefs: [gigante] }),
    (error: unknown) => {
      assert.ok(error instanceof ProductValidationError);
      assert.equal(error.code, "VAL-IMAGE-LIMIT");
      return true;
    },
  );
});

// —— Integração (banco) ——

const email = () => `slice002-${randomBytes(8).toString("hex")}@teste.local`;

async function tenantOf() {
  const token = await registerUser(email(), "senha-segura-123");
  const session = await resolveSession(token);
  assert.ok(session);
  // O provisioning do entitlement default é produção (registerUser/ADR-006); o teste só
  // garante o limite de configuração do runtime no tenant, como o .env faz em produção.
  const limit = Number(process.env.ENTITLEMENT_ACTIVE_PRODUCTS ?? 5);
  await prisma.tenantEntitlement.update({
    where: { tenantId: session.tenantId },
    data: { activeProductsLimit: limit },
  });
  return { token, tenantId: session.tenantId, userId: session.userId };
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
    priceCurrency: "R$",
    features: ["50 aulas", "certificado"],
    targetContentCount: 7,
    creatorPresence: "on_camera",
    constraints: "sem gírias",
    imageRefs: ["https://cdn.exemplo.com/produto.png"],
    url: "https://exemplo.com/produto",
  };
  const key = randomBytes(16).toString("base64url");

  const first = await handleCreateProduct(post(token, body, key));
  assert.equal(first.status, 200);
  const created = (await first.json()) as {
    id: string;
    version: number;
    replay: boolean;
  };
  assert.deepEqual(created, { id: created.id, version: 1, replay: false });

  const row = await prisma.product.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(row.tenantId, tenantId);
  assert.equal(row.targetContentCount, 7);
  const provenance = row.provenance;
  assert.ok(
    typeof provenance === "object" &&
      provenance !== null &&
      "origin" in provenance,
  );
  assert.equal(provenance.origin, "manual");
  assert.deepEqual(row.generationConstraints, {
    creatorPresence: "on_camera",
    constraints: "sem gírias",
  });
  assert.equal(row.priceCurrency, "R$");
  assert.deepEqual(row.images, ["https://cdn.exemplo.com/produto.png"]);
  assert.equal(row.submittedUrl, "https://exemplo.com/produto");

  const replayRes = await handleCreateProduct(post(token, body, key));
  assert.equal(replayRes.status, 200);
  const replayed = (await replayRes.json()) as {
    id: string;
    version: number;
    replay: boolean;
  };
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
  const payload = await Promise.all(
    results.map((res) => res.json() as Promise<{ id: string }>),
  );
  assert.equal(new Set(payload.map((item) => item.id)).size, 1);
  assert.equal(await prisma.product.count({ where: { tenantId } }), 1);
});

test("mesma chave em tenants diferentes não colide; listagem isola por tenant", async (t) => {
  if (!dbUp) return t.skip();
  const a = await tenantOf();
  const b = await tenantOf();
  const key = randomBytes(16).toString("base64url");

  const resA = await handleCreateProduct(
    post(a.token, { ...validInput, name: "Produto A" }, key),
  );
  const resB = await handleCreateProduct(
    post(b.token, { ...validInput, name: "Produto B" }, key),
  );
  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);
  const idA = ((await resA.json()) as { id: string }).id;
  const idB = ((await resB.json()) as { id: string }).id;
  assert.notEqual(idA, idB);

  const listA = await handleListProducts(get(a.token));
  assert.equal(listA.status, 200);
  const viewA = (await listA.json()) as {
    products: Array<Record<string, unknown>>;
  };
  assert.equal(viewA.products.length, 1);
  assert.equal(viewA.products[0]!.id, idA);
  assert.equal(viewA.products[0]!.name, "Produto A");

  const listB = await handleListProducts(get(b.token));
  const viewB = (await listB.json()) as { products: Array<{ id: string }> };
  assert.deepEqual(
    viewB.products.map((product) => product.id),
    [idB],
  );
});

test("GET sem sessão responde 401 AUTH-SESSION; validação via API devolve fieldErrors", async (t) => {
  if (!dbUp) return t.skip();
  const unauthorized = await handleListProducts(
    new Request(`${ORIGIN}/api/products`),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(
    ((await unauthorized.json()) as { code?: string }).code,
    "AUTH-SESSION",
  );

  const { token } = await tenantOf();
  const invalid = await handleCreateProduct(
    post(
      token,
      { description: "sem nome" },
      randomBytes(16).toString("base64url"),
    ),
  );
  assert.equal(invalid.status, 400);
  const body = (await invalid.json()) as {
    code?: string;
    fieldErrors?: Record<string, string>;
  };
  assert.equal(body.code, "VAL-NAME-REQUIRED");
  assert.ok(body.fieldErrors?.name);
});

const getById = (token: string, id: string) =>
  new Request(`${ORIGIN}/api/products/${id}`, {
    method: "GET",
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });

const patch = (token: string, id: string, body: unknown) =>
  new Request(`${ORIGIN}/api/products/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      cookie: `${SESSION_COOKIE}=${token}`,
    },
    body: JSON.stringify(body),
  });

const del = (token: string, id: string) =>
  new Request(`${ORIGIN}/api/products/${id}`, {
    method: "DELETE",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      cookie: `${SESSION_COOKIE}=${token}`,
    },
  });

const archive = (token: string, id: string) =>
  new Request(`${ORIGIN}/api/products/${id}/archive`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      cookie: `${SESSION_COOKIE}=${token}`,
    },
  });

const reactivate = (token: string, id: string) =>
  new Request(`${ORIGIN}/api/products/${id}/reactivate`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      cookie: `${SESSION_COOKIE}=${token}`,
    },
  });

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const updateFacts = {
  name: "Curso de Excel Avançado",
  description: "Curso atualizado com módulos novos",
  category: "Educação",
  price: "199,90",
  priceCurrency: "USD",
  features: ["120 aulas"],
  imageRefs: ["https://cdn.exemplo.com/nova.png", PNG],
  url: "https://exemplo.com/produto-atualizado",
  targetContentCount: 5,
  creatorPresence: "hands_only_product",
  constraints: "mostrar detalhes",
};

async function criarProduct(token: string) {
  const res = await handleCreateProduct(
    post(token, validInput, randomBytes(16).toString("base64url")),
  );
  assert.equal(res.status, 200);
  return (await res.json()) as { id: string; version: number };
}

test("GET por id retorna o Product do tenant com moeda; inexistente responde 404", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const created = await criarProduct(token);

  const res = await handleGetProduct(getById(token, created.id), created.id);
  assert.equal(res.status, 200);
  const view = (await res.json()) as Record<string, unknown>;
  assert.equal(view.id, created.id);
  assert.equal(view.version, 1);
  assert.equal(view.price, "29.9");
  assert.equal(view.priceCurrency, "R$");
  assert.deepEqual(view.features, ["50 aulas", "certificado"]);

  const missing = await handleGetProduct(
    getById(token, randomUUID()),
    String(randomUUID()),
  );
  assert.equal(missing.status, 404);
  assert.equal(
    ((await missing.json()) as { code?: string }).code,
    "PRODUCT-NOT-FOUND",
  );
  assert.equal(await prisma.product.count({ where: { tenantId } }), 1);
});

test("discountPercentage: POST persiste, GET expõe, PATCH atualiza e vazio limpa; ausente permanece null", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();

  // Compatibilidade: produto criado sem desconto projeta null.
  const semDesconto = await criarProduct(token);
  const viewSem = (await handleGetProduct(getById(token, semDesconto.id), semDesconto.id).then((r) => r.json())) as { discountPercentage: string | null };
  assert.equal(viewSem.discountPercentage, null);

  // POST com desconto factual persiste e GET expõe o valor normalizado.
  const resPost = await handleCreateProduct(
    post(
      token,
      { ...validInput, discountPercentage: "25,5" },
      randomBytes(16).toString("base64url"),
    ),
  );
  assert.equal(resPost.status, 200);
  const criado = (await resPost.json()) as { id: string };
  const row = await prisma.product.findUniqueOrThrow({ where: { id: criado.id } });
  assert.equal(row.discountPercentage?.toString(), "25.5");
  const viewPost = (await handleGetProduct(getById(token, criado.id), criado.id).then((r) => r.json())) as { discountPercentage: string | null };
  assert.equal(viewPost.discountPercentage, "25.5");

  // PATCH atualiza o desconto (mesmo contrato de fatos do POST).
  const resPatch = await handleUpdateProduct(
    patch(token, semDesconto.id, {
      ...validInput,
      discountPercentage: "10",
      expectedVersion: semDesconto.version,
    }),
    semDesconto.id,
  );
  assert.equal(resPatch.status, 200);
  const atualizado = (await resPatch.json()) as { version: number };
  const rowPatch = await prisma.product.findUniqueOrThrow({ where: { id: semDesconto.id } });
  assert.equal(rowPatch.discountPercentage?.toString(), "10");

  // PATCH sem o campo limpa o desconto (fatos são substituídos por completo).
  const resLimpa = await handleUpdateProduct(
    patch(token, semDesconto.id, {
      ...validInput,
      expectedVersion: atualizado.version,
    }),
    semDesconto.id,
  );
  assert.equal(resLimpa.status, 200);
  const rowLimpo = await prisma.product.findUniqueOrThrow({ where: { id: semDesconto.id } });
  assert.equal(rowLimpo.discountPercentage, null);
  assert.equal(await prisma.product.count({ where: { tenantId } }), 2);
});

test("GET/PATCH/DELETE de outro tenant responde 404 sem vazar o Product", async (t) => {
  if (!dbUp) return t.skip();
  const dona = await tenantOf();
  const intrusa = await tenantOf();
  const created = await criarProduct(dona.token);
  const corpo = { ...updateFacts, expectedVersion: created.version };

  const resGet = await handleGetProduct(
    getById(intrusa.token, created.id),
    created.id,
  );
  assert.equal(resGet.status, 404);
  assert.equal(
    ((await resGet.json()) as { code?: string }).code,
    "PRODUCT-NOT-FOUND",
  );

  const resPatch = await handleUpdateProduct(
    patch(intrusa.token, created.id, corpo),
    created.id,
  );
  assert.equal(resPatch.status, 404);
  assert.equal(
    ((await resPatch.json()) as { code?: string }).code,
    "PRODUCT-NOT-FOUND",
  );

  const resDel = await handleDeleteProduct(
    del(intrusa.token, created.id),
    created.id,
  );
  assert.equal(resDel.status, 404);
  assert.equal(
    ((await resDel.json()) as { code?: string }).code,
    "PRODUCT-NOT-FOUND",
  );
  const resArchive = await handleArchiveProduct(
    archive(intrusa.token, created.id),
    created.id,
  );
  assert.equal(resArchive.status, 404);
  assert.equal(
    ((await resArchive.json()) as { code?: string }).code,
    "PRODUCT-NOT-FOUND",
  );

  assert.equal(
    await prisma.product.count({ where: { tenantId: dona.tenantId } }),
    1,
  );
  assert.equal(
    await prisma.product.count({ where: { tenantId: intrusa.tenantId } }),
    0,
  );
});

test("PATCH atualiza fatos, persiste imagens por URL/data URL e bumpeia version", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const created = await criarProduct(token);

  const res = await handleUpdateProduct(
    patch(token, created.id, {
      ...updateFacts,
      expectedVersion: created.version,
    }),
    created.id,
  );
  assert.equal(res.status, 200);
  const saved = (await res.json()) as { id: string; version: number };
  assert.equal(saved.id, created.id);
  assert.equal(saved.version, created.version + 1);

  const row = await prisma.product.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(row.name, "Curso de Excel Avançado");
  assert.equal(row.priceAmount?.toString(), "199.9");
  assert.deepEqual(row.images, ["https://cdn.exemplo.com/nova.png", PNG]);
  assert.equal(row.submittedUrl, "https://exemplo.com/produto-atualizado");
  assert.equal(row.targetContentCount, 5);
  assert.deepEqual(row.generationConstraints, {
    creatorPresence: "either",
    constraints: "sem gírias",
  });

  const view = (await (
    await handleGetProduct(getById(token, created.id), created.id)
  ).json()) as Record<string, unknown>;
  assert.equal(view.version, saved.version);
  assert.equal(view.priceCurrency, "USD");
  assert.deepEqual(view.imageRefs, ["https://cdn.exemplo.com/nova.png", PNG]);

  // Mesmas validações obrigatórias do POST: preço vazio é rejeitado com fieldErrors.
  const invalida = await handleUpdateProduct(
    patch(token, created.id, {
      ...updateFacts,
      price: "",
      expectedVersion: saved.version,
    }),
    created.id,
  );
  assert.equal(invalida.status, 400);
  const erro = (await invalida.json()) as {
    code?: string;
    fieldErrors?: Record<string, string>;
  };
  assert.equal(erro.code, "VAL-PRICE-REQUIRED");
  assert.ok(erro.fieldErrors?.price);
});

test("PATCH com expectedVersion desatualizada responde 409 VERSION-CONFLICT", async (t) => {
  if (!dbUp) return t.skip();
  const { token } = await tenantOf();
  const created = await criarProduct(token);

  const primeira = await handleUpdateProduct(
    patch(token, created.id, {
      ...updateFacts,
      expectedVersion: created.version,
    }),
    created.id,
  );
  assert.equal(primeira.status, 200);

  const conflito = await handleUpdateProduct(
    patch(token, created.id, {
      ...updateFacts,
      expectedVersion: created.version,
    }),
    created.id,
  );
  assert.equal(conflito.status, 409);
  assert.equal(
    ((await conflito.json()) as { code?: string }).code,
    "VERSION-CONFLICT",
  );
});

// Grafo completo de histórico: job → run/understanding/snapshot/reserva e
// strategy → plan → opportunity → content → brief (ciclo currentBrief) + report.
async function seedHistory(tenantId: string, userId: string, productId: string) {
  const job = await prisma.commerceIntelligenceJob.create({
    data: {
      tenantId,
      userId,
      productId,
      idempotencyKey: randomBytes(16).toString("base64url"),
      fingerprint: "delete-bigbang",
      targetContentCount: 1,
      generatedContentsMonth: monthUtc(),
      status: "SUCCEEDED",
    },
  });
  await prisma.intelligenceRun.create({ data: { tenantId, jobId: job.id, productId, engineVersion: "v1", platformSkillVersion: "tiktok-commerce@1.0" } });
  await prisma.productUnderstanding.create({ data: { tenantId, productId, jobId: job.id, payload: {} } });
  await prisma.generationUsageReservation.create({ data: { tenantId, jobId: job.id, generatedContentsMonth: monthUtc(), quantity: 1 } });
  await prisma.productMemorySnapshot.create({ data: { tenantId, productId, sourceJobId: job.id, signals: {} } });
  const strategy = await prisma.productStrategy.create({ data: { tenantId, productId, jobId: job.id, platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", payload: {} } });
  const plan = await prisma.contentPlan.create({ data: { tenantId, productId, jobId: job.id, strategyId: strategy.id, strategyVersion: 1, targetContentCount: 1, platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.0", payload: {} } });
  const opportunity = await prisma.contentOpportunity.create({ data: { tenantId, productId, planId: plan.id, jobId: job.id, position: 1, commercialObjective: "CONVERSION", angle: "ângulo", coreMessage: "mensagem", hookMechanism: "gancho", noveltyTargets: [], payload: {} } });
  const content = await prisma.content.create({ data: { tenantId, productId, jobId: job.id, planId: plan.id, opportunityId: opportunity.id, position: 1, payload: {} } });
  const brief = await prisma.contentBriefVersion.create({ data: { tenantId, productId, jobId: job.id, contentId: content.id, payload: {} } });
  // Ciclo: Content.currentBriefVersionId → ContentBriefVersion.
  await prisma.content.update({ where: { tenantId_id: { tenantId, id: content.id } }, data: { currentBriefVersionId: brief.id } });
  await prisma.briefValidationReport.create({ data: { tenantId, jobId: job.id, productId, contentId: content.id, briefVersionId: brief.id, briefId: `${content.id}:${brief.id}`, factualStatus: "SUPPORTED", structuralStatus: "PASS", platformStatus: "PASS", varietyStatus: "PASS", decision: "PASS", issues: [] } });
  return job;
}

// [product, job, run, understanding, strategy, plan, opportunity, content, brief, report, snapshot, reservation]
function historyCounts(tenantId: string, productId: string): Promise<number[]> {
  return Promise.all([
    prisma.product.count({ where: { tenantId, id: productId } }),
    prisma.commerceIntelligenceJob.count({ where: { tenantId, productId } }),
    prisma.intelligenceRun.count({ where: { tenantId, productId } }),
    prisma.productUnderstanding.count({ where: { tenantId, productId } }),
    prisma.productStrategy.count({ where: { tenantId, productId } }),
    prisma.contentPlan.count({ where: { tenantId, productId } }),
    prisma.contentOpportunity.count({ where: { tenantId, productId } }),
    prisma.content.count({ where: { tenantId, productId } }),
    prisma.contentBriefVersion.count({ where: { tenantId, productId } }),
    prisma.briefValidationReport.count({ where: { tenantId, productId } }),
    prisma.productMemorySnapshot.count({ where: { tenantId, productId } }),
    prisma.generationUsageReservation.count({ where: { tenantId, job: { productId } } }),
  ]);
}

test("DELETE Big Bang exclui Product e TODO o histórico relacionado em transação", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId, userId } = await tenantOf();
  const semHistorico = await criarProduct(token);
  const res = await handleDeleteProduct(del(token, semHistorico.id), semHistorico.id);
  assert.equal(res.status, 204);
  assert.equal(
    await prisma.product.count({ where: { tenantId, id: semHistorico.id } }),
    0,
  );

  const url = "https://exemplo.com/produto";
  const resAlvo = await handleCreateProduct(
    post(token, { ...validInput, url }, randomBytes(16).toString("base64url")),
  );
  assert.equal(resAlvo.status, 200);
  const alvo = (await resAlvo.json()) as { id: string };
  await seedHistory(tenantId, userId, alvo.id);
  // Attempt não tem FK productId: vínculo é pela URL submetida/origem.
  await prisma.productImportAttempt.createMany({
    data: [
      { tenantId, status: "SUCCEEDED", submittedUrl: url },
      { tenantId, status: "FAILED", submittedUrl: "https://outro.com/y" },
    ],
  });

  const resHistorico = await handleDeleteProduct(del(token, alvo.id), alvo.id);
  assert.equal(resHistorico.status, 204);
  assert.deepEqual(
    await historyCounts(tenantId, alvo.id),
    Array(12).fill(0),
    "nada do histórico sobrevive ao Big Bang",
  );
  assert.equal(
    await prisma.productImportAttempt.count({ where: { tenantId, submittedUrl: url } }),
    0,
    "attempt vinculada pela URL do Product é apagada",
  );
  assert.equal(
    await prisma.productImportAttempt.count({ where: { tenantId, submittedUrl: "https://outro.com/y" } }),
    1,
    "attempt de outra URL no mesmo tenant sobrevive",
  );
});

test("DELETE Big Bang é isolado por tenant: mesma URL e histórico do outro tenant sobrevivem", async (t) => {
  if (!dbUp) return t.skip();
  const dona = await tenantOf();
  const vizinha = await tenantOf();
  const url = "https://exemplo.com/compartilhada";
  const criar = async (tenant: { token: string; tenantId: string; userId: string }) => {
    const res = await handleCreateProduct(
      post(tenant.token, { ...validInput, url }, randomBytes(16).toString("base64url")),
    );
    assert.equal(res.status, 200);
    const { id } = (await res.json()) as { id: string };
    await seedHistory(tenant.tenantId, tenant.userId, id);
    await prisma.productImportAttempt.create({ data: { tenantId: tenant.tenantId, status: "SUCCEEDED", submittedUrl: url } });
    return id;
  };
  const idA = await criar(dona);
  const idB = await criar(vizinha);

  const res = await handleDeleteProduct(del(dona.token, idA), idA);
  assert.equal(res.status, 204);
  assert.deepEqual(await historyCounts(dona.tenantId, idA), Array(12).fill(0));
  assert.equal(
    await prisma.productImportAttempt.count({ where: { tenantId: dona.tenantId } }),
    0,
  );
  // Tenant vizinho intocado: Product "gêmeo", mesma URL e mesmo grafo de histórico.
  assert.deepEqual(await historyCounts(vizinha.tenantId, idB), Array(12).fill(1));
  assert.equal(
    await prisma.productImportAttempt.count({ where: { tenantId: vizinha.tenantId, submittedUrl: url } }),
    1,
  );
});

test("Falha dentro da transação faz rollback: nenhum dado é apagado parcialmente", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId, userId } = await tenantOf();
  const created = await criarProduct(token);
  await seedHistory(tenantId, userId, created.id);
  await prisma.productImportAttempt.create({ data: { tenantId, status: "SUCCEEDED", submittedUrl: "https://exemplo.com/produto" } });

  // Conexão externa segura a linha do Product com timeout próprio maior: o
  // DELETE final da exclusão bloqueia, a transação interativa do Prisma (5s
  // default) estoura primeiro e força o rollback de tudo.
  const lock = new PrismaClient();
  try {
    const trava = lock.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT id FROM products WHERE id = ${created.id} FOR UPDATE`;
        await new Promise((resolve) => setTimeout(resolve, 7_000));
      },
      { timeout: 15_000 },
    );
    // Garante a trava adquirida antes de iniciar a exclusão.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await assert.rejects(() => deleteTenantProduct(tenantId, created.id));
    await trava;
  } finally {
    await lock.$disconnect();
  }
  assert.deepEqual(
    await historyCounts(tenantId, created.id),
    Array(12).fill(1),
    "rollback restaura o grafo inteiro",
  );
  assert.equal(
    await prisma.productImportAttempt.count({ where: { tenantId } }),
    1,
    "rollback restaura as attempts",
  );
});

test("DELETE não bloqueia job RUNNING: exclusão prossegue e o worker falha sem erro (fencing)", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId, userId } = await tenantOf();
  const created = await criarProduct(token);
  const job = await prisma.commerceIntelligenceJob.create({
    data: {
      tenantId,
      userId,
      productId: created.id,
      idempotencyKey: randomBytes(16).toString("base64url"),
      fingerprint: "delete-running",
      targetContentCount: 1,
      generatedContentsMonth: monthUtc(),
      status: "RUNNING",
      leaseOwnerId: "worker-test",
      leaseDeadlineAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.generationUsageReservation.create({ data: { tenantId, jobId: job.id, generatedContentsMonth: monthUtc(), quantity: 1 } });

  // Sem bloqueio por precaução: a exclusão Big Bang prossegue com o job RUNNING.
  const res = await handleDeleteProduct(del(token, created.id), created.id);
  assert.equal(res.status, 204);
  assert.deepEqual(await historyCounts(tenantId, created.id), Array(12).fill(0));

  // Worker chega depois: fencing condicional resolve com 0 linhas, sem erro.
  await assert.doesNotReject(() =>
    failJobAndReleaseReservation(job.id, "GEN-PROVIDER", "worker-test"),
  );
});

test("POST archive arquiva sem apagar dados; repetição é replay e preserva version", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const created = await criarProduct(token);

  const res = await handleArchiveProduct(
    archive(token, created.id),
    created.id,
  );
  assert.equal(res.status, 200);
  // ADR-016: contrato mínimo de mutação { id, version } — sem projeção de leitura.
  assert.deepEqual(await res.json(), {
    id: created.id,
    version: created.version + 1,
  });

  // Sem delete: a linha persiste com lifecycle ARCHIVED.
  const row = await prisma.product.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(row.lifecycle, "ARCHIVED");
  assert.equal(await prisma.product.count({ where: { tenantId } }), 1);

  // Dados preservados: GET continua retornando o Product, agora inativo.
  const depois = await handleGetProduct(getById(token, created.id), created.id);
  assert.equal(depois.status, 200);
  const viewDepois = (await depois.json()) as Record<string, unknown>;
  assert.equal(viewDepois.active, false);

  // Idempotência: repetição devolve 200 sem bumpear version.
  const replay = await handleArchiveProduct(
    archive(token, created.id),
    created.id,
  );
  assert.equal(replay.status, 200);
  const viewReplay = (await replay.json()) as Record<string, unknown>;
  assert.deepEqual(viewReplay, {
    id: created.id,
    version: created.version + 1,
  });
});

test("archives concorrentes resolvem em replay único, com um só bump de version", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const created = await criarProduct(token);

  const resultados = await Promise.all([
    archiveTenantProduct(tenantId, created.id),
    archiveTenantProduct(tenantId, created.id),
    archiveTenantProduct(tenantId, created.id),
  ]);
  for (const product of resultados) {
    assert.equal(product.lifecycle, "ARCHIVED");
    assert.equal(product.id, created.id);
  }
  const row = await prisma.product.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(row.lifecycle, "ARCHIVED");
  assert.equal(row.version, created.version + 1);
});

test("archive de Product removido no meio responde ProductNotFoundError", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const created = await criarProduct(token);
  await prisma.product.delete({ where: { id: created.id } });

  await assert.rejects(
    () => archiveTenantProduct(tenantId, created.id),
    ProductNotFoundError,
  );
});

test("POST reactivate reverte archive; repetição é replay e outro tenant responde 404", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const intrusa = await tenantOf();
  const created = await criarProduct(token);

  const arquivado = await handleArchiveProduct(
    archive(token, created.id),
    created.id,
  );
  assert.equal(arquivado.status, 200);

  const res = await handleReactivateProduct(
    reactivate(token, created.id),
    created.id,
  );
  assert.equal(res.status, 200);
  // ADR-016: reactivate também responde só { id, version }; a projeção volta pelo GET.
  assert.deepEqual(await res.json(), {
    id: created.id,
    version: created.version + 2,
  });

  const row = await prisma.product.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(row.lifecycle, "ACTIVE");
  assert.equal(await prisma.product.count({ where: { tenantId } }), 1);

  // Idempotência: reagir um Product ativo dá replay sem bumpear version.
  const replay = await handleReactivateProduct(
    reactivate(token, created.id),
    created.id,
  );
  assert.equal(replay.status, 200);
  const viewReplay = (await replay.json()) as Record<string, unknown>;
  assert.deepEqual(viewReplay, {
    id: created.id,
    version: created.version + 2,
  });

  // Tenant estrangeiro não reativa: 404 sem vazar existência.
  const proibido = await handleReactivateProduct(
    reactivate(intrusa.token, created.id),
    created.id,
  );
  assert.equal(proibido.status, 404);
  assert.equal(
    ((await proibido.json()) as { code?: string }).code,
    "PRODUCT-NOT-FOUND",
  );
});

test("reactivates concorrentes resolvem em replay único, com um só bump de version", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId } = await tenantOf();
  const created = await criarProduct(token);
  await archiveTenantProduct(tenantId, created.id);

  const resultados = await Promise.all([
    reactivateTenantProduct(tenantId, created.id),
    reactivateTenantProduct(tenantId, created.id),
  ]);
  for (const product of resultados) {
    assert.equal(product.lifecycle, "ACTIVE");
    assert.equal(product.id, created.id);
  }
  const row = await prisma.product.findUniqueOrThrow({
    where: { id: created.id },
  });
  assert.equal(row.lifecycle, "ACTIVE");
  // archive (+1) e exatamente um reactivate (+1).
  assert.equal(row.version, created.version + 2);
});

// —— ADR-016: projection server-authoritative da ação de geração nas leituras autenticadas ——

async function withEnv<T>(
  vars: Record<string, string>,
  run: () => Promise<T>,
): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) saved[key] = process.env[key];
  Object.assign(process.env, vars);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const AVAILABLE = { state: "AVAILABLE", reason: null, nextAction: null };

test("ActiveProductView traz generationAction AVAILABLE completo; ArchivedProductView o omite (GET e listagem)", async (t) => {
  if (!dbUp) return t.skip();
  const { token } = await tenantOf();
  const created = await criarProduct(token);
  await withEnv({ GENERATED_CONTENTS_MONTH_LIMIT: "100" }, async () => {
    const view = (await (
      await handleGetProduct(getById(token, created.id), created.id)
    ).json()) as Record<string, unknown>;
    assert.deepEqual(view.generationAction, AVAILABLE);
    assert.deepEqual(Object.keys(view.generationAction as object).sort(), [
      "nextAction",
      "reason",
      "state",
    ]);

    // Mutação: contrato mínimo { id, version }, sem projeção (UI refaz GET após commit).
    const arq = await handleArchiveProduct(
      archive(token, created.id),
      created.id,
    );
    assert.equal(arq.status, 200);
    assert.deepEqual(await arq.json(), {
      id: created.id,
      version: created.version + 1,
    });

    const archived = (await (
      await handleGetProduct(getById(token, created.id), created.id)
    ).json()) as Record<string, unknown>;
    assert.equal(
      "generationAction" in archived,
      false,
      "ArchivedProductView omite o campo",
    );

    const b = await criarProduct(token);
    const list = (await (await handleListProducts(get(token))).json()) as {
      products: Array<Record<string, unknown>>;
    };
    const inList = (id: string) => list.products.find((p) => p.id === id);
    assert.deepEqual(inList(b.id)?.generationAction, AVAILABLE);
    assert.equal("generationAction" in (inList(created.id) ?? {}), false);
  });
});

test("Job QUEUED do usuário bloqueia a leitura com GEN-ACTIVE/VIEW_ACTIVE_ANALYSIS, sem vazar IDs", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId, userId } = await tenantOf();
  const a = await criarProduct(token);
  const b = await criarProduct(token);
  await withEnv({ GENERATED_CONTENTS_MONTH_LIMIT: "100" }, async () => {
    const job = await prisma.commerceIntelligenceJob.create({
      data: {
        tenantId,
        userId,
        productId: a.id,
        idempotencyKey: randomBytes(16).toString("base64url"),
        fingerprint: "adr016",
        targetContentCount: 1,
        generatedContentsMonth: monthUtc(),
        status: "QUEUED",
      },
    });
    for (const id of [a.id, b.id]) {
      const view = (await (
        await handleGetProduct(getById(token, id), id)
      ).json()) as Record<string, unknown>;
      assert.deepEqual(view.generationAction, {
        state: "BLOCKED",
        reason: "GEN-ACTIVE",
        nextAction: "VIEW_ACTIVE_ANALYSIS",
      });
    }
    const serialized = JSON.stringify(
      await (await handleListProducts(get(token))).json(),
    );
    assert.equal(
      serialized.includes(job.id),
      false,
      "nenhum ID de Job no payload",
    );
  });
});

test("reserva do mês consome a projeção: GEN-CAPACITY/WAIT_FOR_CAPACITY sem folga, AVAILABLE com folga", async (t) => {
  if (!dbUp) return t.skip();
  const { token, tenantId, userId } = await tenantOf();
  const created = await criarProduct(token);
  const month = monthUtc();
  const job = await prisma.commerceIntelligenceJob.create({
    data: {
      tenantId,
      userId,
      productId: created.id,
      idempotencyKey: randomBytes(16).toString("base64url"),
      fingerprint: "adr016-cap",
      targetContentCount: 30,
      generatedContentsMonth: month,
      status: "FAILED",
    },
  });
  await prisma.generationUsageReservation.create({
    data: {
      tenantId,
      jobId: job.id,
      generatedContentsMonth: month,
      quantity: 100,
      status: "CONFIRMED",
    },
  });
  const read = async () =>
    (
      (await (
        await handleGetProduct(getById(token, created.id), created.id)
      ).json()) as Record<string, unknown>
    ).generationAction;
  await withEnv({ GENERATED_CONTENTS_MONTH_LIMIT: "100" }, async () => {
    assert.deepEqual(await read(), {
      state: "BLOCKED",
      reason: "GEN-CAPACITY",
      nextAction: "WAIT_FOR_CAPACITY",
    });
    const serialized = JSON.stringify(
      await (await handleListProducts(get(token))).json(),
    );
    for (const leak of [
      "generatedContentsMonth",
      "quantity",
      "activeProducts",
      "limit",
    ]) {
      assert.equal(
        serialized.includes(leak),
        false,
        `payload não deve conter ${leak}`,
      );
    }
  });
  // Limiar da projeção: com exatamente 1 de folga mensal ela ainda é AVAILABLE.
  await prisma.generationUsageReservation.update({
    where: { jobId: job.id },
    data: { quantity: 99 },
  });
  await withEnv({ GENERATED_CONTENTS_MONTH_LIMIT: "100" }, async () => {
    assert.deepEqual(await read(), AVAILABLE);
  });
});
