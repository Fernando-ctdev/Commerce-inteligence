"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import type { GenerationRecord } from "./generation-api";
import {
  BLOCKED_ACTIVE_MESSAGE,
  canCancelGeneration,
  generationStatusLabel,
  stageMessage,
  statusLabels,
  statusMessage,
} from "./generation-ui-model";
import styles from "./generation-panel.module.css";

export type GenerationState = {
  job: GenerationRecord | null;
  busy: boolean;
  error: string | null;
  active: boolean;
  failed: boolean;
  blockedByOther: boolean;
  start: () => Promise<void>;
  retry: () => Promise<void>;
  cancel: () => Promise<void>;
};

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }

type BriefingItem = { id: string; position: number; status: string; angle: string; hook: string; script: string; scenes: string[]; cta: string };
const briefingStatusLabels: Record<string, string> = { DRAFT: "Rascunho" };
function briefings(contents: Array<Record<string, unknown>>): BriefingItem[] {
  return contents.map((content, index): BriefingItem => ({
    id: text(content.id) || `conteudo-${index + 1}`,
    position: typeof content.position === "number" ? content.position : index + 1,
    status: text(content.status) || "DRAFT",
    angle: text(content.angle),
    hook: text(content.hook),
    script: text(content.script),
    scenes: strings(content.scenes),
    cta: text(content.cta),
  })).sort((a, b) => a.position - b.position);
}

function BriefingList({ items }: { items: BriefingItem[] }) {
  return <ol className={styles.list}>
    {items.map((item) => <li className={styles.contentItem} key={item.id}>
      <p><strong>{`Conteúdo ${item.position}`}</strong> · {briefingStatusLabels[item.status] ?? item.status}</p>
      <p className={styles.hook}>{item.hook}</p>
      <p>{item.angle}</p>
      <details className={styles.disclosure}>
        <summary>Roteiro</summary>
        <div className={styles.detailBlock}>
          <p>{item.script}</p>
          <ol>{item.scenes.map((scene, index) => <li key={index}>{scene}</li>)}</ol>
          <p><strong>CTA:</strong> {item.cta}</p>
        </div>
      </details>
    </li>)}
  </ol>;
}

function EmptyRegion({ children }: { children: React.ReactNode }) {
  return <div className={styles.panel}><p>{children}</p></div>;
}

