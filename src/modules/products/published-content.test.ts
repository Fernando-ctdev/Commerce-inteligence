// Testes puros do contrato de conteúdo publicado (Slice 013, Task 1): join
// determinístico sourceId↔product_id↔item_id, fail-closed de fixtures inválidas,
// paginação local e allowlist de playback — sem banco, sem rede, sem teste.json.
// Executar: npx tsx --test src/modules/products/published-content.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import type { LinkedContentsResponse } from "./published-content-contract.js";
import {
  PUBLISHED_VIDEO_ANALYTICS_PAGES,
  PUBLISHED_VIDEO_ITEM_ASSOCIATIONS,
  type PublishedVideoAnalyticsPageFixture,
  type PublishedVideoItemAssociationFixture,
} from "./published-content-fixtures.js";
import {
  PublishedContentFixtureError,
  buildLinkedContents,
} from "./published-content.js";

const ITEM_A = "7685499159243230472"; // ↔ Product 1736673359055521380 (Vitrine)
const ITEM_B = "7685773833734819090"; // ↔ Product 1733261213619029438 (Vitrine)
const PRODUCT_A = "1736673359055521380";
const PRODUCT_B = "1733261213619029438";

const analyticsItem = (itemId: string) =>
  PUBLISHED_VIDEO_ANALYTICS_PAGES
    .flatMap((page) => page.items)
    .find((item) => item.item_id === itemId)!;

const injected = (
  analytics: PublishedVideoAnalyticsPageFixture[],
  associations: PublishedVideoItemAssociationFixture[],
) => ({ analytics, associations });

const onePage = (items: PublishedVideoAnalyticsPageFixture["items"]) => [
  { page: 1, pageSize: items.length, total: items.length, hasMore: false, items },
];

test("join usa sourceId do Product, product_id da associação e item_id da analytics", () => {
  const response = buildLinkedContents(
    { id: "p-local", provenance: { sourceId: PRODUCT_A } },
    1,
    20,
  );

  assert.deepEqual(
    response.videos.map((video) => video.itemId),
    [ITEM_A],
  );
  assert.equal(response.externalProductId, PRODUCT_A);
  assert.equal(response.total, 1);
  assert.equal(response.productId, "p-local");
  assert.equal(response.hasMore, false);
  // Products da Vitrine vêm do allowlist reutilizado, sem duplicar os 20 itens.
  assert.equal(response.showcaseProduct?.externalProductId, PRODUCT_A);
});

test("Product sem sourceId (ou provenance inválida) retorna coleção vazia", () => {
  for (const provenance of [
    {},
    { sourceId: "" },
    { sourceId: 42 },
    "texto",
    null,
    undefined,
  ]) {
    const response = buildLinkedContents(
      { id: "p-local", provenance },
      1,
      20,
    );
    assert.deepEqual(response.videos, []);
    assert.equal(response.total, 0);
    assert.equal(response.hasMore, false);
    assert.equal(response.externalProductId, "");
    assert.equal(response.showcaseProduct, undefined);
  }
});

test("associação many-to-many: mesmo vídeo serve Product distintos com productIds distintos e ordenados", () => {
  const item = analyticsItem(ITEM_A);
  const source = injected(
    onePage([item]),
    [
      { item_id: ITEM_A, product_id: PRODUCT_B },
      { item_id: ITEM_A, product_id: PRODUCT_A },
    ],
  );

  for (const sourceId of [PRODUCT_A, PRODUCT_B]) {
    const response = buildLinkedContents(
      { id: "p-local", provenance: { sourceId } },
      1,
      20,
      source,
    );
    assert.equal(response.total, 1);
    assert.deepEqual(response.videos[0]!.productIds, [PRODUCT_A, PRODUCT_B].sort());
  }
});

