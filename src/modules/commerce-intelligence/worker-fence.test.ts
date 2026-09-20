// Gate 6 (itens 1–2): finalização — fence owner+attempt e atomicidade da transação
// de publicação; lease vencido — ciclo claim→reclaim com incremento único no
// reclaim, backoff e terminal GEN-LEASE-EXPIRED.
// A janela entre o CAS inicial e o commit terminal é protegida pelo row lock da
// própria transação (nenhum reclaim consegue mudar a linha do job no meio); o
// que é reproduzível — e coberto aqui — é o fencing perdido até a finalização
// (GEN-FENCED reverte tudo), a falha no meio das escritas (atomicidade: nada é
// publicado parcialmente) e o ciclo completo de reclaim.
// Integração exige PostgreSQL em DATABASE_URL; faz skip automático caso contrário.
// Executar: npx tsx --test src/modules/commerce-intelligence/worker-fence.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { buildFailureRun, claimGeneration, failJobAndReleaseReservation, finalizeGeneration, reclaimExpiredGenerations } from "./worker.js";
import { runFirstGeneration } from "./engine.js";
import { GenerationError } from "./errors.js";
import type { EngineResult } from "./engine.js";
import { monthUtc } from "../entitlements/generation.js";
import { collectJobEvents, resetJobEvents } from "./observability.js";

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

// Output de engine mínimo (sem briefs/cenas): suficiente para exercitar a
// transação de finalização ponta a ponta. includeBrief acrescenta um Content
// objetivo-válido (brief + report objetivo PASS) com IDs derivados do strategyId.
function syntheticOutput(strategyId = `strat-${randomUUID()}`, opts: { includeBrief?: boolean } = {}): EngineResult {
  const contentId = `${strategyId}-content-1`;
  const briefVersionId = `${strategyId}-brief-v1`;
  const output: EngineResult = {
    productUnderstanding: { fonte: "teste-fence" },
    strategy: { id: strategyId, platformId: "tiktok", platformSkillVersion: "test" },
    plan: { id: `plan-${randomUUID()}`, platformId: "tiktok", platformSkillVersion: "test" },
    planPolicyVersion: 1,
    opportunities: [],
    briefs: [],
    reports: [],
    patternReplacements: [],
    understandingReductions: [],
    sceneSets: [],
    memorySignals: { generatedCount: 0 },
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
  if (opts.includeBrief) {
    // Cutover v2: persistência exige DevelopmentBullet[] canônico alinhado à projeção.
    const bulletsV2 = ["Destaque o uso do produto para orientar a conversa sobre o uso", "Destaque o uso do produto para orientar a conversa sobre o uso"].map((text) => ({ text, action: "Destaque", rationale: "para orientar a conversa sobre o uso", factRefs: ["product:description"], cta: "Confira o produto." }));
    output.briefs = [{ contentId, briefVersionId, version: 1, angle: "demonstração", hook: "Gancho do teste de fence", development: bulletsV2.map(({ text }) => text), bullets: bulletsV2, script: "Fale sobre o uso do produto", cta: "cta do teste" } as never];
    output.reports = [{ briefId: `${contentId}:${briefVersionId}`, gateVersion: 1, factualStatus: "SUPPORTED", claimType: "objetivo", evidenceRefs: [], structuralStatus: "PASS", platformStatus: "PASS", varietyStatus: "PASS", issues: [], decision: "PASS" }];
  }
  return output;
}

// Fixtures: user/tenant/product + job QUEUED (attempt 0 = nenhuma tentativa
// terminada) + reserva RESERVED. O claim é feito com claimGeneration real,
// dirigido ao job do teste pelo parâmetro opcional jobId.
async function criarJobQueued() {
  const email = `fence-${randomUUID()}@teste.local`;
  const user = await prisma.user.create({ data: { email, passwordHash: "teste" } });
  const tenant = await prisma.tenant.create({ data: { userId: user.id } });
  const product = await prisma.product.create({
    data: { tenantId: tenant.id, name: "Produto fence", features: [], images: [], provenance: {}, targetContentCount: 1 },
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
  const limpar = async () => {
    await prisma.generationUsageReservation.deleteMany({ where: { jobId: job.id } });
    await prisma.briefValidationReport.deleteMany({ where: { jobId: job.id } });
    // B-003-14: a relação circular Content ↔ ContentBriefVersion exige nulificar
    // currentBriefVersionId/approvedBriefVersionId antes de apagar as versões;
    // ContentSceneSet referencia a versão (briefVersionId) e sai antes dela.
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
  return { job, limpar };
}

async function estadoPublicacao(jobId: string, tenantId: string) {
  const [job, reservation] = await Promise.all([
    prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: jobId } }),
    prisma.generationUsageReservation.findFirstOrThrow({ where: { jobId } }),
  ]);
  const publicados = {
    strategies: await prisma.productStrategy.count({ where: { jobId } }),
    plans: await prisma.contentPlan.count({ where: { jobId } }),
    understandings: await prisma.productUnderstanding.count({ where: { jobId } }),
    runs: await prisma.intelligenceRun.count({ where: { jobId } }),
    snapshots: await prisma.productMemorySnapshot.count({ where: { tenantId } }),
    contents: await prisma.content.count({ where: { jobId } }),
  };
  return { job, reservation, publicados };
}

// Vence o lease da execução corrente (simula worker morto/sem heartbeat).
const vencerLease = (jobId: string) =>
  prisma.commerceIntelligenceJob.update({
    where: { id: jobId },
    data: { leaseDeadlineAt: new Date(Date.now() - 1_000) },
  });

test("fencing perdido até a finalização reverte tudo: GEN-FENCED, nada publicado, reserva intocada", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const claimed = await claimGeneration(new Date(), "fence-owner-a", job.id);
    assert.ok(claimed);
    assert.equal(claimed.attempt, 0, "claim executa a tentativa corrente sem incrementar");

    // Reclaim + novo claim concorrentes: owner/attempt da finalização não batem mais.
    await prisma.commerceIntelligenceJob.update({
      where: { id: job.id },
      data: { leaseOwnerId: "fence-owner-b", attempt: { increment: 1 } },
    });

    await assert.rejects(
      () => finalizeGeneration(job, "fence-owner-a", 0, syntheticOutput(), [], {}),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /fence|owner\/attempt/i);
        return true;
      },
    );

    const { job: atual, reservation, publicados } = await estadoPublicacao(job.id, job.tenantId);
    assert.equal(atual.status, "RUNNING", "job não ganha estado terminal do owner antigo");
    assert.equal(atual.leaseOwnerId, "fence-owner-b");
    assert.equal(reservation.status, "RESERVED", "capacidade não é confirmada nem liberada");
    assert.deepEqual(publicados, { strategies: 0, plans: 0, understandings: 0, runs: 0, snapshots: 0, contents: 0 });
  } finally {
    await limpar();
  }
});

