"use client";

import {
  useState,
  useEffect,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type {
  ContentPreparationPreferences,
  ProductCandidateDraft,
  ProductCandidateFieldErrors,
  ProductImportRecord,
} from "./product-import-model";
import { contentPreparationPreferencesAreValid } from "./product-import-model";
import styles from "./product-candidate-modal.module.css";

export function candidateFieldId(name: keyof ProductCandidateDraft) {
  return `candidate-${name}`;
}

function CandidateField({
  name,
  label,
  value,
  onChange,
  error,
  required = false,
  multiline = false,
  inputMode,
  maxLength,
  readOnly = false,
}: {
  name: keyof ProductCandidateDraft;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  multiline?: boolean;
  inputMode?: "decimal";
  maxLength?: number;
  readOnly?: boolean;
}) {
  const id = candidateFieldId(name);
  const errorId = `${id}-error`;
  const Control = multiline ? "textarea" : "input";
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <Control
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        id={id}
        inputMode={inputMode}
        name={name}
        onChange={(
          event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
        ) => onChange(event.target.value)}
        readOnly={readOnly}
        required={required}
        rows={multiline ? 4 : undefined}
        maxLength={maxLength}
        value={value}
      />
      {error && (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function TagField({
  name,
  label,
  value,
  onChange,
  error,
  required = false,
}: {
  name: keyof ProductCandidateDraft;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  const [entry, setEntry] = useState("");
  const id = candidateFieldId(name);
  const errorId = `${id}-error`;
  const items = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  function updateItems(nextItems: string[]) {
    onChange(nextItems.join("\n"));
  }

  function addEntry() {
    const next = entry.trim();
    if (!next) return;
    updateItems([...items, next]);
    setEntry("");
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className={`${styles.tagEditor} ${error ? styles.tagEditorError : ""}`}>
        {items.map((item, index) => (
          <span className={styles.tag} key={`${item}-${index}`}>
            {item}
            <button
              aria-label={`Remover ${item}`}
              className={styles.tagRemove}
              onClick={() =>
                updateItems(items.filter((_, itemIndex) => itemIndex !== index))
              }
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          aria-label={`Adicionar ${label.toLowerCase()}`}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          aria-required={required || undefined}
          id={id}
          className={styles.tagInput}
          onChange={(event) => setEntry(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addEntry();
            } else if (
              event.key === "Backspace" &&
              !entry &&
              items.length > 0
            ) {
              updateItems(items.slice(0, -1));
            }
          }}
          value={entry}
        />
      </div>
      {error && (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type ProductCandidateModalProps = {
  candidate: ProductCandidateDraft;
  candidateErrors: ProductCandidateFieldErrors;
  candidateDialogRef: RefObject<HTMLDivElement | null>;
  busy: boolean;
  error?: string | null;
  mode?: "candidate" | "manual";
  previewImage?: string;
  record?: ProductImportRecord;
  onChange: (name: keyof ProductCandidateDraft, value: string) => void;
  onCancel: () => void;
  onConfirm: (preferences?: ContentPreparationPreferences) => void;
};

export function ProductCandidateModal({
  candidate,
  candidateErrors,
  candidateDialogRef,
  busy,
  error,
  mode = "candidate",
  previewImage,
  record,
  onChange,
  onCancel,
  onConfirm,
}: ProductCandidateModalProps) {
  const hasCandidateErrors = Object.keys(candidateErrors).length > 0;
  const isManual = mode === "manual";
  const [quantity, setQuantity] = useState("20");
  const [creatorFormat, setCreatorFormat] = useState("either");
  const [contentNotes, setContentNotes] = useState("");
  const isCustomQuantity = !["10", "20", "30"].includes(quantity);
  const contentPreferences: ContentPreparationPreferences = {
    targetContentCount: Number(quantity),
    creatorPresence: creatorFormat as ContentPreparationPreferences["creatorPresence"],
    ...(contentNotes.trim() ? { constraints: contentNotes.trim() } : {}),
  };
  const customQuantityError = isCustomQuantity &&
    (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 50)
    ? "Informe uma quantidade inteira entre 1 e 50."
    : undefined;
  const canConfirm = !busy && !hasCandidateErrors &&
    (isManual || contentPreparationPreferencesAreValid(contentPreferences));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      candidateDialogRef.current
        ?.querySelector<HTMLElement>("[data-candidate-focus]")
        ?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [candidateDialogRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !candidateDialogRef.current) return;
    const focusable = Array.from(
      candidateDialogRef.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], select:not(:disabled), [tabindex]:not([tabindex='-1'])",
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        aria-describedby="candidate-description"
        aria-labelledby="candidate-title"
        aria-modal="true"
        className={styles.dialog}
        onKeyDown={handleKeyDown}
        ref={candidateDialogRef}
        role="dialog"
      >
        <div className={styles.header}>
          <div>
            <h2 data-candidate-focus id="candidate-title" tabIndex={-1}>
              {isManual ? "Adicionar produto" : "Produto encontrado"}
            </h2>
          </div>
          <button
            aria-label="Fechar revisão"
            className={styles.closeButton}
            disabled={busy}
            onClick={onCancel}
            style={{ fontSize: 28, fontWeight: 400, lineHeight: 1, padding: 8 }}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className={styles.disclaimer} id="candidate-description">
          {isManual
            ? "Informe e revise antes de confirmar. Campos sem evidência permanecem vazios até você preenchê-los."
            : "Revise e complete as informações antes de continuar."}
        </p>
        {record?.gaps && record.gaps.length > 0 && (
          <div className={styles.gaps} role="status">
            <strong>Lacunas para revisar</strong>
            <ul>
              {record.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        )}
        <div className={styles.body}>
          <div className={styles.previewColumn}>
            {previewImage ? (
              <div
                aria-label="Imagem de identificação do produto"
                className={styles.preview}
              >
                {/* External image references are intentionally rendered as-is; next/image would require an unbounded remote host allowlist. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={
                    candidate.name
                      ? `Imagem de ${candidate.name}`
                      : "Imagem do produto encontrado"
                  }
                  loading="lazy"
                  src={previewImage}
                />
              </div>
            ) : (
              <div
                aria-label="Imagem de identificação do produto"
                className={styles.previewEmpty}
              >
                Sem imagem disponível
              </div>
            )}
            <p className={styles.previewHint}>
              Imagem usada somente para confirmar se o produto foi compreendido
              corretamente.
            </p>
          </div>
          <form
            aria-busy={busy}
            className={styles.form}
            id="candidate-form"
            noValidate
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              onConfirm(isManual ? undefined : contentPreferences);
            }}
          >
            {isManual ? (
              <>
                <CandidateField
                  error={candidateErrors.name}
                  label="Nome do produto"
                  name="name"
                  onChange={(value) => onChange("name", value)}
                  required
                  value={candidate.name}
                />
                <CandidateField
                  error={candidateErrors.description}
                  label="Descrição"
                  multiline
                  name="description"
                  onChange={(value) => onChange("description", value)}
                  required
                  value={candidate.description}
                />
                <div className={styles.grid}>
                  <CandidateField
                    error={candidateErrors.category}
                    label="Categoria"
                    maxLength={120}
                    name="category"
                    onChange={(value) => onChange("category", value)}
                    value={candidate.category}
                  />
                  <CandidateField
                    error={candidateErrors.price}
                    inputMode="decimal"
                    label="Preço"
                    name="price"
                    onChange={(value) => onChange("price", value)}
                    value={candidate.price}
                  />
                  <CandidateField
                    error={candidateErrors.currency}
                    label="Moeda"
                    name="currency"
                    onChange={(value) => onChange("currency", value)}
                    value={candidate.currency}
                  />
                  <CandidateField
                    error={candidateErrors.seller}
                    label="Seller"
                    maxLength={200}
                    name="seller"
                    onChange={(value) => onChange("seller", value)}
                    value={candidate.seller}
                  />
                </div>
                <CandidateField
                  error={candidateErrors.features}
                  label="Características — uma por linha"
                  multiline
                  name="features"
                  onChange={(value) => onChange("features", value)}
                  value={candidate.features}
                />
                <CandidateField
                  error={candidateErrors.variants}
                  label="Variantes — uma por linha"
                  multiline
                  name="variants"
                  onChange={(value) => onChange("variants", value)}
                  value={candidate.variants}
                />
                <CandidateField
                  error={candidateErrors.images}
                  label="Imagens — uma URL por linha"
                  multiline
                  name="images"
                  onChange={(value) => onChange("images", value)}
                  value={candidate.images}
                />
                <CandidateField
                  error={candidateErrors.sourceUrl}
                  label="URL do produto"
                  maxLength={2048}
                  name="sourceUrl"
                  onChange={(value) => onChange("sourceUrl", value)}
                  value={candidate.sourceUrl}
                />
              </>
            ) : (
              <>
                <div className={styles.grid}>
                  <CandidateField
                    error={candidateErrors.name}
                    label="Nome do produto"
                    name="name"
                    onChange={(value) => onChange("name", value)}
                    required
                    value={candidate.name}
                  />
                  <CandidateField
                    error={candidateErrors.brand}
                    label="Marca"
                    name="brand"
                    onChange={(value) => onChange("brand", value)}
                    value={candidate.brand}
                  />
                  <CandidateField
                    error={candidateErrors.category}
                    label="Categoria"
                    maxLength={120}
                    name="category"
                    onChange={(value) => onChange("category", value)}
                    value={candidate.category}
                  />
                  <CandidateField
                    error={candidateErrors.price}
                    inputMode="decimal"
                    label="Preço"
                    name="price"
                    onChange={(value) => onChange("price", value)}
                    value={candidate.price}
                  />
                  <CandidateField
                    error={candidateErrors.currency}
                    label="Moeda"
                    name="currency"
                    onChange={(value) => onChange("currency", value)}
                    value={candidate.currency}
                  />
                  <CandidateField
                    error={candidateErrors.seller}
                    label="Seller"
                    maxLength={200}
                    name="seller"
                    onChange={(value) => onChange("seller", value)}
                    value={candidate.seller}
                  />
                </div>
                <CandidateField
                  error={candidateErrors.description}
                  label="Descrição"
                  multiline
                  name="description"
                  onChange={(value) => onChange("description", value)}
                  required
                  value={candidate.description}
                />
                <TagField
                  error={candidateErrors.features}
                  label="Características"
                  name="features"
                  onChange={(value) => onChange("features", value)}
                  value={candidate.features}
                />
                <CandidateField
                  error={candidateErrors.variants}
                  label="Variantes — uma por linha"
                  multiline
                  name="variants"
                  onChange={(value) => onChange("variants", value)}
                  value={candidate.variants}
                />
                <CandidateField
                  error={candidateErrors.images}
                  label="Imagens — uma URL por linha"
                  multiline
                  name="images"
                  onChange={(value) => onChange("images", value)}
                  value={candidate.images}
                />
              </>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {hasCandidateErrors && (
              <p
                className={styles.help}
                id="candidate-validation-help"
                role="alert"
              >
                Corrija os fatos destacados antes de continuar.
              </p>
            )}
          </form>
        </div>
        {!isManual && (
          <section
            aria-labelledby="content-preparation-title"
            style={{
              borderTop: "1px solid var(--color-border)",
              paddingTop: 20,
            }}
          >
            <h3
              id="content-preparation-title"
              style={{
                color: "var(--color-text)",
                fontSize: 16,
                lineHeight: "22px",
                margin: 0,
              }}
            >
              Preparação dos conteúdos
            </h3>
            <p
              style={{
                color: "var(--color-text-secondary)",
                fontSize: 13,
                lineHeight: "18px",
                margin: "4px 0 16px",
              }}
            >
              Defina as preferências para geração inicial dos briefings.
            </p>
            <div
              className={styles.preparationGrid}
            >
              <fieldset
                style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
              >
                <legend
                  style={{
                    color: "var(--color-text)",
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: "18px",
                    marginBottom: 8,
                  }}
                >
                  Quantidade inicial
                </legend>
                <div
                  aria-label="Quantidade inicial"
                  className={`${styles.preparationOptionGroup} ${styles.preparationQuantityOptions}`}
                  role="group"
                >
                  {["10", "20", "30", "other"].map((option) => (
                    <button
                      aria-pressed={
                        option === "other"
                          ? isCustomQuantity
                          : quantity === option
                      }
                      className={
                        (
                          option === "other"
                            ? isCustomQuantity
                            : quantity === option
                        )
                          ? styles.primaryButton
                          : styles.secondaryButton
                      }
                      key={option}
                      onClick={() =>
                        setQuantity(option === "other" ? "" : option)
                      }
                      type="button"
                    >
                      {option === "other" ? "Outro" : option}
                    </button>
                  ))}
                </div>
                {isCustomQuantity && (
                  <input
                    aria-label="Quantidade personalizada"
                    aria-describedby={customQuantityError ? "target-content-count-error" : undefined}
                    aria-invalid={Boolean(customQuantityError)}
                    max={50}
                    min={1}
                    name="targetContentCount"
                    onChange={(event) => setQuantity(event.target.value)}
                    style={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-text)",
                      font: "inherit",
                      marginTop: 8,
                      minHeight: 44,
                      padding: "10px 12px",
                      width: "100%",
                    }}
                    required
                    type="number"
                    value={quantity}
                  />
                )}
                {customQuantityError && (
                  <p className={styles.error} id="target-content-count-error" role="alert">
                    {customQuantityError}
                  </p>
                )}
              </fieldset>
              <fieldset
                style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
              >
                <legend
                  style={{
                    color: "var(--color-text)",
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: "18px",
                    marginBottom: 8,
                  }}
                >
                  Formato do creator
                </legend>
                <div
                  aria-label="Formato do creator"
                  className={`${styles.preparationOptionGroup} ${styles.preparationCreatorOptions}`}
                  role="group"
                >
                  {["on_camera", "hands_only_product", "either"].map(
                    (option) => (
                      <button
                        aria-pressed={creatorFormat === option}
                        className={
                          creatorFormat === option
                            ? styles.primaryButton
                            : styles.secondaryButton
                        }
                        key={option}
                        onClick={() => setCreatorFormat(option)}
                        type="button"
                      >
                        {option === "on_camera"
                          ? "Em câmera"
                          : option === "hands_only_product"
                            ? "mão e produto"
                            : "Tanto faz"}
                      </button>
                    ),
                  )}
                </div>
              </fieldset>
            </div>
            <div className={styles.field} style={{ marginTop: 16 }}>
              <label htmlFor="content-preparation-notes">
                Observações ou restrições{" "}
                <span
                  style={{
                    color: "var(--color-text-secondary)",
                    fontWeight: 400,
                  }}
                >
                  (opcional)
                </span>
              </label>
              <textarea
                id="content-preparation-notes"
                maxLength={300}
                name="constraints"
                onChange={(event) => setContentNotes(event.target.value)}
                placeholder="Ex.: evitar gírias, não mencionar concorrentes, focar em benefícios..."
                rows={3}
                value={contentNotes}
              />
            </div>
          </section>
        )}
        <div className={styles.actions}>
          <button
            className={styles.secondaryButton}
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-describedby={
              hasCandidateErrors ? "candidate-validation-help" : undefined
            }
            className={styles.primaryButton}
            disabled={!canConfirm}
            form="candidate-form"
            type="submit"
          >
            {busy ? "Continuar — confirmando" : "Continuar"}
          </button>
        </div>
        {isManual && (
          <p className={styles.source}>
            <strong>Origem</strong>{" "}
            <span>{candidate.sourceUrl || "Não informada"}</span>
          </p>
        )}
      </div>
    </div>
  );
}
