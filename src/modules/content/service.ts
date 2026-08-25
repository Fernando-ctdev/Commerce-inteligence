// Content/Plan — limite canônico do módulo (SYSTEM-DESIGN §3): Plan único e Contents estruturados.
// Sem ações de edição, feedback ou Production (Slices 004+); sem Next.js, HTTP, fila, quota ou provider.
import { Prisma } from "@prisma/client";

import { prisma } from "../db";
import { normalizeHook, type GenerationOutputV1 } from "../generation/contract";

export type PlanAndContentsInput = {
  tenantId: string;
  productId: string;
  generationRunId: string;
  strategyId: string;
  contractVersion: string;
  plan: GenerationOutputV1["plan"];
  contents: GenerationOutputV1["contents"];
  provenance: Prisma.InputJsonValue;
};

type Db = Pick<Prisma.TransactionClient, "plan" | "content"> | Prisma.TransactionClient;

/** Persiste o Plan único e os exatamente N Contents da run, em transação curta do chamador. */
export async function persistPlanAndContents(tx: Prisma.TransactionClient, input: PlanAndContentsInput): Promise<void> {
  const plan = await tx.plan.create({
    data: {
      tenantId: input.tenantId,
      productId: input.productId,
      generationRunId: input.generationRunId,
      strategyId: input.strategyId,
      contractVersion: input.contractVersion,
      payload: input.plan as unknown as Prisma.InputJsonValue,
      provenance: input.provenance,
    },
    select: { id: true },
  });
  await tx.content.createMany({
    data: input.contents.map((content) => ({
      tenantId: input.tenantId,
      productId: input.productId,
      generationRunId: input.generationRunId,
      strategyId: input.strategyId,
      planId: plan.id,
      position: content.position,
      audienceId: content.audience_id,
      painId: content.pain_id,
      desireId: content.desire_id,
      benefitId: content.benefit_id,
      objectionId: content.objection_id,
      angleId: content.angle_id,
      hook: content.hook,
      normalizedHook: normalizeHook(content.hook),
      structure: content.structure,
      script: content.script,
      scenes: content.scenes as unknown as Prisma.InputJsonValue,
      cta: content.cta,
      explanation: content.explanation,
      provenance: input.provenance,
    })),
  });
}

export async function loadPlanPayload(db: Db = prisma, generationRunId: string): Promise<unknown> {
  const row = await db.plan.findUnique({ where: { generationRunId }, select: { payload: true } });
  return row?.payload ?? null;
}

export async function loadContents(db: Db = prisma, generationRunId: string): Promise<GenerationOutputV1["contents"]> {
  const rows = await db.content.findMany({ where: { generationRunId }, orderBy: { position: "asc" } });
  return rows.map((content) => ({
    id: content.id,
    position: content.position,
    audience_id: content.audienceId,
    pain_id: content.painId,
    ...(content.desireId ? { desire_id: content.desireId } : {}),
    ...(content.benefitId ? { benefit_id: content.benefitId } : {}),
    ...(content.objectionId ? { objection_id: content.objectionId } : {}),
    angle_id: content.angleId,
    hook: content.hook,
    structure: content.structure,
    script: content.script,
    scenes: content.scenes as string[],
    cta: content.cta,
    explanation: content.explanation,
  }));
}

export async function countContents(db: Db = prisma, generationRunId: string): Promise<number> {
  return db.content.count({ where: { generationRunId } });
}

export async function countPlans(db: Db = prisma, generationRunId: string): Promise<number> {
  return db.plan.count({ where: { generationRunId } });
}
