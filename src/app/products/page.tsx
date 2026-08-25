import { requireSession } from "@/modules/identity/application/require-session";

import { ProductList } from "@/components/products/product-list";
import { ProductShell } from "@/components/products/product-shell";

export default async function ProductsPage() {
  await requireSession();
  return (
    <ProductShell title="Seus Products" action={null}>
      <ProductList />
    </ProductShell>
  );
}
