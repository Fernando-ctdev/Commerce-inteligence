// Integração V2 real: engine/planner/skeleton reais + finalizeGeneration transacional.
// O worker não expõe injeção de router; por isso o provider fake fica restrito à
// engine e claim/finalize/persistência usam o caminho real de produção.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { runFirstGeneration, discoveryHashV2, type EngineResult } from "./engine";
import { claimGeneration, finalizeGeneration, loadReusedDiscovery } from "./worker";
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
        // Fixture alinhada ao parser V2 vigente (audiences/opportunities legados
        // são rejeitados pelo parser — ver parseDiscoveryEnvelopeV2).
        return { discoveryContractVersion: "2", hypotheses: [
          { commercialObjective: "gerar desejo", angle: "praticidade", coreMessage: "resolve o dia a dia", desiredViewerResponse: null, audience: "criadores solo", situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: null, desiredOutcome: null, relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["p"], commercialEffects: ["desejo"], evidenceRefs: ["product:description"], confidence: 0.9 },
          { commercialObjective: "quebrar objeção", angle: "durabilidade", coreMessage: "durabilidade real", desiredViewerResponse: null, audience: null, situation: null, desire: null, identification: null, curiosity: null, aspiration: null, humorPotential: null, visualPotential: null, pain: null, objection: "preço", desiredOutcome: null, relevantCapabilities: ["cap2"], benefits: ["acabamento reforçado"], proofOptions: ["p2"], commercialEffects: ["confiança"], evidenceRefs: ["product:description"], confidence: 0.8 },
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

    // Etapa 3 (ADR-033 D2/D3): Blueprint canônico SOMENTE em
    // ContentOpportunity.payload; metadata do run sem plannedV2/creativeDirection
    // e com proveniência do Planner (seed/hash/policy).
    const opportunityRow = await prisma.contentOpportunity.findFirstOrThrow({ where: { tenantId: tenant.id, jobId: job.id } });
    const opportunityPayload = opportunityRow.payload;
    assert.ok(opportunityPayload !== null && typeof opportunityPayload === "object" && !Array.isArray(opportunityPayload));
    assert.ok("opportunityContractVersion" in opportunityPayload && opportunityPayload.opportunityContractVersion === "2", "payload da opportunity é V2 versionado");
    assert.ok("creativeDirection" in opportunityPayload && opportunityPayload.creativeDirection !== null && typeof opportunityPayload.creativeDirection === "object", "blueprint canônico no payload da opportunity");
    assert.ok("sourceOpportunityId" in opportunityPayload && typeof opportunityPayload.sourceOpportunityId === "string", "sourceOpportunityId server-owned no payload");
    const runRow = await prisma.intelligenceRun.findUniqueOrThrow({ where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } } });
    const storedMetadata = runRow.metadata;
    assert.ok(storedMetadata !== null && typeof storedMetadata === "object" && !Array.isArray(storedMetadata));
    assert.ok(!("plannedV2" in storedMetadata), "metadata não persiste plannedV2");
    assert.ok(!JSON.stringify(storedMetadata).includes("creativeDirection"), "metadata não persiste Blueprint");
    assert.ok("plannerProvenance" in storedMetadata, "proveniência do Planner no metadata");
    const storedProvenance = storedMetadata.plannerProvenance;
    assert.ok(storedProvenance !== null && typeof storedProvenance === "object" && !Array.isArray(storedProvenance));
    assert.ok("plannerSeed" in storedProvenance && typeof storedProvenance.plannerSeed === "string", "plannerSeed persistido");
    assert.ok("plannerOutputHash" in storedProvenance && typeof storedProvenance.plannerOutputHash === "string", "plannerOutputHash persistido");
    assert.ok("plannerInputHash" in storedProvenance && typeof storedProvenance.plannerInputHash === "string", "plannerInputHash persistido");
    assert.ok("plannerBinding" in storedProvenance && storedProvenance.plannerBinding !== null && typeof storedProvenance.plannerBinding === "object" && !Array.isArray(storedProvenance.plannerBinding), "plannerBinding persistido");
    const storedBinding = storedProvenance.plannerBinding;
    assert.ok("platformSkillVersion" in storedBinding && typeof storedBinding.platformSkillVersion === "string", "binding com platformSkillVersion");
    assert.ok("creativeSystemVersion" in storedBinding && typeof storedBinding.creativeSystemVersion === "string", "binding com creativeSystemVersion");
    assert.ok(storedBinding.platformSkillVersion !== "frozen-harness-fixture", "proveniência operacional, nunca fixture de harness");

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

