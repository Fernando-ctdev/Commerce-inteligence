// Sincronização da Vitrine: os fixtures de showcase.ts são a fonte temporária até a
// API real existir. Cada item vira Product do Tenant com createIdempotencyKey estável
// `showcase-<item.id>`; sincronizar de novo atualiza as mesmas linhas (upsert),
// preserva Products manuais, não cria CommerceIntelligenceJob e não consulta
// limite/geração. Só o allowlist ShowcaseItem é persistido — cookie, request_id,
// cache_url e payload bruto do provedor nunca chegam ao banco.
import type { Prisma, Product } from "@prisma/client";

import { prisma } from "../db";
import { listShowcaseItems, type ShowcaseItem } from "./showcase";
import {
  CATEGORY_MAX,
  DEFAULT_CREATOR_PRESENCE,
  DEFAULT_TARGET_CONTENT_COUNT,
  NAME_MAX,
  normalizePriceAmount,
} from "./service";

const SYNC_DESCRIPTION = "Produto importado da Vitrine TikTok Shop.";
const SYNC_CATEGORY_FALLBACK = "Vitrine TikTok Shop";
const SYNC_CURRENCY = "R$";
const SYNC_CONSTRAINTS =
  "Importado da Vitrine TikTok Shop; revise os dados antes de gerar.";

/** Chave estável por item: @@unique([tenantId, createIdempotencyKey]) decide criar vs atualizar. */
export function showcaseIdempotencyKey(itemId: string): string {
  return `showcase-${itemId}`;
}

/** "R$ 109,99" → "109.99" | "R$ 1.234,56" → "1234.56"; sem preço legível → "0.00" (válido e não negativo). */
function showcasePrice(priceLabel: string | undefined): string {
  const match = priceLabel?.match(/\d[\d.,]*/);
  return match ? normalizePriceAmount(match[0]) : "0.00";
}

/** Metadados allowlisted e visíveis do item, preservados em provenance (sem migração). */
function showcaseProvenance(item: ShowcaseItem): Prisma.InputJsonValue {
  const affiliate = item.affiliateInfo;
  const labels = (item.labels ?? [])
    .map((label) => label.text ?? "")
    .filter(Boolean);
  return {
    origin: "showcase",
    sourceId: item.id,
    ...(affiliate
      ? {
          commissionWithCurrency: affiliate.commissionWithCurrency,
          commissionRate: affiliate.commissionRate,
        }
      : {}),
    ...(typeof item.stockCount === "number"
      ? { stockCount: item.stockCount }
      : {}),
    ...(labels.length > 0 ? { labels } : {}),
  };
}

/** Fatos determinísticos do item: defaults válidos onde a Vitrine não traz o fato. */
function showcaseProductData(item: ShowcaseItem) {
  const cover = item.coverUrl ?? item.imageUrls?.[0];
  return {
    name: item.title.slice(0, NAME_MAX),
    description: SYNC_DESCRIPTION,
    category: (item.categoryName ?? SYNC_CATEGORY_FALLBACK).slice(0, CATEGORY_MAX),
    priceAmount: showcasePrice(item.priceLabel),
    priceCurrency: SYNC_CURRENCY,
    images: (cover ? [cover] : []) as Prisma.InputJsonValue,
    seller: item.sellerName ?? null,
    sourceUrl: `https://shop.tiktok.com/product/${item.id}`,
    provenance: showcaseProvenance(item),
    generationConstraints: {
      creatorPresence: DEFAULT_CREATOR_PRESENCE,
      constraints: SYNC_CONSTRAINTS,
    } as Prisma.InputJsonValue,
  };
}

/**
 * Upsert idempotente de todos os itens da Vitrine no Tenant: chaves estáveis por item
 * decidem criar vs atualizar e execuções repetidas convergem para os mesmos fatos
 * (version incrementa como no PATCH). targetContentCount, lifecycle e submittedUrl de
 * registros existentes não são alterados; Products manuais ficam intocados.
 */
export async function syncShowcaseProducts(tenantId: string): Promise<Product[]> {
  const items = listShowcaseItems();
  return Promise.all(
    items.map((item) => {
      const data = showcaseProductData(item);
      return prisma.product.upsert({
        where: {
          tenantId_createIdempotencyKey: {
            tenantId,
            createIdempotencyKey: showcaseIdempotencyKey(item.id),
          },
        },
        create: {
          tenantId,
          ...data,
          targetContentCount: DEFAULT_TARGET_CONTENT_COUNT,
          createIdempotencyKey: showcaseIdempotencyKey(item.id),
        },
        update: { ...data, version: { increment: 1 } },
      });
    }),
  );
}
