"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Ellipsis,
  FileText,
  Plus,
  Search,
  Sparkles,
  Tag,
  Video,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { phaseStates, stageMessage } from "./generation-ui-model";

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
  archiveProduct,
  deleteProduct,
  listProducts,
  ProductApiError,
  ProductRecord,
} from "./product-api";
import styles from "./product-list.module.css";

const filterOptions = [
  ["all", "Todos"],
  ["active", "Ativos"],
  ["pending", "Pendentes"],
  ["archived", "Arquivados"],
] as const;

type ProductFilter = (typeof filterOptions)[number][0];

function activityLabel(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? "hoje"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function ProductList() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [generations, setGenerations] = useState<Record<string, GenerationRecord | null>>({});
  const [actionProduct, setActionProduct] = useState<ProductRecord | null>(null);
  const [actionType, setActionType] = useState<"archive" | "delete" | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextProducts = await listProducts();
      setProducts(nextProducts);
      const entries = await Promise.all(
        nextProducts.map(async (product) => {
          try {
            return [product.id, await getCurrentGenerationForProduct(product.id)] as const;
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
  const filterCounts = useMemo(
    () => ({
      all: products.length,
      active: products.filter((product) => product.active).length,
      pending: products.filter(
        (product) => product.readiness !== "READY" && product.active,
      ).length,
      archived: products.filter((product) => !product.active).length,
    }),
    [products],
  );
  async function confirmAction() {
    if (!actionProduct || !actionType || actionPending) return;
    setActionPending(true);
    try {
      if (actionType === "archive") {
        await archiveProduct(actionProduct.id);
        toast.success("Produto arquivado.");
      } else {
        await deleteProduct(actionProduct.id);
        toast.success("Produto excluído.");
      }
      setActionProduct(null);
      setActionType(null);
      await load();
    } catch (caught) {
      const message =
        caught instanceof ProductApiError
          ? caught.message
          : actionType === "archive"
            ? "Não foi possível arquivar este produto agora."
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
            <Tag aria-hidden="true" className={styles.pageTitleIcon} />
            Produtos
          </h2>
          <p className={styles.listHint}>
            Gerencie os produtos que você promove e continue de onde parou.
          </p>
        </div>
        <Link className={styles.primaryButton} href="/products/new">
          <Plus aria-hidden="true" />
          Adicionar produto
        </Link>
      </div>
      <div className={styles.controls} role="search">
        <label className={styles.searchLabel} htmlFor="product-search">
          Buscar produtos
        </label>
        <div className={styles.searchField}>
          <Search aria-hidden="true" className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            id="product-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, categoria ou descrição"
            type="search"
            value={query}
          />
        </div>
        <div className={styles.filterScroller}>
          <ToggleGroup
            aria-label="Filtrar produtos"
            className={styles.filters}
            onValueChange={(value) => {
              const nextFilter = value[0] as ProductFilter | undefined;
              if (nextFilter) setFilter(nextFilter);
            }}
            value={[filter]}
          >
            {filterOptions.map(([value, label]) => (
              <Toggle
                className={styles.filter}
                key={value}
                value={value}
              >
                {label}
                <span className={styles.filterCount}>
                  {filterCounts[value]}
                </span>
              </Toggle>
            ))}
          </ToggleGroup>
        </div>
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
                style={{ blockSize: 44, inlineSize: "100%" }}
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
            const generation = generations[product.id];
            const analyzing = generation
              ? isActiveGeneration(generation.status)
              : product.readiness === "ANALYZING";
            const ready =
              generation?.status === "SUCCEEDED" ||
              (!generation && product.readiness === "READY");
            const failed =
              generation?.status === "FAILED" ||
              generation?.status === "CANCELLED" ||
              (!generation && product.readiness === "FAILED");
            const approved =
              generation?.contents.filter((content) => content.status === "APPROVED")
                .length ?? 0;
            const phases = generation
              ? phaseStates(generation.status, generation.stage)
              : [];
            const completedPhases = phases.filter((phase) => phase.state === "done").length;
            const progressPercent = phases.length
              ? Math.round((completedPhases / phases.length) * 100)
              : 0;
            const currentStage = generation?.stage
              ? stageMessage(generation.stage)
              : "Preparando a análise...";
            const activity = activityLabel(generation?.finishedAt);
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
                          onClick={() => {
                            setActionProduct(product);
                            setActionType("archive");
                          }}
                        >
                          Arquivar produto
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          render={<Link href={`/products/${encodeURIComponent(product.id)}`} />}
                        >
                          Editar produto
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setActionProduct(product);
                            setActionType("delete");
                          }}
                          variant="destructive"
                        >
                          Excluir produto
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {analyzing ? (
                    <div className={styles.cardProgress} aria-label={`Progresso da análise: ${currentStage}`}>
                      <div className={styles.cardProgressHeader}>
                        <span>{currentStage}</span>
                        <strong>{progressPercent}%</strong>
                      </div>
                      <div
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={progressPercent}
                        className={styles.cardProgressTrack}
                        role="progressbar"
                      >
                        <span style={{ width: `${progressPercent}%` }} />
                      </div>
                    </div>
                  ) : failed ? (
                    <p className={styles.cardError}>
                      <AlertTriangle aria-hidden="true" />
                      Não foi possível concluir a análise.
                    </p>
                  ) : ready && generation ? (
                    <>
                      <div aria-label="Resumo operacional" className={styles.cardMetrics}>
                        <span><FileText aria-hidden="true" /><strong>{generation.contents.length}</strong> conteúdos</span>
                        <span><CheckCircle2 aria-hidden="true" /><strong>{approved}</strong> aprovados</span>
                        <span><Video aria-hidden="true" /><strong>4</strong> gravados</span>
                      </div>
                      {activity && (
                        <p className={styles.cardActivity}>
                          <Clock3 aria-hidden="true" />
                          Última atividade: {activity}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className={styles.cardStatus}>
                      <FileText aria-hidden="true" />
                      0 conteúdos gerados
                    </p>
                  )}
                </div>
                <Link
                  className={`${styles.cardAction} ${failed ? styles.cardActionSecondary : ""}`}
                  href={`/products/${encodeURIComponent(product.id)}`}
                >
                  {analyzing ? "Acompanhar análise" : failed ? "Tentar novamente" : ready ? "Revisar conteúdos" : "Abrir produto"}
                  {!failed && <ArrowRight aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {actionProduct && actionType && (
        <ConfirmationDialog
          confirmLabel={actionType === "archive" ? "Arquivar produto" : "Excluir produto"}
          description={
            actionType === "archive"
              ? `O produto “${actionProduct.name}” será arquivado e deixará de aparecer entre os produtos ativos. Os dados serão preservados.`
              : `O produto “${actionProduct.name}” será excluído permanentemente.`
          }
          error={error}
          onConfirm={confirmAction}
          onOpenChange={(open) => {
            if (!open && !actionPending) {
              setActionProduct(null);
              setActionType(null);
            }
          }}
          open
          pending={actionPending}
          pendingLabel={actionType === "archive" ? "Arquivando…" : "Excluindo…"}
          title={actionType === "archive" ? "Arquivar produto?" : "Excluir produto?"}
          destructive={actionType === "delete"}
        />
      )}
    </div>
  );
}
