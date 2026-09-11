import { createHash } from "node:crypto";
import { CommerceIntelligenceJobStatus } from "@prisma/client";
import { prisma } from "../db";
import { captureJobPreferenceSnapshots } from "../creator-preferences/service";
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
    // Slice 011 (ADR-018): snapshot autorizado das preferências no início do Job — gravado
    // no inputSnapshot; retry técnico reutiliza e mutação posterior não altera a execução.
    const { accountContext, creatorPreferences } = await captureJobPreferenceSnapshots(input.tenantId, tx);
    const job = await tx.commerceIntelligenceJob.create({ data: { tenantId: input.tenantId, userId: input.userId, productId: product.id, idempotencyKey: input.idempotencyKey, fingerprint, targetContentCount: count, generatedContentsMonth: month, status: "QUEUED", stage: "UNDERSTANDING_PRODUCT", inputSnapshot: { accountContext, creatorPreferences } } });
    await tx.generationUsageReservation.create({ data: { tenantId: input.tenantId, jobId: job.id, generatedContentsMonth: job.generatedContentsMonth, quantity: count } });
    return job;
  });
}
export function activeJobWhere(tenantId: string, userId: string, productId?: string) {
  return { tenantId, userId, ...(productId ? { productId } : {}), status: { in: ["QUEUED", "RUNNING"] as CommerceIntelligenceJobStatus[] } };
}

// ADR-016: projeção server-authoritative advisory para leituras autenticadas de Product.
// Nunca autoriza mutação — POST /api/generations conserva sessão, CSRF, escopo e transação
// como fonte definitiva. Escopada a tenantId+userId da sessão; sem plano, limite, saldo ou
// reserva no payload. GEN-ACTIVE precede capacidade (mesma ordem do POST). Block de
// capacidade: restante mensal < 1 (menor targetContentCount válido, AC 1–30).
export type GenerationAction =
  | { state: "AVAILABLE"; reason: null; nextAction: null }
  | { state: "BLOCKED"; reason: "GEN-ACTIVE" | "GEN-CAPACITY"; nextAction: "VIEW_ACTIVE_ANALYSIS" | "WAIT_FOR_CAPACITY" };

export async function projectGenerationAction(scope: { tenantId: string; userId: string }): Promise<GenerationAction> {
  const active = await prisma.commerceIntelligenceJob.findFirst({ where: activeJobWhere(scope.tenantId, scope.userId) });
  if (active) return { state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: "VIEW_ACTIVE_ANALYSIS" };
  const held = await prisma.generationUsageReservation.aggregate({ _sum: { quantity: true }, where: { tenantId: scope.tenantId, generatedContentsMonth: monthUtc(), status: { in: ["RESERVED", "CONFIRMED"] } } });
  const capacity = Number(process.env.GENERATED_CONTENTS_MONTH_LIMIT);
  const remaining = Number.isInteger(capacity) && capacity > 0 ? capacity - (held._sum.quantity ?? 0) : 0;
  if (remaining < 1) return { state: "BLOCKED", reason: "GEN-CAPACITY", nextAction: "WAIT_FOR_CAPACITY" };
  return { state: "AVAILABLE", reason: null, nextAction: null };
}
export async function findBlockingGeneration(tenantId: string, userId: string, productId?: string) {
  return prisma.commerceIntelligenceJob.findFirst({ where: activeJobWhere(tenantId, userId, productId), orderBy: { createdAt: "desc" } });
}
