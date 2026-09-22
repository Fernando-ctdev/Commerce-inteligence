import Link from "next/link";
import { requireSession } from "@/modules/identity/application/require-session";
import { getTenantProduct } from "@/modules/products/service";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ProductDetail } from "@/components/products/product-detail";
import { ProductShell } from "@/components/products/product-shell";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductPage({
  params,
}: ProductPageProps) {
  const session = await requireSession();
  const { id } = await params;

  const product = await getTenantProduct(session.tenantId, id);
  const archived = product?.lifecycle === "ARCHIVED";
  return (
    <ProductShell
      title={archived ? "Produto arquivado" : "Vitrine"}
      user={{ email: session.email }}
    >
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/products" />}>
              Vitrine
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {archived ? "Produto arquivado" : "Produto"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProductDetail id={id} />
    </ProductShell>
  );
}
