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

import type { LinkedContentsResponse, PublishedVideo } from "../../../../modules/products/published-content-contract";
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

test("galeria: duração não vira badge no card (removida a pedido do usuário)", async () => {
  const markup = await gallery(response);

  assert.ok(!markup.includes("00:28"));
  assert.ok(!markup.includes("01:15"));
  assert.ok(!/lucide-(more|ellipsis)-vertical/.test(markup)); // kebab removido a pedido do usuário
});

test("coverFallbackActive: img só com coverUrl presente e sem erro; erro é terminal", async () => {
  const { coverFallbackActive } = await viewModule();
  // capa existe, nada falhou: renderiza img
  assert.equal(coverFallbackActive(false, "https://cover.example/a.jpg"), false);
  // URL ausente: fallback direto (regra já existente, agora na decisão única)
  assert.equal(coverFallbackActive(false, undefined), true);
  // coverUrl existe mas a carga falhou: fallback, e não retorna a img
  assert.equal(coverFallbackActive(true, "https://cover.example/a.jpg"), true);
});

test("coverFrame: capa, play decorativo e badges dentro do frame, antes do corpo", async () => {
  const markup = await gallery(response);

  const cover = markup.indexOf('src="https://cover.example');
  const play = markup.indexOf("lucide-play");
  const views = markup.indexOf("Visualizações");
  const likes = markup.indexOf("Curtidas");
  const body = markup.indexOf("Esse whey realmente vale a pena");
  // capa → play → views → curtidas → corpo: overlays pertencem ao frame
  assert.ok(cover !== -1 && cover < play, "capa antes do play");
  assert.ok(play !== -1 && play < views, "play antes do badge de views");
  assert.ok(views !== -1 && views < likes, "views antes de curtidas no frame");
  assert.ok(likes !== -1 && likes < body, "curtidas antes do corpo do card");
  // play é decorativo: fora da árvore de acessibilidade
  assert.ok(!/>Play</.test(markup), "play não expõe nome acessível");

  // card sem capa: fallback dentro do frame, overlays junto
  const fallbackMarkup = await gallery({
    ...response,
    videos: [{ ...videoSemFallback }],
  });
  const fallback = fallbackMarkup.indexOf("Sem prévia");
  const frameViews = fallbackMarkup.indexOf("Visualizações");
  assert.ok(fallback !== -1 && fallback < frameViews);
});

test("visualizações: apenas vvCnt, mesmo com views presente", async () => {
  const markup = await gallery(response);
  assert.ok(markup.includes("128k")); // vvCnt 128000 compactado no badge

  // badge de views sobre a thumb à esquerda; curtidas no lugar da antiga
  // duração, à direita do frame; GMV/CTR seguem na linha de métricas
  const viewsIdx = markup.indexOf("Visualizações");
  const likesIdx = markup.indexOf("Curtidas");
  const titleIdx = markup.indexOf("Esse whey");
  const ctrIdx = markup.indexOf("CTR");
  assert.ok(viewsIdx > -1, "badge de views presente");
  assert.ok(likesIdx > -1, "badge de curtidas presente");
  assert.ok(likesIdx > viewsIdx, "curtidas depois de views no frame");
  assert.ok(likesIdx < titleIdx, "curtidas na thumb, antes do corpo");
  assert.ok(ctrIdx > titleIdx, "CTR na linha de métricas do corpo");
  assert.equal(markup.split("Curtidas").length - 1, 2, "um rótulo Curtidas por card");

  // views + vvCnt juntas: vvCnt vence, views nunca é exibida
  const comAmbas = await gallery({
    ...response,
    videos: [{ ...videoBase, metrics: { views: 0, vvCnt: 999 } }],
  });
  assert.ok(comAmbas.includes("999"));
  assert.ok(!/>\s*0\s*</.test(comAmbas), "views:0 nunca vira o valor do card");
  assert.ok(!comAmbas.includes("Visualizações válidas"));
  assert.equal(comAmbas.split("Visualizações").length - 1, 1, "um único rótulo Visualizações");

  const soVvCnt = await gallery({
    ...response,
    videos: [{ ...videoBase, metrics: { vvCnt: 777 } }],
  });
  assert.ok(soVvCnt.includes("777"));

  // só views (inválida): card não mostra bloco de visualizações
  const soViews = await gallery({
    ...response,
    videos: [{ ...videoBase, metrics: { views: 555 } }],
  });
  assert.ok(!soViews.includes("Visualizações"));
  assert.ok(!soViews.includes("555"));
});

