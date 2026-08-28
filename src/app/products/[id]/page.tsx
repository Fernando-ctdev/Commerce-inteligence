import { requireSession } from "@/modules/identity/application/require-session";

import { ProductDetail } from "@/components/products/product-detail";
import { ProductShell } from "@/components/products/product-shell";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductPage({ params }: ProductPageProps) {
  const session = await requireSession();
  const { id } = await params;
  return (
    <ProductShell eyebrow="Produto" title="Revisar fatos" user={{ email: session.email }}>
      <ProductDetail id={id} />
    </ProductShell>
  );
}
