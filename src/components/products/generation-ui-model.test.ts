import assert from "node:assert/strict";
import test from "node:test";
import { generationStatusLabel, isActiveGeneration, isRetryableGeneration, stageMessage } from "./generation-ui-model";

test("mapeia estados e stages públicos para mensagens humanas", () => {
  assert.equal(generationStatusLabel("RUNNING"), "Analisando");
  assert.equal(stageMessage("GENERATING_BRIEFS"), "Preparando os Briefings do Conteúdo...");
  assert.equal(isActiveGeneration("QUEUED"), true);
  assert.equal(isRetryableGeneration("FAILED"), true);
});
