import assert from "node:assert/strict";
import test from "node:test";

import { contentDimensionLabels, generationStatusLabel, generationStatusMessage, isActiveGeneration, isCapacityUnavailableError, isLimitError, isRetryableGeneration } from "./generation-ui-model";

test("maps every generation state to visible pt-BR status and action category", () => {
  assert.equal(generationStatusLabel("queued"), "Na fila");
  assert.equal(generationStatusLabel("running"), "Gerando");
  assert.equal(generationStatusLabel("succeeded"), "Concluída");
  assert.equal(generationStatusLabel("failed"), "Falha recuperável");
  assert.equal(generationStatusLabel("cancelled"), "Cancelada");
  assert.equal(isActiveGeneration("queued"), true);
  assert.equal(isActiveGeneration("running"), true);
  assert.equal(isRetryableGeneration("failed"), true);
  assert.equal(isRetryableGeneration("cancelled"), true);
  assert.equal(generationStatusMessage("running", 2), "A geração está em andamento. Nenhum conteúdo parcial será exibido.");
});

test("keeps entitlement errors distinct for their canonical next actions", () => {
  assert.equal(isLimitError("generation_capacity"), true);
  assert.equal(isCapacityUnavailableError("capacity_unavailable"), true);
  assert.equal(isLimitError("capacity_unavailable"), false);
});

test("maps Content dimension IDs to Strategy labels without exposing technical IDs", () => {
  const labels = contentDimensionLabels({ dimensions: {
    audiences: [{ id: "audience-1", label: "Creators iniciantes" }],
    pains: [{ id: "pain-1", label: "Pouco tempo" }],
    desires: [{ id: "desire-1", label: "Clareza" }],
    benefits: [{ id: "benefit-1", label: "Decisão rápida" }],
    objections: [{ id: "objection-1", label: "Custo" }],
    angles: [{ id: "angle-1", label: "Antes e depois" }],
  } }, {
    audience_id: "audience-1",
    pain_id: "pain-1",
    desire_id: "desire-1",
    benefit_id: "benefit-1",
    objection_id: "objection-1",
    angle_id: "angle-1",
  });

  assert.deepEqual(labels, {
    audience: "Creators iniciantes",
    pain: "Pouco tempo",
    desire: "Clareza",
    benefit: "Decisão rápida",
    objection: "Custo",
    angle: "Antes e depois",
  });
});