/** Aba Visão geral: estado do job, ação primária, bloqueio preventivo e cancelamento (só QUEUED). */
export function GenerationStatusCard({ productName, targetContentCount, readiness, state, onOpenContents }: {
  productName: string;
  targetContentCount: number;
  readiness: GenerationRecord["readiness"];
  state: GenerationState;
  onOpenContents: () => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const { job, busy, error, active, failed, blockedByOther, start, retry, cancel } = state;
  const canCancel = !!job && canCancelGeneration(job.status);
  return (
    <section aria-busy={busy || active} aria-labelledby="generation-title" className={styles.panel}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Próxima ação</p>
        <h2 id="generation-title">Analisar produto</h2>
        <p>Geraremos uma estratégia comercial e {targetContentCount} Briefings prontos para revisão.</p>
      </div>
      {active && job ? (
        <div aria-live="polite" className={styles.state} role="status">
          <h3>{statusLabels[job.status]}</h3>
          <p>{stageMessage(job.stage)}</p>
          <p>{statusMessage(job.status, productName)}</p>
          {canCancel && (
            <Button disabled={busy} onClick={() => setCancelOpen(true)} type="button" variant="outline">Cancelar</Button>
          )}
        </div>
      ) : failed && job ? (
        <div aria-live="polite" className={styles.state} role="alert">
          <h3>{statusLabels[job.status]}</h3>
          <p>{job.error ?? statusMessage(job.status, productName)}</p>
          <Button disabled={busy} onClick={() => void retry()} type="button">
            {busy ? "Tentando novamente…" : "Tentar novamente"}
          </Button>
        </div>
      ) : job?.status === "SUCCEEDED" ? (
        <div aria-live="polite" className={styles.state} role="status">
          <h3>{statusLabels[job.status]}</h3>
          <p>{statusMessage(job.status, productName)}</p>
          <Button onClick={onOpenContents} type="button">Revisar conteúdos</Button>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button disabled={busy || readiness !== "PENDING" || blockedByOther} onClick={() => void start()} type="button">
            {busy ? "Iniciando análise…" : "Analisar produto"}
          </Button>
          {blockedByOther && <p className={styles.blockedNote}>{BLOCKED_ACTIVE_MESSAGE}</p>}
          {readiness !== "PENDING" && !blockedByOther && (
            <p className={styles.error}>Este produto não está disponível para uma nova análise.</p>
          )}
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <ConfirmationDialog
        confirmLabel="Cancelar análise"
        description="A análise na fila será cancelada. Os dados do produto permanecem preservados e você pode tentar novamente depois."
        onConfirm={() => void cancel()}
        onOpenChange={setCancelOpen}
        open={cancelOpen}
        pending={busy}
        pendingLabel="Cancelando…"
        title="Cancelar análise?"
      />
    </section>
  );
}

/** Aba Estratégia: Strategy v1 consultável; Plano fica em disclosure dentro da aba. */
export function StrategyView({ job }: { job: GenerationRecord | null }) {
  if (!job?.strategy) return <EmptyRegion>A estratégia aparece aqui quando a análise concluir.</EmptyRegion>;
  const strategy = job.strategy;
  const plan = job.plan ?? {};
  const list = (label: string, items: string[]) => items.length > 0 ? <><strong>{label}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></> : null;
  return (
    <div className={styles.panel}>
      <p><strong>Posicionamento:</strong> {text(strategy.primaryPositioning)}</p>
      {list("Audiências prioritárias", strings(strategy.audiences))}
      {list("Benefícios priorizados", strings(strategy.priorityBenefits))}
      {list("Objeções priorizadas", strings(strategy.priorityObjections))}
      {list("Argumentos priorizados", strings(strategy.priorityArguments))}
      {list("Ângulos priorizados", strings(strategy.priorityAngles))}
      {list("Princípios de comunicação", strings(strategy.communicationPrinciples))}
      {list("Riscos de comunicação", strings(strategy.communicationRisks))}
      <details className={styles.disclosure}>
        <summary>Plano de conteúdo</summary>
        <div className={styles.detailBlock}>
          <p>{job.targetContentCount} oportunidades de conteúdo organizadas.</p>
          {Array.isArray(plan.opportunities) && (
            <ul>
              {(plan.opportunities as Array<Record<string, unknown>>).map((opportunity, index) => (
                <li key={index}>{text(opportunity.angle) || text(opportunity.coreMessage) || `Oportunidade ${index + 1}`}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

/** Aba Conteúdos: Briefings em DRAFT por posição; nunca exibe resultado parcial. */
export function ContentsView({ job, active }: { job: GenerationRecord | null; active: boolean }) {
  return (
    <section className={styles.panel} id="generated-contents">
      {active ? (
        <p>A análise está em andamento. Os Briefings aparecem aqui quando concluir — nenhum conteúdo parcial é exibido.</p>
      ) : !job || job.status !== "SUCCEEDED" ? (
        <p>Os Briefings aparecem aqui quando a análise concluir.</p>
      ) : job.contents.length !== job.targetContentCount ? (
        <p role="alert">Os conteúdos ainda não estão prontos. Nenhum resultado parcial será apresentado. Tente novamente em instantes.</p>
      ) : (
        <>
          <h3 className={styles.listTitle}>Conteúdos para revisão</h3>
          <BriefingList items={briefings(job.contents)} />
        </>
      )}
    </section>
  );
}

/** Aba Histórico: registro da análise mais recente conhecida pelo backend. */
export function HistoryView({ job }: { job: GenerationRecord | null }) {
  if (!job) return <EmptyRegion>Nenhuma análise registrada até agora.</EmptyRegion>;
  return (
    <section className={styles.panel}>
      <p><strong>{generationStatusLabel(job.status)}</strong> · até {job.targetContentCount} Briefings solicitados</p>
      {job.status === "SUCCEEDED" && <p>Resultado completo disponível na aba Conteúdos.</p>}
      {job.error && <p className={styles.error}>{job.error}</p>}
      {job.previousRunId && <p>Esta análise substitui uma tentativa anterior do mesmo produto.</p>}
    </section>
  );
}
