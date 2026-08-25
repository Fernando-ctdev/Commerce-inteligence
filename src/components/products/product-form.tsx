"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { createProduct, getProduct, ProductApiError, ProductRecord, requestEnrichment, updateProduct } from "./product-api";
import { buildProductPayload, emptyProductDraft, ProductDraft, ProductFieldErrors, validateProductDraft, visibleProductFieldErrors } from "./product-form-model";
import { firstProductErrorField, shouldMonitorEnrichment } from "./product-ui-model";
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
    objective: product.context.objective,
    audience: product.context.audience,
    style: product.context.style,
    presence: product.context.presence,
    experience: product.context.experience,
    restrictions: product.context.restrictions,
    market: product.context.market,
    contextObservations: product.context.observations,
  };
}

function createIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
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
  const [enrichmentRetrying, setEnrichmentRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [validationVisible, setValidationVisible] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [enrichmentStatus, setEnrichmentStatus] = useState<ProductRecord["enrichmentStatus"]>(product?.enrichmentStatus ?? "none");
  const [readyForStrategy, setReadyForStrategy] = useState(product?.readyForStrategy ?? false);
  const idempotencyKey = useRef<string | undefined>(undefined);
  const enrichmentRequest = useRef<string | undefined>(undefined);
  const conflictRef = useRef<HTMLDivElement>(null);
  const isEdit = mode === "edit";
  const submitLabel = isEdit ? "Salvar alterações" : "Salvar produto";
  const actionLabel = saving ? `${submitLabel} — salvando` : submitLabel;
  const monitorEnrichment = useCallback((id: string) => {
    void requestEnrichment(id)
      .then(setEnrichmentStatus)
      .catch(() => setEnrichmentStatus("unavailable"));
  }, []);

  useEffect(() => {
    if (!isEdit || !product || !shouldMonitorEnrichment(product)) return;
    const requestKey = `${product.id}:${product.url}`;
    if (enrichmentRequest.current === requestKey) return;
    enrichmentRequest.current = requestKey;
    const timer = window.setTimeout(() => monitorEnrichment(product.id), 0);
    return () => window.clearTimeout(timer);
  }, [isEdit, monitorEnrichment, product]);

  function updateField(name: keyof ProductDraft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setError(null);
    setSuccess(null);
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
      if (!isEdit) {
        onCreated?.(saved.id);
        return;
      }

      const latest = await getProduct(saved.id);
      setDraft(draftFromProduct(latest));
      setEnrichmentStatus(latest.enrichmentStatus);
      setReadyForStrategy(latest.readyForStrategy);
      onSaved?.(latest);
    } catch (caught) {
      if (caught instanceof ProductApiError) {
        setFieldErrors(caught.fieldErrors);
        const isConflict = caught.status === 409 || caught.code === "version_conflict";
        setConflict(isConflict);
        setError(caught.message);
        const firstErrorField = firstProductErrorField(caught.fieldErrors);
        if (firstErrorField) focusField(firstErrorField);
        else if (isConflict) requestAnimationFrame(() => conflictRef.current?.focus());
      } else {
        setError("Não foi possível salvar agora. Seus dados continuam nesta tela; tente novamente.");
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
      setEnrichmentStatus(latest.enrichmentStatus);
      setReadyForStrategy(latest.readyForStrategy);
      setConflict(false);
      setSuccess("Versão mais recente carregada.");
    } catch (caught) {
      setError(caught instanceof ProductApiError ? caught.message : "Não foi possível recarregar agora.");
    } finally {
      setSaving(false);
    }
  }

  async function retryEnrichment() {
    if (!product?.id || saving || enrichmentRetrying) return;
    setEnrichmentRetrying(true);
    setError(null);
    try {
      const status = await requestEnrichment(product.id);
      setEnrichmentStatus(status);
      setSuccess(status === "completed" ? "Enriquecimento concluído. Revise os dados externos." : "Enriquecimento solicitado. Os dados manuais continuam disponíveis.");
    } catch (caught) {
      setEnrichmentStatus("unavailable");
      setError(caught instanceof ProductApiError ? caught.message : "Não foi possível tentar o enriquecimento agora.");
    } finally {
      setEnrichmentRetrying(false);
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
          <p className={styles.eyebrow}>Fatos do produto</p>
          <h2 id="product-facts-title">Comece pelo que você já sabe</h2>
          <p>Nome e descrição bastam para salvar agora. Os detalhes podem entrar depois.</p>
        </div>
        <Field error={combinedErrors.name} label="Nome do produto" name="name" onChange={(value) => updateField("name", value)} required value={draft.name} />
        <Field error={combinedErrors.description} label="Descrição" name="description" multiline onChange={(value) => updateField("description", value)} required value={draft.description} />
        <div className={styles.grid}>
          <Field error={combinedErrors.category} label="Categoria" name="category" onChange={(value) => updateField("category", value)} value={draft.category} />
          <Field error={combinedErrors.price} help="Use reais, por exemplo 39,90." inputMode="decimal" label="Preço (BRL)" name="price" onChange={(value) => updateField("price", value)} value={draft.price} />
        </div>
        <Field error={combinedErrors.characteristics} help="Uma característica por linha." label="Características" multiline name="characteristics" onChange={(value) => updateField("characteristics", value)} value={draft.characteristics} />
        <Field error={combinedErrors.observations} label="Observações" multiline name="observations" onChange={(value) => updateField("observations", value)} value={draft.observations} />
        <Field error={combinedErrors.imageReferences} help="Uma referência http(s) por linha. Nenhum arquivo é enviado aqui." label="Referências de imagens" multiline name="imageReferences" onChange={(value) => updateField("imageReferences", value)} value={draft.imageReferences} />
        <Field error={combinedErrors.url} help="Opcional. O enriquecimento não bloqueia o salvamento manual." label="URL do produto" name="url" onChange={(value) => updateField("url", value)} type="url" value={draft.url} />
      </section>

      <section aria-labelledby="product-context-title" className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Contexto estratégico · pt-BR</p>
          <h2 id="product-context-title">Dê direção ao próximo passo</h2>
          <p>Essas informações ficam ligadas ao produto. Nenhuma estratégia é iniciada aqui.</p>
        </div>
        <div className={styles.grid}>
          <Field error={combinedErrors.objective} label="Objetivo" name="objective" onChange={(value) => updateField("objective", value)} value={draft.objective} />
          <Field error={combinedErrors.audience} label="Público" name="audience" onChange={(value) => updateField("audience", value)} value={draft.audience} />
          <Field error={combinedErrors.style} label="Estilo de conteúdo" name="style" onChange={(value) => updateField("style", value)} value={draft.style} />
          <Field error={combinedErrors.presence} label="Presença do creator" name="presence" onChange={(value) => updateField("presence", value)} value={draft.presence} />
          <Field error={combinedErrors.experience} label="Experiência com o produto" name="experience" onChange={(value) => updateField("experience", value)} value={draft.experience} />
          <Field error={combinedErrors.market} label="Mercado" name="market" onChange={(value) => updateField("market", value)} value={draft.market} />
        </div>
        <Field error={combinedErrors.restrictions} label="Restrições" multiline name="restrictions" onChange={(value) => updateField("restrictions", value)} value={draft.restrictions} />
        <Field error={combinedErrors.contextObservations} label="Observações do contexto" multiline name="contextObservations" onChange={(value) => updateField("contextObservations", value)} value={draft.contextObservations} />
      </section>

      {isEdit && product?.url && (
        <section aria-busy={enrichmentStatus === "pending"} aria-labelledby="enrichment-title" className={styles.enrichment}>
          <div>
            <p className={styles.eyebrow}>Enriquecimento opcional</p>
            <h2 id="enrichment-title">Dados externos não substituem seus fatos</h2>
            <p>
              {enrichmentStatus === "pending" && "A tentativa está em andamento. Você pode salvar manualmente."}
              {enrichmentStatus === "completed" && "A tentativa foi concluída. Revise qualquer informação antes de usar."}
              {enrichmentStatus === "unavailable" && "Não foi possível enriquecer agora. O produto manual continua completo."}
            </p>
          </div>
          {enrichmentStatus === "unavailable" && <button className={styles.secondaryButton} disabled={saving || enrichmentRetrying} onClick={retryEnrichment} type="button">{enrichmentRetrying ? "Tentando…" : "Tentar novamente"}</button>}
        </section>
      )}

      {isEdit && readyForStrategy && (
        <section aria-labelledby="ready-title" className={styles.ready} role="status">
          <p className={styles.eyebrow}>Próxima etapa</p>
          <h2 id="ready-title">Produto pronto para gerar estratégia</h2>
          <p>Os fatos e o contexto pt-BR estão salvos. A próxima etapa é gerar estratégia e plano.</p>
        </section>
      )}

      <div className={styles.submitBar}>
        <button className={styles.primaryButton} disabled={saving} type="submit">
          {actionLabel}
        </button>
        {isEdit && product && <Link className={styles.cancelLink} href="/products">Voltar para Produtos</Link>}
      </div>
    </form>
  );
}
