// Slice 013 — teste de markup da view de conteúdos publicados (react-dom/server,
// sem jsdom): galeria com contagem/ordem/seleção/zero, detail com player
// controls/preload=none/playsInline, fallback único, ausência explícita, null/0/
// false preservados e CTA de roteiro derivado desabilitado sem geração.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";

// A view importa .module.css, que o node puro não carrega — stub mínimo antes
// de qualquer import da view (o tsx resolve o .tsx via require/CJS).
const nodeRequire = createRequire(import.meta.url);
(nodeRequire.extensions as unknown as Record<string, (module: unknown) => unknown>)[
  ".css"
] = () => ({});

import type { LinkedContentsResponse, PublishedVideo } from "../../modules/products/published-content-contract";
import type { PublishedContentsGallery, PublishedContentDetail } from "./published-contents-view";

const videoBase: PublishedVideo = {
  itemId: "7685499159243230472",
  productIds: ["1736673359055521380"],
  title: "Esse whey realmente vale a pena? Minha experiência",
  coverUrl: "https://cover.example/7685499159243230472.jpg",
  publishedAt: "2026-03-12T12:00:00.000Z",
  playbackUrl: "https://video.tiktokcdn.com/main.mp4?sign=abc",
  fallbackPlaybackUrl: "https://video.tiktokcdn.com/backup.mp4?sign=def",
  duration: 28,
  business: {
    productTitle: "Whey Concentrado",
    priceLabel: "R$ 12,4 mil",
  },
  metrics: {
    vvCnt: 128000,
    ctr: "4,6%",
    likes: 0,
    comments: null,
    productClicks: 2846,
  },
};

const videoSemFallback: PublishedVideo = {
  ...videoBase,
  itemId: "7685773833734819090",
  title: "Base Matte: teste honesto de cobertura",
  coverUrl: undefined,
  publishedAt: undefined,
  playbackUrl: "https://video.tiktokcdn.com/solo.mp4?sign=ghi",
  fallbackPlaybackUrl: undefined,
  duration: 75,
};

const response: LinkedContentsResponse = {
  productId: "prod/1",
  externalProductId: "1736673359055521380",
  videos: [videoBase, videoSemFallback],
  page: 1,
  pageSize: 20,
  total: 2,
  hasMore: false,
};

async function viewModule() {
  return import("./published-contents-view");
}

function gallery(response: LinkedContentsResponse | null, extra: Record<string, unknown> = {}) {
  return viewModule().then(({ PublishedContentsGallery }) =>
    renderToStaticMarkup(
      React.createElement(PublishedContentsGallery, {
        response,
        selectedItemId: "7685499159243230472",
        error: null,
        loading: false,
        loadingMore: false,
        onSelect: () => {},
        onLoadMore: () => {},
        onRetry: () => {},
        query: "",
        onQueryChange: () => {},
        sort: "recent",
        onSortChange: () => {},
        ...extra,
      }),
    ),
  );
}

const noHandlers = {
  onSelect: () => {},
  onLoadMore: () => {},
  onRetry: () => {},
};

function detail(video: PublishedVideo, extra: Record<string, unknown> = {}) {
  return viewModule().then(({ PublishedContentDetail }) =>
    renderToStaticMarkup(
      React.createElement(PublishedContentDetail, {
        video,
        fallbackUsed: false,
        playbackFailed: false,
        onPlaybackError: () => {},
        ...extra,
      }),
    ),
  );
}

test("galeria: contagem contextual, ordem preservada e botão de seleção com aria-pressed", async () => {
  const markup = await gallery(response);

  assert.ok(markup.includes("Conteúdos vinculados (2)"));
  assert.ok(markup.indexOf("Esse whey realmente vale a pena") < markup.indexOf("Base Matte"));
  assert.ok(/aria-pressed="true"/.test(markup));
  assert.ok(/aria-pressed="false"/.test(markup));
});

test("galeria: busca e ordenação visíveis com rótulos acessíveis", async () => {
  const markup = await gallery(response);

  // campo de busca com label associada (sr-only) e placeholder da referência
  assert.match(markup, /placeholder="Buscar por título ou assunto\.\.\."/);
  assert.match(markup, /<label[^>]*for="published-contents-search"/);
  assert.match(markup, /id="published-contents-search"/);
  // ordenação funcional: select com Mais recentes/Mais antigas
  assert.match(markup, /<select[^>]*aria-label="Ordenar conteúdos"/);
  assert.match(markup, /<option[^>]*value="recent"[^>]*>Mais recentes</);
  assert.match(markup, /<option[^>]*value="oldest"[^>]*>Mais antigas</);
});

