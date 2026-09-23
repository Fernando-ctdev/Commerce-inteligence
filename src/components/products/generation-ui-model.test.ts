import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKED_ACTIVE_MESSAGE,
  blockedActionCopy,
  briefingItems,
  CAPACITY_UNAVAILABLE_MESSAGE,
  canCancelGeneration,
  contentStatusLabel,
  contentsSummaryLabel,
  executionObservability,
  formatAmount,
  formatCostLabel,
  formatTimestamp,
  formatUsageLabel,
  generationStatusLabel,
  isActiveGeneration,
  isActiveLimitError,
  isCapacityUnavailableError,
  isRetryableGeneration,
  isToastDismissed,
  missingReasonLabel,
  normalizeGenerationAction,
  OBSERVABILITY_UNAVAILABLE,
  partialModel,
  projectionDegradedModel,
  phaseStateLabels,
  phaseStates,
  scriptParagraphs,
  scenesProjection,
  stageMessage,
  statusLabels,
  statusMessage,
  strategyModel,
} from "./generation-ui-model";

test("banner terminal distingue CANCELLED de FAILED sem diagnóstico técnico", () => {
  assert.equal(statusMessage("CANCELLED"), "A análise foi cancelada.");
  const failed = statusMessage("FAILED");
  assert.equal(failed, "Não foi possível concluir a análise. Seus dados permanecem preservados.");
  assert.ok(!failed.includes("CANCELLED") && !failed.includes("GEN-"));
});

test("mapeia estados e stages públicos para mensagens humanas", () => {
  assert.equal(generationStatusLabel("RUNNING"), "Analisando");
  assert.equal(stageMessage("GENERATING_BRIEFS"), "Preparando os Briefings");
  assert.equal(isActiveGeneration("QUEUED"), true);
  assert.equal(isRetryableGeneration("FAILED"), true);
});

test("cancelamento seguro existe somente na fila", () => {
  assert.equal(canCancelGeneration("QUEUED"), true);
  assert.equal(canCancelGeneration("RUNNING"), false);
  assert.equal(canCancelGeneration("SUCCEEDED"), false);
  assert.equal(canCancelGeneration("CANCELLED"), false);
  assert.equal(canCancelGeneration(null), false);
});

test("entrega parcial: mensagem, rótulo, motivo sanitizado e modelo D de N", () => {
  assert.equal(statusMessage("SUCCEEDED_PARTIAL"), "Parte dos conteúdos ficou pronta. Você já pode revisar e gerar os faltantes.");
  assert.equal(statusLabels.SUCCEEDED_PARTIAL, "Pronto (parcial)");
  assert.equal(missingReasonLabel("unverified_claim"), "continha informação não confirmada nos dados do produto");
  assert.equal(missingReasonLabel("desconhecido"), "não convergiu nos critérios de qualidade");
  const job = { status: "SUCCEEDED_PARTIAL", targetContentCount: 3, deliveredCount: 2, contents: [{}, {}], missing: [{ position: 3, reasonCode: "grounding_below_min" }, { position: null, reasonCode: "zzz" }] };
  assert.deepEqual(partialModel(job), { delivered: 2, expected: 3, missing: [{ position: 3, reason: "ficou pouco apoiado nos dados do produto" }, { position: null, reason: "não convergiu nos critérios de qualidade" }] });
  assert.deepEqual(partialModel({ status: "SUCCEEDED", targetContentCount: 3, deliveredCount: 3, contents: [{}, {}, {}], missing: [] }), null);
});

test("bloqueio preventivo cobre só job ativo; capacidade é pós-clique", () => {
  assert.equal(isActiveLimitError("GEN-ACTIVE"), true);
  assert.equal(isActiveLimitError("GEN-CAPACITY"), false);
  assert.equal(isCapacityUnavailableError("GEN-CAPACITY"), true);
  assert.equal(isCapacityUnavailableError("GEN-PRODUCT-CAPACITY"), true);
  assert.equal(isCapacityUnavailableError("GEN-ACTIVE"), false);
  assert.ok(BLOCKED_ACTIVE_MESSAGE.length > 0);
  assert.ok(CAPACITY_UNAVAILABLE_MESSAGE.length > 0);
});

