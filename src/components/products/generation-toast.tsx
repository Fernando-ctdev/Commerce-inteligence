"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createGenerationIdempotencyKey,
  getCurrentGeneration,
  isActiveGeneration,
  retryGeneration,
  type GenerationRecord,
} from "./generation-api";
import { stageMessage, statusMessage } from "./generation-ui-model";
import styles from "./generation-toast.module.css";

export function GenerationToast() {
  const [job, setJob] = useState<GenerationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<{ snapshot: string; path: string } | null>(null);
  const pathname = usePathname();
  const loadRef = useRef<(() => Promise<void>) | null>(null);

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
    loadRef.current = load;
    void load();
    return () => {
      disposed = true;
      loadRef.current = null;
      if (timer) window.clearTimeout(timer);
    };
  }, []);


  const retry = async () => {
    if (!job || busy) return;
    setBusy(true);
    try {
      const next = await retryGeneration(job.id, createGenerationIdempotencyKey());
      setJob(next);
      void loadRef.current?.();
    } catch {
      /* falha é reapresentada pelo polling com o estado real do backend */
      void loadRef.current?.();
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => setDismissed({ path: pathname, snapshot: `${job?.id ?? ""}:${job?.status ?? ""}` });
  const dismissKey = job ? `${job.id}:${job.status}` : null;
  const dismissedHere = dismissed !== null && dismissKey !== null && dismissed.snapshot === dismissKey && dismissed.path === pathname;

  if (!job || dismissedHere) return null;
  const active = isActiveGeneration(job.status);
  const failed = job.status === "FAILED" || job.status === "CANCELLED";
  const href = `/products/${encodeURIComponent(job.productId)}#generated-contents`;
  return (
    <aside aria-atomic="true" aria-busy={active || busy} aria-live={failed ? "assertive" : "polite"} className={styles.toast} role={failed ? "alert" : "status"}>
      <div className={styles.copy}>
        <strong>{active ? "Análise em andamento" : job.status === "SUCCEEDED" ? "Produto pronto para revisão" : "A análise precisa de atenção"}</strong>
        <span>{active ? stageMessage(job.stage) : statusMessage(job.status)}</span>
      </div>
      <div className={styles.actions}>
        {failed ? (
          <button className={styles.action} disabled={busy} onClick={() => void retry()} type="button">
            {busy ? "Tentando novamente…" : "Tentar novamente"}
          </button>
        ) : (
          <Link className={styles.action} href={href}>{job.status === "SUCCEEDED" ? "Revisar conteúdos" : "Abrir produto"}</Link>
        )}
        <button aria-label="Dispensar aviso de geração" className={styles.dismiss} disabled={busy} onClick={dismiss} type="button">×</button>
      </div>
    </aside>
  );
}
