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
  searchParams: Promise<{ edit?: string }>;
};

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const session = await requireSession();
  const { id } = await params;
  const { edit } = await searchParams;

  const product = await getTenantProduct(session.tenantId, id);
  const archived = product?.lifecycle === "ARCHIVED";
  return (
    <ProductShell
      title={archived ? "Produto arquivado" : "Revisar produto"}
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
              {archived ? "Produto arquivado" : "Revisar produto"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ProductDetail
        key={`${id}-${edit === "1" ? "edit" : "view"}`}
        id={id}
        initialEditing={edit === "1"}
      />
    </ProductShell>
  );
}
