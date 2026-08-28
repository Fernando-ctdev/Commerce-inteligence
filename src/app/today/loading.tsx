import { ContentSkeleton } from "@/components/content-skeleton";
import { ProductShell } from "@/components/products/product-shell";

export default function TodayLoading() {
  return (
    <ProductShell active="home" eyebrow="Home" title="Home">
      <ContentSkeleton />
    </ProductShell>
  );
}