test("fence válido publica tudo na mesma transação: terminal, reserva CONFIRMED, resultado completo", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const claimed = await claimGeneration(new Date(), "fence-owner-a", job.id);
    assert.ok(claimed);

    await finalizeGeneration(job, "fence-owner-a", claimed.attempt, syntheticOutput(), [], {});

    const { job: atual, reservation, publicados } = await estadoPublicacao(job.id, job.tenantId);
    assert.equal(atual.status, "SUCCEEDED");
    assert.equal(atual.leaseOwnerId, null);
    assert.ok(atual.finishedAt);
    assert.equal(reservation.status, "CONFIRMED");
    assert.deepEqual(publicados, { strategies: 1, plans: 1, understandings: 1, runs: 1, snapshots: 1, contents: 0 });
  } finally {
    await limpar();
  }
});

// Fix round Task 4 (revisão Lens): prova observável de persistência do contrato
// de entrega — Content objetivo-válido nasce com status DRAFT (default do
// schema, nunca um status semântico), o payload persistido é exatamente o
// brief canônico (sem chave de status/aviso semântico) e partial null não vira
// metadado do run. Complementa os testes de engine (partial null) com persistência real.
test("finalizeGeneration persiste Content objetivo-válido como DRAFT, sem status/aviso semântico", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const strategyId = `strat-${randomUUID()}`;
    const output = syntheticOutput(strategyId, { includeBrief: true });
    const contentId = `${strategyId}-content-1`;
    const briefVersionId = `${strategyId}-brief-v1`;
    const claimed = await claimGeneration(new Date(), "fence-owner-a", job.id);
    assert.ok(claimed);

    await finalizeGeneration(job, "fence-owner-a", claimed.attempt, output, [], {});

    const content = await prisma.content.findUniqueOrThrow({ where: { id: contentId } });
    assert.equal(content.status, "DRAFT", "gates objetivos passando → persistido como DRAFT");
    assert.equal(content.currentBriefVersionId, briefVersionId);
    assert.equal(content.approvedBriefVersionId, null, "aprovação pertence a slice posterior");
    // O payload persistido é o brief canônico — nenhuma chave de status/aviso
    // semântico atravessa para a persistência.
    assert.deepEqual(Object.keys(content.payload as Record<string, unknown>).sort(), ["angle", "briefVersionId", "contentId", "cta", "development", "developmentSchemaVersion", "hook", "script", "version"]);
    const report = await prisma.briefValidationReport.findUniqueOrThrow({ where: { id: `${contentId}:${briefVersionId}` } });
    assert.equal(report.decision, "PASS", "report objetivo registrado separado do judge semântico");
    const run = await prisma.intelligenceRun.findUniqueOrThrow({ where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } } });
    assert.equal("partial" in (run.metadata as Record<string, unknown>), false, "partial null não vira metadado do run");
    // Rodada 2 (revisão Lens): prova negativa explícita — nenhum status/aviso
    // semântico sobrevive no payload do Content nem no metadata do run.
    const payloadText = JSON.stringify(content.payload).toUpperCase();
    const metadataText = JSON.stringify(run.metadata).toUpperCase();
    for (const proibido of ["QUALITY_PENDING", "REJECT", "WARNING", "QUALITYSTATUS", "SEMANTICSTATUS"]) {
      assert.ok(!payloadText.includes(proibido), `payload persistido não contém ${proibido}`);
      assert.ok(!metadataText.includes(proibido), `metadata do run não contém ${proibido}`);
    }
    const { job: atual, publicados } = await estadoPublicacao(job.id, job.tenantId);
    assert.equal(atual.status, "SUCCEEDED");
    assert.deepEqual(publicados, { strategies: 1, plans: 1, understandings: 1, runs: 1, snapshots: 1, contents: 1 });
  } finally {
    await limpar();
  }
});

