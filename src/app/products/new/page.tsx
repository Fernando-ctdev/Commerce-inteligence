import { requireSession } from "@/modules/identity/application/require-session";

import { ProductCreate } from "@/components/products/product-create";
import { ProductShell } from "@/components/products/product-shell";

export default async function NewProductPage() {
  const session = await requireSession();

  return (
    <ProductShell
      active="products"
      eyebrow="Produtos"
      title="Adicionar produto"
      user={{ email: session.email }}
    >
      <ProductCreate />
    </ProductShell>
  );
}
