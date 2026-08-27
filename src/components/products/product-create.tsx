"use client";

import { useRouter } from "next/navigation";

import { ProductImport } from "./product-import";
import { productPathForCreatedProduct } from "./product-create-model";

export function ProductCreate() {
  const router = useRouter();
  return <ProductImport onCreated={(id) => router.push(productPathForCreatedProduct(id))} />;
}
