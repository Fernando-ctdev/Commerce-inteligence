import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeGenerationRequest,
  validateGenerationOutput,
  type GenerationInputV1,
  type GenerationOutputV1,
} from "./contract.js";

const input: GenerationInputV1 = {
  contract_version: "1",
  operation: "first_strategy_plan",
  product: {
    id: "product-1",
    name: "Produto",
    description: "Descrição",
    category: null,
    price_cents: null,
    features: [],
    image_refs: [],
    notes: null,
    url: null,
    locale: "pt-BR",
    version: 1,
  },
  strategy_context: { locale: "pt-BR", goal: null, audience: "Pessoas adultas", style: null, creator_presence: null, experience: null, constraints: null, market: null, notes: null },
  history_snapshot: [],
  request: { quantity: 1, objective: "Vender com clareza" },
};

function validOutput(): GenerationOutputV1 {
  const strategy = {
    analysis: {
      problem: "Um problema claro",
      functional_benefits: ["Benefício funcional"],
      emotional_benefits: ["Benefício emocional"],
      differentiators: ["Diferencial"],
      relevant_characteristics: ["Característica"],
      use_cases: ["Uso"],
      usage_context: ["Contexto"],
      purchase_triggers: ["Gatilho"],
      purchase_barriers: ["Barreira"],
      communication_risks: ["Risco"],
      sales_arguments: ["Argumento"],
    },
    dimensions: {
      audiences: [{ id: "audience-1", label: "Pessoas adultas" }],
      pains: [{ id: "pain-1", label: "Dor" }],
      desires: [{ id: "desire-1", label: "Desejo" }],
      benefits: [{ id: "benefit-1", label: "Benefício" }],
      objections: [{ id: "objection-1", label: "Objeção" }],
      angles: [{ id: "angle-1", label: "Ângulo" }],
    },
  };
  return {
    contract_version: "1",
    provenance: { generation_run_id: "run-1", product_id: "product-1", input_snapshot_hash: "hash", taxonomy_version: "1", engine_version: "blocked", generated_at: new Date().toISOString() },
    strategy,
    plan: { explanation: "Distribuição coerente", distribution: [{ dimension_id: "angle-1", quantity: 1, rationale: "Única oportunidade" }] },
    contents: [{
      id: "content-1",
      position: 1,
      audience_id: "audience-1",
      pain_id: "pain-1",
      desire_id: "desire-1",
      benefit_id: "benefit-1",
      objection_id: "objection-1",
      angle_id: "angle-1",
      hook: "Uma solução para hoje",
      structure: "Demonstração curta",
      script: "Fala e ação graváveis",
      scenes: ["Mostrar o produto"],
      cta: "Conheça o produto",
      explanation: "Trabalha a dor principal",
    }],
  };
}

test("normaliza a solicitação e rejeita quantidade/objetivo inválidos", () => {
  assert.deepEqual(normalizeGenerationRequest({ quantity: 3, objective: "  vender  " }), { request: { quantity: 3, objective: "vender" } });
  assert.deepEqual(normalizeGenerationRequest({ quantity: 1 }), { request: { quantity: 1, objective: null } });
  assert.ok("errors" in normalizeGenerationRequest({ quantity: 0 }));
  assert.ok("errors" in normalizeGenerationRequest({ quantity: 1, objective: "  " }));
});

test("valida a saída completa sem substituir o gold-standard", () => {
  const result = validateGenerationOutput(input, validOutput());
  assert.ok("output" in result);

  const duplicate = validOutput();
  duplicate.contents[0].hook = " Uma solução para hoje. ";
  assert.ok("errors" in validateGenerationOutput(input, { ...duplicate, contents: [duplicate.contents[0], { ...duplicate.contents[0], id: "content-2", position: 2 }] }));

  const missingReference = validOutput();
  missingReference.contents[0].angle_id = "angle-unknown";
  assert.ok("errors" in validateGenerationOutput(input, missingReference));
});

test("desejo OU benefício é suficiente; nenhum dos dois é inválido", () => {
  const desireOnly = validOutput();
  delete desireOnly.contents[0].benefit_id;
  assert.ok("output" in validateGenerationOutput(input, desireOnly));

  const benefitOnly = validOutput();
  delete benefitOnly.contents[0].desire_id;
  assert.ok("output" in validateGenerationOutput(input, benefitOnly));

  const neither = validOutput();
  delete neither.contents[0].desire_id;
  delete neither.contents[0].benefit_id;
  assert.ok("errors" in validateGenerationOutput(input, neither));
});

test("distribuição do Plan referencia dimensões da Strategy e soma a quantidade solicitada", () => {
  const unknownDimension = validOutput();
  unknownDimension.plan.distribution[0].dimension_id = "angle-unknown";
  assert.ok("errors" in validateGenerationOutput(input, unknownDimension));

  const wrongSum = validOutput();
  wrongSum.plan.distribution[0].quantity = 2; // solicitado 1
  assert.ok("errors" in validateGenerationOutput(input, wrongSum));

  const empty = validOutput();
  empty.plan.distribution = [];
  assert.ok("errors" in validateGenerationOutput(input, empty));
});