test("normaliza a projecao ADR-016 e tolera payload sem o campo", () => {
  assert.deepEqual(
    normalizeGenerationAction({ state: "AVAILABLE", reason: null, nextAction: null }),
    { state: "AVAILABLE", reason: null, nextAction: null },
  );
  assert.deepEqual(
    normalizeGenerationAction({ state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: "VIEW_ACTIVE_ANALYSIS" }),
    { state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: "VIEW_ACTIVE_ANALYSIS" },
  );
  assert.equal(normalizeGenerationAction(undefined), undefined);
  assert.equal(normalizeGenerationAction(null), undefined);
  assert.equal(normalizeGenerationAction({ state: "UNAVAILABLE" }), undefined);
  assert.equal(normalizeGenerationAction({ state: "BLOCKED", reason: "GEN-READY", nextAction: "VIEW_ACTIVE_ANALYSIS" }), undefined);
});

test("rejeita todo par reason/nextAction incompativel com o estado", () => {
  assert.equal(
    normalizeGenerationAction({ state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: "WAIT_FOR_CAPACITY" }),
    undefined,
  );
  assert.equal(
    normalizeGenerationAction({ state: "BLOCKED", reason: "GEN-CAPACITY", nextAction: "VIEW_ACTIVE_ANALYSIS" }),
    undefined,
  );
  assert.equal(
    normalizeGenerationAction({ state: "BLOCKED", reason: null, nextAction: "VIEW_ACTIVE_ANALYSIS" }),
    undefined,
  );
  assert.equal(
    normalizeGenerationAction({ state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: null }),
    undefined,
  );
  assert.equal(
    normalizeGenerationAction({ state: "AVAILABLE", reason: "GEN-ACTIVE", nextAction: null }),
    undefined,
  );
  assert.equal(
    normalizeGenerationAction({ state: "AVAILABLE", reason: null, nextAction: "WAIT_FOR_CAPACITY" }),
    undefined,
  );
  assert.equal(
    normalizeGenerationAction({ state: "BLOCKED", reason: "GEN-CAPACITY", nextAction: null }),
    undefined,
  );
});

test("mapeia reason da projecao para a copy aprovada de bloqueio", () => {
  assert.equal(blockedActionCopy({ state: "AVAILABLE", reason: null, nextAction: null }), null);
  assert.equal(
    blockedActionCopy({ state: "BLOCKED", reason: "GEN-ACTIVE", nextAction: "VIEW_ACTIVE_ANALYSIS" }),
    BLOCKED_ACTIVE_MESSAGE,
  );
  assert.equal(
    blockedActionCopy({ state: "BLOCKED", reason: "GEN-CAPACITY", nextAction: "WAIT_FOR_CAPACITY" }),
    CAPACITY_UNAVAILABLE_MESSAGE,
  );
});

test("dismiss do toast persiste por job/estado e reapresenta em mudanca", () => {
  const jobQueued = { id: "job-1", status: "QUEUED" };
  assert.equal(isToastDismissed("job-1:QUEUED", jobQueued), true);
  assert.equal(isToastDismissed(null, jobQueued), false);
  assert.equal(isToastDismissed("job-1:QUEUED", { id: "job-1", status: "RUNNING" }), false);
  assert.equal(isToastDismissed("job-1:QUEUED", { id: "job-2", status: "QUEUED" }), false);
  assert.equal(isToastDismissed("job-1:QUEUED", null), true);
  assert.equal(isToastDismissed(null, null), true);
});

