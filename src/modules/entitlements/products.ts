import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { GenerationError } from "../commerce-intelligence/errors";
type EntitlementTx = Pick<Prisma.TransactionClient, "product" | "tenantEntitlement">;
export function defaultActiveProductsLimit(): number | null { const v = Number(process.env.ENTITLEMENT_ACTIVE_PRODUCTS); return Number.isInteger(v) && v > 0 ? v : null; }
// ADR-006: o entitlement inicial default é server-side e criado de forma idempotente junto
// do provisionamento do Tenant. Nunca sobrescreve limite já resolvido (valores existentes
// são preservados); sem configuração válida, a linha nasce com limite nulo e a ativação
// continua fail-closed — não há fallback controlado pelo cliente.
export async function provisionDefaultEntitlement(tenantId: string, tx: EntitlementTx = prisma) { return tx.tenantEntitlement.upsert({ where: { tenantId }, create: { tenantId, activeProductsLimit: defaultActiveProductsLimit(), activeProductsUsed: 0 }, update: {} }); }
export async function reconcileActiveProducts(tenantId: string, tx: EntitlementTx = prisma) { const count = await tx.product.count({ where: { tenantId, lifecycle: "ACTIVE" } }); const entitlement = await tx.tenantEntitlement.update({ where: { tenantId }, data: { activeProductsUsed: count } }); if (!Number.isInteger(entitlement.activeProductsLimit) || entitlement.activeProductsLimit! < 0) throw new GenerationError("GEN-ACTIVE", "Limite de produtos não configurado", false); return entitlement; }
export async function assertActiveProductCapacity(tenantId: string, tx: EntitlementTx = prisma) { const entitlement = await reconcileActiveProducts(tenantId, tx); if (entitlement.activeProductsUsed >= entitlement.activeProductsLimit!) throw new GenerationError("GEN-ACTIVE", "Limite de produtos ativos atingido"); return entitlement; }
