"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentGeneration, isActiveGeneration, type GenerationRecord } from "./generation-api";
import { stageMessage, statusMessage } from "./generation-ui-model";
import styles from "./generation-toast.module.css";

export function GenerationToast() {
  const [job, setJob] = useState<GenerationRecord | null>(null);
  const [dismissed, setDismissed] = useState<{ snapshot: string; path: string } | null>(null);
  const pathname = usePathname();

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
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, []);

  /* Mudança de rota invalida o dismiss: reentrada encontra estado acionável. */
  const dismissKey = job ? `${job.id}:${job.status}` : null;
  const dismissedHere = dismissed !== null && dismissKey !== null && dismissed.snapshot === dismissKey && dismissed.path === pathname;

  if (!job || dismissedHere) return null;
  const active = isActiveGeneration(job.status);
  const failed = job.status === "FAILED" || job.status === "CANCELLED";
  const href = `/products/${encodeURIComponent(job.productId)}#generated-contents`;
  return (
    <aside aria-atomic="true" aria-busy={active} aria-live={failed ? "assertive" : "polite"} className={styles.toast} role={failed ? "alert" : "status"}>
      <div className={styles.copy}>
        <strong>{active ? "Análise em andamento" : job.status === "SUCCEEDED" ? "Produto pronto para revisão" : "A análise precisa de atenção"}</strong>
        <span>{active ? stageMessage(job.stage) : statusMessage(job.status)}</span>
      </div>
      <div className={styles.actions}>
        <Link className={styles.action} href={href}>{job.status === "SUCCEEDED" ? "Revisar conteúdos" : failed ? "Tentar novamente" : "Abrir produto"}</Link>
        <button aria-label="Dispensar aviso de geração" className={styles.dismiss} onClick={() => dismissKey && setDismissed({ path: pathname, snapshot: dismissKey })} type="button">×</button>
      </div>
    </aside>
  );
}
