"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ellipsis,
  FileText,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Video,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { stageMessage } from "./generation-ui-model";
import {
  ProductCreateOverlay,
  ProductCreateTrigger,
} from "./product-create-overlay";
import {
  listShowcaseItems,
  type ShowcaseItem,
} from "@/modules/products/showcase";
import { ShowcaseCard, showcaseToDraft } from "./showcase";
import showcaseStyles from "./showcase.module.css";

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
} from "./generation-api";
import {
  deleteProduct,
  listProducts,
  ProductApiError,
  ProductRecord,
} from "./product-api";
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
  /* Sincronização da Vitrine (TikHub) ainda sem serviço: apenas o estado
     de carregamento simulado (3s) foi aprovado. Nenhuma chamada de rede. */
  const [syncing, setSyncing] = useState(false);
  const syncTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(syncTimerRef.current), []);
  /* Itens remotos de apresentação (DTO allowlist, fonte síncrona): nunca
     persistem no Product; salvar segue o caso de uso manual existente. */
  const [showcaseItems] = useState(() => listShowcaseItems());
  const [prefill, setPrefill] = useState<ShowcaseItem | null>(null);
  /* Edição no drawer da Vitrine: o menu do card carrega o Product no overlay
     existente (ProductCreateForm mode="edit"); salvar atualiza a lista. */
  const [editProduct, setEditProduct] = useState<ProductRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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
  const visibleShowcase = useMemo(
    () =>
      showcaseItems.filter((item) => {
        const hay = `${item.title} ${item.categoryName ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery);
        return !normalizedQuery || hay;
      }),
    [showcaseItems, normalizedQuery],
  );
  const totalVisible = visibleShowcase.length + filteredProducts.length;

  function startSync() {
    if (syncing) return;
    setSyncing(true);
    syncTimerRef.current = window.setTimeout(() => setSyncing(false), 3000);
  }
  async function confirmAction() {
    if (!actionProduct || actionPending) return;
    setActionPending(true);
    try {
      await deleteProduct(actionProduct.id);
      toast.success("Produto excluído.");
      setActionProduct(null);
      await load();
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
        {/* Serviço de sincronização (TikHub) ainda não implementado: o clique
            mantém apenas o carregamento simulado aprovado (3s). */}
        <button
          aria-busy={syncing}
          aria-label={syncing ? "Atualizando vitrine…" : "Atualizar vitrine do TikTok Shop"}
          className={styles.syncButton}
          disabled={syncing}
          onClick={startSync}
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
            onClick={() => void load()}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      ) : totalVisible === 0 ? (
        <div className={styles.galleryEmpty}>
          {products.length === 0 && showcaseItems.length === 0 ? (
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
          {showcaseItems.map((item) => (
            <ShowcaseCard
              item={item}
              key={item.id}
              onUse={() => setPrefill(item)}
            />
          ))}
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
                    <span className={showcaseStyles.badge}>Manual</span>
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
      {/* Usar produto (showcase): overlay com prefill seguro; salvar segue o
          POST manual e navega ao produto, onde Analisar produto fica explícito. */}
      <ProductCreateOverlay
        initialDraft={prefill ? showcaseToDraft(prefill) : undefined}
        navigateAfterSave
        onOpenChange={(open) => {
          if (!open) setPrefill(null);
        }}
        open={prefill !== null}
      />
      {/* Editar produto (menu do card): o mesmo overlay em mode="edit";
          salvar permanece no caso de uso existente e recarrega a lista. */}
      <ProductCreateOverlay
        onSaved={() => void load()}
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
