"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

import { createProduct, ProductApiError } from "./product-api";
import { createIdempotencyKey } from "./product-create-model";
import {
  buildManualProductPayload,
  DEFAULT_PRODUCT_CURRENCY,
  digitsToPrice,
  formatPriceDisplay,
  preparationIsWithinLimits,
  validateProductManualDraft,
  type ProductManualDraft,
  type ProductManualFieldErrors,
} from "./product-form-model";
import type { ContentPreparationPreferences } from "./product-import-model";
import styles from "./product-form.module.css";

const emptyDraft: ProductManualDraft = {
  name: "",
  description: "",
  category: "",
  price: "",
  currency: DEFAULT_PRODUCT_CURRENCY,
  characteristics: "",
};

const currencyOptions = [
  { value: "BRL", label: "R$ Reais" },
  { value: "USD", label: "$ Dólar" },
  { value: "EUR", label: "€ Euro" },
];

const currencySymbols: Record<string, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
};

const creatorPresenceOptions = [
  { value: "on_camera", label: "Em câmera" },
  { value: "hands_only_product", label: "mão e produto" },
  { value: "either", label: "Tanto faz" },
] as const;

const errorFieldOrder: Array<keyof ProductManualFieldErrors> = [
  "name",
  "description",
  "category",
  "price",
  "characteristics",
  "targetContentCount",
  "creatorPresence",
  "constraints",
];

function fieldId(field: string) {
  return `new-product-${field}`;
}

function CurrencySelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = `${fieldId("currency")}-error`;
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
        id={fieldId("currency")}
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

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  required = false,
  multiline = false,
  inputMode,
  maxLength,
  financial = false,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  multiline?: boolean;
  inputMode?: "decimal";
  maxLength?: number;
  financial?: boolean;
}) {
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
        maxLength={maxLength}
        name={id}
        onChange={(event) =>
          onChange(financial ? digitsToPrice(event.target.value) : event.target.value)
        }
        required={required}
        value={financial ? formatPriceDisplay(value) : value}
      />
      {error && (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CurrencyField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = `${fieldId("currency")}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={fieldId("currency")}>Moeda</label>
      <CurrencySelect error={error} onChange={onChange} value={value} />
      {error && (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProductCreateForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductManualDraft>(emptyDraft);
  const [quantity, setQuantity] = useState(20);
  const [creatorPresence, setCreatorPresence] =
    useState<ContentPreparationPreferences["creatorPresence"]>("either");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProductManualFieldErrors>({});
  const [validationVisible, setValidationVisible] = useState(false);
  /* Uma chave por tentativa lógica: gerada no primeiro submit e reutilizada
     em todo retry; limpa só após sucesso (novo formulário = novo mount). */
  const idempotencyKey = useRef<string | undefined>(undefined);

  function update(field: keyof ProductManualDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  }

  function focusFirstError(errors: ProductManualFieldErrors) {
    const first = errorFieldOrder.find((field) => Boolean(errors[field]));
    if (!first) return;
    requestAnimationFrame(() => document.getElementById(fieldId(first))?.focus());
  }

  const contentPreferences: ContentPreparationPreferences = {
    targetContentCount: quantity,
    creatorPresence,
    ...(notes.trim() ? { constraints: notes.trim() } : {}),
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setValidationVisible(true);
    if (!preparationIsWithinLimits(contentPreferences)) {
      setError("Revise a preparação dos conteúdos antes de salvar.");
      return;
    }
    const validation = validateProductManualDraft(draft);
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setError("Revise os campos destacados para continuar.");
      focusFirstError(validation);
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});
    const key = idempotencyKey.current ?? createIdempotencyKey();
    idempotencyKey.current = key;

    try {
      await createProduct(buildManualProductPayload(draft, contentPreferences, key));
      idempotencyKey.current = undefined;
      router.push("/products");
    } catch (caught) {
      if (caught instanceof ProductApiError) {
        const apiErrors: ProductManualFieldErrors = {
          name: caught.fieldErrors.name,
          description: caught.fieldErrors.description,
          category: caught.fieldErrors.category,
          price: caught.fieldErrors.price,
          characteristics: caught.fieldErrors.characteristics,
          targetContentCount: caught.fieldErrors.targetContentCount,
          creatorPresence: caught.fieldErrors.creatorPresence,
          constraints: caught.fieldErrors.constraints,
        };
        setFieldErrors(apiErrors);
        setError(caught.message);
        focusFirstError(apiErrors);
      } else {
        setError("Não foi possível salvar agora. Seus dados continuam nesta tela; tente novamente.");
      }
    } finally {
      setSaving(false);
    }
  }

  const combinedErrors: ProductManualFieldErrors = validationVisible
    ? { ...validateProductManualDraft(draft), ...fieldErrors }
    : fieldErrors;

  return (
    <form aria-busy={saving} className={styles.form} noValidate onSubmit={submit}>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby="new-product-facts-title" className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Novo produto</p>
          <h2 id="new-product-facts-title">Informe os fatos que você conhece</h2>
          <p>
            Nome e descrição são obrigatórios. Os demais fatos são opcionais e
            podem ser completados depois.
          </p>
        </div>
        <TextField
          error={combinedErrors.name}
          id={fieldId("name")}
          label="Nome do produto"
          onChange={(value) => update("name", value)}
          required
          value={draft.name}
        />
        <TextField
          error={combinedErrors.description}
          id={fieldId("description")}
          label="Descrição"
          multiline
          onChange={(value) => update("description", value)}
          required
          value={draft.description}
        />
        <div className={styles.factsGrid}>
          <TextField
            error={combinedErrors.category}
            id={fieldId("category")}
            label="Categoria"
            maxLength={120}
            onChange={(value) => update("category", value)}
            value={draft.category}
          />
          <TextField
            error={combinedErrors.price}
            financial
            id={fieldId("price")}
            inputMode="decimal"
            label="Preço"
            onChange={(value) => update("price", value)}
            value={draft.price}
          />
          <CurrencyField
            error={combinedErrors.currency}
            onChange={(value) => update("currency", value)}
            value={draft.currency}
          />
        </div>
        <TextField
          error={combinedErrors.characteristics}
          id={fieldId("characteristics")}
          label="Características — uma por linha"
          multiline
          onChange={(value) => update("characteristics", value)}
          value={draft.characteristics}
        />
      </section>

      <section
        aria-labelledby="content-preparation-title"
        className={styles.section}
      >
        <div className={styles.sectionHeading}>
          <h2 id="content-preparation-title">Preparação dos conteúdos</h2>
          <p>Defina as preferências para geração inicial dos briefings.</p>
        </div>
        <div className={styles.preparationGrid}>
          <fieldset className={styles.preparationGroup}>
            <legend>Quantidade inicial de conteúdos</legend>
            <div className={styles.preparationQuantity}>
              <span aria-hidden="true" className={styles.quantityValue}>
                {quantity}
              </span>
              <Slider
                aria-describedby={
                  combinedErrors.targetContentCount
                    ? `${fieldId("targetContentCount")}-error`
                    : undefined
                }
                aria-invalid={Boolean(combinedErrors.targetContentCount)}
                aria-label="Quantidade inicial de conteúdos"
                className={styles.quantitySlider}
                id={fieldId("targetContentCount")}
                max={30}
                min={1}
                onValueChange={(value) =>
                  setQuantity(Array.isArray(value) ? value[0] ?? quantity : quantity)
                }
                step={1}
                value={[quantity]}
              />
              <div aria-hidden="true" className={styles.quantityBounds}>
                <span>1</span>
                <span>30</span>
              </div>
            </div>
            {combinedErrors.targetContentCount && (
              <p
                className={styles.fieldError}
                id={`${fieldId("targetContentCount")}-error`}
                role="alert"
              >
                {combinedErrors.targetContentCount}
              </p>
            )}
          </fieldset>
          <fieldset className={styles.preparationGroup}>
            <legend>Formato do creator</legend>
            <div
              aria-describedby={
                combinedErrors.creatorPresence
                  ? `${fieldId("creatorPresence")}-error`
                  : undefined
              }
              aria-label="Formato do creator"
              className={styles.creatorOptions}
              role="group"
            >
              {creatorPresenceOptions.map((option, index) => (
                <Button
                  aria-pressed={creatorPresence === option.value}
                  id={index === 0 ? fieldId("creatorPresence") : undefined}
                  key={option.value}
                  onClick={() => setCreatorPresence(option.value)}
                  type="button"
                  variant={creatorPresence === option.value ? "default" : "outline"}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {combinedErrors.creatorPresence && (
              <p
                className={styles.fieldError}
                id={`${fieldId("creatorPresence")}-error`}
                role="alert"
              >
                {combinedErrors.creatorPresence}
              </p>
            )}
          </fieldset>
        </div>
        <TextField
          error={combinedErrors.constraints}
          id={fieldId("constraints")}
          label={
            <>
              Observações ou restrições{" "}
              <span aria-hidden="true" className={styles.optionalMark}>
                (opcional)
              </span>
            </>
          }
          maxLength={300}
          multiline
          onChange={setNotes}
          value={notes}
        />
      </section>

      <div className={styles.submitBar}>
        <Button disabled={saving} type="submit">
          {saving ? "Salvar produto — salvando" : "Salvar produto"}
        </Button>
        {/* Cancelar bloqueado durante o salvamento: navegar com POST em
            voo poderia persistir um Product após o cancelamento (B-006). */}
        {saving ? (
          <Button disabled type="button" variant="outline">
            Cancelar
          </Button>
        ) : (
          <Link className={styles.cancelLink} href="/products">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  );
}