test("paginação do cliente: 10 itens por página", async () => {
  const { PAGE_SIZE } = await viewModule();
  assert.equal(PAGE_SIZE, 10);
});

test("compactCount: mil+ vira k com vírgula; abaixo disso e ausências, cru", async () => {
  const { compactCount } = await viewModule();
  // exemplos do usuário
  assert.equal(compactCount(1100), "1,1k");
  assert.equal(compactCount(25600), "25,6k");
  // mil exato sem vírgula; abaixo de mil cru
  assert.equal(compactCount(1000), "1k");
  assert.equal(compactCount(999), "999");
  assert.equal(compactCount(0), "0");
  // arredondamento para uma casa; grande vira k inteiro
  assert.equal(compactCount(1259), "1,3k");
  assert.equal(compactCount(999950), "1000k");
  // ausências preservadas para badge/CardMetric
  assert.equal(compactCount(null), null);
  assert.equal(compactCount(undefined), undefined);
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

test("detail com metrics vazio: três métricas viram 0, social só no overlay", async () => {
  const markup = await detail({ ...videoBase, metrics: {} });
  const afterTitle = markup.slice(markup.indexOf("Esse whey realmente vale a pena"));

  // as três métricas restantes renderizam 0 mesmo sem nenhuma chave
  for (const label of ["Visualizações", "GMV", "Itens vendidos"]) {
    assert.ok(afterTitle.includes(`${label}</dt><dd>0</dd>`), `${label} presente com 0`);
  }
  // removidas do detail (social virou overlay do player): nem rótulo após o título
  for (const label of ["Novos seguidores", "Taxa de conclusão", "GMV direto", "CTR", "Curtidas", "Comentários", "Compartilhamentos"]) {
    assert.ok(!afterTitle.includes(label), `${label} removida do detail`);
  }
  // o social continua acessível no overlay do player, antes do título
  for (const label of ["Curtidas:", "Comentários:", "Compartilhamentos:"]) {
    assert.ok(markup.indexOf(label) !== -1 && markup.indexOf(label) < markup.indexOf("Esse whey"), `${label} no overlay do player`);
  }
  // métricas de produto sem dados: seção oculta, nada inventado
  assert.ok(!afterTitle.includes("Cliques no produto"));
  // negócio continua com — para ausentes
  assert.ok(afterTitle.includes("Categoria"));
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
  assert.ok(markup.includes("Visualizações"));
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

test("detail: overlay TikTok local, rail de métricas reais e ausência como —", async () => {
  const markup = await detail({
    ...videoBase,
    metrics: { vvCnt: 128000, likes: 1100, comments: 25600, shares: 42 },
  });

  // asset LOCAL do TikTok: nada de CDN em runtime
  assert.match(markup, /src="\/icons\/tiktok\.svg"/);
  assert.ok(!markup.includes("simpleicons"));

  // ordem: vídeo → tiktok (img no overlay, ignorando o preload link do React)
  // → rail (curtidas, comentários, compartilhamentos) → título
  const videoIdx = markup.indexOf("<video");
  const tiktokIdx = markup.indexOf("/icons/tiktok.svg", videoIdx);
  const curtidasIdx = markup.indexOf("Curtidas");
  const comentariosIdx = markup.indexOf("Comentários");
  const compartilhamentosIdx = markup.indexOf("Compartilhamentos");
  const titleIdx = markup.indexOf("Esse whey realmente vale a pena");
  assert.ok(videoIdx !== -1 && videoIdx < tiktokIdx, "vídeo antes do overlay");
  assert.ok(tiktokIdx !== -1 && tiktokIdx < curtidasIdx, "tiktok antes do rail");
  assert.ok(curtidasIdx < comentariosIdx && comentariosIdx < compartilhamentosIdx, "ordem do rail");
  assert.ok(compartilhamentosIdx < titleIdx, "rail dentro do player, antes do corpo");

  // ícones do rail conforme desenho: coração, comentários (more), compartilhar
  const heartIdx = markup.indexOf("lucide-heart");
  const commentIconIdx = markup.indexOf("lucide-message-circle-more");
  const shareIconIdx = markup.indexOf("lucide-corner-up-right");
  assert.ok(commentIconIdx > -1, "ícone de comentários é message-circle-more");
  assert.ok(shareIconIdx > -1, "ícone de compartilhamentos é corner-up-right");
  assert.ok(heartIdx !== -1 && heartIdx < commentIconIdx && commentIconIdx < shareIconIdx, "ordem dos ícones do rail");
  // os antigos MessageCircle/Share2 não sobram no rail (match exato de classe)
  const railSlice = markup.slice(heartIdx, markup.indexOf("Esse whey realmente vale a pena"));
  assert.ok(!railSlice.includes('lucide-message-circle"'), "sem lucide-message-circle antigo");
  assert.ok(!railSlice.includes('lucide-share-2"'), "sem lucide-share-2 antigo");

  // contadores reais compactados (compactCount pt-BR)
  assert.ok(markup.includes("1,1k"), "likes compactado");
  assert.ok(markup.includes("25,6k"), "comentários compactado");
  assert.ok(markup.includes("42"), "shares cru");
  // nomes acessíveis com rótulo e valor (sr-only)
  assert.ok(markup.includes("Curtidas: 1,1k"), "label acessível de curtidas");
  assert.ok(markup.includes("Comentários: 25,6k"), "label acessível de comentários");
  assert.ok(markup.includes("Compartilhamentos: 42"), "label acessível de compartilhamentos");
  // overlay não é aria-hidden: a tag logo após </video> abre o container limpo
  const afterVideo = markup.slice(markup.indexOf("</video>"), markup.indexOf("</video>") + 40);
  assert.match(afterVideo, /^<\/video><div(>|\s)/, "container do overlay presente");
  assert.ok(!afterVideo.slice(0, 30).includes("aria-hidden"), "rail acessível sem aria-hidden no container");

  // sem controles customizados: nada clicável no overlay; vídeo segue nativo
  const playerSlice = markup.slice(videoIdx, titleIdx);
  assert.ok(!playerSlice.includes("<button"), "overlay sem botão customizado");
  assert.ok(!/tabIndex|role="button"/.test(playerSlice), "overlay sem interação própria");
});

test("detail: overlay mostra — para likes/comments/shares ausentes ou null", async () => {
  const markup = await detail({
    ...videoBase,
    metrics: { vvCnt: 128000, likes: null, comments: null },
  });
  const playerSlice = markup.slice(markup.indexOf("<video"), markup.indexOf("Esse whey"));
  // cada ausência aparece uma vez no sr-only (label: —) e uma no valor visível
  assert.equal(playerSlice.split(": —").length - 1, 3, "três ausências explícitas no rail");
});

test("detail: ícones decorativos Eye/DollarSign/Package nas três métricas", async () => {
  const markup = await detail(videoBase);

  const eye = markup.indexOf("lucide-eye");
  const dollar = markup.indexOf("lucide-dollar-sign");
  const pack = markup.indexOf("lucide-package");
  assert.ok(eye !== -1, "ícone Eye para Visualizações");
  assert.ok(dollar !== -1, "ícone DollarSign para GMV");
  assert.ok(pack !== -1, "ícone Package para Itens vendidos");
  // ordem dos tiles: Visualizações → GMV → Itens vendidos
  assert.ok(eye < dollar && dollar < pack, "ícones na ordem das métricas");
  // decorativos: fora da árvore de acessibilidade (span que envolve o svg do Eye)
  const spanStart = markup.lastIndexOf("<span", eye);
  assert.match(markup.slice(spanStart, spanStart + 40), /aria-hidden="true"/, "ícone é decorativo");
  // ícone DENTRO do primeiro <dt> (mesma linha da label), valor no <dd> abaixo
  const firstDt = markup.slice(markup.indexOf("<dt"), markup.indexOf("</dd>") + 5);
  assert.match(firstDt, /<dt><span[^>]*aria-hidden[^>]*>[\s\S]*lucide-eye/, "ícone dentro do dt");
  assert.match(firstDt, /Visualizações<\/dt><dd>/, "valor após a label");
});

test("detail: Engajamento é a única taxa derivada do recorte", async () => {
  const markup = await detail({
    ...videoBase,
    metrics: { vvCnt: 10000, likes: 600, comments: 80, shares: 40 },
  });
  // (600+80+40)/10000 = 7,2% pt-BR com uma casa
  assert.match(markup, /Engajamento<\/dt><dd>7,2%<\/dd>/);
  // quarta métrica do bloco: após Itens vendidos
  assert.ok(markup.indexOf("Itens vendidos</dt>") < markup.indexOf("Engajamento"));
  // ícone decorativo coerente sem dependência nova
  assert.ok(markup.indexOf("lucide-trending-up") > markup.indexOf("lucide-package"));

  // 0%: vvCnt>0 com os três sociais zerados (zeros reais contam)
  const zeros = await detail({
    ...videoBase,
    metrics: { vvCnt: 500, likes: 0, comments: 0, shares: 0 },
  });
  assert.match(zeros, /Engajamento<\/dt><dd>0%<\/dd>/);

  // — quando vvCnt não é número >0 ou qualquer social é ausente/null
  // (vvCnt ausente da chave = ausente, mesmo contrato de undefined)
  for (const metrics of [
    { vvCnt: 0, likes: 10, comments: 0, shares: 0 },
    { likes: 1, comments: 1, shares: 1 },
    { vvCnt: 100, likes: null, comments: 0, shares: 0 },
    { vvCnt: 100, comments: null },
    { vvCnt: "abc", likes: 1, comments: 0, shares: 0 },
  ] as PublishedVideo["metrics"][]) {
    const dash = await detail({ ...videoBase, metrics });
    assert.match(
      dash,
      /Engajamento<\/dt><dd>—<\/dd>/,
      `— para ${JSON.stringify(metrics)}`,
    );
  }
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

test("detail: métricas com zero, null, ausência como 0 e Engajamento como única taxa derivada", async () => {
  const markup = await detail({
    ...videoBase,
    metrics: { vvCnt: 128000, views: 42, likes: 0, comments: null },
  });

  // vvCnt é a única visualização; views presente no payload nunca vaza
  assert.ok(markup.includes("128000"));
  assert.ok(!markup.includes("<dd>42</dd>"), "views nunca vira tile renderizado");
  assert.ok(!markup.includes("Visualizações válidas"));
  assert.equal(markup.split("Visualizações").length - 1, 1, "um único rótulo Visualizações");
  // ordem fixa das três métricas restantes, na seção Métricas (após o título;
  // o rail do player tem seus próprios rótulos e vem antes)
  const titleIdxOrder = markup.indexOf("Esse whey realmente vale a pena");
  const afterTitle = markup.slice(titleIdxOrder);
  const order = ["Visualizações", "GMV", "Itens vendidos"].map((label) => afterTitle.indexOf(label));
  assert.ok(order.every((index) => index !== -1), "três métricas presentes");
  assert.ok(order.every((index, i) => i === 0 || index > order[i - 1]), "ordem do recorte preservada");
  // social saiu da seção: existe só no overlay, antes do título
  for (const label of ["Curtidas", "Comentários", "Compartilhamentos"]) {
    assert.ok(!afterTitle.includes(label), `${label} só no overlay`);
  }
  for (const label of ["Curtidas:", "Comentários:", "Compartilhamentos:"]) {
    assert.ok(markup.indexOf(label) !== -1 && markup.indexOf(label) < titleIdxOrder, `${label} no overlay`);
  }
  assert.ok(afterTitle.includes("0"));
  // null real do DTO continua literal "null" no tile (nunca 0 nem —)
  const nulo = await detail({ ...videoBase, metrics: { vvCnt: null } });
  assert.ok(nulo.includes("<dd>null</dd>"), "null preservado como literal");
  // campo de MÉTRICA conhecido ausente no DTO mostra 0 (pedido do usuário),
  // não traço; dados de negócio ausentes continuam com —
  const itemSold = afterTitle.indexOf("Itens vendidos");
  assert.ok(itemSold !== -1, "tile de métrica conhecida presente");
  assert.match(markup, /Itens vendidos<\/dt><dd>0<\/dd>/);
  const categoria = markup.indexOf("Categoria");
  assert.match(markup.slice(categoria, categoria + 40), /—/);
  // sem CTR/ROAS/total calculado no cliente — Engajamento é a ÚNICA taxa
  // derivada exibida (engagementRate, aprovada pelo usuário)
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
