import type { ProductFieldErrors } from "./product-form-model";

/** Projeção server-authoritative do ADR-016 (ActiveProductView); archived omite o campo.
 *  Vive em shared: consumida por shared/product-api (leitura do Produto) e pela
 *  camada de geração — shared nunca importa de feature. */
export type GenerationActionProjection =
  | { state: "AVAILABLE"; reason: null; nextAction: null }
  | { state: "BLOCKED"; reason: "GEN-ACTIVE" | "GEN-CAPACITY"; nextAction: "VIEW_ACTIVE_ANALYSIS" | "WAIT_FOR_CAPACITY" };

/** Tolerante a payload antigo: campo ausente/malformado volta como undefined sem quebrar a leitura. */
export function normalizeGenerationAction(value: unknown): GenerationActionProjection | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.state === "AVAILABLE" && record.reason === null && record.nextAction === null) return { state: "AVAILABLE", reason: null, nextAction: null };
  if (record.state === "BLOCKED" && record.reason === "GEN-ACTIVE" && record.nextAction === "VIEW_ACTIVE_ANALYSIS") {
    return { state: "BLOCKED", reason: record.reason, nextAction: record.nextAction };
  }
  if (record.state === "BLOCKED" && record.reason === "GEN-CAPACITY" && record.nextAction === "WAIT_FOR_CAPACITY") {
    return { state: "BLOCKED", reason: record.reason, nextAction: record.nextAction };
  }
  return undefined;
}

const productErrorOrder: Array<keyof ProductFieldErrors> = [
  "name",
  "description",
  "category",
  "price",
  "observations",
  "imageReferences",
  "url",
];

export function firstProductErrorField(errors: ProductFieldErrors) {
  return productErrorOrder.find((field) => Boolean(errors[field]));
}
