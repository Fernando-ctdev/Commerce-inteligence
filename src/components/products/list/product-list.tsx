"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ellipsis,
  FileText,
  RefreshCw,
  Search,
  Store,
  Video,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { stageMessage } from "../generation/generation-ui-model";
import {
  ProductCreateOverlay,
  ProductCreateTrigger,
} from "../create/product-create-overlay";
import showcaseStyles from "../shared/showcase.module.css";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import {
  getCurrentGenerationForProduct,
  isActiveGeneration,
  type GenerationRecord,
} from "../generation/generation-api";
import {
  deleteProduct,
  listProducts,
  ProductApiError,
  ProductRecord,
  syncProducts,
} from "../shared/product-api";
import { formatPriceWithCurrency } from "../shared/product-form-model";
import styles from "./product-list.module.css";

export function ProductList() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [generations, setGenerations] = useState<
    Record<string, GenerationRecord | null>
  >({});
  const [actionProduct, setActionProduct] = useState<ProductRecord | null>(
    null,
  );
  const [actionPending, setActionPending] = useState(false);
  /* Sincronização da Vitrine: somente o botão Atualizar dispara
     POST /api/products/sync; a lista exibida vem sempre do GET autenticado
     seguinte. Falha de sync não impede a lista persistida. */
  const [syncing, setSyncing] = useState(false);
  /* Edição no drawer da Vitrine: o menu do card carrega o Product no overlay
     existente (ProductCreateForm mode="edit"); salvar atualiza a lista. */
  const [editProduct, setEditProduct] = useState<ProductRecord | null>(null);

  const refresh = useCallback(async (withSync: boolean) => {
    if (withSync) setSyncing(true);
    setLoading(true);
    setError(null);
    if (withSync) {
      try {
        await syncProducts();
      } catch {
        toast.error(
          "Não foi possível sincronizar a vitrine do TikTok Shop agora.",
        );
      }
    }
    try {
      const nextProducts = await listProducts();
      setProducts(nextProducts);
      const entries = await Promise.all(
        nextProducts.map(async (product) => {
          try {
            return [
              product.id,
              await getCurrentGenerationForProduct(product.id),
            ] as const;
          } catch {
            return [product.id, null] as const;
          }
        }),
      );
      setGenerations(Object.fromEntries(entries));
    } catch (caught) {
      setError(
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível carregar seus produtos agora.",
      );
    } finally {
      setLoading(false);
      if (withSync) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    /* Montar /products apenas lista os Products persistidos; sync só no botão. */
    const timer = window.setTimeout(() => void refresh(false), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  /* Sem abas/filtros (regra do usuário): a lista reúne tudo — produtos
     cadastrados + itens da Vitrine — e o usuário decide o que fazer.
     Busca textual somente por nome ou categoria. */
  const normalizedQuery = useMemo(
    () => query.trim().toLocaleLowerCase("pt-BR"),
    [query],
  );
  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const matchesQuery =
          !normalizedQuery ||
          `${product.name} ${product.category}`
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedQuery);
        return matchesQuery;
      }),
    [products, normalizedQuery],
  );
  const totalVisible = filteredProducts.length;

  async function confirmAction() {
    if (!actionProduct || actionPending) return;
    setActionPending(true);
    try {
      await deleteProduct(actionProduct.id);
      toast.success("Produto excluído.");
      setActionProduct(null);
      await refresh(false);
    } catch (caught) {
      const message =
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível excluir este produto agora.";
      setError(message);
      toast.error(message);
    } finally {
      setActionPending(false);
    }
  }

  return (
    <div className={styles.list}>
      <div className={styles.listIntro}>
        <div>
          <h2 className={styles.pageTitle}>
            <Store aria-hidden="true" className={styles.pageTitleIcon} />
            Produtos da sua vitrine
          </h2>
          <p className={styles.listHint}>
            Os produtos da sua vitrine do TikTok Shop
          </p>
        </div>
      </div>
      <div className={styles.controls}>
        <ProductCreateTrigger className={styles.primaryButton} />
        <div className={styles.searchGroup} role="search">
          <label className={styles.searchLabel} htmlFor="product-search">
            Buscar produtos
          </label>
          <div className={styles.searchField}>
            <Search aria-hidden="true" className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              id="product-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome ou categoria"
              type="search"
              value={query}
            />
          </div>
        </div>
      </div>
      <div className={styles.filterSummary}>
        <p aria-live="polite">
          {loading
            ? "Carregando produtos…"
            : `${totalVisible} ${
                totalVisible === 1 ? "item disponível" : "itens disponíveis"
              }`}
        </p>
        <button
          aria-busy={syncing}
          aria-label={syncing ? "Atualizando vitrine…" : "Atualizar vitrine do TikTok Shop"}
          className={styles.syncButton}
          disabled={syncing}
          onClick={() => void refresh(true)}
          title={syncing ? "Atualizando vitrine…" : "Atualizar vitrine do TikTok Shop"}
          type="button"
        >
          <RefreshCw
            aria-hidden="true"
            className={syncing ? `${styles.syncIcon} ${styles.syncIconSpinning}` : styles.syncIcon}
          />
        </button>
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
              <Skeleton className={styles.cardLoadingAction} />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className={styles.galleryEmpty} role="alert">
          <p>Não foi possível carregar seus produtos. {error}</p>
          <button
            className={styles.secondaryButton}
            onClick={() => void refresh(false)}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      ) : totalVisible === 0 ? (
        <div className={styles.galleryEmpty}>
          {products.length === 0 ? (
            <>
              <p>
                Nada disponível na vitrine agora. Use Adicionar produto para
                cadastrar manualmente.
              </p>
              <ProductCreateTrigger
                className={`${styles.secondaryButton} ${showcaseStyles.link}`}
              />
            </>
          ) : (
            <>
              <p>Nada encontrado para esta busca.</p>
              <button
                className={styles.secondaryButton}
                onClick={() => setQuery("")}
                type="button"
              >
                Limpar busca
              </button>
            </>
          )}
        </div>
      ) : (
        <ul aria-label="Itens disponíveis na vitrine" className={styles.cards}>
          {products.map((product) => {
            const firstImage = product.imageReferences[0];
            const imageUrl =
              firstImage &&
              /^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,)/i.test(
                firstImage,
              )
                ? firstImage
                : null;
            const generation = generations[product.id];
            const analyzing = generation
              ? isActiveGeneration(generation.status)
              : product.readiness === "ANALYZING";
            const projectionDegraded =
              generation?.code === "GEN-PROJECTION" &&
              (generation.status === "SUCCEEDED" ||
                generation.status === "SUCCEEDED_PARTIAL");
            const ready =
              !projectionDegraded &&
              (generation?.status === "SUCCEEDED" ||
                generation?.status === "SUCCEEDED_PARTIAL" ||
                (!generation && product.readiness === "READY"));
            const failed =
              !projectionDegraded &&
              (generation?.status === "FAILED" ||
                generation?.status === "CANCELLED" ||
                (!generation && product.readiness === "FAILED"));
            const currentStage = generation?.stage
              ? stageMessage(generation.stage)
              : "Preparando a análise...";
            const priceText = formatPriceWithCurrency(
              product.price,
              product.priceCurrency,
            );
            const commissionText = product.commission
              ? product.commissionRate !== undefined &&
                product.commissionRate > 0
                ? `${product.commission} (${(product.commissionRate / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`
                : product.commission
              : null;
            const cardLabels = product.labels ?? [];
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
                  <div className={styles.cardHeader}>
                    {/* Origem pelo contrato do Product; sem palpite por URL. */}
                    <span className={showcaseStyles.badge}>
                      {product.origin === "showcase"
                        ? "TikTok Shop"
                        : "Manual"}
                    </span>
                    <h3>{product.name}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Mais ações para ${product.name}`}
                        className={styles.cardMenuTrigger}
                      >
                        <Ellipsis aria-hidden="true" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditProduct(product)}
                        >
                          Editar produto
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setActionProduct(product)}
                          variant="destructive"
                        >
                          Excluir produto
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {/* Fatos de apresentação "como antes" no card da Vitrine:
                      Preço sempre que existir; Comissão (com percentual),
                      Estoque e labels só quando o backend os projetar.
                      Produtos manuais mostram apenas os fatos disponíveis. */}
                  <dl className={showcaseStyles.facts}>
                    <div>
                      <dt>Preço</dt>
                      <dd
                        className={
                          priceText ? undefined : showcaseStyles.missing
                        }
                      >
                        {priceText ?? "Não informado"}
                      </dd>
                    </div>
                    {commissionText && (
                      <div>
                        <dt>Comissão</dt>
                        <dd>{commissionText}</dd>
                      </div>
                    )}
                    {product.stockCount !== undefined && (
                      <div>
                        <dt>Estoque</dt>
                        <dd>{product.stockCount}</dd>
                      </div>
                    )}
                  </dl>
                  {cardLabels.length > 0 && (
                    <div className={showcaseStyles.labels}>
                      {cardLabels.map((text) => (
                        <span className={showcaseStyles.badge} key={text}>
                          {text}
                        </span>
                      ))}
                    </div>
                  )}
                  {analyzing ? (
                    <div
                      className={styles.cardProgress}
                      aria-label={`Progresso da análise: ${currentStage}`}
                    >
                      <div className={styles.cardProgressHeader}>
                        <span>{currentStage}</span>
                      </div>
                    </div>
                  ) : projectionDegraded ? (
                    <p className={styles.cardError}>
                      <AlertTriangle aria-hidden="true" />
                      Resultado da análise indisponível.
                    </p>
                  ) : failed ? (
                    <p className={styles.cardError}>
                      <AlertTriangle aria-hidden="true" />
                      Não foi possível concluir a análise.
                    </p>
                  ) : ready && generation ? (
                    <div
                      aria-label="Resumo operacional"
                      className={styles.cardMetrics}
                    >
                      <span>
                        <FileText aria-hidden="true" />
                        <strong>{generation.contents.length}</strong> conteúdos
                      </span>
                      <span>
                        <Video aria-hidden="true" />
                        <strong>4</strong> gravados
                      </span>
                    </div>
                  ) : (
                    <p className={styles.cardStatus}>
                      <FileText aria-hidden="true" />0 conteúdos gerados
                    </p>
                  )}
                </div>
                <Link
                  aria-label={`Abrir produto ${product.name}`}
                  className={styles.cardAction}
                  href={`/products/${encodeURIComponent(product.id)}`}
                />
              </li>
            );
          })}
        </ul>
      )}
      {/* Editar produto (menu do card): o overlay em mode="edit";
          salvar permanece no caso de uso existente e recarrega a lista. */}
      <ProductCreateOverlay
        onSaved={() => void refresh(false)}
        onOpenChange={(open) => {
          if (!open) setEditProduct(null);
        }}
        open={editProduct !== null}
        product={editProduct ?? undefined}
      />
      {actionProduct && (
        <ConfirmationDialog
          confirmLabel="Excluir produto"
          description={`O produto “${actionProduct.name}” será excluído permanentemente.`}
          error={error}
          onConfirm={confirmAction}
          onOpenChange={(open) => {
            if (!open && !actionPending) {
              setActionProduct(null);
            }
          }}
          open
          pending={actionPending}
          pendingLabel="Excluindo…"
          title="Excluir produto?"
          destructive
        />
      )}
    </div>
  );
}
