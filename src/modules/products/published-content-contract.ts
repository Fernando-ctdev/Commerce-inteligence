// Contrato compartilhado do conteúdo publicado (Slice 013): tipos públicos que
// atravessam handler, loader e view. Sem import de Prisma, Request, cookies ou
// módulos de banco — nenhum runtime server-only pode vazar ao cliente via types.
// Serialize somente os campos documentados aqui; chaves desconhecidas nunca cruzam.

export type PublishedContentScalar = string | number | boolean | null;

export type ShowcaseLabel = {
  text?: string | null;
  type?: number | null;
  theme?: number | null;
  iconUrl?: string | null;
};

export type ShowcaseProduct = {
  externalProductId: string;
  title: string;
  categoryName?: string;
  priceLabel?: string;
  sellerName?: string;
  sellerId?: string | null;
  stockCount?: number | null;
  canAdd?: boolean | null;
  commission?: string | number | null;
  commissionRate?: number | null;
  commissionExpense?: number | null;
  labels?: ShowcaseLabel[] | null;
};

export type PublishedVideo = {
  itemId: string;
  productIds: string[];
  title?: string;
  coverUrl?: string;
  duration?: number;
  publishedAt?: string;
  playbackUrl?: string;
  fallbackPlaybackUrl?: string;
  business: Record<string, PublishedContentScalar>;
  metrics: Record<string, PublishedContentScalar>;
};

export type LinkedContentsResponse = {
  productId: string;
  externalProductId: string;
  showcaseProduct?: ShowcaseProduct;
  videos: PublishedVideo[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};