// Etapa 3 (ADR-033 D2): runData é metadata allowlisted — plannedV2/creativeDirection
// nunca entram no IntelligenceRun; chamada não padrão com metadata forjada falha
// fechado (GEN-SCHEMA) sem persistir NADA.
test("finalize rejeita runData com plannedV2 ou creativeDirection e não persiste resultado", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    t.skip("DATABASE_URL inacessível — integração V2 pulada");
    return;
  }
  const user = await prisma.user.create({ data: { email: `v2-forge-${randomUUID()}@teste.local`, passwordHash: "test" } });
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
    const claim = await claimGeneration(new Date(), "v2-forge-owner", job.id);
    assert.ok(claim, "claim adquirido");
    // Output mínimo: a rejeição acontece na entrada do finalize, antes de
    // qualquer leitura/escrita — nada deve persistir.
    const output: EngineResult = {
      productUnderstanding: {},
      strategy: { id: `s-${job.id}`, platformId: "tiktok", platformSkillVersion: "test" },
      plan: { id: `p-${job.id}`, platformId: "tiktok", platformSkillVersion: "test" },
      planPolicyVersion: 1,
      opportunities: [],
      briefs: [],
      reports: [],
      patternReplacements: [],
      understandingReductions: [],
      sceneSets: [],
      judgeExecutionRecords: [],
      judgeSelectionDecisions: [],
      preJudgeRiskAssessments: [],
      evidenceRefs: ["product:name"],
      memorySignals: {},
      stage: "FINALIZING",
      capabilities: [],
      repairs: 0,
      repairCauses: [],
      qualityAudits: [],
      qualityRepairs: [],
      validated: 0,
      briefOpportunityPositions: [],
      partial: null,
    };
    await assert.rejects(
      () => finalizeGeneration(job, "v2-forge-owner", claim.attempt, output, [], { plannedV2: [{ sourceOpportunityId: "commercial-1" }] }),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "runData com plannedV2 é rejeitado fail-closed",
    );
    await assert.rejects(
      () => finalizeGeneration(job, "v2-forge-owner", claim.attempt, output, [], { creativeDirection: { recipeId: "r" } }),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "runData com creativeDirection é rejeitado fail-closed",
    );
    assert.equal(await prisma.intelligenceRun.count({ where: { jobId: job.id } }), 0, "run não persistido com metadata forjada");
    assert.equal(await prisma.contentOpportunity.count({ where: { jobId: job.id } }), 0, "opportunities não persistidas");
    assert.equal(await prisma.contentPlan.count({ where: { jobId: job.id } }), 0, "plano não persistido");
    assert.equal(await prisma.content.count({ where: { jobId: job.id } }), 0, "conteúdos não persistidos");
    const untouched = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(untouched.status, "RUNNING", "job segue RUNNING após rejeição (nada publicado)");
  } finally {
    await prisma.generationUsageReservation.deleteMany({ where: { jobId: job.id } });
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

test("Etapa 2: finalize persiste discoveryV2 canônico, discoveryHash e sourceDiscoveryRef; reader resolve e falha fechado", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    t.skip("DATABASE_URL inacessível — integração V2 pulada");
    return;
  }

  const user = await prisma.user.create({ data: { email: `etapa2-${randomUUID()}@teste.local`, passwordHash: "test" } });
  const tenant = await prisma.tenant.create({ data: { userId: user.id } });
  const product = await prisma.product.create({
    data: { tenantId: tenant.id, name: "Produto Etapa 2", description: "Tecido respirável", images: [], provenance: {}, targetContentCount: 1 },
  });
  // Segundo produto no MESMO tenant: run de origem de um produto não pode
  // alimentar reuso de Strategy de outro (vinculação tenant+productId).
  const productOther = await prisma.product.create({
    data: { tenantId: tenant.id, name: "Outro Produto", description: "Outro", images: [], provenance: {}, targetContentCount: 1 },
  });
  // Todos os jobIds aleatórios criados neste teste (principais + seeds) entram
  // aqui para o finally remover em ordem FK, mesmo após qualquer falha.
  const allJobIds: string[] = [];
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
  allJobIds.push(job.id);
  await prisma.generationUsageReservation.create({
    data: { tenantId: tenant.id, jobId: job.id, generatedContentsMonth: monthUtc(), quantity: 1 },
  });

  try {
    const claim = await claimGeneration(new Date(), "etapa2-owner", job.id);
    assert.ok(claim, "claim real adquiriu o fence");
    const output = await runFirstGeneration({
      productId: product.id,
      jobId: job.id,
      name: product.name,
      description: product.description ?? "",
      targetContentCount: 1,
      router: v2Router([]),
      creatorContext: { recordsAlone: true },
    });
    const discovery = output.discoveryCanonicalV2;
    assert.ok(discovery && discovery.origin === "fresh", "engine entrega Discovery canônica fresh");
    if (!discovery || discovery.origin !== "fresh") return;

    await finalizeGeneration(job, "etapa2-owner", claim.attempt, output, output.sceneSets, { integration: "etapa2" });

    const run = await prisma.intelligenceRun.findFirstOrThrow({ where: { tenantId: tenant.id, jobId: job.id } });
    const strategyRow = await prisma.productStrategy.findFirstOrThrow({ where: { tenantId: tenant.id, jobId: job.id } });
    const metadata = run.metadata as Record<string, unknown>;
    assert.deepEqual(metadata.discoveryV2, discovery.envelope, "metadata.discoveryV2 é o envelope canônico imutável");
    assert.equal(metadata.discoveryHash, discovery.discoveryHash, "metadata.discoveryHash acompanha o envelope");
    assert.equal(metadata.discoveryHash, discoveryHashV2(metadata.discoveryV2), "hash recomputa sobre o envelope persistido");

    const payload = strategyRow.payload as Record<string, unknown>;
    assert.equal(payload.strategyContractVersion, "2", "payload versionado");
    assert.equal(payload.strategyPolicyVersion, "STRATEGY_POLICY_V1");
    assert.deepEqual(payload.sourceOpportunityIds, discovery.sourceOpportunityIds);
    const ref = payload.sourceDiscoveryRef as Record<string, unknown>;
    assert.equal(ref.intelligenceRunId, run.id, "sourceDiscoveryRef aponta para o run do MESMO tenant/job");
    assert.equal(ref.discoveryContractVersion, "2");
    assert.equal(ref.discoveryHash, discovery.discoveryHash);
    assert.equal("hypotheses" in payload, false, "pool não é copiado para a Strategy");

    // Reader: resolve no mesmo tenant E produto; valida envelope v2 e a
    // consistência metadata.discoveryHash = recalculado = ref.discoveryHash.
    const reused = await loadReusedDiscovery(payload, tenant.id, product.id);
    assert.equal(reused.discoveryHash, discovery.discoveryHash);
    assert.equal(reused.discoveryHash, metadata.discoveryHash, "ref e metadata.discoveryHash conciliam");
    assert.deepEqual(reused.envelope, discovery.envelope);
    await assert.rejects(
      () => loadReusedDiscovery(payload, "tenant-inexistente", product.id),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "run de outro tenant não resolve",
    );
    await assert.rejects(
      () => loadReusedDiscovery(payload, tenant.id, productOther.id),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "run de outro produto no mesmo tenant não resolve",
    );
    // Divergência real: o envelope persistido é a fonte da verdade — o reader
    // recomputa o hash dele; envelope alterado ≠ ref.discoveryHash rejeita.
    const metadataForTamper = metadata.discoveryV2 as { hypotheses: Array<Record<string, unknown>> };
    await prisma.intelligenceRun.update({
      where: { id: run.id },
      data: {
        metadata: JSON.parse(JSON.stringify({
          ...metadata,
          discoveryV2: {
            ...metadataForTamper,
            hypotheses: metadataForTamper.hypotheses.map((h, index) =>
              index === 0 ? { ...h, confidence: 0.1 } : h,
            ),
          },
        })) as never,
      },
    });
    await assert.rejects(
      () => loadReusedDiscovery(payload, tenant.id, product.id),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "hash divergente do run falha fechado",
    );
    // Restaura o run canônico e tamper APENAS o discoveryHash derivado:
    // envelope intacto, campo derivado divergente também rejeita.
    await prisma.intelligenceRun.update({
      where: { id: run.id },
      data: { metadata: JSON.parse(JSON.stringify(metadata)) as never },
    });
    await prisma.intelligenceRun.update({
      where: { id: run.id },
      data: { metadata: JSON.parse(JSON.stringify({ ...metadata, discoveryHash: "0".repeat(64) })) as never },
    });
    await assert.rejects(
      () => loadReusedDiscovery(payload, tenant.id, product.id),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "metadata.discoveryHash divergente do recalculado falha fechado",
    );
    await assert.rejects(
      () => loadReusedDiscovery({ ...payload, sourceDiscoveryRef: { ...ref, discoveryContractVersion: "1" } }, tenant.id, product.id),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "versão divergente falha fechado",
    );
    // Invariante de provenance (ADR-033 §12): reuso exige sourceDiscoveryRef —
    // Strategy sem ref falha fechado (GEN-SCHEMA), sem síntese nem fallback.
    await assert.rejects(
      () => loadReusedDiscovery({ id: "x", version: 1, audiences: [] }, tenant.id, product.id),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "reuso sem sourceDiscoveryRef falha fechado",
    );

    // Imutabilidade (evidência viva do state machine): re-finalize com fence
    // consumido é rejeitada e o metadata canônico permanece intacto.
    const beforeRefinalize = JSON.stringify((await prisma.intelligenceRun.findFirstOrThrow({ where: { id: run.id } })).metadata);
    await assert.rejects(
      () => finalizeGeneration(job, "etapa2-owner", claim.attempt, output, output.sceneSets, { integration: "etapa2" }),
      (error: unknown) => (error as { code?: string }).code === "GEN-FENCED",
    );
    const afterRefinalize = JSON.stringify((await prisma.intelligenceRun.findFirstOrThrow({ where: { id: run.id } })).metadata);
    assert.equal(afterRefinalize, beforeRefinalize, "discoveryV2/discoveryHash não são substituíveis pós-terminal");

    // ── DEFENSIVO (upsert, ADR-033 §12): o state machine ordinário não alcança
    // segunda finalização (fence CAS + terminal no mesmo tx); os cenários abaixo
    // SEMEIAM run pré-existente direto no banco para exercitar o invariante do
    // próprio upsert — não é cenário normal de execução.
    const seedDivergentJob = async (ownerId: string) => {
      const seededJob = await prisma.commerceIntelligenceJob.create({
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
      allJobIds.push(seededJob.id);
      await prisma.generationUsageReservation.create({
        data: { tenantId: tenant.id, jobId: seededJob.id, generatedContentsMonth: monthUtc(), quantity: 1 },
      });
      const claim2 = await claimGeneration(new Date(), ownerId, seededJob.id);
      assert.ok(claim2, "claim do job semeado adquiriu o fence");
      return { seededJob, claim2 };
    };
    // Caso divergente: par existente consistente, porém DIFERENTE do novo →
    // GEN-SCHEMA com rollback integral (job volta a RUNNING, nada persiste).
    const { seededJob, claim2 } = await seedDivergentJob("etapa2-owner-2");
    if (discovery.origin !== "fresh") return;
    const envelopeB = JSON.parse(JSON.stringify(discovery.envelope)) as { hypotheses: Array<Record<string, unknown>> };
    envelopeB.hypotheses[0]!.confidence = 0.123456;
    await prisma.intelligenceRun.create({
      data: {
        tenantId: tenant.id,
        jobId: seededJob.id,
        productId: product.id,
        engineVersion: "seed",
        platformSkillVersion: "seed",
        metadata: JSON.parse(JSON.stringify({ discoveryV2: envelopeB, discoveryHash: discoveryHashV2(envelopeB) })) as never,
      },
    });
    await assert.rejects(
      () => finalizeGeneration(seededJob, "etapa2-owner-2", claim2.attempt, output, output.sceneSets, { integration: "etapa2-defensivo" }),
      (error: unknown) => (error as { code?: string }).code === "GEN-SCHEMA",
      "upsert sobre par canônico divergente falha GEN-SCHEMA",
    );
    const jobAfterRollback = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: seededJob.id } });
    assert.equal(jobAfterRollback.status, "RUNNING", "rollback da transação: job permanece RUNNING");
    const seededMetadata = (await prisma.intelligenceRun.findFirstOrThrow({ where: { jobId: seededJob.id } })).metadata as Record<string, unknown>;
    assert.equal(seededMetadata.discoveryHash, discoveryHashV2(envelopeB), "par semeado permanece intacto após rollback");
    assert.equal(await prisma.productStrategy.count({ where: { jobId: seededJob.id } }), 0, "rollback: Strategy não persistiu");
    assert.equal(await prisma.content.count({ where: { jobId: seededJob.id } }), 0, "rollback: Contents não persistiram");
    // Opção B adjudicada: o update de par "igual" é inalcançável pelo state
    // machine normal (fence CAS + terminal no mesmo tx) — sem segundo cenário;
    // a preservação do par igual permanece garantida pelo guard no upsert
    // (worker.ts) e o caminho de reuso real é coberto pelo teste do modo
    // complete (reusedDiscovery) no fluxo normal.
  } finally {
    // Ordem FK idêntica à do bloco principal, sobre TODOS os jobIds criados
    // (principal + seeds) — roda mesmo após falha de qualquer assert.
    await prisma.generationUsageReservation.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.briefValidationReport.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.content.updateMany({ where: { jobId: { in: allJobIds } }, data: { currentBriefVersionId: null, approvedBriefVersionId: null } });
    await prisma.contentSceneSet.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.contentBriefVersion.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.content.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.contentOpportunity.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.contentPlan.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.productStrategy.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.productUnderstanding.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.intelligenceRun.deleteMany({ where: { jobId: { in: allJobIds } } });
    await prisma.productMemorySnapshot.deleteMany({ where: { sourceJobId: { in: allJobIds } } });
    await prisma.commerceIntelligenceJob.deleteMany({ where: { id: { in: allJobIds } } });
    await prisma.product.deleteMany({ where: { id: { in: [product.id, productOther.id] } } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