test("galeria: duração em badge MM:SS sobre a thumb", async () => {
  const markup = await gallery(response);

  assert.ok(markup.includes("00:28"));
  assert.ok(markup.includes("01:15"));
  assert.ok(!markup.includes("00:38")); // vídeo sem duration não inventa badge
  assert.ok(!/lucide-(more|ellipsis)-vertical/.test(markup)); // kebab removido a pedido do usuário
});

test("coverFrame: capa e duração dentro do frame da thumb, antes do corpo", async () => {
  const markup = await gallery(response);

  const cover = markup.indexOf('src="https://cover.example');
  const badge = markup.indexOf("00:28");
  const body = markup.indexOf("Esse whey realmente vale a pena");
  // capa → duração → corpo: o badge pertence ao frame da thumb
  assert.ok(cover !== -1 && cover < badge, "capa antes da duração");
  assert.ok(badge !== -1 && badge < body, "duração antes do corpo do card");

  // card sem capa: fallback dentro do frame, duração junto
  const fallbackMarkup = await gallery({
    ...response,
    videos: [{ ...videoSemFallback, duration: 75 }],
  });
  const fallback = fallbackMarkup.indexOf("Sem prévia");
  const dur = fallbackMarkup.indexOf("01:15");
  assert.ok(fallback !== -1 && fallback < dur);
});

test("visualizações: views ?? vvCnt com zero preservado", async () => {
  const markup = await gallery(response);
  assert.ok(markup.includes("128000")); // vvCnt do payload real

  const comViewsZero = await gallery({
    ...response,
    videos: [{ ...videoBase, metrics: { views: 0, vvCnt: 999 } }],
  });
  assert.match(comViewsZero, />\s*0\s*</);
  assert.ok(!comViewsZero.includes("999"));

  const soVvCnt = await gallery({
    ...response,
    videos: [{ ...videoBase, metrics: { vvCnt: 777 } }],
  });
  assert.ok(soVvCnt.includes("777"));
});

test("paginação do cliente: 9 itens por página", async () => {
  const { PAGE_SIZE } = await viewModule();
  assert.equal(PAGE_SIZE, 9);
});

test("formatDuration: mm:ss determinístico, ausente é null", async () => {
  const { formatDuration } = await viewModule();
  assert.equal(formatDuration(28), "00:28");
  assert.equal(formatDuration(61), "01:01");
  assert.equal(formatDuration(3599.7), "59:59");
  assert.equal(formatDuration(0), "00:00");
  assert.equal(formatDuration(undefined), null);
  assert.equal(formatDuration(-5), null);
  assert.equal(formatDuration(Number.NaN), null);
});

test("busca filtra por título e assunto (case-insensitive) e estado vazio é honesto", async () => {
  const buscaResponse: LinkedContentsResponse = {
    ...response,
    videos: [
      videoBase,
      { ...videoSemFallback, title: "Base Matte: teste honesto", business: { productTitle: "Cosméticos" } },
    ],
  };
  const markup = await gallery(buscaResponse, { query: "WHEY" });
  assert.ok(!markup.includes("Base Matte"));
  assert.ok(markup.includes("Esse whey realmente vale a pena"));

  const porAssunto = await gallery(
    { ...response, videos: [{ ...videoBase, title: "Sem palavra chave", business: { productTitle: "Conjunto Batinha" }, metrics: {} }] },
    { query: "batinha" },
  );
  assert.ok(porAssunto.includes("Sem palavra chave"));

  const semResultado = await gallery(response, { query: "inexistente" });
  assert.ok(semResultado.includes("Nenhum conteúdo encontrado para a busca."));
  assert.ok(!semResultado.includes("Esse whey realmente vale a pena"));
});

test("detail com metrics vazio: métricas conhecidas viram 0, seções vazias somem", async () => {
  const markup = await detail({ ...videoBase, metrics: {} });

  // métricas de vídeo allowlisted renderizam 0 mesmo sem nenhuma chave
  const itemSold = markup.indexOf("Itens vendidos");
  assert.ok(itemSold !== -1, "tiles de métricas presentes com record vazio");
  assert.match(markup, /Itens vendidos<\/dt><dd>0<\/dd>/);
  assert.match(markup, /Taxa de conclusão<\/dt><dd>0<\/dd>/);
  // métricas de produto sem dados: seção oculta, nada inventado
  assert.ok(!markup.includes("Cliques no produto"));
  // negócio continua com — para ausentes
  assert.ok(markup.includes("Categoria"));
});

