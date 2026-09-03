"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentGeneration, getGeneration, isActiveGeneration, type GenerationRecord } from "./generation-api";
import { stageMessage, statusMessage } from "./generation-ui-model";
import styles from "./global-activity-indicator.module.css";

export function GlobalActivityIndicator() {
  const [job, setJob] = useState<GenerationRecord | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const load = async () => {
      try { const next = await getCurrentGeneration(); if (!disposed) { setJob(next); timer = window.setTimeout(() => void load(), next && isActiveGeneration(next.status) ? 4000 : 15000); } }
      catch { if (!disposed) timer = window.setTimeout(() => void load(), 15000); }
    };
    void load();
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, []);
  if (!job) return null;
  const active = isActiveGeneration(job.status);
  const href = `/products/${encodeURIComponent(job.productId)}#generated-contents`;
  return <aside aria-live="polite" aria-busy={active} className={styles.indicator} role="status"><div><strong>{active ? "Análise em andamento" : job.status === "SUCCEEDED" ? "Produto pronto para revisão" : "A análise precisa de atenção"}</strong><p>{active ? stageMessage(job.stage) : statusMessage(job.status)}</p></div><Link href={href}>{job.status === "SUCCEEDED" ? "Revisar conteúdos" : job.status === "FAILED" || job.status === "CANCELLED" ? "Tentar novamente" : "Abrir produto"}</Link></aside>;
}
