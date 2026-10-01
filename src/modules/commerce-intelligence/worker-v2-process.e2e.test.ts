// Etapa 4 V2 — e2e do processGeneration com router injetado (seam interno):
// persistência v2 (payload + bullets canônicos), ContentSceneSet separado,
// plannedV2 no metadata do run, parcial (locator não publica), replay
// idempotente e fence de owner. Assertions apenas sobre contratos observáveis
// (linhas do banco + eventos emitidos).
// Suíte V2: processGeneration no caminho V2 (planner determinístico, sem
// capabilities LLM de plano/cenas); hooks restauram o ambiente.
import { randomUUID } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { claimGeneration, processGeneration } from "./worker.js";
import { readBriefPayload } from "./engine-v2";
import { monthUtc } from "../entitlements/generation.js";
import { collectJobEvents, resetJobEvents } from "./observability.js";
import { loadCreativeSystem } from "./creative-system";
import { canonicalSerialization, sha256Hex } from "./planner-harness/canonical";

const prisma = new PrismaClient();
let dbUp = false;

test.after(() => prisma.$disconnect());

test("setup: banco acessível (skip dos testes de integração caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

const developmentOk = [
  { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
  { text: "Comente o tecido respiravel para conectar o tecido respiravel ao uso cotidiano", action: "Comente", rationale: "para mostrar o tecido respirável no uso diário", factRefs: ["product:description"], cta: "Confira o produto na página." },
];
const qualityPass = { parts: [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
] };

// Router V2: planner determinístico (sem CONTENT_PLAN_GENERATION) e cenas via
// skeleton (sem CONTENT_SCENE_IDEAS). `briefs` permite injetar item inválido
// (locator interno) para exercitar o parcial objetivo.
function v2Router(briefs: Array<Record<string, unknown>>) {
  const describe = () => ({ provider: "test", model: "test", instructionVersion: "v2" });
  return {
    describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      const context = input?.trustedContext as Record<string, unknown> | undefined;
      if (task === "PRODUCT_UNDERSTANDING")
        return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING")
        return { discoveryContractVersion: "2", hypotheses: [
          { commercialObjective: "resolve o dia a dia", angle: "praticidade no dia a dia", coreMessage: "resolve o dia a dia", relevantCapabilities: ["cap"], benefits: ["praticidade no dia a dia"], proofOptions: ["product:description"], commercialEffects: ["resolve o dia a dia"], evidenceRefs: ["product:description"], confidence: 0.9 },
          { commercialObjective: "durabilidade real", angle: "acabamento reforçado", coreMessage: "durabilidade real", relevantCapabilities: ["cap"], benefits: ["acabamento reforçado"], proofOptions: ["product:description"], commercialEffects: ["durabilidade real"], evidenceRefs: ["product:description"], confidence: 0.9 },
          { commercialObjective: "conforto em qualquer hora", angle: "conforto térmico", coreMessage: "conforto em qualquer hora", relevantCapabilities: ["cap"], benefits: ["conforto térmico"], proofOptions: ["product:description"], commercialEffects: ["conforto em qualquer hora"], evidenceRefs: ["product:description"], confidence: 0.9 },
        ] };
      if (task === "STRATEGY_SYNTHESIS")
        return { primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
      if (task === "CONTENT_PLAN_GENERATION")
        throw new Error("capability proibida no caminho V2: CONTENT_PLAN_GENERATION");
      if (task === "CONTENT_SCENE_IDEAS")
        throw new Error("capability proibida no caminho V2: CONTENT_SCENE_IDEAS");
      if (task === "CONTENT_BRIEF_GENERATION") {
        const realizations = Array.isArray(context?.realizations) ? (context!.realizations as unknown[]) : [];
        return {
          developmentSchemaVersion: 2,
          items: briefs.slice(0, Math.max(1, realizations.length)),
        };
      }
      if (task === "CONTENT_QUALITY_JUDGE") {
        const items = Array.isArray(context?.items) ? (context!.items as Array<{ contentId: string }>) : [];
        return { audits: items.map(({ contentId }) => ({ contentId, parts: qualityPass.parts })) };
      }
      return {};
    },
  };
}

const validBriefs = [
  { angle: "a", hook: "Gancho V2", development: developmentOk, script: "Mostre o Produto", cta: "Confira o produto na página." },
  { angle: "b", hook: "Gancho alternativo V2", development: [...developmentOk].reverse(), script: "Apresente o Produto", cta: "Conheça os detalhes do produto." },
  { angle: "c", hook: "Gancho terceiro V2", development: developmentOk, script: "Mostre o Produto em uso", cta: "Saiba mais sobre o produto." },
];
const invalidBrief = { angle: "z", hook: "Gancho com locator", development: developmentOk, script: "Use fact:description como base da fala", cta: "Confira o produto na página." };

async function criarJobQueued(targetContentCount: number) {
  const email = `v2-${randomUUID()}@teste.local`;
  const user = await prisma.user.create({ data: { email, passwordHash: "teste" } });
  const tenant = await prisma.tenant.create({ data: { userId: user.id } });
  const product = await prisma.product.create({
    data: { tenantId: tenant.id, name: "Produto V2", description: "Tecido respirável", features: [], images: [], provenance: {}, targetContentCount },
  });
  const job = await prisma.commerceIntelligenceJob.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      productId: product.id,
      idempotencyKey: randomUUID(),
      fingerprint: randomUUID(),
      targetContentCount,
      generatedContentsMonth: monthUtc(),
      status: "QUEUED",
      stage: "UNDERSTANDING_PRODUCT",
      nextAttemptAt: new Date(Date.now() - 60_000),
      inputSnapshot: {
        creatorPreferences: {
          allowedFormats: ["pov", "talk_first"],
          allowedProductRoles: ["solution"],
          recordsAlone: true,
        },
      },
    },
  });
  await prisma.generationUsageReservation.create({
    data: { tenantId: tenant.id, jobId: job.id, generatedContentsMonth: monthUtc(), quantity: targetContentCount },
  });
  const limpar = async () => {
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
    await prisma.productMemorySnapshot.deleteMany({ where: { tenantId: tenant.id, productId: product.id } });
    await prisma.commerceIntelligenceJob.delete({ where: { id: job.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.user.delete({ where: { id: user.id } });
  };
  return { job, tenant, product, limpar };
}

test("V2 processGeneration: persistência v2, cena separada, proveniência do Planner no run, replay idempotente e fence de owner", async (t) => {
  if (!dbUp) return t.skip();
  const { job, tenant, product, limpar } = await criarJobQueued(3);
  try {
    const claimed = await claimGeneration(new Date(), "v2-owner", job.id);
    assert.ok(claimed, "job claimed para o owner do teste");
    resetJobEvents();

    // Fence: owner errado não encontra o job RUNNING sob seu lease.
    assert.equal(await processGeneration(job.id, "intruder", { router: v2Router(validBriefs) }), false);
    const untouched = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(untouched.status, "RUNNING", "tentativa de intruso não altera o job");
    assert.equal((await prisma.content.findMany({ where: { jobId: job.id } })).length, 0);

    // Caminho V2 completo com router injetado. Sucesso = efeito no banco
    // (processGeneration não retorna flag de sucesso; replay retorna false).
    const ran = await processGeneration(job.id, "v2-owner", { router: v2Router(validBriefs) });
    assert.notEqual(ran, false, "processGeneration não deve abortar no caminho V2");

    const finished = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(finished.status, "SUCCEEDED", "D=N entrega sucesso pleno");
    assert.equal((await prisma.content.findMany({ where: { jobId: job.id } })).length, 3, "três Contents entregues");

    // Persistência v2: payload canônico + readback versionado.
    const payloadRow = await prisma.contentBriefVersion.findFirstOrThrow({ where: { jobId: job.id } });
    const payload = payloadRow.payload as Record<string, unknown>;
    assert.equal(payload.version, 2);
    assert.equal(payload.developmentSchemaVersion, 2);
    assert.ok(Array.isArray(payload.development) && (payload.development as Array<Record<string, unknown>>).every((b) => Array.isArray(b.factRefs) && b.factRefs.length > 0), "bullets canônicos com factRefs");
    const round = readBriefPayload(payload);
    assert.equal(round.schema, "v2");
    assert.equal("scenes" in payload, false, "cenas nunca entram no payload do brief");

    // ContentSceneSet separado, AVAILABLE e com gatePolicyVersion persistido.
    const set = await prisma.contentSceneSet.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(set.status, "AVAILABLE");
    assert.equal(set.backfilled, false);
    const setPayload = set.payload as { scenes: unknown[]; generated: number; dropped: number };
    // Contract: AVAILABLE publica ≥2 cenas válidas; dropped é advisory (gate de
    // cenas é filtro), nunca negativo.
    assert.ok(setPayload.scenes.length >= 2, "cenas publicadas válidas");
    assert.equal(typeof setPayload.dropped, "number");
    assert.ok(setPayload.dropped >= 0);

    // Etapa 3 (ADR-033 D2/D3): Blueprint canônico vive SOMENTE em
    // ContentOpportunity.payload.creativeDirection; metadata guarda proveniência
    // do Planner (seed/hash/policy) e nunca plannedV2/Blueprint.
    const run = await prisma.intelligenceRun.findUniqueOrThrow({ where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } } });
    const metadata = run.metadata;
    assert.ok(metadata !== null && typeof metadata === "object" && !Array.isArray(metadata), "metadata do run é objeto");
    assert.ok(!("plannedV2" in metadata), "metadata não persiste plannedV2");
    assert.ok(!JSON.stringify(metadata).includes("creativeDirection"), "metadata não persiste Blueprint");
    assert.ok("plannerProvenance" in metadata, "proveniência do Planner presente no metadata");
    const provenance = metadata.plannerProvenance;
    assert.ok(provenance !== null && typeof provenance === "object" && !Array.isArray(provenance));
    assert.equal(provenance.plannerPolicyVersion, "PLANNER_POLICY_V2");
    assert.equal(provenance.compatibilityPolicyVersion, "CREATIVE_COMPATIBILITY_V2");
    assert.equal(provenance.creativeSystemHash, sha256Hex(canonicalSerialization(loadCreativeSystem("tiktok-commerce@1.3"))));
    assert.ok("plannerSeed" in provenance && typeof provenance.plannerSeed === "string", "plannerSeed persistido");
    assert.ok("plannerOutputHash" in provenance && typeof provenance.plannerOutputHash === "string", "plannerOutputHash persistido");
    assert.ok("plannerInputHash" in provenance && typeof provenance.plannerInputHash === "string", "plannerInputHash persistido");
    assert.ok("plannerBinding" in provenance && provenance.plannerBinding !== null && typeof provenance.plannerBinding === "object" && !Array.isArray(provenance.plannerBinding), "plannerBinding persistido");
    const provenanceBinding = provenance.plannerBinding;
    assert.ok("platformSkillVersion" in provenanceBinding && typeof provenanceBinding.platformSkillVersion === "string", "binding com platformSkillVersion");
    assert.ok("creativeSystemVersion" in provenanceBinding && typeof provenanceBinding.creativeSystemVersion === "string", "binding com creativeSystemVersion");
    assert.ok(provenanceBinding.platformSkillVersion !== "frozen-harness-fixture", "proveniência operacional, nunca fixture de harness");

    // Isolamento por tenant: mesma PK não é visível em outro tenant.
    assert.equal(await prisma.content.count({ where: { jobId: job.id, tenantId: "tenant-inexistente" } }), 0);

    // Etapa 3 (ADR-033 D4): snapshot de memória V1 canônico — somente sinais
    // dos Contents entregues, sem duplicatas, sem arrays legados.
    const snapshot = await prisma.productMemorySnapshot.findFirstOrThrow({ where: { tenantId: tenant.id, productId: product.id } });
    const signalsEnvelope = snapshot.signals;
    assert.ok(signalsEnvelope !== null && typeof signalsEnvelope === "object" && !Array.isArray(signalsEnvelope), "snapshot é o envelope canônico");
    assert.ok("signalsSchemaVersion" in signalsEnvelope && signalsEnvelope.signalsSchemaVersion === "PLANNER_MEMORY_SIGNALS_V1", "envelope PLANNER_MEMORY_SIGNALS_V1");
    const deliveredSignals = "signals" in signalsEnvelope ? signalsEnvelope.signals : undefined;
    assert.ok(Array.isArray(deliveredSignals) && deliveredSignals.length >= 1, "sinais somente dos Contents entregues");
    const signalKeys = deliveredSignals.map((signal) => JSON.stringify(signal));
    assert.equal(new Set(signalKeys).size, signalKeys.length, "sinais deduplicados no snapshot");

    // Replay idempotente: job terminal → processGeneration não reexecuta nem duplica.
    assert.equal(await processGeneration(job.id, "v2-owner", { router: v2Router(validBriefs) }), false);
    assert.equal((await prisma.content.findMany({ where: { jobId: job.id } })).length, 3);

    // Telemetria V2: proveniência binding/policy/hash/caminho nos eventos.
    const events = collectJobEvents().map((line) => JSON.parse(line) as Record<string, unknown>);
    const plannerEvent = events.find((event) => event.event === "v2.planner.completed");
    assert.ok(plannerEvent, "evento do Planner V2 emitido");
    assert.equal(plannerEvent?.skillBinding, "tiktok-commerce@1.3/1.3");
    assert.equal(plannerEvent?.briefPolicyVersion, "BRIEF_GENERATION_POLICY_V1");
    assert.equal(plannerEvent?.enginePath, "v2");
    assert.match(String(plannerEvent?.plannerOutputHash), /^[0-9a-f]{64}$/);
  } finally {
    resetJobEvents();
    await limpar();
  }
});

