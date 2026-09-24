export function productPathForCreatedProduct(id: string) {
  return `/products/${encodeURIComponent(id)}`;
}

export function createIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
