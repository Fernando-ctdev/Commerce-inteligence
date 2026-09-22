import { Plus } from "lucide-react";
import { ProductShell } from "@/components/products/product-shell";
import { Skeleton } from "@/components/ui/skeleton";
import listStyles from "@/components/products/product-list.module.css";

/* Toolbar e header são estáticos (render real); skeleton apenas no grid
   combinado da Vitrine (showcase + produtos manuais), que é dinâmico. */
export default function ProductsLoading() {
  return (
    <ProductShell active="products" action={null} title="Vitrine">
      <div className={listStyles.list}>
        <div className={listStyles.listIntro}>
          <div>
            <h2 className={listStyles.pageTitle}>Produtos da sua vitrine</h2>
            <p className={listStyles.listHint}>
              Os produtos da sua vitrine estão sendo carregados...
            </p>
          </div>
          <span
            aria-hidden="true"
            className={listStyles.primaryButton}
            style={{ pointerEvents: "none" }}
          >
            <Plus aria-hidden="true" />
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
            className={listStyles.filterNav}
            role="group"
          >
            {(
              [
                ["active", "Ativos"],
                ["pending", "Pendentes"],
                ["archived", "Arquivados"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={value === "active"}
                className={listStyles.filterTab}
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
                style={{ blockSize: 44, inlineSize: "100%" }}
              />
            </li>
          ))}
        </ul>
      </div>
    </ProductShell>
  );
}
