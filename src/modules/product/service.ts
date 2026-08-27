// Casos de uso de Product — SPEC/PLAN 002 (fallback manual + confirmação de Candidate importado).
// Criação: transação única com verificação de capacidade (FOR UPDATE no entitlement),
// registro de idempotência (24h) e Product ativo. Atualização: versão otimista.
// Escopo: Tenant sempre derivado da sessão no chamador; tenant_id do cliente nunca entra aqui.
// Contexto estratégico (ProductContext) não é mais criado aqui: permanece somente leitura
// histórica para Products pré-slice 002 (Generation aceita Product sem contexto).
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { IDEMPOTENCY_TTL_MS, assertProductCapacity } from "../entitlements/service";
import { createBrowserClient, type BrowserClient } from "../browser/client";
import { loadCandidateForConfirmation } from "../product-import/service";
import { payloadHash, type CandidateEdits, type NormalizedProductInput } from "./validation";

export class IdempotencyConflictError extends Error {} // mesma chave com payload diferente
export class StaleVersionError extends Error {}
export class CandidateNotFoundError extends Error {} // inexistente ou de outro Tenant (404 uniforme)
export class CandidateStaleVersionError extends Error {} // versão observada pelo cliente está obsoleta
export class CandidateNotConfirmableError extends Error {} // attempt não está ready / Candidate expirado
export class CandidateIncompleteError extends Error {} // mínimos (nome/descrição) não satisfeitos


export type ProductView = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  brand: string | null;
  seller: string | null;
  variants: string[] | null;
  priceCents: number | null;
  priceCurrency: string | null; // moeda informada quando existente; nunca assumida
  features: string[] | null;
  imageRefs: string[] | null;
  notes: string | null;
  url: string | null;
  canonicalUrl: string | null; // identidade canônica comprovada pelo Browser Service
  sourceKind: string; // "manual" | "browser"
  factsVersion: number;
  confirmedAt: string | null;
  factProvenance: Record<string, string> | null;
  locale: string;
  active: boolean;
  version: number;
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
  } | null; // histórico pré-002; novos cadastros não criam
  readyForStrategy: boolean; // SPEC 002: estratégia dispensa contexto — ativo basta
  createdAt: string;
  updatedAt: string;
};

function toView(p: {
  id: string;
  name: string;
  description: string;
  category: string | null;
  brand: string | null;
  seller: string | null;
  variants: unknown;
  priceCents: bigint | null;
  priceCurrency: string | null;
  features: unknown;
  imageRefs: unknown;
  notes: string | null;
  url: string | null;
  canonicalUrl: string | null;
  sourceKind: string;
  factsVersion: number;
  confirmedAt: Date | null;
  factProvenance: unknown;
  locale: string;
  active: boolean;
  version: number;
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
    brand: p.brand,
    seller: p.seller,
    variants: (p.variants as string[] | null) ?? null,
    priceCents: p.priceCents === null ? null : Number(p.priceCents),
    priceCurrency: p.priceCurrency,
    features: (p.features as string[] | null) ?? null,
    imageRefs: (p.imageRefs as string[] | null) ?? null,
    notes: p.notes,
    url: p.url,
    canonicalUrl: p.canonicalUrl,
    sourceKind: p.sourceKind,
    factsVersion: p.factsVersion,
    confirmedAt: p.confirmedAt === null ? null : p.confirmedAt.toISOString(),
    factProvenance: (p.factProvenance as Record<string, string> | null) ?? null,
    locale: p.locale,
    active: p.active,
    version: p.version,
    context: p.context,
    readyForStrategy: p.active,
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
  idempotencyKey: string
): Promise<{ product: ProductView; replay: boolean }> {
  const hash = payloadHash(input);
  const product = await prisma.$transaction(async (tx) => {
    let existing = await tx.idempotencyRecord.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      if (existing.payloadHash !== hash) throw new IdempotencyConflictError();
      const p = await tx.product.findUnique({ where: { id: existing.productId }, include: includeContext });
      if (p) return { p, replay: true };
    }

    // Lock capacity before the second read so concurrent first-use replays converge.
    await assertProductCapacity(tx, tenantId);
    existing = await tx.idempotencyRecord.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      if (existing.payloadHash !== hash) throw new IdempotencyConflictError();
      const p = await tx.product.findUnique({ where: { id: existing.productId }, include: includeContext });
      if (p) return { p, replay: true };
    }

    const created = await tx.product.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description,
        category: input.category,
        brand: input.brand,
        seller: input.seller,
        variants: input.variants ?? undefined,
        priceCents: input.priceCents === null ? null : BigInt(input.priceCents),
        priceCurrency: input.priceCurrency,
        features: input.features ?? undefined,
        imageRefs: input.imageRefs ?? undefined,
        notes: input.notes,
        url: input.url,
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

  return { product: toView(product.p), replay: product.replay };
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

    const facts: Record<string, unknown> = {};
    if (patch.name !== undefined) facts.name = patch.name;
    if (patch.description !== undefined) facts.description = patch.description;
    if (patch.category !== undefined) facts.category = patch.category;
    if (patch.brand !== undefined) facts.brand = patch.brand;
    if (patch.seller !== undefined) facts.seller = patch.seller;
    if (patch.variants !== undefined) facts.variants = patch.variants ?? null;
    if (patch.priceCents !== undefined) facts.priceCents = patch.priceCents === null ? null : BigInt(patch.priceCents);
    if (patch.priceCurrency !== undefined) facts.priceCurrency = patch.priceCurrency;
    if (patch.features !== undefined) facts.features = patch.features ?? null;
    if (patch.imageRefs !== undefined) facts.imageRefs = patch.imageRefs ?? null;
    if (patch.notes !== undefined) facts.notes = patch.notes;
    if (patch.url !== undefined) facts.url = patch.url;
    if (Object.keys(facts).length > 0) {
      const result = await tx.product.updateMany({
        where: { id: productId, tenantId, version: expectedVersion },
        data: { ...facts, version: { increment: 1 }, factsVersion: { increment: 1 } },
      });
      if (result.count === 0) throw new StaleVersionError();
    }
    return tx.product.findUnique({ where: { id: productId }, include: includeContext });
  });
  if (!updated) throw new Error("PRODUCT_NOT_FOUND"); // mapeado para 404 uniforme no handler
  return toView(updated);
}

