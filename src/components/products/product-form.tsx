"use client";

import Link from "next/link";
import { FormEvent, useState, useRef } from "react";
import { toast } from "sonner";

import { createProduct, getProduct, ProductApiError, ProductRecord, updateProduct } from "./product-api";
import { buildProductPayload, emptyProductDraft, ProductDraft, ProductFieldErrors, validateProductDraft, visibleProductFieldErrors } from "./product-form-model";
import { firstProductErrorField } from "./product-ui-model";
import { createIdempotencyKey } from "./product-create-model";
import styles from "./product-form.module.css";

type ProductFormProps = {
  mode: "create" | "edit";
  product?: ProductRecord;
  onSaved?: (product: ProductRecord) => void;
  onCreated?: (productId: string) => void;
};

function draftFromProduct(product?: ProductRecord): ProductDraft {
  if (!product) return emptyProductDraft();
  return {
    name: product.name,
    description: product.description,
    category: product.category,
    price: product.price,
    characteristics: product.characteristics.join("\n"),
    imageReferences: product.imageReferences.join("\n"),
    observations: product.observations,
    url: product.url,
  };
}

function fieldId(field: keyof ProductDraft) {
  return `product-${field}`;
}

function Field({
  name,
  label,
  value,
  onChange,
  error,
  required = false,
  multiline = false,
  help,
  ...props
}: {
  name: keyof ProductDraft;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  multiline?: boolean;
  help?: string;
  [key: string]: unknown;
}) {
  const id = fieldId(name);
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const controlProps = {
    ...props,
    "aria-describedby": describedBy,
    "aria-invalid": Boolean(error),
    id,
    name,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    required,
    value,
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {multiline ? <textarea {...controlProps} rows={4} /> : <input {...controlProps} />}
      {help && <p className={styles.help} id={helpId}>{help}</p>}
      {error && <p className={styles.fieldError} id={errorId} role="alert">{error}</p>}
    </div>
  );
}

function errorFor(errors: ProductFieldErrors, name: keyof ProductDraft) {
  return errors[name];
}

