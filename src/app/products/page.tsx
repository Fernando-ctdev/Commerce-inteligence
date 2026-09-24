import { requireSession } from "@/modules/identity/application/require-session";

import { ProductList } from "@/components/products/list/product-list";
import { ProductShell } from "@/components/products/shared/product-shell";

export default async function ProductsPage() {
  const session = await requireSession();
  return (
    <ProductShell title="Vitrine" action={null} user={{ email: session.email }}>
      <ProductList />
    </ProductShell>
  );
}