test("deriva o log de fases apenas dos stages públicos", () => {
  assert.deepEqual(phaseStates("RUNNING", "BUILDING_STRATEGY").map((p) => p.state), [
    "done", "done", "active", "pending", "pending", "pending",
  ]);
  assert.deepEqual(phaseStates("QUEUED", null).map((p) => p.state), Array(6).fill("pending"));
  assert.deepEqual(phaseStates("SUCCEEDED", "FINALIZING").map((p) => p.state), Array(6).fill("done"));
  assert.deepEqual(phaseStates("FAILED", "GENERATING_BRIEFS").map((p) => p.state), [
    "done", "done", "done", "done", "failed", "skipped",
  ]);
  assert.equal(phaseStates("FAILED", "GENERATING_BRIEFS")[4].stage, "GENERATING_BRIEFS");
  assert.equal(phaseStateLabels.skipped, "Cancelado");
});

test("modelo da Strategy expõe só campos presentes e deriva vínculos por match exato", () => {
  const model = strategyModel({
    primaryPositioning: " Posicionamento ",
    status: "ACTIVE",
    audiences: ["Público A", "Público B"],
    priorityBenefits: ["Benefício 1"],
    priorityObjections: ["Objeção 1"],
    priorityArguments: ["Argumento 1"],
    priorityAngles: ["Ângulo 1"],
    communicationPrinciples: ["Princípio 1"],
    opportunities: [
      { audience: "Público A", situation: "Situação A", pain: "Dor 1", desire: "Desejo 1", objection: "Objeção 1", sellingArgument: "Argumento vinculado" },
      { audience: "Público A", situation: "Situação duplicada", pain: "Dor 1", desire: "Desejo 2" },
    ],
  });
  assert.equal(model.positioning, "Posicionamento");
  assert.equal(model.active, true);
  assert.deepEqual(model.pains, ["Dor 1"]);
  assert.deepEqual(model.desires, ["Desejo 1", "Desejo 2"]);
  // Primeiro match exato apenas; relações inexistentes não são criadas.
  assert.equal(model.audienceSituations.get("Público A"), "Situação A");
  assert.equal(model.audienceSituations.get("Público B"), undefined);
  assert.equal(model.objectionArguments.get("Objeção 1"), "Argumento vinculado");
  assert.equal(model.objectionArguments.get("Inexistente"), undefined);
});

test("modelo da Strategy tolera payload vazio ou malformado", () => {
  const empty = strategyModel(null);
  assert.equal(empty.positioning, "");
  assert.equal(empty.active, false);
  assert.deepEqual(empty.audiences, []);
  assert.deepEqual(empty.pains, []);
  assert.equal(empty.audienceSituations.size, 0);
  const partial = strategyModel({ audiences: "não-lista", opportunities: [null, 42, { pain: " " }] });
  assert.deepEqual(partial.audiences, []);
  assert.deepEqual(partial.pains, []);
});


test("briefingItems projeta só campos reais e ordena por posição", () => {
  const items = briefingItems([
    { id: "c2", position: 2, status: "APPROVED", angle: "Ângulo B", hook: "Hook B", development: ["Mostre o produto"], script: "Roteiro B", scenes: ["legado"], cta: "CTA B" },
    { id: "c1", position: 1, status: "DRAFT", angle: "Ângulo A", hook: "Hook A", development: ["Destaque o benefício real", "Demonstre o uso"], script: "Roteiro A", cta: "CTA A", objective: "Objetivo A", targetAudience: "Público A" },
  ]);
  assert.deepEqual(items.map((item) => item.id), ["c1", "c2"]);
  assert.equal(items[0].objective, "Objetivo A");
  assert.equal(items[0].targetAudience, "Público A");
  assert.deepEqual(items[0].development, ["Destaque o benefício real", "Demonstre o uso"]);
  assert.equal(items[0].pain, "");
  assert.deepEqual(items[1].scenes, null);
  assert.equal(items[1].objective, "");
});

