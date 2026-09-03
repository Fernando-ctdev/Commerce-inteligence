"use client";

import Link from "next/link";
import { Archive, ArchiveRestore } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import {
  archiveProduct,
  getProduct,
  ProductApiError,
  ProductRecord,
  reactivateProduct,
} from "./product-api";
import { GenerationPanel } from "./generation-panel";
import { ProductCreateForm } from "./product-create-form";
import styles from "./product-detail.module.css";

export function ProductDetail({ id }: { id: string }) {
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [reactivating, setReactivating] = useState(false);
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
      setProduct(await archiveProduct(product.id));
      setArchiveConfirmationOpen(false);
      toast.success("Produto arquivado.");
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
      setProduct(await reactivateProduct(product.id));
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
        className={styles.actionRegion}
      >
        <div>
          <p className={styles.eyebrow}>Produto</p>
          <h2 id="product-actions-title">{product.name}</h2>
          <p className={styles.actionContext}>
            Edite os fatos ou remova este produto do seu workspace.
          </p>
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
      {product.active && (
        <GenerationPanel
          productId={product.id}
          productName={product.name}
          readiness={product.readiness}
          targetContentCount={product.targetContentCount}
        />
      )}
      <ProductCreateForm
        mode="edit"
        onSaved={setProduct}
        product={product}
      />
    </>
  );
}
