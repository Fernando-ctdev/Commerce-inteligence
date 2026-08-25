export function productPathForCreatedProduct(id: string) {
  return `/products/${encodeURIComponent(id)}`;
}