test("filterAndSortVideos: recent/oldest determinísticos e sem data por último", async () => {
  const { filterAndSortVideos } = await viewModule();
  const antigo = { ...videoBase, itemId: "a-antigo", publishedAt: "2026-01-01T00:00:00.000Z" };
  const recente = { ...videoBase, itemId: "b-recente", publishedAt: "2026-06-01T00:00:00.000Z" };
  const semData = { ...videoBase, itemId: "c-sem-data", publishedAt: undefined };

  const recentes = filterAndSortVideos([antigo, recente, semData], "", "recent");
  assert.deepEqual(recentes.map((video) => video.itemId), ["b-recente", "a-antigo", "c-sem-data"]);

  const antigas = filterAndSortVideos([antigo, recente, semData], "", "oldest");
  assert.deepEqual(antigas.map((video) => video.itemId), ["a-antigo", "b-recente", "c-sem-data"]);

  // sem data em ambos os modos: afundam, ordem relativa preservada
  const doisSemData = filterAndSortVideos([semData, { ...semData, itemId: "d-sem-data" }], "", "recent");
  assert.deepEqual(doisSemData.map((video) => video.itemId), ["c-sem-data", "d-sem-data"]);
});

test("galeria: data pt-BR, métrica zero visível e thumbnail com fallback ausente", async () => {
  const markup = await gallery(response);

  assert.ok(markup.includes("2026"));
  assert.ok(markup.includes("mar"));
  assert.ok(/views|Visualizações/.test(markup));
  // valor zero preservado, nunca trocado por ausência
  const zeroRender = await gallery({
    ...response,
    videos: [{ ...videoBase, coverUrl: undefined, metrics: { vvCnt: 0 } }],
  });
  assert.match(zeroRender, />\s*0\s*</);
  assert.ok(zeroRender.includes("Visualizações"));
  // card sem coverUrl usa fallback visual, não img quebrada
  assert.ok(zeroRender.includes("Sem prévia"));
});

test("detail: player sem autoplay com controls, preload none e playsInline", async () => {
  const markup = await detail(videoBase);

  assert.match(markup, /<video[^>]*controls/);
  assert.match(markup, /<video[^>]*preload="none"/);
  assert.match(markup, /<video[^>]*plays[Ii]nline/);
  assert.match(markup, /<video[^>]*src="https:\/\/video\.tiktokcdn\.com\/main\.mp4\?sign=abc"/);
  assert.ok(!markup.includes("autoplay"));
});

test("detail: fallback único troca a fonte e erro final aparece em role alert", async () => {
  const comFallback = await detail(videoBase, { fallbackUsed: true });
  assert.match(
    comFallback,
    /<video[^>]*src="https:\/\/video\.tiktokcdn\.com\/backup\.mp4\?sign=def"/,
  );

  const semFallback = await detail(videoSemFallback, { playbackFailed: true });
  assert.match(semFallback, /role="alert"/);
  assert.ok(!semFallback.includes("backup.mp4"));
});

test("detail: métricas com zero, null, ausência como 0 e sem cálculo derivado", async () => {
  const markup = await detail({
    ...videoBase,
    metrics: { views: 128000, likes: 0, comments: null },
  });

  assert.ok(markup.includes("128000"));
  assert.ok(markup.includes("Curtidas"));
  assert.ok(markup.includes("0"));
  assert.ok(markup.includes("null"));
  // campo de MÉTRICA conhecido ausente no DTO mostra 0 (pedido do usuário),
  // não traço; dados de negócio ausentes continuam com —
  const itemSold = markup.indexOf("Itens vendidos");
  assert.ok(itemSold !== -1, "tile de métrica conhecida presente");
  assert.match(markup, /Itens vendidos<\/dt><dd>0<\/dd>/);
  const categoria = markup.indexOf("Categoria");
  assert.match(markup.slice(categoria, categoria + 40), /—/);
  // sem CTR/ROAS/total calculado no cliente
  assert.ok(!markup.includes("% calculado"));
});

test("detail: CTA de roteiro derivado desabilitado, explicado e sem geração", async () => {
  const markup = await detail(videoBase);

  assert.ok(markup.includes("Gerar roteiro derivado"));
  assert.ok(markup.includes("Disponível em uma etapa futura"));
  assert.match(markup, /<button[^>]*disabled/);
  assert.ok(!markup.includes("ContentBriefVersion"));
});

test("galeria vazia: estado honesto sem carregar mais", async () => {
  const markup = await gallery({ ...response, videos: [], total: 0, hasMore: false });

  assert.ok(markup.includes("Nenhum conteúdo publicado vinculado"));
  assert.ok(!markup.includes("Carregar mais"));
});

test("galeria com hasMore: botão Carregar mais e loadingMore desabilita", async () => {
  const markup = await gallery({ ...response, hasMore: true });
  assert.match(markup, /<button[^>]*>[\s\S]*Carregar mais/);

  const loadingMore = await gallery({ ...response, hasMore: true }, { loadingMore: true });
  assert.match(loadingMore, /<button[^>]*disabled[^>]*>Carregando…</);
});

test("erro do endpoint: role alert com retry local, sem dados antigos", async () => {
  const markup = await gallery(null, { error: "Não foi possível carregar os conteúdos publicados agora." });

  assert.match(markup, /role="alert"/);
  assert.ok(markup.includes("Tentar novamente"));
  assert.ok(!markup.includes("Conteúdos vinculados"));
});

