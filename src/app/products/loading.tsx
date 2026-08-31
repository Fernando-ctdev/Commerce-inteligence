import { ProductShell } from "@/components/products/product-shell";
import { Skeleton } from "@/components/ui/skeleton";
import listStyles from "@/components/products/product-list.module.css";

/* Toolbar (título, busca, filtros, botão) é estática: render real.
   Skeleton apenas nos cards, que são conteúdo dinâmico. */
export default function ProductsLoading() {
  return (
    <ProductShell active="products" action={null} title="Seus produtos">
      <div className={listStyles.list}>
        <div className={listStyles.listIntro}>
          <div>
            <h2>Produtos</h2>
            <p className={listStyles.listHint}>
              Encontre um produto e continue pelo próximo passo.
            </p>
          </div>
          <span
            aria-hidden="true"
            className={listStyles.primaryButton}
            style={{ pointerEvents: "none" }}
          >
            Adicionar produto
          </span>
        </div>
        <div className={listStyles.controls} role="search">
          <label className={listStyles.searchLabel} htmlFor="product-search">
            Buscar produtos
          </label>
          <input
            className={listStyles.searchInput}
            disabled
            id="product-search"
            placeholder="Nome, categoria ou descrição"
            type="search"
          />
          <div
            aria-label="Filtrar produtos"
            className={listStyles.filters}
            role="group"
          >
            {(
              [
                ["all", "Todos"],
                ["active", "Ativos"],
                ["archived", "Arquivados"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={value === "all"}
                className={listStyles.filterButton}
                disabled
                key={value}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ul aria-hidden="true" className={listStyles.cards}>
          {Array.from({ length: 6 }, (_, index) => (
            <li className={listStyles.card} key={index}>
              <Skeleton className={listStyles.imageFallback} />
              <div className={listStyles.cardBody}>
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
                className={listStyles.cardAction}
                style={{ blockSize: 16, inlineSize: 96 }}
              />
            </li>
          ))}
        </ul>
      </div>
    </ProductShell>
  );
}