test("falha no meio das escritas reverte a transação inteira: atomicidade da publicação", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const claimed = await claimGeneration(new Date(), "fence-owner-a", job.id);
    assert.ok(claimed);
    // Strategy com id já existente: a escrita falha no meio da transação e o
    // rollback reverte tudo que veio antes/depois dentro dela.
    const output = syntheticOutput();
    await prisma.productStrategy.create({
      data: {
        id: String(output.strategy.id),
        tenantId: job.tenantId,
        productId: job.productId,
        jobId: job.id,
        platformId: "tiktok",
        platformSkillVersion: "test",
        payload: {},
      },
    });

    await assert.rejects(() => finalizeGeneration(job, "fence-owner-a", claimed.attempt, output, [], {}));

    const { job: atual, reservation, publicados } = await estadoPublicacao(job.id, job.tenantId);
    assert.equal(atual.status, "RUNNING", "falha no meio não publica estado terminal");
    assert.equal(reservation.status, "RESERVED");
    assert.equal(publicados.understandings, 0, "nenhuma escrita parcial visível");
    assert.equal(publicados.runs, 0);
    assert.equal(publicados.plans, 0);
    assert.equal(publicados.strategies, 1, "só a linha pré-existente criada fora da transação");
  } finally {
    await limpar();
  }
});

