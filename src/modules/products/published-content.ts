// Join determinístico Product↔vídeos publicados (Slice 013, Task 1): função pura
// server-side sobre fixtures sanitizadas. A associação é sourceId do Product (Vitrine
// sincronizada) × product_id × item_id, na ordem original da analytics; o total
// público é o número de vídeos distintos do Product antes do recorte (ruling do
// ledger). Fail-closed: fixture inválida, página inválida ou provenance sem sourceId
// não inventam dados. Playback só https *.tiktokcdn.com; post_url assinado nunca vira
// coverUrl (ruling); chaves fora do allowlist nunca cruzam; nada é logado.
import type {
  LinkedContentsResponse,
  PublishedContentScalar,
  PublishedVideo,
} from "./published-content-contract";
import {
  PUBLISHED_VIDEO_ANALYTICS_PAGES,
  PUBLISHED_VIDEO_ITEM_ASSOCIATIONS,
  SHOWCASE_PRODUCT_FIXTURES,
  type PublishedVideoAnalyticsFixture,
  type PublishedVideoAnalyticsPageFixture,
  type PublishedVideoItemAssociationFixture,
} from "./published-content-fixtures";

/** Erro identificável de normalização de fixture: página, associação, URL ou ID obrigatório inválido. */
export class PublishedContentFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishedContentFixtureError";
  }
}

export type PublishedContentSource = {
  analytics: PublishedVideoAnalyticsPageFixture[];
  associations: PublishedVideoItemAssociationFixture[];
};

const DEFAULT_SOURCE: PublishedContentSource = {
  analytics: PUBLISHED_VIDEO_ANALYTICS_PAGES,
  associations: PUBLISHED_VIDEO_ITEM_ASSOCIATIONS,
};

const PLAYBACK_HOST_PATTERN =
  /^[a-z0-9-]+(\.[a-z0-9-]+)*\.tiktokcdn\.com$/;

/** Listas fechadas da SPEC §6.1: campo fora da lista é descartado; presente, mantido (0/false/null inclusive). */
export const BUSINESS_FIELD_ALLOWLIST: ReadonlySet<string> = new Set([
  "productTitle",
  "title",
  "categoryName",
  "priceLabel",
  "sellerName",
  "sellerId",
  "stockCount",
  "canAdd",
  "commission",
  "commissionRate",
  "commissionExpense",
  "labels",
]);

export const METRIC_FIELD_ALLOWLIST: ReadonlySet<string> = new Set([
  "views",
  "vvCnt",
  "newFollowerCnt",
  "ctr",
  "gmv",
  "directGmv",
  "itemSoldCnt",
  "completionRate",
  "likes",
  "comments",
  "shares",
  "productClicks",
  "productUnits",
  "productRevenue",
]);

/** Mantém só chaves allowlisted presentes; não cria valor derivado e preserva 0/false/null. */
function filterFields(
  record: Record<string, PublishedContentScalar>,
  allowlist: ReadonlySet<string>,
): Record<string, PublishedContentScalar> {
  const filtered: Record<string, PublishedContentScalar> = {};
  for (const [key, value] of Object.entries(record)) {
    if (allowlist.has(key)) filtered[key] = value;
  }
  return filtered;
}

/** Aceita somente provenance objeto com sourceId string não vazia. */
function readSourceId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const sourceId = (value as { sourceId?: unknown }).sourceId;
  return typeof sourceId === "string" && sourceId.trim() ? sourceId : null;
}

function emptyResponse(
  productId: string,
  page: number,
  pageSize: number,
): LinkedContentsResponse {
  return {
    productId,
    externalProductId: "",
    videos: [],
    page,
    pageSize,
    total: 0,
    hasMore: false,
  };
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new PublishedContentFixtureError(`${label} inválida: ${String(value)}`);
  }
}

/** URLs de playback: somente https em hostname *.tiktokcdn.com bem-formado (sem rótulo
 *  vazio, sem sufixo nu ou hostname estranho); inválida ou ausente deixa o campo de fora. */
function playbackUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return undefined;
    if (!PLAYBACK_HOST_PATTERN.test(parsed.hostname)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** Copia somente campos allowlisted para o contrato camelCase compartilhado; business e
 *  metrics passam pelas listas fechadas da SPEC antes de cruzar o DTO. */
function projectVideo(
  item: PublishedVideoAnalyticsFixture,
  productIds: string[],
): PublishedVideo {
  const playback = playbackUrl(item.main_url);
  const fallback = playbackUrl(item.backup_url);
  return {
    itemId: item.item_id,
    productIds,
    ...(item.title ? { title: item.title } : {}),
    ...(playback ? { playbackUrl: playback } : {}),
    ...(fallback ? { fallbackPlaybackUrl: fallback } : {}),
    ...(item.published_at ? { publishedAt: item.published_at } : {}),
    business: filterFields(item.business, BUSINESS_FIELD_ALLOWLIST),
    metrics: filterFields(item.metrics, METRIC_FIELD_ALLOWLIST),
  };
}

/** Valida integridade da fixture antes de qualquer recorte: sequência de páginas
 *  começando em 1 com pageSize único, intermediárias cheias e hasMore true (última
 *  cheia ou parcial e false), total coerente com itens distintos, item_id único na
 *  analytics inteira, associação sem duplicata, sempre com item na analytics e
 *  product na Vitrine. Qualquer desvio é PublishedContentFixtureError. */
function validatedSource(source: PublishedContentSource): PublishedVideoAnalyticsFixture[] {
  const ids = new Set<string>();
  let declaredTotal: number | null = null;
  let declaredPageSize: number | null = null;
  source.analytics.forEach((page, index) => {
    requirePositiveInteger(page.page, "Página da fixture");
    requirePositiveInteger(page.pageSize, "PageSize da fixture");
    // Sequência estrita: 1, 2, 3… — cobre início em 1 e contiguidade de uma vez.
    if (page.page !== index + 1) {
      throw new PublishedContentFixtureError("Páginas da fixture não começam em 1 ou não são contíguas");
    }
    if (declaredPageSize === null) declaredPageSize = page.pageSize;
    else if (page.pageSize !== declaredPageSize) {
      throw new PublishedContentFixtureError("PageSize varia entre páginas da fixture");
    }
    const isLast = index === source.analytics.length - 1;
    if (!isLast && page.items.length !== page.pageSize) {
      throw new PublishedContentFixtureError("Página intermediária da fixture não está cheia");
    }
    if (!isLast && !page.hasMore) {
      throw new PublishedContentFixtureError("Página intermediária da fixture precisa anunciar hasMore");
    }
    if (isLast && page.hasMore) {
      throw new PublishedContentFixtureError("Última página da fixture não pode anunciar hasMore");
    }
    if (typeof page.total !== "number" || page.total < 0) {
      throw new PublishedContentFixtureError("Total da fixture inválido");
    }
    if (declaredTotal !== null && page.total !== declaredTotal) {
      throw new PublishedContentFixtureError("Totais das páginas divergem");
    }
    declaredTotal = page.total;
    for (const item of page.items) {
      if (!item.item_id || typeof item.item_id !== "string") {
        throw new PublishedContentFixtureError("item_id da analytics é obrigatório");
      }
      if (ids.has(item.item_id)) {
        throw new PublishedContentFixtureError("item_id repetido na analytics da fixture");
      }
      ids.add(item.item_id);
    }
  });
  if (declaredTotal !== ids.size) {
    throw new PublishedContentFixtureError("Total da fixture não corresponde aos itens distintos");
  }

  const edges = new Set<string>();
  for (const edge of source.associations) {
    if (!edge.item_id || !edge.product_id) {
      throw new PublishedContentFixtureError("Associação exige item_id e product_id");
    }
    if (!ids.has(edge.item_id)) {
      throw new PublishedContentFixtureError("Associação aponta para item sem analytics");
    }
    if (
      !SHOWCASE_PRODUCT_FIXTURES.some(
        (showcase) => showcase.externalProductId === edge.product_id,
      )
    ) {
      throw new PublishedContentFixtureError("Associação aponta para produto fora da Vitrine");
    }
    const key = `${edge.item_id}\u0000${edge.product_id}`;
    if (edges.has(key)) {
      throw new PublishedContentFixtureError("Associação duplicada na fixture");
    }
    edges.add(key);
  }
  return source.analytics.flatMap((page) => page.items);
}

/** Associações do Product, com productIds distintos e ordenados deterministicamente por vídeo. */
function productsByItem(
  associations: PublishedVideoItemAssociationFixture[],
): Map<string, string[]> {
  const byItem = new Map<string, Set<string>>();
  for (const edge of associations) {
    const products = byItem.get(edge.item_id) ?? new Set<string>();
    products.add(edge.product_id);
    byItem.set(edge.item_id, products);
  }
  return new Map(
    [...byItem].map(([itemId, products]) => [itemId, [...products].sort()]),
  );
}

/**
 * Produz a resposta pública de conteúdos publicados de um Product: vídeos
 * distintos associados ao sourceId da Vitrine, na ordem da fixture, recortados
 * pela página solicitada. Sem sourceId, coleção vazia — nunca outro Product.
 */
export function buildLinkedContents(
  product: { id: string; provenance: unknown },
  page: number,
  pageSize: number,
  source: PublishedContentSource = DEFAULT_SOURCE,
): LinkedContentsResponse {
  requirePositiveInteger(page, "Página");
  requirePositiveInteger(pageSize, "PageSize");
  if (typeof product.id !== "string" || !product.id.trim()) {
    throw new PublishedContentFixtureError("Product id inválido");
  }

  const externalProductId = readSourceId(product.provenance);
  if (!externalProductId) return emptyResponse(product.id, page, pageSize);

  const items = validatedSource(source);
  const productIdsByItem = productsByItem(source.associations);
  const associatedIds = new Set(
    source.associations
      .filter((edge) => edge.product_id === externalProductId)
      .map((edge) => edge.item_id),
  );
  const videos = items
    .filter((item) => associatedIds.has(item.item_id))
    .map((item) => projectVideo(item, productIdsByItem.get(item.item_id) ?? []));
  const total = videos.length;
  const selected = videos.slice((page - 1) * pageSize, page * pageSize);

  const showcaseProduct = SHOWCASE_PRODUCT_FIXTURES.find(
    (showcase) => showcase.externalProductId === externalProductId,
  );

  return {
    productId: product.id,
    externalProductId,
    ...(showcaseProduct ? { showcaseProduct } : {}),
    videos: selected,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}
