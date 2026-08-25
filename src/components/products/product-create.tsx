"use client";

import { useRouter } from "next/navigation";

import { ProductForm } from "./product-form";
import { productPathForCreatedProduct } from "./product-create-model";

export function ProductCreate() {
  const router = useRouter();
  return <ProductForm mode="create" onCreated={(id) => router.push(productPathForCreatedProduct(id))} />;
}
