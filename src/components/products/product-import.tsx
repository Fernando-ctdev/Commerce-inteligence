"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { createIdempotencyKey } from "./product-create-model";
import { createProduct, ProductApiError } from "./product-api";
import {
  cancelProductImport,
  confirmProductImport,
  getProductImport,
  ProductImportApiError,
  resumeProductImport,
  retryProductImport,
  startProductImport,
} from "./product-import-api";
import { buildProductPayload, type ProductDraft } from "./product-form-model";
import {
  candidateCanBeConfirmed,
  candidateDraftFromCandidate,
  candidateFromDraft,
  contentPreparationPreferencesAreValid,
  importStateAllowsCancel,
  importStateAllowsRetry,
  productImportCanResume,
  productImportAllowsManualFallback,
  productImportErrorMessage,
  productImportShouldPoll,
  productImportShowsInteractiveBrowser,
  productImportStateLabel,
  type CandidateValidationOptions,
  type ContentPreparationPreferences,
  type ProductCandidateDraft,
  type ProductCandidateFieldErrors,
  type ProductImportRecord,
  type ProductImportState,
  validateCandidateDraft,
  validateProductImportUrl,
} from "./product-import-model";
import {
  candidateFieldId,
  ProductCandidateModal,
} from "./product-candidate-modal";
import styles from "./product-import.module.css";

type ProductImportProps = {
  onCreated: (productId: string) => void;
};

const interactionStates: ProductImportState[] = [
  "LOGIN_REQUIRED",
  "CAPTCHA_REQUIRED",
  "2FA_REQUIRED",
  "USER_INTERACTION_REQUIRED",
];
const activeStates: ProductImportState[] = [
  "OPENING",
  "LOGIN_REQUIRED",
  "CAPTCHA_REQUIRED",
  "2FA_REQUIRED",
  "USER_INTERACTION_REQUIRED",
  "PAUSED",
  "EXTRACTING",
];

function errorMessage(caught: unknown) {
  if (caught instanceof ProductImportApiError) {
    return (
      caught.message.trim() ||
      productImportErrorMessage(caught.code) ||
      "Não foi possível analisar este produto. Seus dados continuam nesta tela; tente novamente."
    );
  }
  return "Não foi possível analisar este produto. Seus dados continuam nesta tela; tente novamente.";
}

function stateForApiError(caught: unknown): ProductImportState {
  if (!(caught instanceof ProductImportApiError)) return "ERROR";
  const code = caught.code?.toLowerCase();
  if (code === "product_limit_reached") return "LIMIT";
  if (
    [
      "profile_unavailable",
      "browser_service_unavailable",
      "capacity_unavailable",
    ].includes(code ?? "")
  )
    return "PROFILE_UNAVAILABLE";
  return "ERROR";
}

function safePreviewImage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

