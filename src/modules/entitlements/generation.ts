import { Prisma } from "@prisma/client";

import { CapacityUnavailableError } from "./service";

export class GeneratedContentsLimitReachedError extends Error {}

export function resolveGeneratedContentsMonthlyLimit(): number {
  const raw = process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  const limit = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new CapacityUnavailableError();
  return limit;
}

export function monthlyPeriodStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("INVALID_GENERATION_QUANTITY");
}

export async function reserveGeneratedContents(
  tx: Prisma.TransactionClient,
  tenantId: string,
  generationRunId: string,
  quantity: number,
  createdAt: Date
): Promise<void> {
  assertQuantity(quantity);
  const entitlement = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "entitlements" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  if (entitlement.length === 0) throw new CapacityUnavailableError();

  const existing = await tx.generationUsageReservation.findUnique({ where: { generationRunId } });
  if (existing) {
    if (existing.quantity === quantity && (existing.status === "reserved" || existing.status === "confirmed")) return;
    throw new Error("GENERATION_RESERVATION_CONFLICT");
  }

  const limit = resolveGeneratedContentsMonthlyLimit();
  const periodStart = monthlyPeriodStart(createdAt);
  const usage = await tx.generationUsageReservation.findMany({
    where: { tenantId, periodStart, status: { in: ["reserved", "confirmed"] } },
    select: { quantity: true },
  });
  const used = usage.reduce((sum, item) => sum + item.quantity, 0);
  if (used + quantity > limit) throw new GeneratedContentsLimitReachedError();

  await tx.generationUsageReservation.create({
    data: { tenantId, generationRunId, periodStart, quantity, status: "reserved", reason: "generation_started" },
  });
}

export async function confirmGeneratedContents(tx: Prisma.TransactionClient, generationRunId: string, reason = "generation_succeeded"): Promise<number> {
  const result = await tx.generationUsageReservation.updateMany({
    where: { generationRunId, status: "reserved" },
    data: { status: "confirmed", reason, confirmedAt: new Date() },
  });
  return result.count;
}

export async function releaseGeneratedContents(tx: Prisma.TransactionClient, generationRunId: string, reason: string): Promise<void> {
  await tx.generationUsageReservation.updateMany({
    where: { generationRunId, status: "reserved" },
    data: { status: "released", reason, releasedAt: new Date() },
  });
}

export async function reconcileGeneratedContents(tx: Prisma.TransactionClient, generationRunId: string, status: "succeeded" | "failed" | "cancelled"): Promise<void> {
  if (status === "succeeded") {
    await confirmGeneratedContents(tx, generationRunId, "reconciliation_succeeded");
    return;
  }
  return releaseGeneratedContents(tx, generationRunId, `reconciliation_${status}`);
}
