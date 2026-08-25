import { createHash } from "node:crypto";

import { IDEMPOTENCY_KEY_RE } from "../product/validation";

export const GENERATION_CONTRACT_VERSION = "1" as const;
export const FIRST_GENERATION_OPERATION = "first_strategy_plan" as const;
export const MAX_GENERATION_QUANTITY = 50;
const MAX_CONTEXT_TEXT_LENGTH = 5000;

export type GenerationRequest = { quantity: number; objective: string | null };

export type ProductSnapshot = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  price_cents: number | null;
  features: string[];
  image_refs: string[];
  notes: string | null;
  url: string | null;
  locale: "pt-BR";
  version: number;
};

export type StrategyContextSnapshot = {
  locale: "pt-BR";
  goal: string | null;
  audience: string | null;
  style: string | null;
  creator_presence: string | null;
  experience: string | null;
  constraints: string | null;
  market: string | null;
  notes: string | null;
};

export type GenerationInputV1 = {
  contract_version: typeof GENERATION_CONTRACT_VERSION;
  operation: typeof FIRST_GENERATION_OPERATION;
  product: ProductSnapshot;
  strategy_context: StrategyContextSnapshot;
  history_snapshot: [];
  request: GenerationRequest;
};

export type Dimension = { id: string; label: string };
export type StrategyDimensions = {
  audiences: Dimension[];
  pains: Dimension[];
  desires: Dimension[];
  benefits: Dimension[];
  objections: Dimension[];
  angles: Dimension[];
};

export type GenerationOutputV1 = {
  contract_version: typeof GENERATION_CONTRACT_VERSION;
  provenance: {
    generation_run_id: string;
    product_id: string;
    input_snapshot_hash: string;
    taxonomy_version: string;
    engine_version: string;
    provider?: string;
    model?: string;
    generated_at: string;
  };
  strategy: {
    analysis: {
      problem: string;
      functional_benefits: string[];
      emotional_benefits: string[];
      differentiators: string[];
      relevant_characteristics: string[];
      use_cases: string[];
      usage_context: string[];
      purchase_triggers: string[];
      purchase_barriers: string[];
      communication_risks: string[];
      sales_arguments: string[];
    };
    dimensions: StrategyDimensions;
  };
  plan: {
    explanation: string;
    distribution: { dimension_id: string; quantity: number; rationale: string }[];
  };
  contents: {
    id: string;
    position: number;
    audience_id: string;
    pain_id: string;
    desire_id?: string; // SPEC: desejo OU benefício — ao menos um dos dois é obrigatório
    benefit_id?: string;
    objection_id?: string;
    angle_id: string;
    hook: string;
    structure: string;
    script: string;
    scenes: string[];
    cta: string;
    explanation: string;
  }[];
};

export type ContractErrors = Record<string, string>;

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  return normalized === "" ? null : normalized;
}

export function normalizeHook(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:]+$/g, "");
}

export function normalizeGenerationRequest(value: unknown): { request: GenerationRequest } | { errors: ContractErrors } {
  if (typeof value !== "object" || value === null) return { errors: { request: "Requisição inválida." } };
  const body = value as Record<string, unknown>;
  const errors: ContractErrors = {};
  if (!Number.isInteger(body.quantity) || Number(body.quantity) < 1 || Number(body.quantity) > MAX_GENERATION_QUANTITY) {
    errors.quantity = `Informe uma quantidade inteira entre 1 e ${MAX_GENERATION_QUANTITY}.`;
  }
  let objective: string | null = null;
  if (body.objective !== undefined && body.objective !== null) {
    objective = normalizeText(body.objective);
    if (!objective) errors.objective = "Informe um objetivo ou deixe o campo vazio.";
    else if (Array.from(objective).length > MAX_CONTEXT_TEXT_LENGTH) errors.objective = `Máximo de ${MAX_CONTEXT_TEXT_LENGTH} caracteres.`;
  }
  if (Object.keys(errors).length) return { errors };
  return { request: { quantity: Number(body.quantity), objective } };
}

export function validateGenerationIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && IDEMPOTENCY_KEY_RE.test(value) ? value : null;
}

export function intentFingerprint(input: GenerationInputV1, previousRunId?: string): string {
  return generationIntentFingerprint(input.product.id, input.request.quantity, input.request.objective, previousRunId);
}

export function generationIntentFingerprint(productId: string, quantity: number, objective: string | null, previousRunId?: string): string {
  return createHash("sha256")
    .update(JSON.stringify([FIRST_GENERATION_OPERATION, productId, quantity, objective, previousRunId ?? null]))
    .digest("hex");
}

export function inputSnapshotHash(input: GenerationInputV1): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && normalizeText(value) !== null;
}

function dimensionIds(dimensions: Dimension[]): Set<string> {
  return new Set(dimensions.map((dimension) => dimension.id));
}

function validateDimensions(dimensions: StrategyDimensions, errors: ContractErrors): void {
  for (const key of ["audiences", "pains", "desires", "benefits", "angles"] as const) {
    const items = dimensions[key];
    if (!Array.isArray(items) || items.length < 1 || items.length > 8 || items.some((item) => !item || !nonEmpty(item.id) || !nonEmpty(item.label))) {
      errors[`strategy.dimensions.${key}`] = "A coleção deve ter entre 1 e 8 itens não vazios.";
    }
  }
  const objections = dimensions.objections;
  if (!Array.isArray(objections) || objections.length > 8 || objections.some((item) => !item || !nonEmpty(item.id) || !nonEmpty(item.label))) {
    errors["strategy.dimensions.objections"] = "Objeções devem ter até 8 itens não vazios.";
  }
}

