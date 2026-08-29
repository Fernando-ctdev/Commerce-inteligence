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

/* O formulário é 100% estático (nenhum dado carrega): renderizar o
   formulário real elimina qualquer troca de layout no loading. */
export default function NewProductLoading() {
  return (
    <ProductShell eyebrow="Produtos" title="Adicionar produto">
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/products" />}>Produtos</BreadcrumbLink>
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
