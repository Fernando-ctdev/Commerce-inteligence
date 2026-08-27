"use client";

import { useEffect, type ChangeEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";

import type { ProductCandidateDraft, ProductCandidateFieldErrors, ProductImportRecord } from "./product-import-model";
import styles from "./product-candidate-modal.module.css";

export function candidateFieldId(name: keyof ProductCandidateDraft) {
  return `candidate-${name}`;
}

function CandidateField({ name, label, value, onChange, error, required = false, multiline = false, inputMode }: { name: keyof ProductCandidateDraft; label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; multiline?: boolean; inputMode?: "decimal" }) {
  const id = candidateFieldId(name);
  const errorId = `${id}-error`;
  const Control = multiline ? "textarea" : "input";
  return <div className={styles.field}><label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label><Control aria-describedby={error ? errorId : undefined} aria-invalid={Boolean(error)} id={id} inputMode={inputMode} name={name} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value)} required={required} rows={multiline ? 4 : undefined} value={value} />{error && <p className={styles.error} id={errorId} role="alert">{error}</p>}</div>;
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
  onConfirm: () => void;
};

export function ProductCandidateModal({ candidate, candidateErrors, candidateDialogRef, busy, error, mode = "candidate", previewImage, record, onChange, onCancel, onConfirm }: ProductCandidateModalProps) {
  const hasCandidateErrors = Object.keys(candidateErrors).length > 0;
  const isManual = mode === "manual";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => candidateDialogRef.current?.querySelector<HTMLElement>("[data-candidate-focus]")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [candidateDialogRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !candidateDialogRef.current) return;
    const focusable = Array.from(candidateDialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], select:not(:disabled), [tabindex]:not([tabindex='-1'])"));
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

  return <div className={styles.backdrop} role="presentation">
    <div aria-describedby="candidate-description" aria-labelledby="candidate-title" aria-modal="true" className={styles.dialog} onKeyDown={handleKeyDown} ref={candidateDialogRef} role="dialog">
      <div className={styles.header}>
        <div><p className={styles.eyebrow}>{isManual ? "Entrada manual" : "Candidate não confirmado"}</p><h2 data-candidate-focus id="candidate-title" tabIndex={-1}>{isManual ? "Adicionar produto" : "Produto encontrado"}</h2></div>
        <button aria-label="Fechar revisão" className={styles.closeButton} disabled={busy} onClick={onCancel} type="button">Fechar</button>
      </div>
      <p className={styles.disclaimer} id="candidate-description">{isManual ? "Informe os fatos que você conhece. Você pode completar os demais dados depois." : "Confira e corrija os fatos antes de continuar. Esta revisão ainda não criou um Product ativo."}</p>
      {record?.gaps && record.gaps.length > 0 && <div className={styles.gaps} role="status"><strong>Lacunas para revisar</strong><ul>{record.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></div>}
      <div className={styles.body}>
        <div className={styles.previewColumn}>
          {previewImage ? <div aria-label="Imagem de identificação do produto" className={styles.preview}>
            {/* External image references are intentionally rendered as-is; next/image would require an unbounded remote host allowlist. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={candidate.name ? `Imagem de ${candidate.name}` : "Imagem do produto encontrado"} loading="lazy" src={previewImage} />
          </div> : <div aria-label="Imagem de identificação do produto" className={styles.previewEmpty}>Sem imagem disponível</div>}
          <p className={styles.previewHint}>Imagem usada somente para confirmar se o produto foi compreendido corretamente.</p>
        </div>
        <form aria-busy={busy} className={styles.form} noValidate onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onConfirm(); }}>
          <CandidateField error={candidateErrors.name} label="Nome do produto" name="name" onChange={(value) => onChange("name", value)} required value={candidate.name} />
          <CandidateField error={candidateErrors.description} label="Descrição" multiline name="description" onChange={(value) => onChange("description", value)} required value={candidate.description} />
          {isManual ? <>
            <div className={styles.grid}><CandidateField error={candidateErrors.category} label="Categoria" name="category" onChange={(value) => onChange("category", value)} value={candidate.category} /><CandidateField error={candidateErrors.price} inputMode="decimal" label="Preço" name="price" onChange={(value) => onChange("price", value)} value={candidate.price} /><CandidateField error={candidateErrors.currency} label="Moeda" name="currency" onChange={(value) => onChange("currency", value)} value={candidate.currency} /></div>
            <CandidateField error={candidateErrors.features} label="Características — uma por linha" multiline name="features" onChange={(value) => onChange("features", value)} value={candidate.features} />
            <CandidateField label="Observações" multiline name="variants" onChange={(value) => onChange("variants", value)} value={candidate.variants} />
            <CandidateField error={candidateErrors.images} label="Referências de imagens — uma URL por linha" multiline name="images" onChange={(value) => onChange("images", value)} value={candidate.images} />
            <CandidateField error={candidateErrors.sourceUrl} label="URL do produto" name="sourceUrl" onChange={(value) => onChange("sourceUrl", value)} value={candidate.sourceUrl} />
          </> : <>
            <div className={styles.grid}><CandidateField error={candidateErrors.category} label="Categoria" name="category" onChange={(value) => onChange("category", value)} value={candidate.category} /><CandidateField error={candidateErrors.brand} label="Marca" name="brand" onChange={(value) => onChange("brand", value)} value={candidate.brand} /><CandidateField error={candidateErrors.seller} label="Seller" name="seller" onChange={(value) => onChange("seller", value)} value={candidate.seller} /><CandidateField error={candidateErrors.price} inputMode="decimal" label="Preço" name="price" onChange={(value) => onChange("price", value)} value={candidate.price} /><CandidateField error={candidateErrors.currency} label="Moeda" name="currency" onChange={(value) => onChange("currency", value)} value={candidate.currency} /></div>
            <CandidateField error={candidateErrors.features} label="Características — uma por linha" multiline name="features" onChange={(value) => onChange("features", value)} value={candidate.features} />
            <CandidateField error={candidateErrors.variants} label="Variantes — uma por linha" multiline name="variants" onChange={(value) => onChange("variants", value)} value={candidate.variants} />
            <CandidateField error={candidateErrors.images} label="Imagens — uma URL por linha" multiline name="images" onChange={(value) => onChange("images", value)} value={candidate.images} />
          </>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          {hasCandidateErrors && <p className={styles.help} role="alert">Corrija os fatos destacados antes de continuar.</p>}
          <div className={styles.actions}><button className={styles.secondaryButton} disabled={busy} onClick={onCancel} type="button">Cancelar</button><button className={styles.primaryButton} disabled={busy} type="submit">{busy ? "Continuar — confirmando" : "Continuar"}</button></div>
        </form>
      </div>
      <p className={styles.source}><strong>Origem</strong> <span>{candidate.sourceUrl}</span></p>
    </div>
  </div>;
}