export function validateGenerationOutput(input: GenerationInputV1, value: unknown): { output: GenerationOutputV1 } | { errors: ContractErrors } {
  const errors: ContractErrors = {};
  if (typeof value !== "object" || value === null) return { errors: { output: "Saída inválida." } };
  const output = value as GenerationOutputV1;
  if (output.contract_version !== GENERATION_CONTRACT_VERSION) errors.contract_version = "Versão de contrato inválida.";
  if (!output.provenance || output.provenance.product_id !== input.product.id) errors.provenance = "Proveniência incompatível com o Product.";
  const strategy = output.strategy;
  if (!strategy?.analysis || !strategy.dimensions) errors.strategy = "Strategy incompleta.";
  else {
    const analysis = strategy.analysis;
    for (const field of ["problem", "functional_benefits", "emotional_benefits", "differentiators", "relevant_characteristics", "use_cases", "usage_context", "purchase_triggers", "purchase_barriers", "communication_risks", "sales_arguments"] as const) {
      const valueAtField = analysis[field];
      if (field === "problem" ? !nonEmpty(valueAtField) : !Array.isArray(valueAtField) || valueAtField.length === 0 || valueAtField.some((item) => !nonEmpty(item))) {
        errors[`strategy.analysis.${field}`] = "Campo obrigatório da análise ausente.";
      }
    }
    validateDimensions(strategy.dimensions, errors);
  }
  const contents = output.contents;
  if (!Array.isArray(contents) || contents.length !== input.request.quantity) errors.contents = "A quantidade de Contents deve ser exatamente a solicitada.";
  const ids = strategy?.dimensions;
  if (Array.isArray(contents) && ids) {
    const references = {
      audience_id: dimensionIds(ids.audiences),
      pain_id: dimensionIds(ids.pains),
      desire_id: dimensionIds(ids.desires),
      benefit_id: dimensionIds(ids.benefits),
      objection_id: dimensionIds(ids.objections),
      angle_id: dimensionIds(ids.angles),
    } as const;
    const hooks = new Set<string>();
    const contentIds = new Set<string>();
    for (const content of contents) {
      if (!content || !nonEmpty(content.id) || contentIds.has(content.id)) errors.contents = "IDs de Content devem ser únicos.";
      contentIds.add(content?.id ?? "");
      for (const field of ["audience_id", "pain_id", "angle_id"] as const) {
        if (!references[field].has(content?.[field])) errors[`contents.${field}`] = "Referência de dimensão inexistente.";
      }
      // SPEC: desejo ou benefício — ao menos um presente; quando presente, referencia a própria Strategy.
      if (content?.desire_id === undefined && content?.benefit_id === undefined) errors["contents.desire_id"] = "Informe desejo ou benefício.";
      if (content?.desire_id !== undefined && !references.desire_id.has(content.desire_id)) errors["contents.desire_id"] = "Referência de desejo inexistente.";
      if (content?.benefit_id !== undefined && !references.benefit_id.has(content.benefit_id)) errors["contents.benefit_id"] = "Referência de benefício inexistente.";
      if (content?.objection_id !== undefined && !references.objection_id.has(content.objection_id)) errors["contents.objection_id"] = "Referência de objeção inexistente.";
      if (!nonEmpty(content?.hook) || hooks.has(normalizeHook(content.hook))) errors["contents.hook"] = "Hooks obrigatórios devem ser únicos após normalização.";
      hooks.add(normalizeHook(content?.hook ?? ""));
      for (const field of ["structure", "script", "cta", "explanation"] as const) if (!nonEmpty(content?.[field])) errors[`contents.${field}`] = "Campo gravável obrigatório ausente.";
      if (!Array.isArray(content?.scenes) || content.scenes.length < 1 || content.scenes.some((scene) => !nonEmpty(scene))) errors["contents.scenes"] = "Cada Content precisa de pelo menos uma cena.";
    }
  }
  if (!output.plan || !nonEmpty(output.plan.explanation) || !Array.isArray(output.plan.distribution) || output.plan.distribution.length === 0) {
    errors.plan = "Plan incompleto ou sem distribuição válida.";
  } else if (ids) {
    const allDimensions = new Set([
      ...ids.audiences, ...ids.pains, ...ids.desires, ...ids.benefits, ...ids.objections, ...ids.angles,
    ].map((dimension) => dimension.id));
    let distributed = 0;
    for (const item of output.plan.distribution) {
      if (!nonEmpty(item?.dimension_id) || !allDimensions.has(item.dimension_id)) errors.plan = "Distribuição do Plan referencia dimensão inexistente.";
      if (!nonEmpty(item?.rationale) || !Number.isInteger(item?.quantity) || item.quantity < 1) errors.plan = "Distribuição do Plan incompleta ou sem quantidade válida.";
      distributed += Number.isInteger(item?.quantity) ? item.quantity : 0;
    }
    if (distributed !== input.request.quantity) errors.plan = "A distribuição do Plan deve somar exatamente a quantidade solicitada.";
  }
  return Object.keys(errors).length ? { errors } : { output };
}
