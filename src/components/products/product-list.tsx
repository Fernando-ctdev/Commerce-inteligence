"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { listProducts, ProductApiError, ProductRecord } from "./product-api";
import styles from "./product-list.module.css";
import { productProgressLabel } from "./product-ui-model";

export function ProductList() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listProducts());
    } catch (caught) {
      setError(caught instanceof ProductApiError ? caught.message : "Não foi possível carregar seus Products agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <div aria-busy="true" className={styles.state} role="status">
        <p className={styles.eyebrow}>Produtos</p>
        <h2>Carregando seus Products…</h2>
        <p>A estrutura da lista permanece visível enquanto buscamos os dados.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.state} role="alert">
        <p className={styles.eyebrow}>Não foi possível carregar</p>
        <h2>Seus Products continuam protegidos.</h2>
        <p>{error}</p>
        <button className={styles.primaryButton} onClick={() => void load()} type="button">Tentar novamente</button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className={styles.state}>
        <p className={styles.eyebrow}>Primeiro passo</p>
        <h2>Adicione o produto que você quer vender.</h2>
        <p>Nome e descrição bastam para começar. Você pode completar o contexto depois.</p>
        <Link className={styles.primaryButton} href="/products/new">Adicionar produto</Link>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <div className={styles.listIntro}>
        <div>
          <p className={styles.eyebrow}>Seu catálogo de trabalho</p>
          <h2>Produtos ativos</h2>
        </div>
        <Link className={styles.primaryButton} href="/products/new">Adicionar produto</Link>
      </div>
      <ul aria-label="Products ativos" className={styles.cards}>
        {products.map((product) => (
          <li className={styles.card} key={product.id}>
            <div className={styles.cardBody}>
              <p className={styles.cardMeta}>{product.category || "Product"}</p>
              <h3>{product.name}</h3>
              <p>{product.description}</p>
              <span className={styles.status}>{productProgressLabel(product.readyForStrategy)}</span>
            </div>
            <Link className={styles.cardAction} href={`/products/${encodeURIComponent(product.id)}`}>
              Abrir Product
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
