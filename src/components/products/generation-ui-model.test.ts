import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKED_ACTIVE_MESSAGE,
  CAPACITY_UNAVAILABLE_MESSAGE,
  canCancelGeneration,
  generationStatusLabel,
  isActiveGeneration,
  isActiveLimitError,
  isCapacityUnavailableError,
  isRetryableGeneration,
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
