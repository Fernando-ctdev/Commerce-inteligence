"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getProduct, ProductApiError, ProductRecord } from "./product-api";
import { ProductForm } from "./product-form";
import styles from "./product-detail.module.css";

export function ProductDetail({ id }: { id: string }) {
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return <ProductForm mode="edit" onSaved={setProduct} product={product} />;
}