test("briefingItems tolera payload ausente e exige development como lista", () => {
  const items = briefingItems([{ hook: "Só hook", development: "não é lista" }]);
  assert.deepEqual(items[0].development, []);
  assert.equal(items[0].position, 1);
  assert.equal(items[0].status, "DRAFT");
  assert.deepEqual(items[0].scenes, null);
});


test("development persistido como string[] mantém os bullets separados", () => {
  const items = briefingItems([{ id: "c1", hook: "Hook", development: ["Mostre o produto real em uso", "Comente o benefício principal"], script: "Roteiro", cta: "CTA" }]);
  assert.deepEqual(items[0].development, ["Mostre o produto real em uso", "Comente o benefício principal"]);
  assert.deepEqual(items[0].scenes, null);
});
test("labels de status do Content não misturam estados do Estúdio", () => {
  assert.equal(contentStatusLabel("DRAFT"), "Rascunho");
  assert.equal(contentStatusLabel("APPROVED"), "Aprovado");
  assert.equal(contentStatusLabel("DISCARDED"), "Descartado");
  assert.equal(contentStatusLabel("GRAVANDO"), "GRAVANDO");
});

test("scenesProjection aplica os estados do contrato", () => {
  assert.deepEqual(scenesProjection({ id: "c1" }), null);
  assert.deepEqual(scenesProjection({ id: "c1", scenes: null }), null);
  assert.deepEqual(scenesProjection({ id: "c1", scenes: ["legado"] }), null);
  assert.deepEqual(scenesProjection({ id: "c1", scenes: { status: "EXISTENTE" } }), null);
  const available = scenesProjection({
    id: "c1",
    scenes: { status: "AVAILABLE", generated: 3, dropped: 2, scenes: [{ description: "Abre em pé na rua" }, { description: " " }, { description: "Close do tecido" }, 42] },
  });
  assert.equal(available?.status, "AVAILABLE");
  assert.deepEqual(available?.scenes, [{ description: "Abre em pé na rua" }, { description: "Close do tecido" }]);
  assert.equal(available?.generated, 3);
  assert.equal(available?.dropped, 2);
  const filtered = scenesProjection({ id: "c1", scenes: { status: "FILTERED", scenes: [], generated: 2, dropped: 2 } });
  assert.equal(filtered?.status, "FILTERED");
  const error = scenesProjection({ id: "c1", scenes: { status: "ERROR", scenes: [], generated: 0, dropped: 0 } });
  assert.equal(error?.status, "ERROR");
  const defaults = scenesProjection({ id: "c1", scenes: { status: "AVAILABLE", scenes: [{ description: "Close do tecido" }] } });
  assert.equal(defaults?.generated, 1);
  assert.equal(defaults?.dropped, 0);
});

test("scriptParagraphs separa frases completas em parágrafos distintos", () => {
  assert.deepEqual(scriptParagraphs("Frase um aqui. Segunda frase! Terceira?"), ["Frase um aqui.", "Segunda frase!", "Terceira?"]);
  assert.deepEqual(scriptParagraphs("Só uma frase sem fim."), ["Só uma frase sem fim."]);
  assert.deepEqual(scriptParagraphs("  "), []);
});

test("resumo da aba conta aprovados só quando existem", () => {
  assert.equal(contentsSummaryLabel(5, 0), "5 conteúdos");
  assert.equal(contentsSummaryLabel(20, 8), "20 conteúdos · 8 aprovados");
});

// Gate 3 item 6 (rev. 4) — modelo de ações do terminal degradado GEN-PROJECTION
// (RI-003-20): anomalia comunicada, nunca sucesso nem falha de execução.
test("SUCCEEDED degradado: sem retry e sem revisão — anomalia, não sucesso", () => {
  const actions = projectionDegradedModel({ code: "GEN-PROJECTION", status: "SUCCEEDED" });
  assert.equal(actions.degraded, true);
  assert.equal(actions.retry, false); // /retry responderia 404 (fora da partição)
  assert.equal(actions.reviewContents, false); // nada projetável para revisar
  assert.equal(actions.generateMissing, false);
  // A view (GenerationActions) comunica o estado de anomalia em role alert e
  // não renderiza nenhuma ação quando degraded sem generateMissing.
});

