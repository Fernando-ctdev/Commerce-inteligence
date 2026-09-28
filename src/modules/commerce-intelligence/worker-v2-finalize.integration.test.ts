// Integração V2 real: engine/planner/skeleton reais + finalizeGeneration transacional.
// O worker não expõe injeção de router; por isso o provider fake fica restrito à
// engine e claim/finalize/persistência usam o caminho real de produção.
process.env.ENGINE_V2 = "1";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { runFirstGeneration } from "./engine";
import { claimGeneration, finalizeGeneration } from "./worker";
import { monthUtc } from "../entitlements/generation";

const prisma = new PrismaClient();

test.after(() => prisma.$disconnect());

const bullets = [
  {
    text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso",
    action: "Destaque",
    rationale: "para mostrar o tecido respirável no uso diário",
    factRefs: ["product:description"],
    cta: "Confira o produto na página.",
  },
  {
    text: "Destaque o tecido respiravel para conectar o tecido respiravel ao uso cotidiano",
    action: "Destaque",
    rationale: "para mostrar o tecido respirável no uso diário",
    factRefs: ["product:description"],
    cta: "Confira o produto na página.",
  },
];

function v2Router(calls: string[]) {
  return {
    describe: () => ({ provider: "test", model: "v2-finalize", instructionVersion: "test" }),
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      calls.push(task);
      if (task === "PRODUCT_UNDERSTANDING")
        return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["b"], emotionalBenefits: ["e"], desiredOutcomes: ["d"], purchaseTriggers: ["t"], purchaseBarriers: ["b"], evidenceRefs: ["product:name"] };
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING")
        return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["querer praticidade"], objections: ["o"], opportunities: [
          { relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["p"], sellingArgument: "resolve o dia a dia", confidence: 0.9, evidenceRefs: ["product:description"] },
          { relevantCapabilities: ["cap2"], benefits: ["acabamento reforçado"], proofOptions: ["p2"], sellingArgument: "durabilidade real", confidence: 0.8, evidenceRefs: ["product:description"] },
        ] };
      if (task === "STRATEGY_SYNTHESIS")
        return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
      if (task === "CONTENT_PLAN_GENERATION" || task === "CONTENT_SCENE_IDEAS")
        throw new Error(`${task} não pode rodar no caminho V2`);
      if (task === "CONTENT_BRIEF_GENERATION") {
        const context = input?.trustedContext as { realizations?: unknown[] } | undefined;
        return {
          developmentSchemaVersion: 2,
          items: Array.from({ length: context?.realizations?.length ?? 1 }, () => ({
          angle: "demonstração",
          hook: "Veja o tecido respirável",
          development: bullets,
          script: "Mostre o Produto.",
          cta: "Confira o produto na página.",
        })) };
      }
      if (task === "CONTENT_QUALITY_JUDGE" || task === "CONTENT_PART_REPAIR" || task === "CONTENT_BRIEF_REPAIR") return { items: [] };
      return {};
    },
  };
}