test("associação duplicada falha fechada com erro identificável", () => {
  assert.throws(
    () =>
      buildLinkedContents(
        { id: "p-local", provenance: { sourceId: PRODUCT_A } },
        1,
        20,
        injected(onePage([analyticsItem(ITEM_A)]), [
          { item_id: ITEM_A, product_id: PRODUCT_A },
          { item_id: ITEM_A, product_id: PRODUCT_A },
        ]),
      ),
    (error: unknown) => error instanceof PublishedContentFixtureError,
  );
});

test("associação sem analytics correspondente falha fechada", () => {
  assert.throws(
    () =>
      buildLinkedContents(
        { id: "p-local", provenance: { sourceId: PRODUCT_A } },
        1,
        20,
        injected(onePage([analyticsItem(ITEM_A)]), [
          { item_id: "item-inexistente", product_id: PRODUCT_A },
        ]),
      ),
    (error: unknown) => error instanceof PublishedContentFixtureError,
  );
});

test("ordem da fixture é preservada no recorte por página", () => {
  const primeira = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    1,
    5,
  );
  const segunda = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    2,
    5,
  );
  // Product A só enxerga o vídeo associado a ele; a ordem vem da fixture.
  assert.deepEqual(primeira.videos.map((video) => video.itemId), [ITEM_A]);
  assert.deepEqual(segunda.videos.map((video) => video.itemId), []);
  const todosOsIds = PUBLISHED_VIDEO_ANALYTICS_PAGES.flatMap((page) =>
    page.items.map((item) => item.item_id),
  );
  assert.equal(todosOsIds.length, 10);
  assert.equal(new Set(todosOsIds).size, 10);
});

test("total é o número de vídeos distintos antes do recorte", () => {
  const itemA = analyticsItem(ITEM_A);
  const itemB = analyticsItem(ITEM_B);
  const source = injected(
    onePage([itemA, itemB]),
    [
      { item_id: ITEM_A, product_id: PRODUCT_A },
      { item_id: ITEM_B, product_id: PRODUCT_A },
    ],
  );
  const response = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    1,
    1,
    source,
  );
  assert.equal(response.total, 2);
  assert.equal(response.videos.length, 1);
  assert.equal(response.hasMore, true);
});

test("página além do fim retorna vazio mantendo total e hasMore falsos", () => {
  const response = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    9,
    5,
  );
  assert.deepEqual(response.videos, []);
  assert.equal(response.total, 1);
  assert.equal(response.hasMore, false);
});

test("projectVideo descarta chaves desconhecidas e só projeta o contrato", () => {
  const response = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    1,
    20,
  );
  const video = response.videos[0]!;
  assert.deepEqual(Object.keys(video).sort(), [
    "business",
    "fallbackPlaybackUrl",
    "itemId",
    "metrics",
    "playbackUrl",
    "productIds",
    "publishedAt",
    "title",
  ]);
  // post_url assinado nunca vira coverUrl; sem cover na fixture, o campo fica ausente.
  assert.equal("coverUrl" in video, false);
  assert.ok(video.playbackUrl!.startsWith("https://"));
  assert.equal(new URL(video.playbackUrl!).hostname.endsWith(".tiktokcdn.com"), true);
});

test("playback fora do allowlist de host é descartado sem erro, backup válido permanece", () => {
  const item = analyticsItem(ITEM_A);
  const source = injected(
    onePage([
      {
        ...item,
        main_url: "https://cdn.evil.example/video.mp4?assinatura=secreta",
      },
    ]),
    [{ item_id: ITEM_A, product_id: PRODUCT_A }],
  );
  const response = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    1,
    20,
    source,
  );
  const video = response.videos[0]!;
  assert.equal(video.playbackUrl, undefined);
  assert.equal(
    new URL(video.fallbackPlaybackUrl!).hostname.endsWith(".tiktokcdn.com"),
    true,
  );
});

test("página ou pageSize inválidos falham fechada com erro identificável", () => {
  for (const [page, pageSize] of [
    [0, 20],
    [-1, 20],
    [1, 0],
    [1.5, 20],
    [1, Number.NaN],
  ]) {
    assert.throws(
      () =>
        buildLinkedContents(
          { id: "p", provenance: { sourceId: PRODUCT_A } },
          page,
          pageSize,
        ),
      (error: unknown) => error instanceof PublishedContentFixtureError,
    );
  }
});

