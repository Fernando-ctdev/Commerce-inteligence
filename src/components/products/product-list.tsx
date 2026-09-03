"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionSwitcher, SectionSwitcherList, SectionSwitcherTrigger } from "@/components/ui/section-switcher";

import { listProducts, ProductApiError, ProductRecord } from "./product-api";
import styles from "./product-list.module.css";

export function ProductList() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "pending" | "archived">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listProducts());
    } catch (caught) {
      setError(
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível carregar seus produtos agora.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "active"
          ? product.active
          : filter === "pending"
            ? product.readiness !== "READY" && product.active
            : !product.active);
      const matchesQuery =
        !normalizedQuery ||
        `${product.name} ${product.category} ${product.description}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, products, query]);

  return (
    <div className={styles.list}>
      <div className={styles.listIntro}>
        <div>
          <h2>Produtos</h2>
          <p className={styles.listHint}>
            Encontre um produto e continue pelo próximo passo.
          </p>
        </div>
        <Link className={styles.primaryButton} href="/products/new">
          Adicionar produto
        </Link>
      </div>
      <div className={styles.controls} role="search">
        <label className={styles.searchLabel} htmlFor="product-search">
          Buscar produtos
        </label>
        <input
          className={styles.searchInput}
          id="product-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome, categoria ou descrição"
          type="search"
          value={query}
        />
        <SectionSwitcher
          aria-label="Filtrar produtos"
          onValueChange={(value) => setFilter(value as typeof filter)}
          value={filter}
        >
          <SectionSwitcherList className={styles.filters}>
            <SectionSwitcherTrigger value="all">Todos</SectionSwitcherTrigger>
            <SectionSwitcherTrigger value="active">Ativos</SectionSwitcherTrigger>
            <SectionSwitcherTrigger value="pending">Pendentes</SectionSwitcherTrigger>
            <SectionSwitcherTrigger value="archived">Arquivados</SectionSwitcherTrigger>
          </SectionSwitcherList>
        </SectionSwitcher>
      </div>
      {loading ? (
        <ul aria-hidden="true" className={styles.cards}>
          {Array.from({ length: 6 }, (_, index) => (
            <li className={styles.card} key={index}>
              <Skeleton className={styles.imageFallback} />
              <div className={styles.cardBody}>
                <Skeleton
                  className="rounded-md"
                  style={{ blockSize: 12, inlineSize: "40%" }}
                />
                <Skeleton
                  className="rounded-md"
                  style={{ blockSize: 20, inlineSize: "75%" }}
                />
                <Skeleton
                  className="rounded-md"
                  style={{ blockSize: 14, inlineSize: "60%" }}
                />
              </div>
              <Skeleton
                className={styles.cardAction}
                style={{ blockSize: 16, inlineSize: 96 }}
              />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className={styles.galleryEmpty} role="alert">
          <p>Não foi possível carregar seus produtos. {error}</p>
          <button
            className={styles.secondaryButton}
            onClick={() => void load()}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className={styles.galleryEmpty}>
          {products.length === 0 ? (
            <p>
              Nenhum produto por aqui ainda. Use Adicionar produto para começar
              seu catálogo.
            </p>
          ) : (
            <>
              <p>Nada encontrado para esta busca ou filtro.</p>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                type="button"
              >
                Limpar busca e filtros
              </button>
            </>
          )}
        </div>
      ) : (
        <ul aria-label="Produtos filtrados" className={styles.cards}>
          {filteredProducts.map((product) => {
            const firstImage = product.imageReferences[0];
            const imageUrl =
              firstImage &&
              /^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,)/i.test(
                firstImage,
              )
                ? firstImage
                : null;
            return (
              <li className={styles.card} key={product.id}>
                {imageUrl ? (
                  <Image
                    alt={`Imagem de ${product.name}`}
                    className={styles.cardImage}
                    height={180}
                    src={imageUrl}
                    unoptimized
                    width={320}
                  />
                ) : (
                  <div
                    aria-label={`Produto ${product.name} sem imagem cadastrada`}
                    className={styles.imageFallback}
                    role="img"
                  >
                    Sem imagem
                  </div>
                )}
                <div className={styles.cardBody}>
                  <div className={styles.cardTopline}>
                    <p className={styles.cardMeta}>
                      {product.category || "Produto"}
                    </p>
                    <span
                      className={
                        product.readiness === "ANALYZING"
                          ? styles.statusPending
                          : product.readiness === "READY"
                            ? styles.statusReady
                            : product.readiness === "FAILED"
                              ? styles.statusFailed
                              : product.active
                                ? styles.statusActive
                                : styles.statusArchived
                      }
                    >
                      {product.readiness === "ANALYZING"
                        ? "Analisando"
                        : product.readiness === "READY"
                          ? "Pronto"
                          : product.readiness === "FAILED"
                            ? "Falhou"
                            : product.active
                              ? "Pendente"
                              : "Arquivado"}
                    </span>
                  </div>
                  <h3>{product.name}</h3>
                </div>
                <Link
                  className={styles.cardAction}
                  href={`/products/${encodeURIComponent(product.id)}`}
                >
                  {product.active ? "Abrir produto" : "Consultar produto"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
