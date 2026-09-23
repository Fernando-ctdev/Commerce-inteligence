import { requireSession } from "@/modules/identity/application/require-session";

import { SettingsView } from "@/components/settings/settings-view";
import { ProductShell } from "@/components/products/product-shell";

export default async function SettingsPage() {
  const session = await requireSession();

  return (
    <ProductShell
      active="settings"
      title="Sua conta"
      user={{ email: session.email }}
    >
      <SettingsView email={session.email} />
    </ProductShell>
  );
}