test("SUCCEEDED_PARTIAL degradado: /complete acessível, sem retry e sem revisão", () => {
  const actions = projectionDegradedModel({ code: "GEN-PROJECTION", status: "SUCCEEDED_PARTIAL" });
  assert.equal(actions.degraded, true);
  assert.equal(actions.generateMissing, true); // recuperação dos faltantes não depende da projeção
  assert.equal(actions.retry, false);
  assert.equal(actions.reviewContents, false);
});

test("positivos sem code e terminais de falha não entram no estado degradado", () => {
  assert.equal(projectionDegradedModel({ code: null, status: "SUCCEEDED" }).degraded, false);
  assert.equal(projectionDegradedModel({ code: undefined, status: "SUCCEEDED_PARTIAL" }).degraded, false);
  assert.equal(projectionDegradedModel({ code: "GEN-PROJECTION", status: "FAILED" }).degraded, false);
  assert.equal(projectionDegradedModel(null).degraded, false);
});

test("timestamps do contrato de observabilidade: ausente ou inválido fica indisponível", () => {
  assert.equal(formatTimestamp(null), null);
  assert.equal(formatTimestamp(undefined), null);
  assert.equal(formatTimestamp("invalid"), null);
  assert.match(formatTimestamp("2026-09-18T12:30:00.000Z") ?? "", /^\d{2}\/\d{2}\/\d{4}/);
});

test("uso e custo agregados: null quando nada é conhecível, formatados quando presentes", () => {
  assert.equal(formatUsageLabel(null), null);
  assert.equal(formatUsageLabel({ inputTokens: null, outputTokens: null }), null);
  assert.equal(formatUsageLabel({ inputTokens: 1200, outputTokens: 340 }), "1.200 entrada · 340 saída (tokens)");
  assert.equal(formatCostLabel(null), null);
  assert.equal(formatCostLabel({ currency: null, amountMinor: "1234" }), null);
  assert.equal(formatCostLabel({ currency: "BRL", amountMinor: "1234" }), "R$ 12,34");
  assert.equal(formatAmount("1234567", "BRL"), "R$ 12.345,67");
});

test("executionObservability expõe jobId/status/timestamps/uso/custo com indisponíveis explícitos", () => {
  const rows = executionObservability({
    id: "job-7",
    status: "RUNNING",
    createdAt: "2026-09-18T12:30:00.000Z",
    startedAt: null,
    finishedAt: null,
  });
  const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
  assert.equal(byLabel["Job"]?.value, "job-7");
  assert.equal(byLabel["Job"]?.mono, true);
  assert.equal(byLabel["Status"]?.value, "Analisando");
  assert.notEqual(byLabel["Solicitada em"]?.value, OBSERVABILITY_UNAVAILABLE);
  assert.equal(byLabel["Iniciada em"]?.value, OBSERVABILITY_UNAVAILABLE);
  assert.equal(byLabel["Concluída em"]?.value, OBSERVABILITY_UNAVAILABLE);
  assert.equal(byLabel["Uso"]?.value, "Uso indisponível");
  assert.equal(byLabel["Custo"]?.value, "Custo indisponível");
  assert.equal(executionObservability(null).length, 0);
});

test("projeção de observabilidade nunca carrega provider, modelo, prompt ou metadata", () => {
  const rows = executionObservability({
    id: "job-7",
    status: "SUCCEEDED",
    createdAt: null,
    startedAt: null,
    finishedAt: null,
    usage: { inputTokens: 1, outputTokens: 2 },
    cost: { currency: "BRL", amountMinor: "10" },
  });
  const serialized = JSON.stringify(rows);
  for (const field of ["provider", "model", "tier", "prompt", "latency", "logs"]) {
    assert.equal(serialized.includes(field), false, field);
  }
});
