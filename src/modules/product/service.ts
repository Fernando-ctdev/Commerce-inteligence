// Casos de uso de Product/contexto — SPEC/PLAN 002.
// Criação: transação única com verificação de capacidade (FOR UPDATE no entitlement),
// registro de idempotência (24h) e Product ativo. Atualização: versão otimista.
// Escopo: Tenant sempre derivado da sessão no chamador; tenant_id do cliente nunca entra aqui.
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { IDEMPOTENCY_TTL_MS, assertProductCapacity } from "../entitlements/service";
import { payloadHash, type NormalizedProductInput } from "./validation";

export class IdempotencyConflictError extends Error {} // mesma chave com payload diferente
export class StaleVersionError extends Error {}

export type ProductView = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  priceCents: number | null;
  features: string[] | null;
  imageRefs: string[] | null;
  notes: string | null;
  url: string | null;
  locale: string;
  active: boolean;
  version: number;
  enrichmentStatus: string;
  context: {
    goal: string | null;
    audience: string | null;
    style: string | null;
    creatorPresence: string | null;
    experience: string | null;
    constraints: string | null;
    market: string | null;
    notes: string | null;
    locale: string;
  } | null;
  readyForStrategy: boolean; // nome/descrição válidos + registro de contexto pt-BR salvo (SPEC 002 L.141)
  createdAt: string;
  updatedAt: string;
};

function toView(p: {
  id: string;
  name: string;
  description: string;
  category: string | null;
  priceCents: bigint | null;
  features: unknown;
  imageRefs: unknown;
  notes: string | null;
  url: string | null;
  locale: string;
  active: boolean;
  version: number;
  enrichmentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  context: {
    goal: string | null;
    audience: string | null;
    style: string | null;
    creatorPresence: string | null;
    experience: string | null;
    constraints: string | null;
    market: string | null;
    notes: string | null;
    locale: string;
  } | null;
}): ProductView {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    priceCents: p.priceCents === null ? null : Number(p.priceCents),
    features: (p.features as string[] | null) ?? null,
    imageRefs: (p.imageRefs as string[] | null) ?? null,
    notes: p.notes,
    url: p.url,
    locale: p.locale,
    active: p.active,
    version: p.version,
    enrichmentStatus: p.enrichmentStatus,
    context: p.context,
    readyForStrategy: p.context !== null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const includeContext = { context: true } as const;

/**
 * Cria Product ativo com idempotência por (tenantId, chave).
 * - mesma chave + mesmo payload normalizado (dentro de 24h) → mesmo Product
 * - mesma chave + payload diferente → IdempotencyConflictError sem mutação
 * - chave expirada → nova intenção, sem alterar o Product anterior
 * - capacidade: FOR UPDATE no entitlement; limite atingido → ProductLimitError sem estado parcial
 */
export async function createProduct(
  tenantId: string,
  input: NormalizedProductInput,
  idempotencyKey: string,
  onCommitted?: (productId: string, url: string | null) => void
): Promise<{ product: ProductView; replay: boolean }> {
  const hash = payloadHash(input);
  const product = await prisma.$transaction(async (tx) => {
    const existing = await tx.idempotencyRecord.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      if (existing.payloadHash !== hash) throw new IdempotencyConflictError();
      const p = await tx.product.findUnique({ where: { id: existing.productId }, include: includeContext });
      if (p) return { p, replay: true };
      // registro órfão não deveria existir (FK); trata como nova intenção abaixo
    }

    await assertProductCapacity(tx, tenantId);

    const created = await tx.product.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description,
        category: input.category,
        priceCents: input.priceCents === null ? null : BigInt(input.priceCents),
        features: input.features ?? undefined,
        imageRefs: input.imageRefs ?? undefined,
        notes: input.notes,
        url: input.url,
        enrichmentStatus: input.url ? "pending" : "none",
        ...(input.context
          ? {
              context: {
                create: {
                  goal: input.context.goal,
                  audience: input.context.audience,
                  style: input.context.style,
                  creatorPresence: input.context.creatorPresence,
                  experience: input.context.experience,
                  constraints: input.context.constraints,
                  market: input.context.market,
                  notes: input.context.notes,
                },
              },
            }
          : {}),
      },
      include: includeContext,
    });

    if (existing) {
      // chave expirada reutilizada: nova intenção apontando para o novo Product
      await tx.idempotencyRecord.update({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
        data: { payloadHash: hash, productId: created.id, createdAt: new Date(), expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) },
      });
    } else {
      await tx.idempotencyRecord.create({
        data: {
          tenantId,
          idempotencyKey,
          payloadHash: hash,
          productId: created.id,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      });
    }
    return { p: created, replay: false };
  });

  const view = toView(product.p);
  // enriquecimento é ação separada pós-commit: nunca bloqueia nem falha a criação manual
  onCommitted?.(view.id, view.url);
  return { product: view, replay: product.replay };
}

