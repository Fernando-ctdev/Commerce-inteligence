"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import type { GapCode, ImportCandidate, ImportFacts } from "./import-contracts";
import { ImportField, OriginNote, QuantitySelector, StringListEditor } from "./product-import-controls";
import {
  REVIEW_FIELD_LIMITS,
  buildReviewFacts,
  firstReviewErrorField,
  mapServerFieldErrors,
  reviewDraftFromCandidate,
  reviewFieldId,
  reviewOrigin,
  validateReviewDraft,
  type ReviewDraft,
  type ReviewFieldErrors,
} from "./product-candidate-review-model";
import styles from "./product-import-flow.module.css";

type ProductCandidateReviewProps = {
  candidate: ImportCandidate;
  gaps: GapCode[];
  /** Valor inicial do seletor, resolvido server-side (preferência do tenant > config > preset). */
  initialQuantity: number;
  confirming: boolean;
  confirmErrors: Record<string, string>;
  confirmMessage?: string;
  onConfirm: (facts: ImportFacts, quantity: number) => void;
  onManualFallback: () => void;
};

export function ProductCandidateReview({ candidate, gaps, initialQuantity, confirming, confirmErrors, confirmMessage, onConfirm, onManualFallback }: ProductCandidateReviewProps) {
  const [draft, setDraft] = useState<ReviewDraft>(() => reviewDraftFromCandidate(candidate, initialQuantity));
  const [validationVisible, setValidationVisible] = useState(false);
  const [variantSeed, setVariantSeed] = useState({ name: "", value: "" });
  const messageRef = useRef<HTMLParagraphElement>(null);
  const serverErrors = mapServerFieldErrors(confirmErrors);
  const localErrors = validationVisible ? validateReviewDraft(draft) : {};
  const errors: ReviewFieldErrors = { ...localErrors, ...serverErrors };

  useEffect(() => {
    const serverKeys = Object.keys(confirmErrors);
    if (serverKeys.length === 0) return;
    setValidationVisible(true);
    const first = firstReviewErrorField(mapServerFieldErrors(confirmErrors));
    if (first) {
      requestAnimationFrame(() => document.getElementById(reviewFieldId(first))?.focus());
    } else {
      messageRef.current?.focus();
    }
  }, [confirmErrors]);

  function update<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function focusFirstError(fieldErrors: ReviewFieldErrors) {
    const first = firstReviewErrorField(fieldErrors);
    if (!first) return;
    requestAnimationFrame(() => document.getElementById(reviewFieldId(first))?.focus());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirming) return;
    setValidationVisible(true);
    const fieldErrors = validateReviewDraft(draft);
    if (Object.keys(fieldErrors).length > 0) {
      focusFirstError(fieldErrors);
      return;
    }
    onConfirm(buildReviewFacts(draft, candidate), Number(draft.quantity));
  }

  function addVariant() {
    const name = variantSeed.name.trim();
    const value = variantSeed.value.trim();
    if (!name || !value || draft.variants.length >= REVIEW_FIELD_LIMITS.variantsCount) return;
    update("variants", [...draft.variants, { name, value }]);
    setVariantSeed({ name: "", value: "" });
  }

  function handleVariantKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addVariant();
    }
  }

  function removeVariant(index: number) {
    update("variants", draft.variants.filter((_, position) => position !== index));
  }

  const headingId = "import-review-heading";

  return (
    <form aria-busy={confirming} className={styles.form} noValidate onSubmit={submit}>
      {confirmMessage && (
        <p className={styles.alert} ref={messageRef} role="alert" tabIndex={-1}>
          {confirmMessage}
        </p>
      )}

      <section aria-labelledby={headingId} className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Produto analisado</p>
          <h2 id={headingId}>Revise os fatos antes de confirmar</h2>
          <p>
            Extraído de {candidate.submittedUrl}. Nada é salvo sem a sua confirmação — corrija o que precisar campo a campo.
          </p>
        </div>

        <ImportField
          error={errors.name}
          id={reviewFieldId("name")}
          label="Nome do produto"
          maxLength={REVIEW_FIELD_LIMITS.name}
          onChange={(value) => update("name", value)}
          required
          value={draft.name}
        >
          <OriginNote origin={reviewOrigin("name", draft, candidate, gaps)} />
        </ImportField>

        <ImportField
          error={errors.description}
          id={reviewFieldId("description")}
          label="Descrição"
          maxLength={REVIEW_FIELD_LIMITS.description}
          multiline
          onChange={(value) => update("description", value)}
          value={draft.description}
        >
          <OriginNote origin={reviewOrigin("description", draft, candidate, gaps)} />
        </ImportField>

        <ImportField
          error={errors.category}
          id={reviewFieldId("category")}
          label="Categoria"
          maxLength={REVIEW_FIELD_LIMITS.category}
          onChange={(value) => update("category", value)}
          value={draft.category}
        >
          <OriginNote origin={reviewOrigin("category", draft, candidate, gaps)} />
        </ImportField>

        <ImportField
          error={errors.brand}
          id={reviewFieldId("brand")}
          label="Marca"
          maxLength={REVIEW_FIELD_LIMITS.brand}
          onChange={(value) => update("brand", value)}
          value={draft.brand}
        >
          <OriginNote origin={reviewOrigin("brand", draft, candidate, gaps)} />
        </ImportField>

        <ImportField
          error={errors.price}
          help="Em reais, por exemplo 39,90."
          id={reviewFieldId("price")}
          inputMode="decimal"
          label="Preço (BRL)"
          onChange={(value) => update("price", value)}
          value={draft.price}
        >
          <OriginNote origin={reviewOrigin("price", draft, candidate, gaps)} />
        </ImportField>

        <StringListEditor
          addLabel="Adicionar"
          error={errors.features}
          help="Uma característica por item."
          id={reviewFieldId("features")}
          items={draft.features}
          label="Características"
          maxItems={REVIEW_FIELD_LIMITS.featuresCount}
          maxLength={REVIEW_FIELD_LIMITS.feature}
          onItemsChange={(items) => update("features", items)}
          placeholder="Ex.: cerdas macias"
        />

        <div className={styles.field}>
          <span className={styles.listLabel} id={`${reviewFieldId("variants")}-label`}>Variantes</span>
          {draft.variants.length > 0 && (
            <ul aria-labelledby={`${reviewFieldId("variants")}-label`} className={styles.listRows}>
              {draft.variants.map((variant, index) => (
                <li className={styles.listRow} key={`${variant.name}-${variant.value}-${index}`}>
                  <span className={styles.listItemValue}>
                    {variant.name}: {variant.value}
                  </span>
                  <button
                    aria-label={`Remover variante ${variant.name} ${variant.value}`}
                    className={styles.removeButton}
                    onClick={() => removeVariant(index)}
                    type="button"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.variantRow}>
            <input
              aria-label="Atributo da variante"
              maxLength={REVIEW_FIELD_LIMITS.variantName}
              onChange={(event) => setVariantSeed((current) => ({ ...current, name: event.target.value }))}
              onKeyDown={handleVariantKeyDown}
              placeholder="Atributo (ex.: Cor)"
              value={variantSeed.name}
            />
            <input
              aria-label="Valor da variante"
              maxLength={REVIEW_FIELD_LIMITS.variantValue}
              onChange={(event) => setVariantSeed((current) => ({ ...current, value: event.target.value }))}
              onKeyDown={handleVariantKeyDown}
              placeholder="Valor (ex.: Preto)"
              value={variantSeed.value}
            />
            <button className={styles.secondaryButton} disabled={!variantSeed.name.trim() || !variantSeed.value.trim()} onClick={addVariant} type="button">
              Adicionar
            </button>
          </div>
          {errors.variants && (
            <p className={styles.fieldError} id={`${reviewFieldId("variants")}-error`} role="alert">
              {errors.variants}
            </p>
          )}
        </div>

        <StringListEditor
          addLabel="Adicionar"
          error={errors.images}
          help="URL http(s) de imagem. Nenhum arquivo é enviado."
          id={reviewFieldId("images")}
          items={draft.images}
          label="Imagens"
          maxItems={REVIEW_FIELD_LIMITS.imagesCount}
          onItemsChange={(items) => update("images", items)}
          placeholder="https://…"
          type="url"
        />

        <ImportField
          error={errors.seller}
          id={reviewFieldId("seller")}
          label="Vendedor"
          maxLength={REVIEW_FIELD_LIMITS.seller}
          onChange={(value) => update("seller", value)}
          value={draft.seller}
        >
          <OriginNote origin={reviewOrigin("seller", draft, candidate, gaps)} />
        </ImportField>

        <QuantitySelector
          disabled={confirming}
          error={errors.quantity}
          id={reviewFieldId("quantity")}
          onChange={(value) => update("quantity", value)}
          value={draft.quantity}
        />
      </section>

      <div className={styles.submitBar}>
        <button className={styles.primaryButton} disabled={confirming} type="submit">
          {confirming ? "Confirmando produto…" : "Confirmar produto"}
        </button>
        <button className={styles.textButton} disabled={confirming} onClick={onManualFallback} type="button">
          Adicionar manualmente
        </button>
      </div>
    </form>
  );
}