// Gate 6 (item 2): ciclo completo com incremento ÚNICO no reclaim (B-003-03).
// claim não incrementa; cada reclaim contabiliza a tentativa perdida; o limite
// (GENERATION_MAX_ATTEMPTS=2) permite exatamente 2 execuções e terminaliza.
test("ciclo claim→reclaim→claim→reclaim: 2 execuções, attempt por estado, backoff, terminal e reserva", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const estadoInicial = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(estadoInicial.attempt, 0, "job novo nasce com nenhuma tentativa terminada");

    // Execução 1 (tentativa corrente 0): claim não incrementa.
    const claim1 = await claimGeneration(new Date(), "ciclo-owner-a", job.id);
    assert.ok(claim1);
    assert.equal(claim1.attempt, 0);
    let estado = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(estado.status, "RUNNING");
    assert.equal(estado.attempt, 0);
    assert.ok(estado.leaseOwnerId);
    assert.ok(estado.leaseDeadlineAt);

    // Tentativa 1 perdida: reclaim contabiliza (0→1) e aplica backoff.
    await vencerLease(job.id);
    const antesReclaim1 = new Date();
    await reclaimExpiredGenerations(antesReclaim1);
    estado = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(estado.status, "QUEUED");
    assert.equal(estado.attempt, 1, "reclaim incrementa a tentativa perdida");
    assert.equal(estado.leaseOwnerId, null);
    assert.equal(estado.leaseDeadlineAt, null);
    assert.ok(estado.nextAttemptAt > antesReclaim1, "backoff impede re-claim imediato");
    assert.ok(!estado.internalErrorCode, "sem código de erro em rotação");
    let reservation = await prisma.generationUsageReservation.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(reservation.status, "RESERVED", "job não terminal não mexe na capacidade");

    // Execução 2 (tentativa corrente 1, última permitida com cap=2).
    const depoisDoBackoff = new Date(estado.nextAttemptAt.getTime() + 1_000);
    const claim2 = await claimGeneration(depoisDoBackoff, "ciclo-owner-b", job.id);
    assert.ok(claim2);
    assert.equal(claim2.attempt, 1);
    estado = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(estado.status, "RUNNING");
    assert.equal(estado.attempt, 1);

    // Tentativa 2 perdida: esgotou o limite → terminal contabiliza (1→2).
    await vencerLease(job.id);
    await reclaimExpiredGenerations(new Date());
    const { job: final, reservation: finalReserva, publicados } = await estadoPublicacao(job.id, job.tenantId);
    assert.equal(final.status, "FAILED");
    assert.equal(final.attempt, 2, "terminal registra as 2 tentativas executadas");
    assert.equal(final.internalErrorCode, "GEN-LEASE-EXPIRED");
    assert.equal(final.publicErrorMessage, "Não foi possível concluir a análise. Tente novamente.");
    assert.ok(final.finishedAt);
    assert.equal(final.leaseOwnerId, null);
    assert.equal(finalReserva.status, "RELEASED");
    assert.equal(finalReserva.reason, "GEN-LEASE-EXPIRED", "reason da reserva alinhada ao código da SPEC");
    assert.deepEqual(publicados, { strategies: 0, plans: 0, understandings: 0, runs: 1, snapshots: 0, contents: 0 });
  } finally {
    await limpar();
  }
});

// Gate 6 (item 3, rev. 3): falha com fence perdido não emite job.terminal — o
// evento anunciaria reservationAction RELEASED sem nenhuma persistência.
test("failJob com CAS perdido: retorna false, nada persiste e NENHUM evento terminal; CAS válido terminaliza com evento", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const claimed = await claimGeneration(new Date(), "fail-owner-a", job.id);
    assert.ok(claimed);

    resetJobEvents();
    // Owner errado: CAS {RUNNING, owner-b, attempt} não bate nada.
    const perdido = await failJobAndReleaseReservation(job.id, "GEN-PROVIDER", "fail-owner-b", claimed.attempt);
    assert.equal(perdido, false, "CAS perdido não terminaliza");
    let estado = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(estado.status, "RUNNING", "job permanece com quem detém o fence");
    assert.equal(estado.leaseOwnerId, "fail-owner-a");
    const reservaIntacta = await prisma.generationUsageReservation.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(reservaIntacta.status, "RESERVED", "reserva não é liberada sem terminalização");
    assert.equal(
      collectJobEvents().filter((evento) => evento.includes("job.terminal")).length,
      0,
      "nenhum job.terminal quando o CAS não persiste",
    );

    // Owner correto: terminaliza e o evento acompanha a persistência real.
    const terminalizado = await failJobAndReleaseReservation(job.id, "GEN-PROVIDER", "fail-owner-a", claimed.attempt);
    assert.equal(terminalizado, true);
    estado = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(estado.status, "FAILED");
    const reservaLiberada = await prisma.generationUsageReservation.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(reservaLiberada.status, "RELEASED");
    const terminais = collectJobEvents().filter((evento) => evento.includes("job.terminal"));
    assert.equal(terminais.length, 1, "exatamente um evento terminal, agora com persistência real");
    const evento = JSON.parse(terminais[0]) as Record<string, unknown>;
    assert.equal(evento.reservationAction, "RELEASED");
  } finally {
    resetJobEvents();
    await limpar();
  }
});