const emptyManualCandidate: ProductCandidateDraft = {
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

export function ProductImport({ onCreated }: ProductImportProps) {
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [record, setRecord] = useState<ProductImportRecord | null>(null);
  const [state, setState] = useState<ProductImportState>("IDLE");
  const [candidate, setCandidate] = useState<ProductCandidateDraft | null>(
    null,
  );
  const [manualCandidate, setManualCandidate] =
    useState<ProductCandidateDraft>(emptyManualCandidate);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const importKey = useRef<string | undefined>(undefined);
  const manualKey = useRef<string | undefined>(undefined);
  const statusRef = useRef<HTMLHeadingElement>(null);
  const analyzeTrigger = useRef<HTMLButtonElement>(null);
  const candidateTrigger = useRef<HTMLButtonElement>(null);
  const candidateDialogRef = useRef<HTMLDivElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const operationVersionRef = useRef(0);
  const operationInFlightRef = useRef<number | null>(null);
  const operationKindRef = useRef<"poll" | "action" | null>(null);
  const pollAbortControllerRef = useRef<AbortController | null>(null);
  const pollStoppedRef = useRef(false);

  function beginOperation(kind: "poll" | "action" = "action") {
    if (operationInFlightRef.current !== null) return null;
    const version = ++operationVersionRef.current;
    operationInFlightRef.current = version;
    operationKindRef.current = kind;
    return version;
  }

  function operationIsCurrent(version: number) {
    return operationInFlightRef.current === version && operationVersionRef.current === version;
  }

  function finishOperation(version: number) {
    if (operationInFlightRef.current === version) {
      operationInFlightRef.current = null;
      operationKindRef.current = null;
    }
  }

  function stopPollingForAction() {
    if (operationKindRef.current !== "poll") return;
    pollStoppedRef.current = true;
    pollAbortControllerRef.current?.abort();
    pollAbortControllerRef.current = null;
    operationVersionRef.current += 1;
    operationInFlightRef.current = null;
    operationKindRef.current = null;
  }

  function focusStatus() {
    requestAnimationFrame(() => statusRef.current?.focus());
  }

  function announce(nextState: ProductImportState) {
    setState(nextState);
    focusStatus();
  }

  function adopt(next: ProductImportRecord) {
    setRecord(next);
    setState(next.state);
    setUrl(next.sourceUrl);
    setError(
      next.error?.trim() ||
        productImportErrorMessage(next.errorCode) ||
        (next.state === "ERROR"
          ? "Não foi possível concluir a análise deste produto. Tente novamente."
          : null),
    );
    setCandidate(
      next.candidate ? candidateDraftFromCandidate(next.candidate) : null,
    );
    setCandidateOpen(next.state === "READY" && Boolean(next.candidate));
  }

  useEffect(() => {
    if (!candidateOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [candidateOpen]);

  function closeCandidateReview() {
    setCandidateOpen(false);
    requestAnimationFrame(() => candidateTrigger.current?.focus());
  }

  function openManualEntry() {
    setManual(true);
    setManualError(null);
    setCandidateOpen(true);
  }

  function closeManualEntry() {
    setCandidateOpen(false);
    setManual(false);
    requestAnimationFrame(() => analyzeTrigger.current?.focus());
  }

  useEffect(() => {
    if (!record || !productImportShouldPoll(state) || busy) return;
    pollStoppedRef.current = false;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      if (disposed) return;
      const version = beginOperation("poll");
      if (version === null) {
        timer = window.setTimeout(() => void poll(), 1500);
        return;
      }
      const controller = new AbortController();
      pollAbortControllerRef.current = controller;
      try {
        const next = await getProductImport(record.id, controller.signal);
        if (!disposed && operationIsCurrent(version)) adopt(next);
      } catch (caught) {
        if (!disposed && operationIsCurrent(version)) setError(errorMessage(caught));
      } finally {
        if (pollAbortControllerRef.current === controller) {
          pollAbortControllerRef.current = null;
        }
        finishOperation(version);
        if (!disposed && !pollStoppedRef.current)
          timer = window.setTimeout(() => void poll(), 1500);
      }
    };
    timer = window.setTimeout(() => void poll(), 1500);
    return () => {
      disposed = true;
      pollStoppedRef.current = true;
      pollAbortControllerRef.current?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [record, state, busy]);

  async function analyze() {
    const validationError = validateProductImportUrl(url);
    if (validationError) {
      setUrlError(validationError);
      announce("ERROR");
      requestAnimationFrame(() => urlInput.current?.focus());
      return;
    }
    if (busy) return;
    const version = beginOperation();
    if (version === null) return;
    setUrlError(null);
    setError(null);
    setBusy(true);
    announce("OPENING");
    importKey.current ??= createIdempotencyKey();
    try {
      const next = await startProductImport(url.trim(), importKey.current);
      if (operationIsCurrent(version)) adopt(next);
      importKey.current = undefined;
    } catch (caught) {
      if (operationIsCurrent(version)) {
        setState(stateForApiError(caught));
        setError(errorMessage(caught));
        focusStatus();
      }
    } finally {
      finishOperation(version);
      setBusy(false);
    }
  }

  async function cancel() {
    if (!record || busy) return;
    stopPollingForAction();
    const version = beginOperation();
    if (version === null) return;
    setBusy(true);
    setError(null);
    try {
      const next = await cancelProductImport(record.id);
      if (operationIsCurrent(version)) {
        adopt(next);
        focusStatus();
      }
    } catch (caught) {
      if (operationIsCurrent(version)) {
        setState(stateForApiError(caught));
        setError(errorMessage(caught));
        focusStatus();
      }
    } finally {
      finishOperation(version);
      setBusy(false);
    }
  }

  async function retry() {
    if (!record || busy) return;
    const version = beginOperation();
    if (version === null) return;
    setBusy(true);
    setError(null);
    announce("OPENING");
    importKey.current ??= createIdempotencyKey();
    try {
      const next = await retryProductImport(record.id, importKey.current);
      if (operationIsCurrent(version)) adopt(next);
      importKey.current = undefined;
    } catch (caught) {
      if (operationIsCurrent(version)) {
        setState(stateForApiError(caught));
        setError(errorMessage(caught));
        focusStatus();
      }
    } finally {
      finishOperation(version);
      setBusy(false);
    }
  }

  async function checkStatus() {
    if (!record || checking || busy) return;
    const version = beginOperation();
    if (version === null) return;
    setChecking(true);
    setError(null);
    try {
      const next = await getProductImport(record.id);
      if (operationIsCurrent(version)) {
        adopt(next);
        focusStatus();
      }
    } catch (caught) {
      if (operationIsCurrent(version)) {
        setState(stateForApiError(caught));
        setError(errorMessage(caught));
        focusStatus();
      }
    } finally {
      finishOperation(version);
      setChecking(false);
    }
  }

  async function resume() {
    if (!record || busy) return;
    const version = beginOperation();
    if (version === null) return;
    setBusy(true);
    setError(null);
    announce("EXTRACTING");
    try {
      const next = await resumeProductImport(record.id);
      if (operationIsCurrent(version)) {
        adopt(next);
        focusStatus();
      }
    } catch (caught) {
      if (operationIsCurrent(version)) {
        setState(stateForApiError(caught));
        setError(errorMessage(caught));
        focusStatus();
      }
    } finally {
      finishOperation(version);
      setBusy(false);
    }
  }

  async function confirm(preferences?: ContentPreparationPreferences) {
    if (!record || !candidate || busy) return;
    if (!preferences || !contentPreparationPreferencesAreValid(preferences))
      return;
    const validationOptions: CandidateValidationOptions = {
      requireCompleteFacts: true,
      validateSourceUrl: false,
    };
    const validationErrors = validateCandidateDraft(
      candidate,
      validationOptions,
    );
    const firstError = Object.keys(validationErrors)[0] as
      | keyof ProductCandidateDraft
      | undefined;
    if (firstError) {
      requestAnimationFrame(() =>
        document.getElementById(candidateFieldId(firstError))?.focus(),
      );
      return;
    }
    if (!candidateCanBeConfirmed(candidate, validationOptions)) return;
    const version = beginOperation();
    if (version === null) return;
    setBusy(true);
    setError(null);
    announce("CONFIRMING");
    try {
      const result = await confirmProductImport(
        record.id,
        record.version,
        candidateFromDraft(candidate),
        preferences,
      );
      if (!operationIsCurrent(version)) return;
      if (result.duplicate) {
        setState("DUPLICATE");
        if (result.productId)
          setRecord((current) =>
            current ? { ...current, productId: result.productId } : current,
          );
      } else if (result.productId) {
        setState("CONFIRMED");
        setRecord((current) =>
          current ? { ...current, productId: result.productId } : current,
        );
      } else {
        setState("ERROR");
        setError(
          "A confirmação não retornou um produto válido. Tente consultar novamente.",
        );
      }
    } catch (caught) {
      if (operationIsCurrent(version)) {
        setState(stateForApiError(caught));
        setError(errorMessage(caught));
        focusStatus();
      }
    } finally {
      finishOperation(version);
      setBusy(false);
    }
  }

  async function createManualProduct() {
    const validationOptions: CandidateValidationOptions = {
      requireCompleteFacts: false,
    };
    const validationErrors = validateCandidateDraft(
      manualCandidate,
      validationOptions,
    );
    const firstError = Object.keys(validationErrors)[0] as
      | keyof ProductCandidateDraft
      | undefined;
    if (firstError) {
      requestAnimationFrame(() =>
        document.getElementById(candidateFieldId(firstError))?.focus(),
      );
      return;
    }
    if (!candidateCanBeConfirmed(manualCandidate, validationOptions) || busy)
      return;
    const version = beginOperation();
    if (version === null) return;
    setBusy(true);
    setManualError(null);
    manualKey.current ??= createIdempotencyKey();
    const draft: ProductDraft = {
      name: manualCandidate.name,
      description: manualCandidate.description,
      category: manualCandidate.category,
      seller: manualCandidate.seller,
      variants: manualCandidate.variants,
      price: manualCandidate.price,
      characteristics: manualCandidate.features,
      imageReferences: manualCandidate.images,
      observations: "",
      url: manualCandidate.sourceUrl,
    };
    try {
      const saved = await createProduct({
        ...buildProductPayload(draft, manualKey.current),
        priceCurrency: manualCandidate.currency.trim() || null,
      });
      if (!operationIsCurrent(version)) return;
      manualKey.current = undefined;
      onCreated(saved.id);
    } catch (caught) {
      if (!operationIsCurrent(version)) return;
      setManualError(
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível salvar agora. Seus dados continuam nesta tela; tente novamente.",
      );
    } finally {
      finishOperation(version);
      setBusy(false);
    }
  }

  function updateCandidate(name: keyof ProductCandidateDraft, value: string) {
    setCandidate((current) =>
      current ? { ...current, [name]: value } : current,
    );
  }

  const showCandidate =
    !manual &&
    state === "READY" &&
    candidate !== null &&
    record !== null &&
    candidateOpen;
  const showManualCandidate = manual && candidateOpen;
  const activeCandidate = manual ? manualCandidate : candidate;
  const candidateErrors: ProductCandidateFieldErrors = activeCandidate
    ? validateCandidateDraft(
        activeCandidate,
        manual
          ? { requireCompleteFacts: false }
          : {
              requireCompleteFacts: true,
              validateSourceUrl: false,
            },
      )
    : {};
  const showInteractive = productImportShowsInteractiveBrowser(
    state,
    record?.handoffExpired ? undefined : record?.interactiveUrl,
  );
  const canResume = productImportCanResume({
    state,
    handoffExpired: record?.handoffExpired === true,
    canResume: record?.canResume,
  });
  const previewImage = activeCandidate
    ? safePreviewImage(
        activeCandidate.images
          .split(/\r?\n/)
          .map((item) => item.trim())
          .find(Boolean) ?? "",
      )
    : undefined;

  return (
    <section
      aria-busy={busy || checking}
      aria-labelledby="product-import-title"
      className={styles.surface}
    >
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Entrada principal</p>
        <h2 id="product-import-title">Importar por URL</h2>
        <p>
          Cole o link do TikTok Shop. Encontramos os fatos do produto para você
          revisar antes de confirmar.
        </p>
      </div>

      <form
        aria-busy={busy}
        className={styles.urlArea}
        onSubmit={(event) => {
          event.preventDefault();
          void analyze();
        }}
      >
        <div className={styles.field}>
          <label htmlFor="product-url">URL do produto</label>
          <input
            aria-describedby={
              urlError ? "product-url-error" : "product-url-help"
            }
            aria-invalid={Boolean(urlError)}
            id="product-url"
            name="url"
            onChange={(event) => {
              setUrl(event.target.value);
              setUrlError(null);
            }}
            placeholder="Cole a URL de um produto do TikTok Shop…"
            ref={urlInput}
            type="url"
            value={url}
          />
          {urlError ? (
            <p className={styles.error} id="product-url-error" role="alert">
              {urlError}
            </p>
          ) : (
            <p className={styles.help} id="product-url-help">
              Use uma URL http(s), sem usuário ou senha.
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            disabled={
              busy || activeStates.includes(state) || state === "CONFIRMING"
            }
            ref={analyzeTrigger}
            type="submit"
          >
            {busy && state === "OPENING"
              ? "Analisar produto — abrindo"
              : "Analisar produto"}
          </button>
          <button
            className={styles.textButton}
            onClick={openManualEntry}
            type="button"
          >
            Adicionar manualmente
          </button>
        </div>
      </form>

      {state !== "IDLE" && (
        <div aria-live="polite" className={styles.state}>
          <h3 ref={statusRef} tabIndex={-1}>
            {productImportStateLabel(state)}
          </h3>
          {state === "OPENING" && (
            <p>
              A URL e a intenção estão preservadas enquanto o Browser Service
              abre o profile isolado.
            </p>
          )}
          {state === "EXTRACTING" && (
            <p>
              Os detalhes do browser permanecem ocultos. Aguarde a extração
              factual.
            </p>
          )}
          {state === "PAUSED" && (
            <p>
              Aguardando a verificação do Browser Service antes de retomar. A
              URL e o profile permanecem preservados.
            </p>
          )}
          {interactionStates.includes(state) && (
            <p>
              Resolva somente a etapa solicitada na janela do TikTok. A
              aplicação não recebe sua senha, código, cookie ou token.
            </p>
          )}
          {record?.handoffExpired && (
            <p className={styles.error} role="alert">
              A janela de interação expirou. Não é possível retomar esta
              análise; tente novamente ou adicione o produto manualmente.
            </p>
          )}
          {state === "CANCELLED" && (
            <p>
              A tentativa foi encerrada sem apagar a URL, a intenção ou o
              profile. Você pode tentar novamente ou adicionar manualmente.
            </p>
          )}
          {state === "CONFIRMING" && (
            <p>
              Seus valores permanecem preservados enquanto a confirmação é
              validada no servidor.
            </p>
          )}
          {state === "CONFIRMED" && (
            <p>
              O Product ativo foi criado. Nenhuma Strategy, Plan ou Generation
              foi iniciada.
            </p>
          )}
          {state === "DUPLICATE" && (
            <p>
              Uma origem canônica equivalente já está confirmada neste
              Workspace.
            </p>
          )}
          {(state === "PROFILE_UNAVAILABLE" || state === "LIMIT") && (
            <p>
              {state === "LIMIT"
                ? "Revise Products existentes ou tente novamente quando houver capacidade."
                : "O browser/profile não está disponível. Seus dados manuais continuam disponíveis."}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {showInteractive && (
            <div className={styles.interactive}>
              <h4>Janela do TikTok</h4>
              <iframe
                title="Janela interativa do TikTok para concluir a análise"
                src={record?.interactiveUrl ?? ""}
              />
            </div>
          )}
          <div className={styles.actions}>
            {importStateAllowsCancel(state) && (
              <button
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => void cancel()}
                type="button"
              >
                Cancelar análise
              </button>
            )}
            {canResume && (
              <button
                className={styles.primaryButton}
                disabled={busy}
                onClick={() => void resume()}
                type="button"
              >
                {busy
                  ? "Verificar e retomar — consultando"
                  : "Verificar e retomar"}
              </button>
            )}
            {interactionStates.includes(state) && (
              <button
                className={styles.secondaryButton}
                disabled={checking || busy}
                onClick={() => void checkStatus()}
                type="button"
              >
                {checking
                  ? "Verificar conclusão — consultando"
                  : "Verificar conclusão"}
              </button>
            )}
            {record && importStateAllowsRetry(state) && (
              <button
                className={styles.primaryButton}
                disabled={busy}
                onClick={() => void retry()}
                type="button"
              >
                Tentar novamente
              </button>
            )}
            {productImportAllowsManualFallback(
              state,
              record?.handoffExpired === true,
            ) && (
              <button
                className={styles.secondaryButton}
                onClick={openManualEntry}
                type="button"
              >
                Adicionar manualmente
              </button>
            )}
            {state === "READY" && candidate && !candidateOpen && (
              <button
                aria-haspopup="dialog"
                className={styles.primaryButton}
                onClick={() => setCandidateOpen(true)}
                ref={candidateTrigger}
                type="button"
              >
                Revisar produto encontrado
              </button>
            )}
            {(state === "CONFIRMED" || state === "DUPLICATE") &&
              record?.productId && (
                <Link
                  className={styles.primaryButton}
                  href={`/products/${encodeURIComponent(record.productId)}`}
                >
                  Abrir produto
                </Link>
              )}
            {(state === "CONFIRMED" || state === "DUPLICATE") && (
              <Link className={styles.textButton} href="/products">
                Voltar para Produtos
              </Link>
            )}
          </div>
        </div>
      )}

      {showCandidate && candidate && (
        <ProductCandidateModal
          candidate={candidate}
          candidateDialogRef={candidateDialogRef}
          candidateErrors={candidateErrors}
          busy={busy}
          onCancel={closeCandidateReview}
          onChange={updateCandidate}
          onConfirm={(preferences) => void confirm(preferences)}
          previewImage={previewImage}
          record={record}
        />
      )}
      {showManualCandidate && (
        <ProductCandidateModal
          candidate={manualCandidate}
          candidateDialogRef={candidateDialogRef}
          candidateErrors={candidateErrors}
          busy={busy}
          error={manualError}
          mode="manual"
          onCancel={closeManualEntry}
          onChange={(name, value) =>
            setManualCandidate((current) => ({ ...current, [name]: value }))
          }
          onConfirm={() => void createManualProduct()}
          previewImage={previewImage}
        />
      )}
    </section>
  );
}
