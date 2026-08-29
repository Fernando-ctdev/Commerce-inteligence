"use client";

import {
  useState,
  useEffect,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

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

/* Máscara do Preço: o input exibe pt-BR (10,50) e o draft guarda o
   formato aceito pelo gate (10.50). Digitação estilo caixa: cada dígito
   entra como centavo. */
function digitsToPrice(raw: string) {
  /* 10 dígitos = 99.999.999,99 — teto exato aceito pelo gate. */
  /* Zeros à esquerda colapsam: sem eles, apagar ficava travado em 0,00. */
  const digits = raw
    .replace(/\D/g, "")
    .replace(/^0+/, "")
    .slice(0, 10);
  if (!digits) return "";
  return (Number(digits) / 100).toFixed(2);
}

function formatPriceDisplay(price: string) {
  if (!price) return "";
  const amount = Number(price.replace(",", "."));
  if (!Number.isFinite(amount)) return price;
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  formatFinancial = false,
  labelAddon,
  helperError,
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
  formatFinancial?: boolean;
  labelAddon?: ReactNode;
  helperError?: { id: string; message: string };
}) {
  const id = candidateFieldId(name);
  /* Display pt-BR (10,50) sobre um draft no formato que o gate aceita (10.50). */
  const displayedValue = formatFinancial
    ? formatPriceDisplay(value)
    : value;
  const Control = multiline ? "textarea" : "input";
  const errorId = `${id}-error`;
  const helperErrorId = helperError?.id;
  const describedBy =
    [error ? errorId : undefined, helperErrorId].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label htmlFor={id}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
        {labelAddon}
      </div>
      <Control
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        id={id}
        inputMode={inputMode}
        name={name}
        onChange={(event) =>
          onChange(
            formatFinancial
              ? digitsToPrice(event.target.value)
              : event.target.value,
          )
        }
        readOnly={readOnly}
        required={required}
        value={displayedValue}
      />
      {helperError && (
        <p className={styles.error} id={helperError.id} role="alert">
          {helperError.message}
        </p>
      )}
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

const currencyOptions = [
  { value: "BRL", label: "R$ Reais" },
  { value: "USD", label: "$ Dólar" },
  { value: "EUR", label: "€ Euro" },
];

/* Mapeia o código ISO gravado no draft para o cifrão exibido no trigger. */
const currencySymbols: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
};

function CurrencySelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = `${candidateFieldId("currency")}-error`;
  return (
    <Select
      items={currencySymbols}
      onValueChange={(next) => onChange(next ?? "")}
      value={value || null}
    >
      <SelectTrigger
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        aria-label="Moeda"
        className={styles.currencyTrigger}
        id={candidateFieldId("currency")}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent className={styles.currencyContent}>
        {currencyOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const [quantity, setQuantity] = useState(20);
  const [creatorFormat, setCreatorFormat] = useState("either");
  const [contentNotes, setContentNotes] = useState("");
  const contentPreferences: ContentPreparationPreferences = {
    targetContentCount: quantity,
    creatorPresence: creatorFormat as ContentPreparationPreferences["creatorPresence"],
    ...(contentNotes.trim() ? { constraints: contentNotes.trim() } : {}),
  };
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

  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      open
    >
      <DialogContent
        aria-describedby="candidate-modal-description"
        aria-labelledby="candidate-title"
        className={`${styles.dialog} w-[min(100%,65vw)] sm:max-w-[80vw]`}
        ref={candidateDialogRef}
        showCloseButton={false}
      >
        <ScrollArea className={styles.scrollArea}>
          <div className={styles.dialogInner}>
            <div className={styles.header}>
              <DialogTitle
                className={styles.dialogTitle}
                data-candidate-focus
                id="candidate-title"
                tabIndex={-1}
              >
                {isManual ? "Adicionar produto" : "Produto encontrado"}
              </DialogTitle>
              <Button
                aria-label="Fechar revisão"
                className={styles.closeButton}
                disabled={busy}
                onClick={onCancel}
                size="icon"
                type="button"
                variant="ghost"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
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
                {/* <p className={styles.previewHint}>
                  Imagem usada somente para confirmar se o produto foi compreendido
                  corretamente.
                </p> */}
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
                        helperError={
                          candidateErrors.currency
                            ? {
                                id: `${candidateFieldId("currency")}-error`,
                                message: candidateErrors.currency,
                              }
                            : undefined
                        }
                        formatFinancial
                        inputMode="decimal"
                        label="Preço"
                        labelAddon={
                          <CurrencySelect
                            error={candidateErrors.currency}
                            onChange={(value) => onChange("currency", value)}
                            value={candidate.currency}
                          />
                        }
                        name="price"
                        onChange={(value) => onChange("price", value)}
                        value={candidate.price}
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
                  </>
                ) : (
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
                        helperError={
                          candidateErrors.currency
                            ? {
                                id: `${candidateFieldId("currency")}-error`,
                                message: candidateErrors.currency,
                              }
                            : undefined
                        }
                        formatFinancial
                        inputMode="decimal"
                        label="Preço"
                        labelAddon={
                          <CurrencySelect
                            error={candidateErrors.currency}
                            onChange={(value) => onChange("currency", value)}
                            value={candidate.currency}
                          />
                        }
                        name="price"
                        onChange={(value) => onChange("price", value)}
                        value={candidate.price}
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
                  </>
                )}
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
              </form>
            </div>
            {(
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
                      Quantidade inicial de conteúdos
                    </legend>
                    <div className={styles.preparationQuantityOptions}>
                      <span aria-hidden="true" className={styles.quantityValue}>
                        {quantity}
                      </span>
                      <Slider
                        aria-label="Quantidade inicial de conteúdos"
                        max={30}
                        min={1}
                        onValueChange={(value) =>
                          setQuantity(
                            Array.isArray(value) ? value[0] ?? quantity : quantity,
                          )
                        }
                        step={1}
                        value={[quantity]}
                      />
                      <div aria-hidden="true" className={styles.quantityBounds}>
                        <span>1</span>
                        <span>30</span>
                      </div>
                    </div>
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
                          <Button
                            aria-pressed={creatorFormat === option}
                            key={option}
                            onClick={() => setCreatorFormat(option)}
                            type="button"
                            variant={creatorFormat === option ? "default" : "outline"}
                          >
                            {option === "on_camera"
                              ? "Em câmera"
                              : option === "hands_only_product"
                                ? "mão e produto"
                                : "Tanto faz"}
                          </Button>
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
              <Button
                disabled={busy}
                onClick={onCancel}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                aria-describedby={
                  hasCandidateErrors ? "candidate-validation-help" : undefined
                }
                disabled={!canConfirm}
                form="candidate-form"
                type="submit"
              >
                {busy ? "Continuar — confirmando" : "Continuar"}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
