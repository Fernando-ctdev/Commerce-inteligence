// Strategy — limite canônico do módulo (SYSTEM-DESIGN §3): snapshot imutável da análise/decisão.
// O módulo não conhece Next.js, HTTP, fila, quota, provider ou SDK; apenas persiste e expõe o snapshot.
import { Prisma } from "@prisma/client";

import { prisma } from "../db";

export type StrategySnapshotInput = {
  tenantId: string;
  productId: string;
  generationRunId: string;
  contractVersion: string;
  payload: Prisma.InputJsonValue;
  provenance: Prisma.InputJsonValue;
};

export type StrategySnapshot = { payload: unknown; provenance: unknown };

type Db = Pick<Prisma.TransactionClient, "strategy"> | Prisma.TransactionClient;

/** Persiste o snapshot único da run (unicidade por generationRunId garantida no banco). */
export async function persistStrategySnapshot(tx: Prisma.TransactionClient, input: StrategySnapshotInput): Promise<string> {
  const created = await tx.strategy.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      generationRunId: input.generationRunId,
      contractVersion: input.contractVersion,
      payload: input.payload,
      provenance: input.provenance,
    },
    select: { id: true },
  });
  return created.id;
}

export async function loadStrategySnapshot(db: Db = prisma, generationRunId: string): Promise<StrategySnapshot | null> {
  const row = await db.strategy.findUnique({ where: { generationRunId }, select: { payload: true, provenance: true } });
  return row ? { payload: row.payload, provenance: row.provenance } : null;
}

export async function countStrategySnapshots(db: Db = prisma, generationRunId: string): Promise<number> {
  return db.strategy.count({ where: { generationRunId } });
}
