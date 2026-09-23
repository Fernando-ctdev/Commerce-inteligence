import type { ProductFieldErrors } from "./product-form-model";

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
