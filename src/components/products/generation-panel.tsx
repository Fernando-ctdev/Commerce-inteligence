"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { cancelGeneration, createGenerationIdempotencyKey, GenerationApiError, getGeneration, getLatestGeneration, isCompleteGenerationResult, rememberGeneration, retryGeneration, startGeneration, type GenerationRecord } from "./generation-api";
import { contentDimensionLabels, generationStatusLabel, generationStatusMessage, isActiveGeneration, isCapacityUnavailableError, isLimitError, isRetryableGeneration } from "./generation-ui-model";
import styles from "./generation-panel.module.css";

const CLOSED_DISCLOSURE = { strategy: false, plan: false, provenance: false };
const ANALYSIS_LABELS: Array<[string, string]> = [
  ["functional_benefits", "Benefícios funcionais"],
  ["emotional_benefits", "Benefícios emocionais"],
  ["differentiators", "Diferenciais"],
  ["relevant_characteristics", "Características relevantes"],
  ["use_cases", "Casos de uso"],
  ["usage_context", "Contexto de uso"],
  ["purchase_triggers", "Gatilhos de compra"],
  ["purchase_barriers", "Barreiras de compra"],
  ["communication_risks", "Riscos de comunicação"],
  ["sales_arguments", "Argumentos de venda"],
];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function ErrorMessage({ id, children }: { id: string; children: string }) {
  return <p className={styles.error} id={id} role="alert">{children}</p>;
}

