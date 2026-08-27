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
];

export function firstProductErrorField(errors: ProductFieldErrors) {
  return productErrorOrder.find((field) => Boolean(errors[field]));
}