test("V2 parcial: item com locator interno não publica; D=2 confirmado com N=3", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued(3);
  try {
    const claimed = await claimGeneration(new Date(), "v2-owner-partial", job.id);
    assert.ok(claimed);
    const ran = await processGeneration(job.id, "v2-owner-partial", { router: v2Router([validBriefs[0]!, invalidBrief, validBriefs[1]!]) });
    assert.notEqual(ran, false, "processGeneration não deve abortar no parcial V2");

    const finished = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(finished.status, "SUCCEEDED_PARTIAL", "item objetivamente inválido vira faltante declarada");
    const contents = await prisma.content.findMany({ where: { jobId: job.id } });
    assert.equal(contents.length, 2, "apenas itens objetivamente válidos publicam");
    const run = await prisma.intelligenceRun.findUniqueOrThrow({ where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } } });
    const metadata = run.metadata as { partial?: { deliveredCount: number; failedCount: number } | unknown };
    assert.equal((metadata.partial as { deliveredCount: number })?.deliveredCount, 2, "parcial D=2 no metadata do run");
    // Cena do único conteúdo entregue permanece separada e AVAILABLE.
    const set = await prisma.contentSceneSet.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(set.status, "AVAILABLE");
  } finally {
    resetJobEvents();
    await limpar();
  }
});
