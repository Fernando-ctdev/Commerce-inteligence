import { ProductCreate } from "@/components/products/product-create";
import { ProductShell } from "@/components/products/product-shell";
import { requireSession } from "@/modules/identity/application/require-session";

export default async function TodayPage() {
  await requireSession();

  return <ProductShell active="home" eyebrow="Home" title="Home"><ProductCreate /></ProductShell>;
}
