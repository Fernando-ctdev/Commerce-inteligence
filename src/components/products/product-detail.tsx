"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, CircleAlert, Package, Pencil, Save, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { SectionSwitcher, SectionSwitcherContent, SectionSwitcherList, SectionSwitcherTrigger } from "@/components/ui/section-switcher";

import {
  archiveProduct,
  deleteProduct,
  getProduct,
  ProductApiError,
  ProductRecord,
  reactivateProduct,
} from "./product-api";
import { loadProductHistory, type ProductHistoryResponse } from "./history-api";
import {
  ContentsView,
  GenerationActions,
  HistoryView,
  OperationalSummaryCard,
  StrategyView,
} from "./generation-views";
import { statusMessage } from "./generation-ui-model";
import { formatCommission, formatDiscount, formatPriceWithCurrency } from "./product-form-model";
import { ProductCreateForm } from "./product-create-form";
import { useGenerationJob } from "./use-generation-job";
import styles from "./product-detail.module.css";

type ProductTab = "overview" | "strategy" | "contents" | "history";

const hashToTab = (hash: string): ProductTab | null =>
  hash === "#generated-contents" ? "contents" : null;

/* Ciclo navegável do MVP: Conteúdos → Estratégia → Produto → Conteúdos.
   Histórico permanece no código, fora da navegação visível. */
const cycleTabs = ["contents", "strategy", "overview"] as const;
type CycleTab = (typeof cycleTabs)[number];

const tabLabels: Record<ProductTab, string> = {
  contents: "Conteúdos",
  strategy: "Estratégia",
  overview: "Produto",
  history: "Histórico",
};

function cycleNeighbours(tab: ProductTab): { prev: CycleTab; next: CycleTab } {
  const index = cycleTabs.indexOf(tab as CycleTab);
  const safe = index === -1 ? 0 : index;
  return {
    prev: cycleTabs[(safe + cycleTabs.length - 1) % cycleTabs.length],
    next: cycleTabs[(safe + 1) % cycleTabs.length],
  };
}

/* Vislumbre do produto: imagem + fatos essenciais. O form completo só
   aparece quando o usuário pede edição — a aba abre em modo leitura. */

