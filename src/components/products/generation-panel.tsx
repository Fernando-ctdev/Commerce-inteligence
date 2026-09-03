"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createGenerationIdempotencyKey, getGeneration, isActiveGeneration, isRetryableGeneration, retryGeneration, startGeneration, type GenerationRecord } from "./generation-api";
import { stageMessage, statusLabels, statusMessage } from "./generation-ui-model";
import styles from "./generation-panel.module.css";

type Props = { productId: string; productName: string; targetContentCount: number; readiness: "PENDING" | "ANALYZING" | "READY" | "FAILED"; };
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }
export function GenerationPanel({ productId, productName, targetContentCount, readiness }: Props) {
  const [job, setJob] = useState<GenerationRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (readiness === "PENDING") return;
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/generations/current?productId=${encodeURIComponent(productId)}`, { credentials: "same-origin" });
        if (!response.ok) return;
        const value = await response.json();
        if (!disposed && value) setJob(value.id ? await getGeneration(String(value.id)) : null);
      } catch { if (!disposed) setError("Não foi possível recuperar o estado da análise agora."); }
    };
    void load();
    return () => { disposed = true; };
  }, [productId, readiness]);

  useEffect(() => {
    if (!job || !isActiveGeneration(job.status)) return;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = await getGeneration(job.id);
        if (!disposed) { setJob(next); if (isActiveGeneration(next.status)) timer = window.setTimeout(() => void poll(), 1500); }
      } catch { if (!disposed) { setError("Não foi possível atualizar a análise. Tentaremos novamente."); timer = window.setTimeout(() => void poll(), 3000); } }
    };
    timer = window.setTimeout(() => void poll(), 1200);
    return () => { disposed = true; if (timer) window.clearTimeout(timer); };
  }, [job]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    keyRef.current ??= createGenerationIdempotencyKey();
    try {
      setJob(await startGeneration(productId, keyRef.current, undefined, undefined, targetContentCount));
      keyRef.current = undefined;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível iniciar a análise.");
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!job || busy) return;
    setBusy(true); setError(null); keyRef.current ??= createGenerationIdempotencyKey();
    try { setJob(await retryGeneration(job.id, keyRef.current)); keyRef.current = undefined; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível tentar novamente."); }
    finally { setBusy(false); }
  }

  const currentReadiness = job?.readiness ?? readiness;
  if (currentReadiness === "READY" && !job) return <section className={styles.panel} aria-labelledby="generation-title" aria-busy="true"><div className={styles.heading}><p className={styles.eyebrow}>Resultado disponível</p><h2 id="generation-title">Consultando conteúdos</h2><p>Estamos recuperando a estratégia e os Briefings deste produto.</p></div></section>;
  if (currentReadiness === "READY" && job && job.contents.length !== job.targetContentCount) return <section className={styles.panel} aria-labelledby="generation-title" role="alert"><div className={styles.heading}><p className={styles.eyebrow}>Resultado incompleto</p><h2 id="generation-title">Os conteúdos ainda não estão prontos</h2><p>Nenhum resultado parcial será apresentado. Tente novamente em instantes.</p></div></section>;
  if (currentReadiness === "READY" && job) { const strategy = job.strategy ?? {}; const plan = job.plan ?? {}; const list = (label: string, items: string[]) => items.length > 0 ? <><strong>{label}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></> : null; return <section className={styles.panel} aria-labelledby="generation-title" id="generated-contents"><div className={styles.heading}><p className={styles.eyebrow}>Resultado disponível</p><h2 id="generation-title">Produto pronto para revisão</h2><p>Estratégia e Plano vinculados a {job.targetContentCount} Briefings em DRAFT.</p></div><details><summary>Estratégia</summary><div><p><strong>Posicionamento:</strong> {text(strategy.primaryPositioning)}</p>{list("Audiências prioritárias", strings(strategy.audiences))}{list("Benefícios priorizados", strings(strategy.priorityBenefits))}{list("Objeções priorizadas", strings(strategy.priorityObjections))}{list("Argumentos priorizados", strings(strategy.priorityArguments))}{list("Ângulos priorizados", strings(strategy.priorityAngles))}{list("Princípios de comunicação", strings(strategy.communicationPrinciples))}{list("Riscos de comunicação", strings(strategy.communicationRisks))}</div></details><details><summary>Plano</summary><p>{job.targetContentCount} oportunidades de conteúdo organizadas.</p>{Array.isArray(plan.opportunities) && <ul>{plan.opportunities.map((opportunity, index) => <li key={index}>{text(opportunity.angle) || text(opportunity.coreMessage) || `Oportunidade ${index + 1}`}</li>)}</ul>}</details></section>; }
  const active = job && isActiveGeneration(job.status);
  const failed = job && isRetryableGeneration(job.status);
  return <section aria-busy={busy || !!active} aria-labelledby="generation-title" className={styles.panel}>
    <div className={styles.heading}><p className={styles.eyebrow}>Próxima ação</p><h2 id="generation-title">Analisar produto</h2><p>Geraremos uma estratégia comercial e {targetContentCount} Briefings prontos para revisão.</p></div>
    {active && job ? <div aria-live="polite" className={styles.state} role="status"><h3>{statusLabels[job.status]}</h3><p>{stageMessage(job.stage)}</p><p>{statusMessage(job.status, productName)}</p></div> : failed && job ? <div aria-live="polite" className={styles.state} role="alert"><h3>{statusLabels[job.status]}</h3><p>{job.error ?? statusMessage(job.status, productName)}</p><Button disabled={busy} onClick={() => void retry()} type="button">{busy ? "Tentando novamente..." : "Tentar novamente"}</Button></div> : <div className={styles.actions}><Button disabled={busy || readiness !== "PENDING"} onClick={() => void start()} type="button">{busy ? "Iniciando análise..." : "Analisar produto"}</Button>{readiness !== "PENDING" && <p className={styles.error}>Este produto não está disponível para uma nova análise.</p>}</div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
