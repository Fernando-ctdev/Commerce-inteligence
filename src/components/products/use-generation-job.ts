"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelGeneration,
  createGenerationIdempotencyKey,
  GenerationApiError,
  getCurrentGeneration,
  getCurrentGenerationForProduct,
  getGeneration,
  isActiveGeneration,
  isRetryableGeneration,
  retryGeneration,
  startGeneration,
  type GenerationRecord,
} from "./generation-api";
import {
  BLOCKED_ACTIVE_MESSAGE,
  CAPACITY_UNAVAILABLE_MESSAGE,
  isActiveLimitError,
  isCapacityUnavailableError,
} from "./generation-ui-model";

type UseGenerationJobArgs = { productId: string | null; readiness: GenerationRecord["readiness"] };

function actionErrorMessage(caught: unknown) {
  if (caught instanceof GenerationApiError) {
    if (isActiveLimitError(caught.code)) return BLOCKED_ACTIVE_MESSAGE;
    if (isCapacityUnavailableError(caught.code)) return CAPACITY_UNAVAILABLE_MESSAGE;
    return caught.message;
  }
  return caught instanceof Error && caught.message ? caught.message : "Não foi possível concluir a ação agora.";
}

/**
 * Estado do CommerceIntelligenceJob na página do Produto. O backend é a única
 * fonte de verdade: carga no mount (reentrada), polling enquanto ativo e
 * detecção preventiva de bloqueio por job ativo de outro produto (GEN-ACTIVE).
 * Capacidade insuficiente (GEN-CAPACITY/GEN-PRODUCT-CAPACITY) não é
 * conhecível antes do POST e permanece erro pós-clique.
 */
export function useGenerationJob({ productId, readiness }: UseGenerationJobArgs) {
  const [job, setJob] = useState<GenerationRecord | null>(null);
  const [blockedJob, setBlockedJob] = useState<GenerationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | undefined>(undefined);

  // Reentrada: recupera o job real deste Produto a partir do backend.
  useEffect(() => {
    if (!productId) return;
    let disposed = false;
    getCurrentGenerationForProduct(productId)
      .then((next) => { if (!disposed) setJob(next); })
      .catch(() => { if (!disposed) setError("Não foi possível recuperar o estado da análise agora."); });
    return () => { disposed = true; };
  }, [productId]);

  // Bloqueio preventivo: job ativo do usuário em outro Produto. Reconsulta
  // em 15s apenas enquanto existir bloqueio, para liberar o botão quando acabar.
  useEffect(() => {
    if (!productId) return;
    let disposed = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const current = await getCurrentGeneration();
        if (disposed) return;
        const active = current && isActiveGeneration(current.status) ? current : null;
        const blocked = active && active.productId !== productId ? active : null;
        setBlockedJob(blocked);
        if (active) timer = window.setTimeout(() => void load(), 15000);
      } catch {
        if (!disposed) timer = window.setTimeout(() => void load(), 15000);
      }
    };
    void load();
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, [productId]);

  // Polling do job deste Produto enquanto QUEUED/RUNNING.
  useEffect(() => {
    if (!job || !isActiveGeneration(job.status)) return;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await getGeneration(job.id);
        if (!disposed) {
          setJob(next);
          if (isActiveGeneration(next.status)) timer = window.setTimeout(() => void poll(), 1500);
        }
      } catch {
        if (!disposed) {
          setError("Não foi possível atualizar a análise. Tentaremos novamente.");
          timer = window.setTimeout(() => void poll(), 3000);
        }
      }
    };
    timer = window.setTimeout(() => void poll(), 1200);
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, [job]);

  const start = useCallback(async () => {
    if (!productId || busy) return;
    setBusy(true);
    setError(null);
    keyRef.current ??= createGenerationIdempotencyKey();
    try {
      setJob(await startGeneration(productId, keyRef.current));
      keyRef.current = undefined;
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [busy, productId]);

  const retry = useCallback(async () => {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    keyRef.current ??= createGenerationIdempotencyKey();
    try {
      setJob(await retryGeneration(job.id, keyRef.current));
      keyRef.current = undefined;
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [busy, job]);

  const cancel = useCallback(async () => {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    try {
      setJob(await cancelGeneration(job.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível cancelar a análise agora.");
    } finally {
      setBusy(false);
    }
  }, [busy, job]);

  return {
    job,
    busy,
    error,
    active: !!job && isActiveGeneration(job.status),
    failed: !!job && isRetryableGeneration(job.status),
    blockedByOther: !!blockedJob,
    readiness: job?.readiness ?? readiness,
    start,
    retry,
    cancel,
  };
}