test("V2 real finaliza atomically com handoff planejado, bullets V2 e ContentSceneSet separado", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    t.skip("DATABASE_URL inacessível — integração V2 pulada");
    return;
  }

  const user = await prisma.user.create({ data: { email: `v2-finalize-${randomUUID()}@teste.local`, passwordHash: "test" } });
  const tenant = await prisma.tenant.create({ data: { userId: user.id } });
  const product = await prisma.product.create({
    data: { tenantId: tenant.id, name: "Produto V2", description: "Tecido respirável", images: [], provenance: {}, targetContentCount: 1 },
  });
  const job = await prisma.commerceIntelligenceJob.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      productId: product.id,
      idempotencyKey: randomUUID(),
      fingerprint: randomUUID(),
      targetContentCount: 1,
      generatedContentsMonth: monthUtc(),
      status: "QUEUED",
      stage: "UNDERSTANDING_PRODUCT",
      nextAttemptAt: new Date(Date.now() - 60_000),
    },
  });
  await prisma.generationUsageReservation.create({
    data: { tenantId: tenant.id, jobId: job.id, generatedContentsMonth: monthUtc(), quantity: 1 },
  });

  try {
    const claim = await claimGeneration(new Date(), "v2-finalize-owner", job.id);
    assert.ok(claim, "claim real adquiriu o fence");
    const calls: string[] = [];
    const output = await runFirstGeneration({
      productId: product.id,
      jobId: job.id,
      name: product.name,
      description: product.description ?? "",
      targetContentCount: 1,
      router: v2Router(calls),
      creatorContext: { recordsAlone: true },
    });

    assert.ok(output.plannedV2?.length === 1, "handoff vem do Planner V2 real");
    assert.equal(output.sceneSets.length, 1, "skeleton V2 gerou um set transitório");
    const canonicalBullets = output.developmentBullets?.[0]?.bullets;
    assert.ok(canonicalBullets, "engine entrega bullets V2 canônicos para a persistência");
    assert.equal(calls.includes("CONTENT_PLAN_GENERATION"), false);
    assert.equal(calls.includes("CONTENT_SCENE_IDEAS"), false);

    await finalizeGeneration(job, "v2-finalize-owner", claim.attempt, output, output.sceneSets, { integration: "worker-v2-finalize" });

    const [storedJob, reservation, content, sceneSet] = await Promise.all([
      prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } }),
      prisma.generationUsageReservation.findFirstOrThrow({ where: { jobId: job.id } }),
      prisma.content.findFirstOrThrow({ where: { tenantId: tenant.id, jobId: job.id }, include: { briefs: true } }),
      prisma.contentSceneSet.findFirstOrThrow({ where: { tenantId: tenant.id, jobId: job.id } }),
    ]);
    const payload = content.briefs[0]!.payload as Record<string, unknown>;

    assert.equal(storedJob.status, "SUCCEEDED");
    assert.equal(reservation.status, "CONFIRMED", "quota é confirmada somente com o commit V2");
    assert.equal(reservation.quantity, 1);
    assert.equal(content.tenantId, tenant.id, "conteúdo fica escopado ao tenant do job");
    assert.equal(sceneSet.tenantId, tenant.id, "cenas ficam escopadas ao tenant do job");
    assert.equal(payload.version, 2);
    assert.equal(payload.developmentSchemaVersion, 2);
    assert.deepEqual(payload.development, canonicalBullets, "handoff persiste exatamente os bullets canônicos da engine");
    assert.equal("scenes" in payload, false, "brief V2 não persiste cenas");
    assert.equal(sceneSet.contentId, content.id);
    assert.equal(sceneSet.briefVersionId, content.currentBriefVersionId);
    assert.equal(sceneSet.status, "AVAILABLE");
    assert.ok(Array.isArray((sceneSet.payload as Record<string, unknown>).scenes));

    await assert.rejects(
      () => finalizeGeneration(job, "v2-finalize-owner", claim.attempt, output, output.sceneSets, { integration: "worker-v2-finalize" }),
      (error: unknown) => (error as { code?: string }).code === "GEN-FENCED",
      "re-finalize com fence já consumido é rejeitado",
    );
    assert.equal(await prisma.content.count({ where: { jobId: job.id } }), 1, "re-finalize não duplica conteúdo");
    assert.equal(await prisma.contentSceneSet.count({ where: { jobId: job.id } }), 1, "re-finalize não duplica cenas");
    assert.equal(await prisma.intelligenceRun.count({ where: { jobId: job.id } }), 1, "re-finalize não duplica IntelligenceRun");
  } finally {
    await prisma.generationUsageReservation.deleteMany({ where: { jobId: job.id } });
    await prisma.briefValidationReport.deleteMany({ where: { jobId: job.id } });
    await prisma.content.updateMany({ where: { jobId: job.id }, data: { currentBriefVersionId: null, approvedBriefVersionId: null } });
    await prisma.contentSceneSet.deleteMany({ where: { jobId: job.id } });
    await prisma.contentBriefVersion.deleteMany({ where: { jobId: job.id } });
    await prisma.content.deleteMany({ where: { jobId: job.id } });
    await prisma.contentOpportunity.deleteMany({ where: { jobId: job.id } });
    await prisma.contentPlan.deleteMany({ where: { jobId: job.id } });
    await prisma.productStrategy.deleteMany({ where: { jobId: job.id } });
    await prisma.productUnderstanding.deleteMany({ where: { jobId: job.id } });
    await prisma.intelligenceRun.deleteMany({ where: { jobId: job.id } });
    await prisma.productMemorySnapshot.deleteMany({ where: { sourceJobId: job.id } });
    await prisma.commerceIntelligenceJob.deleteMany({ where: { id: job.id } });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