test("carregamento: região aria-live polite", async () => {
  const markup = await gallery(null, { loading: true });

  assert.match(markup, /aria-live="polite"/);
});

test("foco do título do detail: só viewport móvel, com elemento montado (drawer aberto)", async () => {
  const { focusDetailTitle } = await viewModule();
  let focused = 0;
  const el = { focus: () => { focused += 1; } } as unknown as HTMLElement;

  // drawer fechado: título não montado (ref null) — nunca foca
  focusDetailTitle(null, true);
  assert.equal(focused, 0);
  // desktop: mesmo com drawer aberto do item padrão, não rouba foco
  focusDetailTitle(el, false);
  assert.equal(focused, 0);
  // drawer aberto do item padrão em viewport móvel: foca
  focusDetailTitle(el, true);
  assert.equal(focused, 1);
});

test("erro de load-more preserva cards e mostra alert de retry junto", async () => {
  const markup = await gallery(response, {
    error: "Não foi possível carregar os conteúdos publicados agora.",
  });

  assert.ok(markup.includes("Conteúdos vinculados (2)"));
  assert.ok(markup.includes("Esse whey realmente vale a pena"));
  assert.match(markup, /role="alert"/);
  assert.ok(markup.includes("Tentar novamente"));
});

test("erro inicial sem resposta substitui o estado vazio", async () => {
  const markup = await gallery(null, { error: "Erro inicial." });

  assert.match(markup, /role="alert"/);
  assert.ok(!markup.includes("Conteúdos vinculados"));
});

test("chaves desconhecidas de business/metrics nunca aparecem no markup", async () => {
  const markup = await detail({
    ...videoBase,
    business: { ...videoBase.business, raw_provider_field: "secreto" },
    metrics: { ...videoBase.metrics, weirdProviderKey: 1 },
  });

  assert.ok(!markup.includes("raw_provider_field"));
  assert.ok(!markup.includes("weirdProviderKey"));
  assert.ok(markup.includes("Produto"));
  assert.ok(markup.includes("Visualizações"));
});

test("seleção efetiva: primeira entrada por padrão e estável ao anexar páginas", async () => {
  const { resolveSelection } = await viewModule();
  const terceiro: PublishedVideo = { ...videoSemFallback, itemId: "7685499999999999999" };
  const pagina2: LinkedContentsResponse = { ...response, videos: [...response.videos, terceiro] };

  assert.equal(resolveSelection(null, response.videos), response.videos[0]);
  assert.equal(resolveSelection(null, pagina2.videos), pagina2.videos[0]);
  assert.equal(
    resolveSelection(videoSemFallback.itemId, pagina2.videos)?.itemId,
    videoSemFallback.itemId,
  );
  assert.equal(resolveSelection(null, []), null);
});

test("fallback de playback: uma única troca, falha terminal preserva fallbackUsed e sem loop", async () => {
  const { playbackFallbackState } = await viewModule();

  assert.deepEqual(playbackFallbackState(false, videoBase), {
    fallbackUsed: true,
    playbackFailed: false,
  });
  // backup falha: terminal, mas mantém fallbackUsed para a src não voltar ao principal
  const second = playbackFallbackState(true, videoBase);
  assert.deepEqual(second, { fallbackUsed: true, playbackFailed: true });
  // terceiro/repetido onError: mesmo estado terminal — sem troca de src, sem loop
  const third = playbackFallbackState(second.fallbackUsed, videoBase);
  assert.deepEqual(third, { fallbackUsed: true, playbackFailed: true });
  assert.equal(third.fallbackUsed, second.fallbackUsed);
  // sem backup (ou igual ao principal): falha terminal direta, fallbackUsed preservado
  assert.deepEqual(playbackFallbackState(false, videoSemFallback), {
    fallbackUsed: false,
    playbackFailed: true,
  });
  assert.deepEqual(
    playbackFallbackState(false, { ...videoBase, fallbackPlaybackUrl: videoBase.playbackUrl }),
    { fallbackUsed: false, playbackFailed: true },
  );
});

test("merge de páginas preserva itens já renderizados e metadados da próxima", async () => {
  const { mergePage } = await viewModule();
  const terceiro: PublishedVideo = { ...videoSemFallback, itemId: "7685499999999999999" };
  const proxima: LinkedContentsResponse = {
    ...response,
    videos: [terceiro],
    page: 2,
    total: 3,
    hasMore: false,
  };

  const merged = mergePage(response, proxima);
  assert.equal(merged.videos.length, 3);
  assert.equal(merged.videos[0].itemId, response.videos[0].itemId);
  assert.equal(merged.page, 2);
  assert.equal(merged.total, 3);
  assert.equal(merged.hasMore, false);
});
