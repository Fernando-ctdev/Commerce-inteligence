import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKED_ACTIVE_MESSAGE,
  blockedActionCopy,
  CAPACITY_UNAVAILABLE_MESSAGE,
  canCancelGeneration,
  generationStatusLabel,
  isActiveGeneration,
  isActiveLimitError,
  isCapacityUnavailableError,
  isRetryableGeneration,
  isToastDismissed,
  normalizeGenerationAction,
  stageMessage,
} from "./generation-ui-model";

test("mapeia estados e stages públicos para mensagens humanas", () => {
  assert.equal(generationStatusLabel("RUNNING"), "Analisando");
  assert.equal(stageMessage("GENERATING_BRIEFS"), "Preparando os Briefings do Conteúdo...");
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

