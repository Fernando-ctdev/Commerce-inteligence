import { requireSession } from "@/modules/identity/application/require-session";
import { MyStyleExperience } from "@/components/settings/my-style-experience";
import { ProductShell } from "@/components/products/shared/product-shell";

// Página dedicada Meu estilo (SPEC slice-011): acessada pelo botão da sidebar.
export default async function MyStylePage() {
  const session = await requireSession();

  return (
    <ProductShell
      active="meu-estilo"
      title="Meu estilo"
      user={{ email: session.email }}
    >
      <MyStyleExperience />
    </ProductShell>
  );
}
