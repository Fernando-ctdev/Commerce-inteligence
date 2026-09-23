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