/**
 * Confirma um Candidate de importação como Product (human-in-the-loop, SPEC 002):
 * recarrega os fatos server-side dentro da transação (nada do cliente é fonte factual),
 * aplica correções do creator (proveniência creator-confirmed por campo), deduplica por
 * URL canônica comprovada pelo Browser Service, verifica capacidade com lock (FOR UPDATE)
 * e cria o Product ativo em sourceKind=browser. Sessão do browser é encerrada após o
 * commit (best-effort), preservando o profile. Replay: confirmação repetida devolve o
 * mesmo Product; URL canônica já confirmada → {duplicate} sem mutação.
 */

type ProductWithCtx = Prisma.ProductGetPayload<{ include: { context: true } }>;
type ConfirmTxOutcome = { product: ProductWithCtx; replay: boolean } | { duplicate: true; productId: string };

export async function confirmCandidate(
  tenantId: string,
  attemptId: string,
  expectedCandidateVersion: number,
  edits: CandidateEdits,
  client?: BrowserClient
): Promise<{ product: ProductView; replay: boolean } | { duplicate: true; productId: string }> {
  const head = await prisma.productImportAttempt.findFirst({
    where: { id: attemptId, tenantId },
    select: { sessionId: true, canonicalUrl: true },
  });
  if (!head) throw new CandidateNotFoundError();

  const outcome: ConfirmTxOutcome = await prisma
    .$transaction(async (tx): Promise<ConfirmTxOutcome> => {
      const loaded = await loadCandidateForConfirmation(tx, tenantId, attemptId);
      if (!loaded) throw new CandidateNotFoundError();
      const { attempt, candidate } = loaded;

      if (attempt.status === "confirmed" && candidate.confirmedProductId !== null) {
        const existing = await tx.product.findUnique({ where: { id: candidate.confirmedProductId }, include: includeContext });
        if (existing) return { product: existing, replay: true };
      }
      if (attempt.status !== "ready" || candidate.expiresAt.getTime() <= Date.now()) throw new CandidateNotConfirmableError();
      if (candidate.version !== expectedCandidateVersion) throw new CandidateStaleVersionError();

      // merge das correções sobre os fatos extraídos; todo campo editado vira creator-confirmed
      const facts = { ...candidate.payload, ...edits } as typeof candidate.payload;
      const provenance = { ...candidate.provenance };
      for (const field of Object.keys(edits)) provenance[field] = "creator-confirmed";
      if (facts.name.length === 0 || facts.description === null || facts.description.length === 0) {
        throw new CandidateIncompleteError(); // mínimos do schema: nome + descrição
      }

      if (attempt.canonicalUrl !== null) {
        const dup = await tx.product.findUnique({
          where: { tenantId_canonicalUrl: { tenantId, canonicalUrl: attempt.canonicalUrl } },
          select: { id: true },
        });
        if (dup) return { duplicate: true, productId: dup.id };
      }

      await assertProductCapacity(tx, tenantId);


      const created = await tx.product.create({
        data: {
          tenantId,
          name: facts.name,
          description: facts.description,
          category: facts.category,
          brand: facts.brand,
          seller: facts.seller,
          variants: facts.variants ?? undefined,
          priceCents: facts.priceCents === null ? null : BigInt(facts.priceCents),
          priceCurrency: facts.priceCurrency,
          features: facts.features,
          imageRefs: facts.imageRefs,
          notes: null,
          url: attempt.sourceUrl,
          canonicalUrl: attempt.canonicalUrl,
          sourceKind: "browser",
          factsVersion: 1,
          confirmedAt: new Date(),
          factProvenance: provenance,
        },
        include: includeContext,
      });
      await tx.productImportAttempt.update({
        where: { id: attempt.id },
        data: { status: "confirmed", finishedAt: new Date(), errorCode: null, pauseReason: null, interactiveUrl: null },
      });
      await tx.productCandidate.update({ where: { id: candidate.id }, data: { confirmedProductId: created.id } });
      return { product: created, replay: false };
    })
    .catch(async (e) => {
      // corrida de dedupe: unique (tenantId, canonicalUrl) perdido — devolve duplicata sem erro
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && head.canonicalUrl !== null) {
        const dup = await prisma.product.findUnique({
          where: { tenantId_canonicalUrl: { tenantId, canonicalUrl: head.canonicalUrl } },
          select: { id: true },
        });
        if (dup) return { duplicate: true, productId: dup.id };
      }
      throw e;
    });

  if ("product" in outcome && !outcome.replay) {
    // pós-commit: encerra a sessão do browser preservando o profile (SPEC: confirmação libera o Chromium)
    try {
      if (head.sessionId) await (client ?? createBrowserClient()).close(head.sessionId);
    } catch (e) {
      console.error("browser session close pending:", e instanceof Error ? e.constructor.name : "unknown");
    }
  }
  return "duplicate" in outcome ? outcome : { product: toView(outcome.product), replay: outcome.replay };
}
