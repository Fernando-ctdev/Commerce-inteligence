"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteProduct, getProduct, ProductApiError, ProductRecord } from "./product-api";
import { ProductForm } from "./product-form";
import styles from "./product-detail.module.css";

export function ProductDetail({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProduct(await getProduct(id));
    } catch (caught) {
      setError(caught instanceof ProductApiError ? caught.message : "Não foi possível carregar este Product agora.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading) {
      return <div aria-busy="true" className={styles.state} role="status"><h2>Carregando produto…</h2><p>O formulário será mantido no mesmo lugar quando os dados chegarem.</p></div>;
  }

  if (error || !product) {
    return (
      <div className={styles.state} role="alert">
        <h2>Não foi possível abrir este produto.</h2>
        <p>{error ?? "O produto não está disponível para este Workspace."}</p>
        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={() => void load()} type="button">Tentar novamente</button>
          <Link className={styles.secondaryLink} href="/products">Voltar para Produtos</Link>
        </div>
      </div>
    );
  }

  async function remove() {
    if (!product) return;
    const currentProduct = product;
    if (deleting || !window.confirm(`Excluir "${currentProduct.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(currentProduct.id);
      toast.success("Produto excluído.");
      router.push("/products");
    } catch (caught) {
      const message = caught instanceof ProductApiError ? caught.message : "Não foi possível excluir este produto agora.";
      setError(message);
      toast.error(message);
      setDeleting(false);
    }
  }

  return (
    <>
      {error && <p className={styles.deleteError} role="alert">{error}</p>}
      <section aria-labelledby="product-actions-title" className={styles.actionRegion}>
        <div>
          <p className={styles.eyebrow}>Produto</p>
          <h2 id="product-actions-title">{product.name}</h2>
          <p className={styles.actionContext}>Edite os fatos ou remova este produto do seu workspace.</p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryLink} href="#product-facts-title">Editar</Link>
          <button className={styles.deleteButton} disabled={deleting} onClick={() => void remove()} type="button">
            {deleting ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </section>
      <ProductForm mode="edit" onSaved={setProduct} product={product} />
    </>
  );
}
