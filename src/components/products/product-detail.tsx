"use client";

import Link from "next/link";
import { Archive, ArchiveRestore } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { SectionSwitcher, SectionSwitcherContent, SectionSwitcherList, SectionSwitcherTrigger } from "@/components/ui/section-switcher";

import {
  archiveProduct,
  getProduct,
  ProductApiError,
  ProductRecord,
  reactivateProduct,
} from "./product-api";
import {
  ContentsView,
  GenerationStatusCard,
  HistoryView,
  StrategyView,
} from "./generation-views";
import { ProductCreateForm } from "./product-create-form";
import { useGenerationJob } from "./use-generation-job";
import styles from "./product-detail.module.css";

type ProductTab = "overview" | "strategy" | "contents" | "history";

const hashToTab = (hash: string): ProductTab | null =>
  hash === "#generated-contents" ? "contents" : null;

export function ProductDetail({ id }: { id: string }) {
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [tab, setTab] = useState<ProductTab>(() =>
    hashToTab(typeof window === "undefined" ? "" : window.location.hash) ??
      "overview",
  );
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [reactivateConfirmationOpen, setReactivateConfirmationOpen] =
    useState(false);

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
          O formulário será mantido no mesmo lugar quando os dados chegarem.
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
        {product.imageReferences[0] &&
        /^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,)/i.test(
          product.imageReferences[0],
        ) ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt={`Imagem de ${product.name}`}
            className={styles.objectImage}
            src={product.imageReferences[0]}
          />
        ) : null}
        <div className={styles.objectIdentity}>
          <p className={styles.eyebrow}>Produto</p>
          <h2 id="product-actions-title">{product.name}</h2>
          <p className={styles.objectFacts}>
            {[
              product.category,
              product.price
                ? `${product.price} ${product.priceCurrency}`.trim()
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <span
            aria-label={`Estado: ${product.readiness === "ANALYZING" ? "Analisando" : product.readiness === "READY" ? "Pronto" : product.readiness === "FAILED" ? "Falhou" : "Pendente"}`}
            className={styles.objectStatus}
            data-readiness={product.readiness}
            role="status"
          >
            <span aria-hidden="true" className={styles.statusDot} />
            {product.readiness === "ANALYZING"
              ? "Analisando"
              : product.readiness === "READY"
                ? "Pronto"
                : product.readiness === "FAILED"
                  ? "Falhou"
                  : "Pendente"}
          </span>
        </div>
        <div className={styles.actionActions}>
          <Button
            aria-label={product.active ? "Arquivar produto" : "Reativar produto"}
            onClick={() => {
              setError(null);
              if (product.active) setArchiveConfirmationOpen(true);
              else setReactivateConfirmationOpen(true);
            }}
            size="icon"
            title={product.active ? "Arquivar produto" : "Reativar produto"}
            variant="outline"
          >
            {product.active ? (
              <Archive aria-hidden="true" />
            ) : (
              <ArchiveRestore aria-hidden="true" />
            )}
          </Button>
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
      {product.active ? (
        <SectionSwitcher
          className={styles.tabs}
          onValueChange={changeTab}
          value={tab}
        >
          <SectionSwitcherList className={styles.tabsList}>
            <SectionSwitcherTrigger value="overview">Visão geral</SectionSwitcherTrigger>
            <SectionSwitcherTrigger value="strategy">Estratégia</SectionSwitcherTrigger>
            <SectionSwitcherTrigger value="contents">Conteúdos</SectionSwitcherTrigger>
            <SectionSwitcherTrigger value="history">Histórico</SectionSwitcherTrigger>
          </SectionSwitcherList>
          <SectionSwitcherContent className={styles.overviewContent} value="overview">
            <GenerationStatusCard
              className={styles.nextActionCard}
              generationAction={product.generationAction}
              onOpenContents={() => changeTab("contents")}
              productName={product.name}
              readiness={generation.readiness}
              state={generation}
              targetContentCount={product.targetContentCount}
            />
            <div className={styles.editSection}>
              <ProductCreateForm
                mode="edit"
                onSaved={setProduct}
                product={product}
              />
            </div>
          </SectionSwitcherContent>
          <SectionSwitcherContent value="strategy">
            <StrategyView job={generation.job} />
          </SectionSwitcherContent>
          <SectionSwitcherContent value="contents">
            <ContentsView
              active={generation.active}
              job={generation.job}
            />
          </SectionSwitcherContent>
          <SectionSwitcherContent value="history">
            <HistoryView job={generation.job} />
          </SectionSwitcherContent>
        </SectionSwitcher>
      ) : (
        <ProductCreateForm
          mode="edit"
          onSaved={setProduct}
          product={product}
        />
      )}
    </>
  );
}
