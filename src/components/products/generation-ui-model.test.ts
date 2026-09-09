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
  generationStatusLabel,
  isActiveGeneration,
  isActiveLimitError,
  isCapacityUnavailableError,
  isRetryableGeneration,
  isToastDismissed,
  normalizeGenerationAction,
  phaseStateLabels,
  phaseStates,
  stageMessage,
  strategyModel,
} from "./generation-ui-model";

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
    communicationRisks: ["Risco 1"],
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
    { id: "c2", position: 2, status: "APPROVED", angle: "Ângulo B", hook: "Hook B", script: "Roteiro B", scenes: ["Cena 1", " ", 42], cta: "CTA B" },
    { id: "c1", position: 1, status: "DRAFT", angle: "Ângulo A", hook: "Hook A", script: "Roteiro A", scenes: ["Cena 1", "Cena 2"], cta: "CTA A", objective: "Objetivo A", targetAudience: "Público A" },
  ]);
  assert.deepEqual(items.map((item) => item.id), ["c1", "c2"]);
  assert.equal(items[0].objective, "Objetivo A");
  assert.equal(items[0].targetAudience, "Público A");
  assert.equal(items[0].pain, "");
  assert.deepEqual(items[1].scenes, ["Cena 1"]);
  assert.equal(items[1].objective, "");
});

test("briefingItems tolera payload ausente ou malformado", () => {
  const items = briefingItems([{ hook: "Só hook" }]);
  assert.equal(items[0].id, "conteudo-1");
  assert.equal(items[0].position, 1);
  assert.equal(items[0].status, "DRAFT");
  assert.deepEqual(items[0].scenes, []);
});

test("labels de status do Content não misturam estados do Estúdio", () => {
  assert.equal(contentStatusLabel("DRAFT"), "Rascunho");
  assert.equal(contentStatusLabel("APPROVED"), "Aprovado");
  assert.equal(contentStatusLabel("DISCARDED"), "Descartado");
  assert.equal(contentStatusLabel("GRAVANDO"), "GRAVANDO");
});

test("resumo da aba conta aprovados só quando existem", () => {
  assert.equal(contentsSummaryLabel(5, 0), "5 conteúdos");
  assert.equal(contentsSummaryLabel(20, 8), "20 conteúdos · 8 aprovados");
});
