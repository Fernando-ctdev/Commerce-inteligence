import { ContentSkeleton } from "@/components/content-skeleton";
import { ProductShell } from "@/components/products/product-shell";

export default function ProductsLoading() {
  return (
    <ProductShell active="products" eyebrow="Produtos" title="Seus produtos">
      <ContentSkeleton />
    </ProductShell>
  );
}
