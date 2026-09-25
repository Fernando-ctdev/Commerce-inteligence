import { requireSession } from "@/modules/identity/application/require-session";

import { TodayEmpty } from "@/components/today/today-empty";
import { ProductShell } from "@/components/products/shared/product-shell";

export default async function TodayPage() {
  const session = await requireSession();

  return (
    <ProductShell
      active="home"
      title="Bem vindo!"
      user={{ email: session.email }}
    >
      <TodayEmpty />
    </ProductShell>
  );
}
