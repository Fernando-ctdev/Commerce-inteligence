import { requireSession } from "@/modules/identity/application/require-session";

import { TodayEmpty } from "@/components/today/today-empty";
import { ProductShell } from "@/components/products/product-shell";

export default async function TodayPage() {
  const session = await requireSession();

  return (
    <ProductShell active="home" eyebrow="Home" title="Home" user={{ email: session.email }}>
      <TodayEmpty />
    </ProductShell>
  );
}