// Gate 6 (item 6): expiração visível nos logs JSONL — rotação emite job.reclaimed
// e esgotamento emite job.terminal, ambos condicionados ao CAS do reclaim
// (reclaim sem job expirado não emite nada).
test("reclaim emite job.reclaimed na rotação e job.terminal no esgotamento; sem expirado não emite", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const claim1 = await claimGeneration(new Date(), "recl-owner-a", job.id);
    assert.ok(claim1);

    // Rotação da tentativa 0: um job.reclaimed com attempt pós-incremento.
    resetJobEvents();
    await vencerLease(job.id);
    await reclaimExpiredGenerations(new Date());
    let eventos = collectJobEvents();
    assert.equal(eventos.length, 1, "exatamente um evento na rotação");
    const rotacao = JSON.parse(eventos[0]) as Record<string, unknown>;
    assert.equal(rotacao.event, "job.reclaimed");
    assert.equal(rotacao.jobId, job.id);
    assert.equal(rotacao.attempt, 1);
    assert.equal(rotacao.errorCode, "GEN-LEASE-EXPIRED");

    // Reclaim sem nenhum job expirado (job agora QUEUED): nada é emitido.
    await reclaimExpiredGenerations(new Date());
    assert.equal(collectJobEvents().length, 1, "reclaim sem expirado não emite");

    // Segunda execução perdida: esgotamento terminaliza com job.terminal.
    const estado = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    const claim2 = await claimGeneration(new Date(estado.nextAttemptAt.getTime() + 1_000), "recl-owner-b", job.id);
    assert.ok(claim2);
    resetJobEvents();
    await vencerLease(job.id);
    await reclaimExpiredGenerations(new Date());
    eventos = collectJobEvents();
    assert.equal(eventos.length, 1, "exatamente um evento no esgotamento");
    const terminal = JSON.parse(eventos[0]) as Record<string, unknown>;
    assert.equal(terminal.event, "job.terminal");
    assert.equal(terminal.attempt, 2);
    assert.equal(terminal.errorCode, "GEN-LEASE-EXPIRED");
    assert.equal(terminal.reservationAction, "RELEASED");
    const reserva = await prisma.generationUsageReservation.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(reserva.status, "RELEASED", "evento acompanha a persistência real");

    // ADR-021 (decisão 5): FAILED também grava IntelligenceRun — diagnóstico
    // sanitizado na mesma transação do CAS terminal.
    const run = await prisma.intelligenceRun.findUniqueOrThrow({
      where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } },
    });
    const metadata = run.metadata as { attempt?: number; internalError?: { code?: string; stage?: string | null } };
    assert.equal(metadata.internalError?.code, "GEN-LEASE-EXPIRED");
    assert.equal(metadata.attempt, 2);
    assert.equal(metadata.internalError?.stage, "UNDERSTANDING_PRODUCT", "stage persistido no job no momento do reclaim");
  } finally {
    resetJobEvents();
    await limpar();
  }
});

// ADR-026 (pós-job ace9e417): o caminho FAILED do worker persiste a telemetria
// de cenas (sceneOutcomes sanitizados por contentId) no IntelligenceRun, na
// MESMA transação do CAS de FAILED; fence perdido NÃO persiste. O engine roda
// com provider fake (cenas gate-reprovadas), o terminal usa failJob real.
function sceneFailRouter() {
  const developmentOk = ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"];
  const qualityPass = { parts: [
    { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
    { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
    { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
    { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
    { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
  ] };
  return {
    describe: () => ({ provider: "test", model: "test", instructionVersion: "test" }),
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      const context = input?.trustedContext as Record<string, unknown> | undefined;
      if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: [{ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:description"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:description"] }] };
      if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
      if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 1, opportunities: [{ commercialObjective: "c", angle: "a", coreMessage: "m", hookMechanism: "demonstração direta", noveltyTargets: ["n"] }] };
      if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "a", hook: "Gancho", development: developmentOk, script: "Tecido respiravel", cta: "cta" }] };
      if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Ambiente iluminado e bonito" }, { description: "Espaço decorado e organizado" }] };
      if (task === "CONTENT_QUALITY_JUDGE") {
        const items = Array.isArray(context?.items) ? context.items as Array<{ contentId: string }> : [];
        return { audits: items.map(({ contentId }) => ({ contentId, parts: qualityPass.parts })) };
      }
      return {};
    },
  };
}

