"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import type { GenerationRecord } from "./generation-api";
import {
  BLOCKED_ACTIVE_MESSAGE,
  blockedActionCopy,
  canCancelGeneration,
  generationStatusLabel,
  isActiveGeneration,
  phaseStateLabels,
  phaseStates,
  stageMessage,
  statusLabels,
  statusMessage,
  type GenerationActionProjection,
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
  cancel: () => Promise<boolean>;
  retry: () => Promise<void>;
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
export function GenerationStatusCard({ className, productName, targetContentCount, readiness, state, generationAction, onOpenContents }: {
  className?: string;
  productName: string;
  targetContentCount: number;
  readiness: GenerationRecord["readiness"];
  state: GenerationState;
  generationAction?: GenerationActionProjection;
  onOpenContents: () => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const { job, busy, error, active, failed, blockedByOther, start, retry, cancel } = state;
  const canCancel = !!job && canCancelGeneration(job.status);
  /* ADR-016: com a projeção presente, ela é a única fonte do bloqueio preventivo;
     a inferência por GET current é só fallback para payload que ainda não a carrega. */
  const projectedBlocked = generationAction?.state === "BLOCKED" ? generationAction : null;
  const projectedNote = projectedBlocked ? blockedActionCopy(projectedBlocked) : null;
  const fallbackNote = !generationAction && blockedByOther ? BLOCKED_ACTIVE_MESSAGE : null;
  return (
    <section aria-busy={busy || active} aria-labelledby="generation-title" className={[styles.panel, className].filter(Boolean).join(" ")}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Próxima ação</p>
        <h2 id="generation-title">Analisar produto</h2>
        <p>Geraremos uma estratégia comercial e {targetContentCount} Briefings prontos para revisão.</p>
      </div>
      {active && job ? (
        <div aria-live="polite" className={styles.state} role="status">
          <p className={styles.stateLine}>
            <strong>{statusLabels[job.status]}</strong> · {stageMessage(job.stage)}
          </p>
          <div className={styles.actions}>
            {/* SPEC/PLAN: a ação permanece visível-desabilitada enquanto o job ativo existe. */}
            <Button disabled type="button">Analisar produto</Button>
            {canCancel && (
              <Button disabled={busy} onClick={() => setCancelOpen(true)} type="button" variant="outline">Cancelar</Button>
            )}
          </div>
        </div>
      ) : failed && job ? (
        <div aria-live="polite" className={styles.state} role="alert">
          <p className={styles.stateLine}>
            <strong>{statusLabels[job.status]}</strong>{job.error ? ` · ${job.error}` : ` · ${statusMessage(job.status, productName)}`}
          </p>
          <div className={styles.actions}>
            <Button disabled={busy} onClick={() => void retry()} type="button">
              {busy ? "Tentando novamente…" : "Tentar novamente"}
            </Button>
          </div>
        </div>
      ) : job?.status === "SUCCEEDED" ? (
        <div aria-live="polite" className={styles.state} role="status">
          <p className={styles.stateLine}>
            <strong>{statusLabels[job.status]}</strong> · {statusMessage(job.status, productName)}
          </p>
          <div className={styles.actions}>
            <Button onClick={onOpenContents} type="button">Revisar conteúdos</Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button disabled={busy || readiness !== "PENDING" || blockedByOther || !!projectedBlocked} onClick={() => void start()} type="button">
            {busy ? "Iniciando análise…" : "Analisar produto"}
          </Button>
          {(projectedNote ?? fallbackNote) && <p className={styles.blockedNote}>{projectedNote ?? fallbackNote}</p>}
          {readiness !== "PENDING" && !projectedBlocked && !blockedByOther && (
            <p className={styles.error}>Este produto não está disponível para uma nova análise.</p>
          )}
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {cancelOpen && (
        <ConfirmationDialog
          confirmLabel="Cancelar análise"
          description="A análise na fila será cancelada. Os dados do produto permanecem preservados e você pode tentar novamente depois."
          error={error}
          onConfirm={async () => {
            if (await cancel()) setCancelOpen(false);
          }}
          onOpenChange={setCancelOpen}
          open
          pending={busy}
          pendingLabel="Cancelando…"
          title="Cancelar análise?"
        />
      )}
    </section>
  );
}

/**
 * Visão geral: resumo operacional da Commerce Intelligence — log das fases
 * públicas do job (stages reais, sem percentual/ETA), atualizado pelo polling.
 * Substitui o antigo card "Resumo do produto" baseado em cadastro.
 */
export function OperationalSummaryCard({ className, job, readiness }: {
  className?: string;
  job: GenerationRecord | null;
  readiness: GenerationRecord["readiness"];
}) {
  const phases = job ? phaseStates(job.status, job.stage) : null;
  const failed = !!job && !isActiveGeneration(job.status) && job.status !== "SUCCEEDED";
  return (
    <section aria-labelledby="operational-summary-title" className={[styles.panel, className].filter(Boolean).join(" ")}>
      <div className={styles.heading}>
        <p className={styles.eyebrow}>Commerce Intelligence</p>
        <h2 id="operational-summary-title">Resumo operacional</h2>
        {!job && readiness === "PENDING" && (
          <p>Nenhuma análise ainda. Use “Analisar produto” para gerar a estratégia e os Briefings deste produto.</p>
        )}
        {!job && readiness !== "PENDING" && <p aria-busy="true">Recuperando o estado da análise...</p>}
      </div>
      {job && phases && (
        <>
          <div
            aria-live={failed ? "assertive" : "polite"}
            className={styles.state}
            role={failed ? "alert" : "status"}
          >
            <p className={styles.stateLine}>
              <strong>{statusLabels[job.status]}</strong>
              {failed && job.error ? ` · ${job.error}` : ""}
            </p>
          </div>
          <ol className={styles.phaseList}>
            {phases.map((phase) => (
              <li className={styles.phaseItem} data-state={phase.state} key={phase.stage}>
                <span className={styles.phaseName}>{stageMessage(phase.stage)}</span>
                <span className={styles.phaseStatus}>{phaseStateLabels[phase.state]}</span>
              </li>
            ))}
          </ol>
        </>
      )}
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
