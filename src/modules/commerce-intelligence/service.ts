import { createHash } from "node:crypto";
import { CommerceIntelligenceJobStatus } from "@prisma/client";
import { prisma } from "../db";
import { GenerationError } from "./errors";
import { validateTargetContentCount } from "./contract";
import { monthUtc } from "../entitlements/generation";

export async function startCommerceIntelligence(input: { tenantId: string; userId: string; productId: string; idempotencyKey: string }) {
  const fingerprint = createHash("sha256").update(`${input.tenantId}:${input.productId}`).digest("hex");
  return prisma.$transaction(async (tx) => {
    const replay = await tx.commerceIntelligenceJob.findFirst({ where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } });
    if (replay) { if (replay.fingerprint !== fingerprint) throw new GenerationError("GEN-IDEMPOTENCY", "Chave já utilizada"); return replay; }
    const product = await tx.product.findFirst({ where: { tenantId: input.tenantId, id: input.productId } });
    if (!product || product.lifecycle !== "ACTIVE") throw new GenerationError("GEN-PRODUCT", "Produto não disponível");
    const count = validateTargetContentCount(product.targetContentCount);
    const active = await tx.commerceIntelligenceJob.findFirst({ where: activeJobWhere(input.tenantId, input.userId) });
    if (active) { console.info("[generation-active]", { tenantId: input.tenantId, userId: input.userId, activeJobId: active.id, code: "GEN-ACTIVE" }); throw new GenerationError("GEN-ACTIVE", "Já existe uma análise em andamento"); }
    const ready = await tx.commerceIntelligenceJob.findFirst({ where: { tenantId: input.tenantId, productId: product.id, status: "SUCCEEDED" } });
    if (ready) throw new GenerationError("GEN-READY", "Produto já está pronto");
    if (!product.name.trim() || !product.description?.trim() || !product.generationConstraints) throw new GenerationError("GEN-PRODUCT", "Produto sem fatos confirmados");
    const month = monthUtc();
    const entitlement = await tx.tenantEntitlement.findUnique({ where: { tenantId: input.tenantId } });
    if (entitlement) {
      await tx.$queryRaw`SELECT "tenantId" FROM "tenant_entitlements" WHERE "tenantId" = ${input.tenantId} FOR UPDATE`;
      const activeProductCount = await tx.product.count({ where: { tenantId: input.tenantId, lifecycle: "ACTIVE" } });
      await tx.tenantEntitlement.update({ where: { tenantId: input.tenantId }, data: { activeProductsUsed: activeProductCount } });
    }
    const reserved = await tx.generationUsageReservation.aggregate({ _sum: { quantity: true }, where: { tenantId: input.tenantId, generatedContentsMonth: month, status: { in: ["RESERVED", "CONFIRMED"] } } });
    const capacity = Number(process.env.GENERATED_CONTENTS_MONTH_LIMIT);
    if (!Number.isInteger(capacity) || capacity <= 0 || (reserved._sum.quantity ?? 0) + count > capacity) throw new GenerationError("GEN-CAPACITY", "Capacidade mensal insuficiente");
    const job = await tx.commerceIntelligenceJob.create({ data: { tenantId: input.tenantId, userId: input.userId, productId: product.id, idempotencyKey: input.idempotencyKey, fingerprint, targetContentCount: count, generatedContentsMonth: month, status: "QUEUED", stage: "UNDERSTANDING_PRODUCT" } });
    await tx.generationUsageReservation.create({ data: { tenantId: input.tenantId, jobId: job.id, generatedContentsMonth: job.generatedContentsMonth, quantity: count } });
    return job;
  });
}
export function activeJobWhere(tenantId: string, userId: string, productId?: string) {
  return { tenantId, userId, ...(productId ? { productId } : {}), status: { in: ["QUEUED", "RUNNING"] as CommerceIntelligenceJobStatus[] } };
}
export async function findBlockingGeneration(tenantId: string, userId: string, productId?: string) {
  return prisma.commerceIntelligenceJob.findFirst({ where: activeJobWhere(tenantId, userId, productId), orderBy: { createdAt: "desc" } });
}
