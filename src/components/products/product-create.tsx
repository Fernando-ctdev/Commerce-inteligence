"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createProduct, ProductApiError } from "./product-api";
import { createIdempotencyKey, productPathForCreatedProduct } from "./product-create-model";
import { candidateFieldId, ProductCandidateModal } from "./product-candidate-modal";
import {
  candidateCanBeConfirmed,
  validateCandidateDraft,
  type ProductCandidateDraft,
  type ProductCandidateFieldErrors,
} from "./product-import-model";
import { buildProductPayload } from "./product-form-model";
import styles from "./product-list.module.css";

const emptyDraft: ProductCandidateDraft = {
  name: "",
  description: "",
  category: "",
  brand: "",
  seller: "",
  price: "",
  currency: "BRL",
  features: "",
  variants: "",
  images: "",
  sourceUrl: "",
};

export function ProductCreate() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ProductCandidateDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors: ProductCandidateFieldErrors = open
    ? validateCandidateDraft(draft)
    : {};

  function update(name: keyof ProductCandidateDraft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setError(null);
  }

  async function submit() {
    if (!candidateCanBeConfirmed(draft) || busy) {
      const firstError = Object.keys(errors)[0] as keyof ProductCandidateDraft | undefined;
      if (firstError) document.getElementById(candidateFieldId(firstError))?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = await createProduct({
        ...buildProductPayload({
          name: draft.name,
          description: draft.description,
          category: draft.category,
          seller: draft.seller,
          price: draft.price,
          characteristics: draft.features,
          imageReferences: draft.images,
          observations: "",
          url: "",
        }, createIdempotencyKey()),
        priceCurrency: draft.currency.trim() || null,
      });
      setOpen(false);
      router.push(productPathForCreatedProduct(saved.id));
    } catch (caught) {
      setError(caught instanceof ProductApiError ? caught.message : "Não foi possível salvar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.state}>
        <p className={styles.eyebrow}>Novo produto</p>
        <h2>Adicione um produto ao seu catálogo.</h2>
        <p>Preencha os fatos manualmente. Você poderá completar ou ajustar os dados depois.</p>
        <button className={styles.primaryButton} onClick={() => { setError(null); setOpen(true); }} type="button">
          Adicionar produto
        </button>
      </div>
      {open && (
        <ProductCandidateModal
          candidate={draft}
          candidateDialogRef={dialogRef}
          candidateErrors={errors}
          busy={busy}
          error={error}
          mode="manual"
          onCancel={() => { if (!busy) setOpen(false); }}
          onChange={update}
          onConfirm={() => void submit()}
        />
      )}
    </>
  );
}
