"use client";

import { useRouter } from "next/navigation";

import { productPathForCreatedProduct } from "./product-create-model";
import { ProductForm } from "./product-form";

export function ProductCreate() {
  const router = useRouter();
  return (
    <ProductForm
      mode="create"
      onCreated={(id) => router.push(productPathForCreatedProduct(id))}
    />
  );
}