test("falha de cenas persiste sceneOutcomes sanitizados no IntelligenceRun (mesma transação CAS)", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const claimed = await claimGeneration(new Date(), "scene-owner", job.id);
    assert.ok(claimed);
    let captured: GenerationError | undefined;
    await assert.rejects(
      () => runFirstGeneration({ productId: job.productId, jobId: job.id, name: "Produto", description: "Tecido respirável", targetContentCount: 1, router: sceneFailRouter() }),
      (error: unknown) => {
        captured = error as GenerationError;
        return error instanceof GenerationError && error.code === "GEN-REPAIR-EXHAUSTED";
      },
    );
    assert.ok(captured, "engine falhou como esperado");
    const failureRun = buildFailureRun(captured!.code, "GENERATING_BRIEFS", captured!.detail);
    const terminalized = await failJobAndReleaseReservation(job.id, captured!.code, "scene-owner", claimed.attempt, failureRun.internalError, {
      tenantId: job.tenantId,
      productId: job.productId,
      engineVersion: "teste-fence",
      platformSkillVersion: "tiktok-commerce@1.2",
      metadata: { internalError: failureRun.internalError, diagnostics: failureRun.diagnostics },
    }, {
      stage: "GENERATING_BRIEFS",
      gateReports: failureRun.diagnostics?.gateReports,
    });
    assert.equal(terminalized, true, "CAS terminaliza e persiste o run de falha");
    const run = await prisma.intelligenceRun.findUniqueOrThrow({ where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } } });
    const diagnostics = (run.metadata as { diagnostics?: { sceneOutcomes?: Array<Record<string, unknown>> } }).diagnostics;
    assert.ok(diagnostics, "diagnostics persistidos no run");
    const outcomes = diagnostics!.sceneOutcomes ?? [];
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].contentId, `${job.id}-content-1`);
    assert.equal(outcomes[0].status, "FILTERED");
    assert.deepEqual(outcomes[0].causes, ["acao_ausente:2"]);
    assert.equal((outcomes[0].attempts as unknown[]).length, 2);
    assert.ok(!JSON.stringify(run.metadata).includes("iluminado") && !JSON.stringify(run.metadata).includes("decorado"), "nenhuma descrição de cena persistida");
    const estado = await estadoPublicacao(job.id, job.tenantId);
    assert.equal(estado.job.status, "FAILED");
    assert.equal(estado.job.internalErrorCode, "GEN-REPAIR-EXHAUSTED");
    assert.equal(estado.reservation.status, "RELEASED");
    assert.equal(estado.publicados.contents, 0);
  } finally {
    await limpar();
  }
});

test("fence perdido: sceneOutcomes NÃO persistem no IntelligenceRun pelo owner vencido", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  try {
    const claimed = await claimGeneration(new Date(), "owner-a", job.id);
    assert.ok(claimed);
    await prisma.commerceIntelligenceJob.update({
      where: { id: job.id },
      data: { leaseOwnerId: "owner-b", attempt: { increment: 1 } },
    });
    const failureRun = buildFailureRun("GEN-REPAIR-EXHAUSTED", "GENERATING_BRIEFS", {
      task: "CONTENT_QUALITY_JUDGE",
      expected: 1,
      received: 0,
      sceneOutcomes: [{ contentId: `${job.id}-content-1`, status: "FILTERED", generated: 2, dropped: 2, causes: ["acao_ausente:2"], attempts: [] }],
      rejected: [],
    });
    const terminalized = await failJobAndReleaseReservation(job.id, "GEN-REPAIR-EXHAUSTED", "owner-a", claimed.attempt, failureRun.internalError, {
      tenantId: job.tenantId,
      productId: job.productId,
      engineVersion: "teste-fence",
      platformSkillVersion: "tiktok-commerce@1.2",
      metadata: { internalError: failureRun.internalError, diagnostics: failureRun.diagnostics },
    }, {});
    assert.equal(terminalized, false, "CAS perdido não terminaliza nem persiste");
    const run = await prisma.intelligenceRun.findUnique({ where: { tenantId_jobId: { tenantId: job.tenantId, jobId: job.id } } });
    assert.equal(run, null, "nenhum run de falha gravado pelo owner vencido");
    const atual = await prisma.commerceIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(atual.status, "RUNNING");
    assert.equal(atual.leaseOwnerId, "owner-b");
    const reserva = await prisma.generationUsageReservation.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(reserva.status, "RESERVED", "capacidade intocada");
  } finally {
    await limpar();
  }
});

