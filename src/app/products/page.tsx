import { requireSession } from "@/modules/identity/application/require-session";

import { ProductList } from "@/components/products/product-list";
import { ProductShell } from "@/components/products/product-shell";

export default async function ProductsPage() {
  const session = await requireSession();
  return (
    <ProductShell title="Vitrine" action={null} user={{ email: session.email }}>
      <ProductList />
    </ProductShell>
  );
}
