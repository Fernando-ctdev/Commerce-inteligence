"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentGeneration,
  isActiveGeneration,
  type GenerationRecord,
} from "./generation-api";
import { isToastDismissed, stageMessage, statusMessage, formatTimestamp } from "./generation-ui-model";
import styles from "./generation-toast.module.css";

/**
 * Em memória (sem localStorage): o dismiss sobrevive à remontagem do
 * GenerationToast ao trocar de rota — cada página renderiza seu próprio
 * <ProductShell> — e reapresenta quando Job/estado mudarem.
 */
let dismissedSnapshotModule: string | null = null;

export function GenerationToast() {
  const [job, setJob] = useState<GenerationRecord | null>(null);
  const [, setDismissTick] = useState(0);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        const next = await getCurrentGeneration();
        if (disposed) return;
        setJob(next);
        timer = window.setTimeout(() => void load(), next && isActiveGeneration(next.status) ? 4000 : 15000);
      } catch {
        if (!disposed) timer = window.setTimeout(() => void load(), 15000);
      }
    };
    void load();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  /* Alerta comum: expira sozinho; job/estado novo reapresenta com timer novo. */
  const snapshot = job ? `${job.id}:${job.status}` : null;
  useEffect(() => {
    if (!snapshot || snapshot === dismissedSnapshotModule) return;
    const expiry = window.setTimeout(() => {
      dismissedSnapshotModule = snapshot;
      setDismissTick((tick) => tick + 1);
    }, 5000);
    return () => window.clearTimeout(expiry);
  }, [snapshot]);

  const dismiss = () => {
    dismissedSnapshotModule = job ? `${job.id}:${job.status}` : null;
    setDismissTick((tick) => tick + 1);
  };

  if (!job || isToastDismissed(dismissedSnapshotModule, job)) return null;
  const active = isActiveGeneration(job.status);
  const failed = job.status === "FAILED";
  const succeeded = job.status === "SUCCEEDED";
  const cancelled = job.status === "CANCELLED";
  /* Contrato de observabilidade: jobId + timestamp mais recente conhecido; os demais
     dados (uso/custo/timestamps completos) ficam nos "Dados da execução" do produto. */
  const timeValue = job.finishedAt ?? job.startedAt ?? job.createdAt;
  const timePrefix = job.finishedAt ? "Concluída em" : job.startedAt ? "Iniciada em" : "Solicitada em";
  const href = `/products/${encodeURIComponent(job.productId)}`;
  return (
    <aside aria-atomic="true" aria-busy={active} aria-live={failed ? "assertive" : "polite"} className={styles.toast} role={failed ? "alert" : "status"}>
      <div className={styles.copy}>
        <strong>{cancelled ? "A análise foi cancelada." : active ? "Análise em andamento" : succeeded ? "Produto pronto para revisão" : "A análise falhou"}</strong>
        {!cancelled && <span>{active ? stageMessage(job.stage) : statusMessage(job.status)}</span>}
        <span className={styles.meta}>
          Job <span className={styles.monoId}>{job.id}</span> · {timePrefix} {formatTimestamp(timeValue) ?? "Indisponível"}
        </span>
      </div>
      <div className={styles.actions}>
        {failed ? (
          <Link className={styles.action} href={href} onClick={dismiss}>Abrir produto</Link>
        ) : succeeded ? (
          <button className={styles.action} onClick={dismiss} type="button">Pronto</button>
        ) : active ? (
          <Link className={styles.action} href={`${href}#generated-contents`} onClick={dismiss}>Abrir produto</Link>
        ) : null}
        <button aria-label="Dispensar aviso de geração" className={styles.dismiss} onClick={dismiss} type="button">×</button>
      </div>
    </aside>
  );
}

