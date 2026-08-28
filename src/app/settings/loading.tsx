import { ContentSkeleton } from "@/components/content-skeleton";
import { ProductShell } from "@/components/products/product-shell";

export default function SettingsLoading() {
  return (
    <ProductShell active="settings" eyebrow="Configurações" title="Sua conta">
      <ContentSkeleton />
    </ProductShell>
  );
}
