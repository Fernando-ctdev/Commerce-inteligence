import { ContentSkeleton } from "@/components/content-skeleton";
import { ProductShell } from "@/components/products/product-shell";

export default function NewProductLoading() {
  return (
    <ProductShell active="products" eyebrow="Produtos" title="Adicionar produto">
      <ContentSkeleton />
    </ProductShell>
  );
}