export function ProductForm({ mode, product, onSaved, onCreated }: ProductFormProps) {
  const [draft, setDraft] = useState<ProductDraft>(() => draftFromProduct(product));
  const [version, setVersion] = useState(product?.version ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [validationVisible, setValidationVisible] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const idempotencyKey = useRef<string | undefined>(undefined);
  const conflictRef = useRef<HTMLDivElement>(null);
  const isEdit = mode === "edit";
  const submitLabel = isEdit ? "Salvar alterações" : "Adicionar produto";
  const actionLabel = saving ? `${submitLabel} — salvando` : submitLabel;

  function updateField(name: keyof ProductDraft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setError(null);
    setSuccess(null);
  }

  function readImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > 2_000_000) {
      toast.error("A imagem deve ter no máximo 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDraft((current) => ({
          ...current,
          imageReferences: `${current.imageReferences}${current.imageReferences ? "\n" : ""}${reader.result}`,
        }));
        setFieldErrors((current) => ({ ...current, imageReferences: undefined }));
        setError(null);
        setSuccess(null);
      }
    };
    reader.onerror = () => toast.error("Não foi possível ler essa imagem.");
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setValidationVisible(true);
    const validation = validateProductDraft(draft);
    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setError("Revise os campos destacados para continuar.");
      focusField(firstProductErrorField(validation));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    setConflict(false);
    setFieldErrors({});
    const key = idempotencyKey.current ?? createIdempotencyKey();
    idempotencyKey.current = key;

    try {
      const payload = buildProductPayload(draft, isEdit ? undefined : key, isEdit ? version : undefined);
      const saved = isEdit && product ? await updateProduct(product.id, payload) : await createProduct(payload);
      setVersion(saved.version);
      setSuccess(isEdit ? "Alterações salvas." : "Produto salvo.");
      toast.success(isEdit ? "Alterações salvas." : "Produto salvo.");
      if (!isEdit) {
        onCreated?.(saved.id);
        return;
      }

      const latest = await getProduct(saved.id);
      setDraft(draftFromProduct(latest));
      onSaved?.(latest);
    } catch (caught) {
      if (caught instanceof ProductApiError) {
        const isConflict = caught.status === 409 || caught.code === "version_conflict";
        setConflict(isConflict);
        setError(caught.message);
        toast.error(caught.message);
        const firstErrorField = firstProductErrorField(caught.fieldErrors);
        if (firstErrorField) focusField(firstErrorField);
        else if (isConflict) requestAnimationFrame(() => conflictRef.current?.focus());
      } else {
        const message = "Não foi possível salvar agora. Seus dados continuam nesta tela; tente novamente.";
        setError(message);
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  function focusField(name?: keyof ProductDraft) {
    if (!name) return;
    requestAnimationFrame(() => document.getElementById(fieldId(name))?.focus());
  }

  async function reloadLatest() {
    if (!product) return;
    setSaving(true);
    setError(null);
    try {
      const latest = await getProduct(product.id);
      setDraft(draftFromProduct(latest));
      setVersion(latest.version);
      setConflict(false);
      setSuccess("Versão mais recente carregada.");
    } catch (caught) {
      setError(caught instanceof ProductApiError ? caught.message : "Não foi possível recarregar agora.");
    } finally {
      setSaving(false);
    }
  }

  const combinedErrors = visibleProductFieldErrors(draft, fieldErrors, validationVisible);

  return (
    <form aria-busy={saving} className={styles.form} noValidate onSubmit={submit}>
      {error && <p className={styles.alert} role="alert">{error}</p>}
      {success && <p className={styles.success} role="status">{success}</p>}

      {conflict && (
        <div aria-live="assertive" className={styles.conflict} ref={conflictRef} role="alert" tabIndex={-1}>
          <strong>Este produto mudou em outra edição.</strong>
          <p>Recarregue a versão mais recente ou continue revisando seus dados sem sobrescrever nada.</p>
          <div className={styles.inlineActions}>
            <button className={styles.secondaryButton} disabled={saving} onClick={reloadLatest} type="button">Recarregar</button>
            <button className={styles.textButton} disabled={saving} onClick={() => setConflict(false)} type="button">Continuar</button>
          </div>
        </div>
      )}

      <section aria-labelledby="product-facts-title" className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Fallback manual</p>
          <h2 id="product-facts-title">Confirme os fatos que você conhece</h2>
          <p>Nome e descrição são obrigatórios. Os demais fatos são opcionais e podem ser completados depois.</p>
        </div>
        <Field error={combinedErrors.name} label="Nome do produto" name="name" onChange={(value) => updateField("name", value)} required value={draft.name} />
        <Field error={combinedErrors.description} label="Descrição" name="description" multiline onChange={(value) => updateField("description", value)} required value={draft.description} />
        <div className={styles.grid}>
          <Field error={combinedErrors.category} label="Categoria" name="category" onChange={(value) => updateField("category", value)} value={draft.category} />
          <Field error={combinedErrors.price} help="Use reais, por exemplo 39,90." inputMode="decimal" label="Preço (BRL)" name="price" onChange={(value) => updateField("price", value)} value={draft.price} />
        </div>
        <Field error={combinedErrors.characteristics} help="Uma característica por linha." label="Características" multiline name="characteristics" onChange={(value) => updateField("characteristics", value)} value={draft.characteristics} />
        <Field error={combinedErrors.observations} label="Observações" multiline name="observations" onChange={(value) => updateField("observations", value)} value={draft.observations} />
        <Field error={combinedErrors.imageReferences} help="Uma URL http(s) ou arquivo de imagem por linha." label="Referências de imagens" multiline name="imageReferences" onChange={(value) => updateField("imageReferences", value)} value={draft.imageReferences} />
        <div className={styles.field}>
          <label htmlFor="product-image-file">Adicionar arquivo de imagem</label>
          <input
            accept="image/*"
            id="product-image-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readImageFile(file);
              event.target.value = "";
            }}
            type="file"
          />
          <p className={styles.help}>Imagem pequena, até 2 MB. O arquivo será convertido para data URL.</p>
        </div>
        <Field error={combinedErrors.url} help="Opcional. A origem pode ser registrada como referência factual." label="URL do produto" name="url" onChange={(value) => updateField("url", value)} type="url" value={draft.url} />
      </section>

      <div className={styles.submitBar}>
        <button className={styles.primaryButton} disabled={saving} type="submit">
          {actionLabel}
        </button>
        {isEdit && product && <Link className={styles.cancelLink} href="/products">Voltar para Produtos</Link>}
      </div>
    </form>
  );
}
