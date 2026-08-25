import type { ProductFieldErrors } from "./product-form-model";

const productErrorOrder: Array<keyof ProductFieldErrors> = [
  "name",
  "description",
  "category",
  "price",
  "characteristics",
  "observations",
  "imageReferences",
  "url",
  "objective",
  "audience",
  "style",
  "presence",
  "experience",
  "market",
  "restrictions",
  "contextObservations",
];

export function productProgressLabel(readyForStrategy: boolean) {
  return readyForStrategy ? "Produto pronto para Strategy" : "Completar contexto";
}

export function firstProductErrorField(errors: ProductFieldErrors) {
  return productErrorOrder.find((field) => Boolean(errors[field]));
}

export function shouldMonitorEnrichment(product: { url: string; enrichmentStatus: string }) {
  return Boolean(product.url) && product.enrichmentStatus === "pending";
}