test("fixture padrão é coerente: páginas contíguas, total distinto e associação dentro da analytics", () => {
  const flat = PUBLISHED_VIDEO_ANALYTICS_PAGES.flatMap((page) => page.items);
  assert.equal(flat.length, 10);
  assert.deepEqual(
    PUBLISHED_VIDEO_ANALYTICS_PAGES.map((page) => page.page),
    [1, 2],
  );
  assert.equal(
    PUBLISHED_VIDEO_ANALYTICS_PAGES[PUBLISHED_VIDEO_ANALYTICS_PAGES.length - 1]!
      .hasMore,
    false,
  );
  const ids = new Set(flat.map((item) => item.item_id));
  assert.ok(
    PUBLISHED_VIDEO_ITEM_ASSOCIATIONS.every((edge) => ids.has(edge.item_id)),
  );
  // O join sobre a fixture padrão não lança: integridade validada antes do recorte.
  const response: LinkedContentsResponse = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_B } },
    1,
    20,
  );
  assert.deepEqual(response.videos.map((video) => video.itemId), [ITEM_B]);
});

// —— Regressões da revisão (Task 1, REQUEST_CHANGES) ——

test("item_id repetido entre páginas da analytics falha fechado (global)", () => {
  const item = analyticsItem(ITEM_A);
  const source = injected(
    [
      { page: 1, pageSize: 1, total: 2, hasMore: true, items: [item] },
      {
        page: 2,
        pageSize: 1,
        total: 2,
        hasMore: false,
        items: [{ ...item, title: "cópia" }],
      },
    ],
    [{ item_id: ITEM_A, product_id: PRODUCT_A }],
  );
  assert.throws(
    () =>
      buildLinkedContents(
        { id: "p", provenance: { sourceId: PRODUCT_A } },
        1,
        20,
        source,
      ),
    (error: unknown) => error instanceof PublishedContentFixtureError,
  );
});

test("associação com product_id fora da Vitrine falha fechado", () => {
  assert.throws(
    () =>
      buildLinkedContents(
        { id: "p", provenance: { sourceId: PRODUCT_A } },
        1,
        20,
        injected(onePage([analyticsItem(ITEM_A)]), [
          { item_id: ITEM_A, product_id: "1739999999999999999" },
        ]),
      ),
    (error: unknown) => error instanceof PublishedContentFixtureError,
  );
});

test("business e metrics passam por allowlists da SPEC: desconhecida fora, 0/false/null preservados", () => {
  const item = analyticsItem(ITEM_A);
  const source = injected(
    onePage([
      {
        ...item,
        business: {
          productTitle: "Vestido",
          gmv: "R$ 9,99",
          campoEstranho: "fora",
        },
        metrics: { ...item.metrics, vvCnt: 0, likes: null, roas: 3.5 },
      },
    ]),
    [{ item_id: ITEM_A, product_id: PRODUCT_A }],
  );
  const video = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    1,
    20,
    source,
  ).videos[0]!;
  // gmv é MetricField na SPEC: fora do allowlist de business, não migra por conta própria.
  assert.deepEqual(video.business, { productTitle: "Vestido" });
  assert.equal(video.metrics.vvCnt, 0);
  assert.equal(video.metrics.likes, null);
  assert.equal("roas" in video.metrics, false);
  assert.equal("campoEstranho" in video.business, false);
});

test("fixture padrão classifica gmv/directGmv/itemSoldCnt em metrics, não em business", () => {
  const flat = PUBLISHED_VIDEO_ANALYTICS_PAGES.flatMap((page) => page.items);
  for (const item of flat) {
    assert.deepEqual(item.business, {});
    assert.equal("gmv" in item.metrics, true);
    assert.equal("directGmv" in item.metrics, true);
    assert.equal("itemSoldCnt" in item.metrics, true);
    assert.equal(item.metrics.gmv, "R$ 0,00");
  }
});