// ADR-021/SPEC B-003-10: o modo complete reutiliza a Strategy ACTIVE do job
// parcial original — finalize NUNCA cria uma segunda ACTIVE (índice parcial
// único product_strategies_active_product). Regressão do job 5fa687db
// (GEN-PERSISTENCE em tx.productStrategy.create).
test("complete-mode finalize com Strategy ACTIVE existente: única ACTIVE e plano vinculado a ela", async (t) => {
  if (!dbUp) return t.skip();
  const { job, limpar } = await criarJobQueued();
  // Job parcial original (row apenas para a FK da Strategy e proveniência).
  const originalJob = await prisma.commerceIntelligenceJob.create({
    data: { tenantId: job.tenantId, userId: job.userId, productId: job.productId, idempotencyKey: randomUUID(), fingerprint: randomUUID(), targetContentCount: 5, generatedContentsMonth: monthUtc(), status: "SUCCEEDED_PARTIAL", stage: "FINALIZING" },
  });
  const originalStrategy = await prisma.productStrategy.create({
    data: { id: `${originalJob.id}-strategy`, tenantId: job.tenantId, productId: job.productId, jobId: originalJob.id, platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", payload: { id: `${originalJob.id}-strategy`, productId: job.productId, jobId: originalJob.id, version: 1, status: "ACTIVE" } },
  });
  try {
    const claimed = await claimGeneration(new Date(), "owner-c", job.id);
    assert.ok(claimed);
    // Engine re-carimba a strategy reutilizada com o id do job atual (ADR-021).
    const output = syntheticOutput(`${job.id}-strategy`);
    await finalizeGeneration(job, "owner-c", claimed.attempt, output, [], {}, originalStrategy.id);
    const strategies = await prisma.productStrategy.findMany({ where: { productId: job.productId } });
    assert.equal(strategies.length, 1, "nenhuma segunda Strategy ACTIVE criada");
    assert.equal(strategies[0].id, originalStrategy.id);
    assert.equal(strategies[0].status, "ACTIVE");
    assert.equal(strategies[0].jobId, originalJob.id, "proveniência original preservada");
    const plan = await prisma.contentPlan.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(plan.strategyId, originalStrategy.id, "plano do job atual vinculado à Strategy reutilizada");
    const estado = await estadoPublicacao(job.id, job.tenantId);
    assert.equal(estado.job.status, "SUCCEEDED");
    assert.equal(estado.reservation.status, "CONFIRMED");
    assert.equal(estado.publicados.runs, 1);
  } finally {
    // Ordem FK-safe local: filhos do job atual → Strategy reutilizada (por id)
    // → job original → limpar() finaliza reservation/run/job/product/tenant.
    await prisma.briefValidationReport.deleteMany({ where: { jobId: job.id } });
    await prisma.contentBriefVersion.deleteMany({ where: { jobId: job.id } });
    await prisma.contentSceneSet.deleteMany({ where: { jobId: job.id } });
    await prisma.content.deleteMany({ where: { jobId: job.id } });
    await prisma.contentOpportunity.deleteMany({ where: { jobId: job.id } });
    await prisma.contentPlan.deleteMany({ where: { jobId: job.id } });
    await prisma.productStrategy.deleteMany({ where: { id: originalStrategy.id } });
    await prisma.commerceIntelligenceJob.deleteMany({ where: { id: originalJob.id } }).catch(() => {});
    await limpar();
  }
});
