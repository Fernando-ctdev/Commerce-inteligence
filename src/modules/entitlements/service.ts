// Entitlements — Slice 002: entitlement default por Tenant (ADR-006) e capacidade `active_products`.
// O limite vem exclusivamente de configuração server-side validada (fail-closed); o registro por Tenant
// é o marcador do default provisionado — não armazena limite editável nem é autoridade do cliente.
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export class CapacityUnavailableError extends Error {} // config ausente/inválida → falha fechada
export class ProductLimitReachedError extends Error {}

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // retenção da chave de idempotência (SPEC/PLAN 002)

/** Provisiona o entitlement default do Tenant dentro da transação de criação (idempotente). */
export async function provisionDefaultEntitlement(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  try {
    await tx.entitlement.create({ data: { tenantId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return; // já provisionado
    throw e;
  }
}

/** Limite vigente de Products ativos: somente configuração server-side; ausente/inválida falha fechada. */
export function resolveActiveProductsLimit(): number {
  const raw = process.env.ENTITLEMENT_ACTIVE_PRODUCTS;
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new CapacityUnavailableError();
  return n;
}

/**
 * Verifica capacidade dentro da transação de criação do Product.
 * `SELECT ... FOR UPDATE` no entitlement do Tenant serializa criações concorrentes:
 * duas no limite deixam no máximo a capacidade configurada, sem Product/uso parcial.
 */
export async function assertProductCapacity(tx: Prisma.TransactionClient, tenantId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ tenantId: string }[]>`
    SELECT "tenantId" FROM "entitlements" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  if (rows.length === 0) await provisionDefaultEntitlement(tx, tenantId); // convergência de backfill/rollout
  const limit = resolveActiveProductsLimit();
  const active = await tx.product.count({ where: { tenantId, active: true } });
  if (active >= limit) throw new ProductLimitReachedError();
  return limit;
}

/** Limpeza operacional: remove registros de idempotência expirados (retenção 24h). */
export async function purgeExpiredIdempotency(): Promise<number> {
  const res = await prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
