import { requireSession } from "@/modules/identity/application/require-session";

import { ProductCreate } from "@/components/products/product-create";
import { ProductShell } from "@/components/products/product-shell";

export default async function NewProductPage() {
  await requireSession();
  return <ProductShell eyebrow="Novo Product" title="Adicionar produto"><ProductCreate /></ProductShell>;
}