function ProductSummaryPanel({ product }: { product: ProductRecord }) {
  const imageUrl = product.imageReferences[0];
  const commission = formatCommission(
    product.commissionType,
    product.commission,
    product.price,
    product.priceCurrency,
  );
  const discount = formatDiscount(
    product.discountType,
    product.discountValue,
    product.priceCurrency,
  );
  return (
    <section aria-labelledby="product-summary-title" className={styles.summaryPanel}>
      <div className={styles.sideCardHeading}>
        <Package aria-hidden="true" />
        <h2 id="product-summary-title">Resumo do produto</h2>
      </div>
      <div className={styles.summaryBody}>
        {imageUrl ? (
          <Image
            alt={`Imagem de ${product.name}`}
            className={styles.summaryImage}
            height={360}
            src={imageUrl}
            unoptimized
            width={640}
          />
        ) : (
          <div
            aria-label={`Produto ${product.name} sem imagem cadastrada`}
            className={styles.summaryImageFallback}
            role="img"
          >
            Sem imagem
          </div>
        )}
        <dl className={styles.summaryFacts}>
          <div className={styles.summaryFact}>
            <dt>Preço</dt>
            <dd>{formatPriceWithCurrency(product.price, product.priceCurrency)}</dd>
          </div>
          <div className={styles.summaryFact}>
            <dt>Categoria</dt>
            <dd>{product.category}</dd>
          </div>
          {commission && (
            <div className={styles.summaryFact}>
              <dt>Comissão</dt>
              <dd>{commission}</dd>
            </div>
          )}
          {discount && (
            <div className={styles.summaryFact}>
              <dt>Desconto</dt>
              <dd>{discount}</dd>
            </div>
          )}
          <div className={styles.summaryFact}>
            <dt>Descrição</dt>
            <dd className={styles.summaryDescription} tabIndex={0}>{product.description}</dd>
          </div>
        </dl>
      </div>
      {product.characteristics.length > 0 && (
        <dl className={styles.summaryFacts}>
          <div className={styles.summaryFact}>
            <dt>Características</dt>
            <dd>
              <ul className={styles.summaryList}>
                {product.characteristics.map((characteristic) => (
                  <li key={characteristic}>{characteristic}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      )}
      {product.url && (
        <dl className={styles.summaryFacts}>
          <div className={styles.summaryFact}>
            <dt>Link do produto</dt>
            <dd>
              <a
                className={styles.summaryLink}
                href={product.url}
                rel="noreferrer"
                target="_blank"
              >
                {product.url}
              </a>
            </dd>
          </div>
        </dl>
      )}
      {product.observations && (
        <dl className={styles.summaryFacts}>
          <div className={styles.summaryFact}>
            <dt>Observações para os conteúdos</dt>
            <dd className={styles.summaryDescription} tabIndex={0}>{product.observations}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

export function ProductDetail({
  id,
  initialEditing = false,
}: {
  id: string;
  initialEditing?: boolean;
}) {
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProductHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [tab, setTab] = useState<ProductTab>(() =>
    hashToTab(typeof window === "undefined" ? "" : window.location.hash) ??
      "contents",
  );
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [reactivateConfirmationOpen, setReactivateConfirmationOpen] =
    useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /* A aba abre em leitura (resumo); o form completo só entra sob edição explícita. */
  const [editing, setEditing] = useState(initialEditing);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function startEdit() {
    setEditing(true);
  }

  /* Volta ao resumo devolvendo o foco ao gatilho — o botão só existe de novo
     após o re-render, por isso o foco vai no próximo frame. */
  function stopEdit() {
    setEditing(false);
    void router.replace("/products/" + encodeURIComponent(id), {
      scroll: false,
    });
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProduct(await getProduct(id));
    } catch (caught) {
      setError(
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível carregar este Product agora.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let disposed = false;
    void loadProductHistory(id)
      .then((value) => {
        if (!disposed) setHistory(value);
      })
      .catch((caught: unknown) => {
        if (!disposed) setHistoryError(caught instanceof Error ? caught.message : "Não foi possível carregar o histórico agora.");
      })
      .finally(() => {
        if (!disposed) setHistoryLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [id]);

  // Deep-link do indicador global: /products/:id#generated-contents abre Conteúdos.
  useEffect(() => {
    const sync = () => {
      const fromHash = hashToTab(window.location.hash);
      if (fromHash) setTab(fromHash);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function changeTab(next: string) {
    const value = next as ProductTab;
    setTab(value);
    window.history.replaceState(
      null,
      "",
      value === "contents" ? "#generated-contents" : window.location.pathname,
    );
  }

  const cycle = cycleNeighbours(tab);

  const generation = useGenerationJob({
    productId: product?.active ? product.id : null,
    readiness: product?.readiness ?? "PENDING",
    onProjectionStale: () => void load(),
  });

  if (loading) {
    return (
      <div aria-busy="true" className={styles.state} role="status">
        <h2>Carregando produto…</h2>
        <p>
          O resumo do produto aparece aqui quando os dados chegarem.
        </p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className={styles.state} role="alert">
        <h2>Não foi possível abrir este produto.</h2>
        <p>{error ?? "O produto não está disponível para este Workspace."}</p>
        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={() => void load()}
            type="button"
          >
            Tentar novamente
          </button>
          <Link className={styles.secondaryLink} href="/products">
            Voltar para Produtos
          </Link>
        </div>
      </div>
    );
  }

  async function archive() {
    if (!product || archiving) return;
    setArchiving(true);
    setError(null);
    try {
      // ADR-016: a mutação confirma { id, version }; o estado (com a projeção recalculada
      // ou ArchivedProductView sem geraçãoAction) chega sempre pelo GET autenticado seguinte.
      await archiveProduct(product.id);
      setProduct(await getProduct(product.id));
      setArchiveConfirmationOpen(false);
    } catch (caught) {
      const message =
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível arquivar este produto agora.";
      setError(message);
      toast.error(message);
    } finally {
      setArchiving(false);
    }
  }

  async function reactivate() {
    if (!product || reactivating) return;
    setReactivating(true);
    setError(null);
    try {
      await reactivateProduct(product.id);
      setProduct(await getProduct(product.id));
      setReactivateConfirmationOpen(false);
      toast.success("Produto reativado.");
    } catch (caught) {
      const message =
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível reativar este produto agora.";
      setError(message);
      toast.error(message);
    } finally {
      setReactivating(false);
    }
  }

  async function remove() {
    if (!product || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(product.id);
      toast.success("Produto excluído.");
      router.push("/products");
    } catch (caught) {
      const message =
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível excluir este produto agora.";
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error && (
        <p className={styles.deleteError} role="alert">
          {error}
        </p>
      )}
      <section
        aria-labelledby="product-actions-title"
        className={styles.objectHeader}
      >
        <div className={styles.objectIdentity}>
          <p className={styles.eyebrow}>Produto</p>
          <h2 className={styles.objectTitle} id="product-actions-title">
            <Tag aria-hidden="true" className={styles.pageTitleIcon} />
            <span className={styles.objectTitleText}>{product.name}</span>
          </h2>
        </div>
      </section>
      <ConfirmationDialog
        confirmLabel="Arquivar produto"
        description={`O produto “${product.name}” será arquivado e deixará de aparecer entre os produtos ativos. Os dados serão preservados.`}
        error={error}
        onConfirm={archive}
        onOpenChange={setArchiveConfirmationOpen}
        open={archiveConfirmationOpen}
        pending={archiving}
        pendingLabel="Arquivando…"
        title="Arquivar produto?"
      />
      <ConfirmationDialog
        confirmLabel="Reativar produto"
        description={`O produto “${product.name}” voltará a aparecer entre os produtos ativos.`}
        error={error}
        onConfirm={reactivate}
        onOpenChange={setReactivateConfirmationOpen}
        open={reactivateConfirmationOpen}
        pending={reactivating}
        pendingLabel="Reativando…"
        title="Reativar produto?"
      />
      <ConfirmationDialog
        confirmLabel="Excluir produto"
        description={`O produto “${product.name}” será excluído permanentemente. Produtos com análises ou conteúdos não podem ser excluídos — nesses casos, use Arquivar.`}
        error={error}
        onConfirm={remove}
        onOpenChange={setDeleteConfirmationOpen}
        open={deleteConfirmationOpen}
        pending={deleting}
        pendingLabel="Excluindo…"
        title="Excluir produto?"
      />
      {product.active ? (
        <SectionSwitcher
          className={styles.tabs}
          onValueChange={changeTab}
          value={tab}
        >
          <div className={styles.tabsScroller}>
            <SectionSwitcherList className={styles.tabsList}>
              <SectionSwitcherTrigger value="contents">Conteúdos</SectionSwitcherTrigger>
              <SectionSwitcherTrigger value="strategy">Estratégia</SectionSwitcherTrigger>
              <SectionSwitcherTrigger value="overview">Produto</SectionSwitcherTrigger>
              <SectionSwitcherTrigger value="history">Histórico</SectionSwitcherTrigger>
            </SectionSwitcherList>
          </div>
          <nav aria-label="Navegar entre seções" className={styles.tabsMobile}>
            <button
              aria-label={`Seção anterior: ${tabLabels[cycle.prev]}`}
              className={styles.tabsMobileButton}
              onClick={() => changeTab(cycle.prev)}
              type="button"
            >
              {tabLabels[cycle.prev]}
            </button>
            <button
              aria-label={`Próxima seção: ${tabLabels[cycle.next]}`}
              className={styles.tabsMobileButton}
              onClick={() => changeTab(cycle.next)}
              type="button"
            >
              {tabLabels[cycle.next]}
            </button>
          </nav>
          <SectionSwitcherContent className={styles.overviewContent} value="overview">
            {generation.failed && generation.job && (
              <div className={styles.failureBanner} role="alert">
                <CircleAlert aria-hidden="true" />
                <p>{`${statusMessage(generation.job.status)} Você pode tentar novamente.`}</p>
              </div>
            )}
            <div className={styles.overviewLayout}>
              <div className={styles.editCard}>
                {editing ? (
                  <ProductCreateForm
                    mode="edit"
                    onAfterSave={stopEdit}
                    onSaved={setProduct}
                    product={product}
                  />
                ) : (
                  <ProductSummaryPanel product={product} />
                )}
              </div>
              <aside className={styles.sideRail}>
                <OperationalSummaryCard
                  className={styles.statusCard}
                  job={generation.job}
                  readiness={generation.readiness}
                />
                <section aria-labelledby="product-actions-card-title" className={styles.sideCard}>
                  <div className={styles.sideCardHeading}>
                    <Archive aria-hidden="true" />
                    <h2 id="product-actions-card-title">Ações</h2>
                  </div>
                  {editing && (
                    <Button className={styles.saveAction} form="product-edit-form" type="submit" variant="ghost">
                      <Save aria-hidden="true" />
                      Salvar apenas
                    </Button>
                  )}
                  {/* Alternância editar/cancelar no mesmo slot: o foco nunca
                      se perde e o rótulo comunica o próximo passo. */}
                  {editing ? (
                    <Button
                      className={styles.saveAction}
                      onClick={stopEdit}
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden="true" />
                      Cancelar alterações
                    </Button>
                  ) : (
                    <Button
                      className={styles.saveAction}
                      onClick={startEdit}
                      ref={editButtonRef}
                      type="button"
                      variant="ghost"
                    >
                      <Pencil aria-hidden="true" />
                      Editar produto
                    </Button>
                  )}
                  <Button
                    className={styles.archiveAction}
                    onClick={() => {
                      setError(null);
                      if (product.active) setArchiveConfirmationOpen(true);
                      else setReactivateConfirmationOpen(true);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {product.active ? <Archive aria-hidden="true" /> : <ArchiveRestore aria-hidden="true" />}
                    {product.active ? "Arquivar produto" : "Reativar produto"}
                  </Button>
                  <Button
                    className={styles.deleteAction}
                    onClick={() => {
                      setError(null);
                      setDeleteConfirmationOpen(true);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" />
                    Excluir produto
                  </Button>
                </section>
              </aside>
            </div>
          </SectionSwitcherContent>
          <SectionSwitcherContent className={styles.tabContent} value="contents">
            <GenerationActions
              generationAction={product.generationAction}
              onGenerateMissing={() => void generation.generateMissing()}
              readiness={generation.readiness}
              state={generation}
            />
            <ContentsView
              active={generation.active}
              job={generation.job}
            />
          </SectionSwitcherContent>
          <SectionSwitcherContent className={styles.tabContent} value="strategy">
            <StrategyView job={generation.job} onOpenContents={() => changeTab("contents")} />
          </SectionSwitcherContent>
          <SectionSwitcherContent className={styles.tabContent} value="history">
            <HistoryView error={historyError} history={history} loading={historyLoading} />
          </SectionSwitcherContent>
        </SectionSwitcher>
      ) : (
        <div className={styles.archivedLayout}>
          <ProductCreateForm
            mode="edit"
            onSaved={setProduct}
            product={product}
          />
          <section aria-labelledby="product-actions-card-title" className={styles.sideCard}>
            <div className={styles.sideCardHeading}>
              <ArchiveRestore aria-hidden="true" />
              <h2 id="product-actions-card-title">Produto arquivado</h2>
            </div>
            <p>Este produto não aparece entre os produtos ativos.</p>
          </section>
        </div>
      )}
    </>
  );
}