/** Leitura escopada ao Tenant; Product inexistente ou de outro Tenant → null (uniforme, não enumerável). */
export async function getProduct(tenantId: string, productId: string): Promise<ProductView | null> {
  const p = await prisma.product.findFirst({ where: { id: productId, tenantId }, include: includeContext });
  return p ? toView(p) : null;
}

/** Leitura autorizada reutilizável por Generation, inclusive dentro da sua transação. */
export async function getProductForGeneration(
  tenantId: string,
  productId: string,
  db: Pick<PrismaClient, "product"> | Prisma.TransactionClient = prisma
): Promise<ProductView | null> {
  const p = await db.product.findFirst({ where: { id: productId, tenantId }, include: includeContext });
  return p ? toView(p) : null;
}

/** Lista os Products ativos do Tenant (mais recentes primeiro); Tenant vem sempre da sessão no chamador. */
export async function listProducts(tenantId: string): Promise<ProductView[]> {
  const products = await prisma.product.findMany({
    where: { tenantId, active: true },
    orderBy: { updatedAt: "desc" },
    include: includeContext,
  });
  return products.map(toView);
}

/**
 * Atualização de fatos/contexto com versão otimista.
 * `expectedVersion` é a versão observada pelo cliente; versão obsoleta → StaleVersionError
 * preservando a edição mais recente. Campos de fatos ausentes são preservados (merge).
 */
export async function updateProduct(
  tenantId: string,
  productId: string,
  expectedVersion: number,
  patch: Partial<NormalizedProductInput>
): Promise<ProductView> {
  const updated = await prisma.$transaction(async (tx) => {
    // trava otimista: update condicional à versão observada; 0 linhas → 404 ou conflito
    const base = await tx.product.findFirst({ where: { id: productId, tenantId }, include: includeContext });
    if (!base) return null;

    if (patch.context) {
      const data = {
        goal: patch.context.goal,
        audience: patch.context.audience,
        style: patch.context.style,
        creatorPresence: patch.context.creatorPresence,
        experience: patch.context.experience,
        constraints: patch.context.constraints,
        market: patch.context.market,
        notes: patch.context.notes,
      };
      if (base.context) {
        await tx.productContext.update({ where: { productId }, data });
      } else {
        await tx.productContext.create({ data: { productId, ...data } });
      }
    }

    const facts: Record<string, unknown> = {};
    if (patch.name !== undefined) facts.name = patch.name;
    if (patch.description !== undefined) facts.description = patch.description;
    if (patch.category !== undefined) facts.category = patch.category;
    if (patch.priceCents !== undefined) facts.priceCents = patch.priceCents === null ? null : BigInt(patch.priceCents);
    if (patch.features !== undefined) facts.features = patch.features ?? null;
    if (patch.imageRefs !== undefined) facts.imageRefs = patch.imageRefs ?? null;
    if (patch.notes !== undefined) facts.notes = patch.notes;
    if (patch.url !== undefined) facts.url = patch.url;

    const result = await tx.product.updateMany({
      where: { id: productId, tenantId, version: expectedVersion },
      data: { ...facts, version: { increment: 1 } },
    });
    if (result.count === 0) throw new StaleVersionError();
    return tx.product.findUnique({ where: { id: productId }, include: includeContext });
  });
  if (!updated) throw new Error("PRODUCT_NOT_FOUND"); // mapeado para 404 uniforme no handler
  return toView(updated);
}

/** Registra o estado de enriquecimento sem tocar na versão (não é edição concorrente do usuário). */
export async function setEnrichmentStatus(productId: string, status: "pending" | "completed" | "unavailable"): Promise<void> {
  await prisma.product.update({ where: { id: productId }, data: { enrichmentStatus: status } });
}
