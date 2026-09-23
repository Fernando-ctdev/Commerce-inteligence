import { requireSession } from "@/modules/identity/application/require-session";

import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ProductCreateForm } from "@/components/products/product-create-form";
import { ProductShell } from "@/components/products/product-shell";

export default async function NewProductPage() {
  const session = await requireSession();
  return (
    <ProductShell title="Adicionar produto" user={{ email: session.email }}>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/products" />}>
              Vitrine
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Adicionar produto</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProductCreateForm />
    </ProductShell>
  );
}