test("sequência de páginas inválida falha fechado", () => {
  const item = analyticsItem(ITEM_A);
  const base = { total: 1, items: [item] };
  const casos: PublishedVideoAnalyticsPageFixture[][] = [
    // Primeira página precisa ser 1.
    [{ page: 2, pageSize: 1, hasMore: false, ...base }],
    // pageSize precisa ser igual entre páginas.
    [
      { page: 1, pageSize: 1, total: 1, hasMore: false, items: [item] },
      { page: 2, pageSize: 2, total: 1, hasMore: false, items: [] },
    ],
    // Página intermediária precisa ser cheia.
    [
      { page: 1, pageSize: 2, total: 1, hasMore: true, items: [item] },
      { page: 2, pageSize: 2, total: 1, hasMore: false, items: [] },
    ],
    // Página intermediária precisa anunciar hasMore true.
    [
      { page: 1, pageSize: 1, total: 1, hasMore: false, items: [item] },
      { page: 2, pageSize: 1, total: 1, hasMore: false, items: [] },
    ],
    // Última página não pode anunciar hasMore true.
    [{ page: 1, pageSize: 1, total: 1, hasMore: true, items: [item] }],
  ];
  for (const pages of casos) {
    assert.throws(
      () =>
        buildLinkedContents(
          { id: "p", provenance: { sourceId: PRODUCT_A } },
          1,
          20,
          injected(pages, [{ item_id: ITEM_A, product_id: PRODUCT_A }]),
        ),
      (error: unknown) => error instanceof PublishedContentFixtureError,
      `caso: ${JSON.stringify(pages.map((page) => [page.page, page.pageSize, page.hasMore]))}`,
    );
  }
});

test("Product com id vazio ou malformado falha fechado", () => {
  for (const id of ["", "   ", 42, null, undefined]) {
    assert.throws(
      () =>
        buildLinkedContents(
          { id, provenance: { sourceId: PRODUCT_A } } as {
            id: string;
            provenance: unknown;
          },
          1,
          20,
        ),
      (error: unknown) => error instanceof PublishedContentFixtureError,
    );
  }
});

test("hostname de playback rejeita sufixo malformado e aceita subdomínio normal", () => {
  const item = analyticsItem(ITEM_A);
  for (const url of [
    "https://tiktokcdn.com/video/tos/x.mp4",
    "https://x..tiktokcdn.com/video/tos/x.mp4",
    "https://tiktokcdn.com.evil.example/video/tos/x.mp4",
  ]) {
    const source = injected(
      onePage([{ ...item, main_url: url }]),
      [{ item_id: ITEM_A, product_id: PRODUCT_A }],
    );
    const video = buildLinkedContents(
      { id: "p", provenance: { sourceId: PRODUCT_A } },
      1,
      20,
      source,
    ).videos[0]!;
    assert.equal(video.playbackUrl, undefined, url);
  }
});

test("playback com credenciais na URL (userinfo) é omitido; host assinado válido permanece", () => {
  const item = analyticsItem(ITEM_A);
  const source = injected(
    onePage([
      {
        ...item,
        main_url: "https://user:pass@v58.tiktokcdn.com/video/tos/x.mp4",
      },
    ]),
    [{ item_id: ITEM_A, product_id: PRODUCT_A }],
  );
  const video = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    1,
    20,
    source,
  ).videos[0]!;
  assert.equal(video.playbackUrl, undefined);
  // Comportamento válido preservado: host permitido com assinatura na query passa.
  const valido = buildLinkedContents(
    { id: "p", provenance: { sourceId: PRODUCT_A } },
    1,
    20,
  ).videos[0]!;
  assert.equal(new URL(valido.playbackUrl!).username, "");
  assert.equal(new URL(valido.playbackUrl!).password, "");
});
