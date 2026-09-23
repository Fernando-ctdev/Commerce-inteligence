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
  business: {
    productTitle: "Whey Concentrado",
    priceLabel: "R$ 12,4 mil",
  },
  metrics: {
    views: 128000,
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
  assert.ok(!markup.includes("Busca") && !markup.includes("Mais recentes"));
});

test("galeria: data pt-BR, métrica zero visível e thumbnail com fallback ausente", async () => {
  const markup = await gallery(response);

  assert.ok(markup.includes("2026"));
  assert.ok(markup.includes("mar"));
  assert.ok(/views|Visualizações/.test(markup));
  // valor zero preservado, nunca trocado por ausência
  const zeroRender = await gallery({
    ...response,
    videos: [{ ...videoBase, coverUrl: undefined, metrics: { views: 0 } }],
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

test("detail: métricas com zero, null, ausência explícita e sem cálculo derivado", async () => {
  const markup = await detail({
    ...videoBase,
    metrics: { views: 128000, likes: 0, comments: null },
  });

  assert.ok(markup.includes("128000"));
  assert.ok(markup.includes("Curtidas"));
  assert.ok(markup.includes("0"));
  assert.ok(markup.includes("null"));
  // campo conhecido inexistente no DTO é ausência explícita, não invenção
  assert.ok(markup.includes("—"));
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

test("foco do título do detail: só em viewport móvel e com elemento presente", async () => {
  const { focusDetailTitle } = await viewModule();
  let focused = 0;
  const el = { focus: () => { focused += 1; } } as unknown as HTMLElement;

  focusDetailTitle(el, false);
  assert.equal(focused, 0);
  focusDetailTitle(el, true);
  assert.equal(focused, 1);
  focusDetailTitle(null, true);
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

test("fallback de playback: uma única troca e falha final sem loop", async () => {
  const { playbackFallbackState } = await viewModule();

  assert.deepEqual(playbackFallbackState(false, videoBase), {
    fallbackUsed: true,
    playbackFailed: false,
  });
  assert.deepEqual(playbackFallbackState(true, videoBase), {
    fallbackUsed: false,
    playbackFailed: true,
  });
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