export function GenerationPanel({ productId, readyForStrategy }: { productId: string; readyForStrategy: boolean }) {
  const [quantity, setQuantity] = useState("1");
  const [objective, setObjective] = useState("");
  const [generation, setGeneration] = useState<GenerationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [restoring, setRestoring] = useState(readyForStrategy);
  const [restoreError, setRestoreError] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [disclosure, setDisclosure] = useState(CLOSED_DISCLOSURE);
  const startKey = useRef<string | undefined>(undefined);
  const retryKey = useRef<string | undefined>(undefined);
  const quantityRef = useRef<HTMLInputElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const cancelTrigger = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);

  function adoptGeneration(next: GenerationRecord) {
    rememberGeneration(productId, next.id);
    setGeneration(next);
  }

  useEffect(() => {
    if (!readyForStrategy) return;
    let disposed = false;
    void getLatestGeneration(productId).then((next) => {
      if (disposed) return;
      if (next) rememberGeneration(productId, next.id);
      setGeneration(next);
      setRestoreError(false);
      setError(null);
      setErrorCode(null);
    }).catch((caught) => {
      if (disposed) return;
      setGeneration(null);
      setRestoreError(true);
      setError(caught instanceof GenerationApiError ? caught.message : "Não foi possível restaurar a geração deste produto.");
      setErrorCode(caught instanceof GenerationApiError ? caught.code ?? "restore" : "restore");
    }).finally(() => {
      if (!disposed) setRestoring(false);
    });
    return () => {
      disposed = true;
    };
  }, [productId, readyForStrategy, restoreAttempt]);

  useEffect(() => {
    const id = generation?.id;
    if (!id || !isActiveGeneration(generation?.status)) return;

    let disposed = false;
    let timer: number | undefined;
    const refresh = async () => {
      try {
        const next = await getGeneration(id);
        if (disposed) return;
        rememberGeneration(productId, next.id);
        setGeneration(next);
        setError(null);
        setErrorCode(null);
        if (isActiveGeneration(next.status)) timer = window.setTimeout(() => void refresh(), 1200);
      } catch (caught) {
        if (!disposed) {
          setError(caught instanceof GenerationApiError ? caught.message : "Não foi possível acompanhar esta geração agora.");
          setErrorCode(caught instanceof GenerationApiError ? caught.code ?? "polling" : "polling");
        }
      }
    };

    timer = window.setTimeout(() => void refresh(), 1200);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [generation?.id, generation?.status, productId]);

  useEffect(() => {
    if (!confirmCancel) return;
    dialogRef.current?.focus();
  }, [confirmCancel]);

  function focusStatus() {
    requestAnimationFrame(() => statusHeadingRef.current?.focus());
  }

  function focusFormError(errors: Record<string, string>, code: string | null) {
    requestAnimationFrame(() => {
      if (errors.quantity || code === "generation_capacity") quantityRef.current?.focus();
      else if (errors.objective) objectiveRef.current?.focus();
      else quantityRef.current?.focus();
    });
  }

  function showError(caught: unknown, fallback: string, focusForm = false) {
    const apiError = caught instanceof GenerationApiError ? caught : null;
    const nextCode = apiError?.code ?? null;
    const nextFieldErrors = apiError?.fieldErrors ?? {};
    setError(apiError?.message ?? fallback);
    setErrorCode(nextCode);
    setFieldErrors(nextFieldErrors);
    if (nextCode === "generation_capacity" || nextCode === "capacity_unavailable") startKey.current = undefined;
    if (focusForm) focusFormError(nextFieldErrors, nextCode);
    else focusStatus();
  }

  function changeQuantity(value: string) {
    setQuantity(value);
    startKey.current = undefined;
    setError(null);
    setErrorCode(null);
    setFieldErrors({});
  }

  function changeObjective(value: string) {
    setObjective(value);
    startKey.current = undefined;
    setError(null);
    setErrorCode(null);
    setFieldErrors({});
  }

  function retryRestore() {
    setError(null);
    setErrorCode(null);
    setRestoreError(false);
    setRestoring(true);
    setRestoreAttempt((attempt) => attempt + 1);
  }

  async function create(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy) return;
    if (isLimitError(errorCode)) {
      quantityRef.current?.focus();
      return;
    }

    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      const nextErrors = { quantity: "Informe uma quantidade inteira entre 1 e 50." };
      setError(nextErrors.quantity);
      setErrorCode("validation");
      setFieldErrors(nextErrors);
      focusFormError(nextErrors, "validation");
      return;
    }

    setBusy(true);
    setError(null);
    setErrorCode(null);
    setFieldErrors({});
    startKey.current ??= createGenerationIdempotencyKey();
    try {
      const next = await startGeneration(productId, parsed, objective, startKey.current);
      startKey.current = undefined;
      adoptGeneration(next);
    } catch (caught) {
      showError(caught, "Não foi possível iniciar a geração. Seus valores continuam nesta tela.", true);
    } finally {
      setBusy(false);
    }
  }

  async function follow() {
    if (!generation || checking) return;
    setChecking(true);
    setError(null);
    setErrorCode(null);
    try {
      adoptGeneration(await getGeneration(generation.id));
    } catch (caught) {
      showError(caught, "Não foi possível acompanhar esta geração agora.");
    } finally {
      setChecking(false);
    }
  }

  async function cancel() {
    if (!generation) return;
    setBusy(true);
    setError(null);
    try {
      const next = await cancelGeneration(generation.id);
      adoptGeneration(next);
      setConfirmCancel(false);
      focusStatus();
    } catch (caught) {
      showError(caught, "Não foi possível cancelar agora.");
      dialogRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!generation || busy) return;
    setBusy(true);
    setError(null);
    setErrorCode(null);
    retryKey.current ??= createGenerationIdempotencyKey();
    try {
      const next = await retryGeneration(generation.id, retryKey.current);
      retryKey.current = undefined;
      adoptGeneration(next);
      setDisclosure(CLOSED_DISCLOSURE);
    } catch (caught) {
      showError(caught, "Não foi possível tentar novamente agora.");
    } finally {
      setBusy(false);
    }
  }

  function closeCancelDialog() {
    setConfirmCancel(false);
    requestAnimationFrame(() => cancelTrigger.current?.focus());
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCancelDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!readyForStrategy) {
    return <section aria-labelledby="generation-title" className={styles.panel}><div className={styles.heading}><p className={styles.eyebrow}>Próxima etapa</p><h2 id="generation-title">Complete o contexto antes de gerar</h2><p>Fatos e contexto pt-BR precisam estar salvos para orientar a primeira estratégia.</p></div><Link className={styles.link} href="#product-context-title">Completar contexto do produto</Link></section>;
  }

  if (restoring) {
    return <section aria-busy="true" aria-labelledby="generation-title" className={styles.panel}><div className={styles.heading}><p className={styles.eyebrow}>Primeira geração</p><h2 id="generation-title">Gerar estratégia e plano</h2><p>Consultando o estado salvo deste produto.</p></div><div aria-live="polite" className={styles.state} role="status"><p>Restaurando a última geração…</p></div></section>;
  }

  if (!generation && restoreError) {
    return <section aria-labelledby="generation-title" className={styles.panel}><div className={styles.heading}><p className={styles.eyebrow}>Primeira geração</p><h2 id="generation-title">Não foi possível restaurar a geração</h2><p>O estado salvo do produto não foi confirmado. Tente consultar novamente antes de iniciar outra geração.</p></div><ErrorMessage id="generation-restore-error">{error ?? "Não foi possível restaurar a geração deste produto."}</ErrorMessage><div className={styles.actions}><button className={styles.button} onClick={retryRestore} type="button">Tentar novamente</button></div></section>;
  }

  const active = isActiveGeneration(generation?.status);
  const incompleteSucceeded = generation?.status === "succeeded" && !isCompleteGenerationResult(generation);
  const submitLabel = isLimitError(errorCode) ? "Ajustar quantidade" : isCapacityUnavailableError(errorCode) ? "Tentar novamente" : busy ? "Gerar estratégia e plano — solicitando" : "Gerar estratégia e plano";

  return (
    <section aria-busy={busy || active} aria-labelledby="generation-title" className={styles.panel}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Primeira geração</p>
        <h2 id="generation-title">Gerar estratégia e plano</h2>
        <p>Receba uma estratégia comercial, um plano e conteúdos graváveis para este produto.</p>
      </div>

      {!generation && <form className={styles.form} onSubmit={(event) => void create(event)}>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor="generation-quantity">Quantidade de conteúdos</label>
            <input aria-describedby={[fieldErrors.quantity ? "generation-quantity-error" : null, error ? "generation-error" : null].filter(Boolean).join(" ") || undefined} aria-invalid={fieldErrors.quantity ? true : undefined} disabled={busy} id="generation-quantity" inputMode="numeric" max="50" min="1" onChange={(event) => changeQuantity(event.target.value)} ref={quantityRef} type="number" value={quantity} />
            {fieldErrors.quantity && <ErrorMessage id="generation-quantity-error">{fieldErrors.quantity}</ErrorMessage>}
          </div>
          <div className={styles.field}>
            <label htmlFor="generation-objective">Objetivo desta geração (opcional)</label>
            <textarea aria-describedby={[fieldErrors.objective ? "generation-objective-error" : null, error ? "generation-error" : null].filter(Boolean).join(" ") || undefined} aria-invalid={fieldErrors.objective ? true : undefined} disabled={busy} id="generation-objective" maxLength={5000} onChange={(event) => changeObjective(event.target.value)} ref={objectiveRef} value={objective} />
            {fieldErrors.objective && <ErrorMessage id="generation-objective-error">{fieldErrors.objective}</ErrorMessage>}
          </div>
        </div>
        {error && <ErrorMessage id="generation-error">{error}</ErrorMessage>}
        <div className={styles.actions}><button className={styles.button} disabled={busy} type="submit">{submitLabel}</button></div>
      </form>}

      {generation && <div aria-live="polite" className={styles.state} role="status">
        <h3 ref={statusHeadingRef} tabIndex={-1}>{incompleteSucceeded ? "Resultado indisponível" : generationStatusLabel(generation.status)}</h3>
        <p>{incompleteSucceeded ? "A resposta não contém Strategy, Plan e Contents completos. Nenhum resultado será exibido como sucesso." : generationStatusMessage(generation.status, generation.quantity)}</p>
        {generation.objective && <p>Objetivo: {generation.objective}</p>}
        {isRetryableGeneration(generation.status) && generation.error && <ErrorMessage id="generation-run-error">{generation.error}</ErrorMessage>}
        {error && <ErrorMessage id="generation-state-error">{error}</ErrorMessage>}
        <div className={styles.actions}>
          {incompleteSucceeded && <><ErrorMessage id="generation-incomplete-error">O estado salvo precisa ser consultado novamente.</ErrorMessage><button className={styles.button} disabled={busy || checking} onClick={() => void follow()} type="button">{checking ? "Acompanhar geração — consultando" : "Acompanhar geração"}</button></>}
          {!incompleteSucceeded && active && <>
            <button className={styles.button} disabled={busy || checking} onClick={() => void follow()} type="button">{checking ? "Acompanhar geração — consultando" : "Acompanhar geração"}</button>
            <button aria-haspopup="dialog" className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => setConfirmCancel(true)} ref={cancelTrigger} type="button">Cancelar geração</button>
          </>}
          {!incompleteSucceeded && isRetryableGeneration(generation.status) && <button className={styles.button} disabled={busy} onClick={() => void retry()} type="button">Tentar novamente</button>}
          {!incompleteSucceeded && generation.status === "succeeded" && <Link className={styles.link} href="#generated-contents">Ver conteúdos gerados</Link>}
        </div>
      </div>}

      {generation?.status === "succeeded" && !incompleteSucceeded && (() => {
        const analysis = record(generation.strategy?.analysis);
        const distribution = Array.isArray(generation.plan?.distribution) ? generation.plan.distribution.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) : [];
        return <div aria-labelledby="generated-contents-title" className={styles.result} id="generated-contents">
          <div className={styles.resultSummary}><h3 id="generated-contents-title">Resultado desta geração</h3><p>{generation.quantity} conteúdos completos, vinculados a este produto.</p></div>
          <details className={styles.disclosure} onToggle={(event) => setDisclosure((current) => ({ ...current, strategy: (event.currentTarget as HTMLDetailsElement).open }))} open={disclosure.strategy}><summary>Estratégia útil</summary><p>{text(analysis.problem)}</p>{ANALYSIS_LABELS.map(([key, label]) => { const values = strings(analysis[key]); return values.length ? <div className={styles.detailBlock} key={key}><strong>{label}</strong><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></div> : null; })}</details>
          <details className={styles.disclosure} onToggle={(event) => setDisclosure((current) => ({ ...current, plan: (event.currentTarget as HTMLDetailsElement).open }))} open={disclosure.plan}><summary>Plano e distribuição</summary><p>{text(generation.plan?.explanation)}</p>{distribution.length > 0 && <ul className={styles.distribution}>{distribution.map((item, index) => <li key={`${text(item.dimension_id)}-${index}`}><strong>{text(item.dimension_id) || "Dimensão"}</strong><span>{typeof item.quantity === "number" ? `${item.quantity} conteúdos` : "Quantidade registrada"}</span><p>{text(item.rationale)}</p></li>)}</ul>}</details>
          <details className={styles.disclosure} onToggle={(event) => setDisclosure((current) => ({ ...current, provenance: (event.currentTarget as HTMLDetailsElement).open }))} open={disclosure.provenance}><summary>Explicação e proveniência</summary><p>O resultado permanece vinculado a esta geração e a este produto.</p><p>Geração: {generation.id}</p><p>Taxonomia: {text(generation.provenance?.taxonomy_version) || "versão registrada"}</p>{text(generation.provenance?.engine_version) && <p>Motor: {text(generation.provenance?.engine_version)}</p>}</details>
          <ul className={styles.list}>{generation.contents.map((content, index) => { const scenes = strings(content.scenes); const dimensions = contentDimensionLabels(generation.strategy, content); return <li className={styles.contentItem} key={text(content.id) || index}><strong>{text(content.hook)}</strong><div aria-label="Dimensões do conteúdo" className={styles.dimensions}><p><strong>Público</strong><span>{dimensions.audience}</span></p><p><strong>Dor</strong><span>{dimensions.pain}</span></p><p><strong>Desejo/benefício</strong><span>{dimensions.desire} · {dimensions.benefit}</span></p>{dimensions.objection && <p><strong>Objeção</strong><span>{dimensions.objection}</span></p>}<p><strong>Ângulo</strong><span>{dimensions.angle}</span></p></div><p><strong>Estrutura:</strong> {text(content.structure)}</p><p><strong>Roteiro:</strong> {text(content.script)}</p>{scenes.length > 0 && <div><strong>Cenas:</strong><ol>{scenes.map((scene) => <li key={scene}>{scene}</li>)}</ol></div>}<p><strong>CTA:</strong> {text(content.cta)}</p><p><strong>Explicação:</strong> {text(content.explanation)}</p></li>; })}</ul>
        </div>;
      })()}

      {confirmCancel && <div className={styles.dialogBackdrop}><div aria-describedby="cancel-description" aria-labelledby="cancel-title" aria-modal="true" className={styles.dialog} onKeyDown={handleDialogKeyDown} ref={dialogRef} role="dialog" tabIndex={-1}><h3 id="cancel-title">Cancelar geração?</h3><p id="cancel-description">Nenhum conteúdo parcial será apresentado. Você poderá tentar novamente depois.</p>{error && <ErrorMessage id="cancel-error">{error}</ErrorMessage>}<div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={closeCancelDialog} type="button">Continuar gerando</button><button className={styles.button} disabled={busy} onClick={() => void cancel()} type="button">Cancelar geração</button></div></div></div>}
    </section>
  );
}
