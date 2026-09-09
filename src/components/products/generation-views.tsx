"use client";

import { useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Clapperboard, Hourglass, Megaphone, Mic, ScrollText, Sparkles, X } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";

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
  briefingItems,
  contentStatusLabel,
  contentsSummaryLabel,
  strategyModel,
  type BriefingItem,
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

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Rótulo de seção do Briefing com âncora visual de traço simples. */
function SectionLabel({ icon: Icon, children }: { icon: typeof Mic; children: string }) {
  return (
    <p className={styles.sectionLabel}>
      <Icon aria-hidden="true" className={styles.sectionIcon} />
      {children}
    </p>
  );
}

/**
 * Painel do Briefing selecionado: hook dominante, roteiro/cenas/CTA sempre
 * visíveis e estratégia profunda em progressive disclosure ("Por que este
 * conteúdo?"). Somente leitura — ações de Edição/Aprovação dependem de
 * capability de backend ainda não exposta.
 */
function BriefingDetail({ index, item, onBack, onNavigate, total }: {
  index: number;
  item: BriefingItem;
  onBack: () => void;
  onNavigate: (nextIndex: number) => void;
  total: number;
}) {
  /* Disclosure só existe quando há dado real do PRD; nada inventado. */
  const deep = [
    ["Público", item.targetAudience],
    ["Dor", item.pain],
    ["Desejo", item.desire],
    ["Benefício", item.benefit],
    ["Objeção", item.objection],
  ].filter((pair): pair is [string, string] => !!pair[1]);
  /* Linha de contexto sob o hook: leitura rápida de objetivo + ângulo. */
  const context = [
    ["Objetivo", item.objective],
    ["Ângulo", item.angle],
  ].filter((pair): pair is [string, string] => !!pair[1]);
  return (
    <article className={styles.detail}>
      <Button className={styles.mobileBack} onClick={onBack} type="button" variant="outline">
        <ArrowLeft aria-hidden="true" />
        Conteúdos
      </Button>
      <header className={styles.detailHeader}>
        <h3 className={styles.detailTitle}>{`Conteúdo ${pad2(item.position)}`}</h3>
        <p className={styles.statusTag}>{contentStatusLabel(item.status)}</p>
      </header>
      <section aria-label="Hook" className={styles.hookBlock}>
        <p className={styles.sectionLabel}>
          <Mic aria-hidden="true" className={[styles.sectionIcon, styles.sectionIconIntelligence].join(" ")} />
          Hook
        </p>
        <p className={styles.briefingHook}>{item.hook}</p>
      </section>
      {context.length > 0 && (
        <section className={styles.contextRow}>
          {context.map(([label, value]) => (
            <div className={styles.contextCell} key={label}>
              <p className={styles.sectionLabel}>{label}</p>
              <p className={styles.contextValue}>{value}</p>
            </div>
          ))}
        </section>
      )}
      <section className={styles.detailSection}>
        <SectionLabel icon={ScrollText}>Roteiro</SectionLabel>
        <p className={styles.readingText}>{item.script}</p>
      </section>
      {item.scenes.length > 0 && (
        <section className={styles.detailSection}>
          <SectionLabel icon={Clapperboard}>Cenas</SectionLabel>
          <ol className={styles.sceneList}>
            {item.scenes.map((scene, sceneIndex) => (
              <li className={styles.sceneItem} key={sceneIndex}>
                <span aria-hidden="true" className={styles.sceneIndex}>{pad2(sceneIndex + 1)}</span>
                <p className={styles.readingText}>{scene}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section aria-label="CTA" className={styles.detailSection}>
        <SectionLabel icon={Megaphone}>CTA</SectionLabel>
        <p className={styles.readingText}>{item.cta}</p>
      </section>
      {deep.length > 0 && (
        <details className={styles.disclosure}>
          <summary className={styles.whySummary}>
            <Sparkles aria-hidden="true" className={[styles.sectionIcon, styles.sectionIconIntelligence].join(" ")} />
            Por que este conteúdo?
          </summary>
          <div className={styles.detailBlock}>
            {deep.map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}
          </div>
        </details>
      )}
      <nav aria-label={`Navegação entre conteúdos: conteúdo ${index + 1} de ${total}`} className={styles.contentsNav}>
        <Button disabled={index <= 0} onClick={() => onNavigate(index - 1)} type="button" variant="outline">
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Button>
        <span>{`${index + 1} de ${total}`}</span>
        <Button disabled={index >= total - 1} onClick={() => onNavigate(index + 1)} type="button" variant="outline">
          Próximo
          <ChevronRight aria-hidden="true" />
        </Button>
      </nav>
    </article>
  );
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
                <span aria-label={phaseStateLabels[phase.state]} className={styles.phaseStatus} role="img">
                  {phase.state === "pending" && <Hourglass aria-hidden="true" />}
                  {phase.state === "skipped" && <X aria-hidden="true" />}
                  {(phase.state === "done" || phase.state === "active" || phase.state === "failed") &&
                    phaseStateLabels[phase.state]}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Aba Estratégia: tese comercial estruturada; Plano continua pertencendo à aba Conteúdos. */
export function StrategyView({ job, onOpenContents }: { job: GenerationRecord | null; onOpenContents?: () => void }) {
  if (!job?.strategy) return <EmptyRegion>A estratégia aparece aqui quando a análise concluir.</EmptyRegion>;
  const strategy = strategyModel(job.strategy);
  const contentsReady = job.status === "SUCCEEDED" && job.contents.length === job.targetContentCount;
  const triplet = [
    { title: "Dores", items: strategy.pains },
    { title: "Desejos", items: strategy.desires },
    { title: "Benefícios", items: strategy.benefits },
  ].filter((column) => column.items.length > 0);
  return (
    <div className={styles.strategyLayout}>
      <div className={styles.strategyPanel}>
        <header className={styles.strategyHeader}>
          <h2>Estratégia comercial</h2>
          <p>Entenda a estratégia comercial deste produto.</p>
        </header>
        {strategy.positioning && (
          <section aria-label="Posicionamento" className={styles.positioning}>
            <p className={styles.positioningLabel}>Posicionamento</p>
            <p className={styles.positioningText}>{strategy.positioning}</p>
          </section>
        )}
        {strategy.audiences.length > 0 && (
          <section className={styles.strategySection}>
            <h3 className={styles.sectionTitle}>Públicos prioritários</h3>
            <ul className={styles.audienceList}>
              {strategy.audiences.map((audience, index) => (
                <li className={styles.audienceItem} key={`${index}-${audience}`}>
                  <p className={styles.audienceName}>{audience}</p>
                  {strategy.audienceSituations.get(audience) && (
                    <p className={styles.audienceSituation}>{strategy.audienceSituations.get(audience)}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {triplet.length > 0 && (
          <section className={styles.strategySection}>
            <div className={styles.triplet}>
              {triplet.map((column) => (
                <div className={styles.tripletColumn} key={column.title}>
                  <h3 className={styles.sectionTitle}>{column.title}</h3>
                  <ul className={styles.bulletList}>
                    {column.items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
        {strategy.objections.length > 0 && (
          <section className={styles.strategySection}>
            <h3 className={styles.sectionTitle}>Objeções que precisamos vencer</h3>
            <ul className={styles.objectionList}>
              {strategy.objections.map((objection, index) => {
                const argument = strategy.objectionArguments.get(objection);
                return (
                  <li className={styles.objectionItem} key={`${index}-${objection}`}>
                    {argument ? (
                      <details>
                        <summary>{objection}</summary>
                        <p className={styles.objectionArgument}>{argument}</p>
                      </details>
                    ) : objection}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {strategy.arguments.length > 0 && (
          <section className={styles.strategySection}>
            <h3 className={styles.sectionTitle}>Argumentos de venda</h3>
            <ol className={styles.argumentList}>
              {strategy.arguments.map((argument, index) => (
                <li className={styles.argumentItem} key={`${index}-${argument}`}>
                  <span aria-hidden="true" className={styles.argumentIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <p className={styles.argumentText}>{argument}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
        {strategy.angles.length > 0 && (
          <section className={styles.strategySection}>
            <h3 className={styles.sectionTitle}>Ângulos prioritários</h3>
            <ul className={styles.chipList}>
              {strategy.angles.map((angle, index) => <li className={styles.chip} key={`${index}-${angle}`}>{angle}</li>)}
            </ul>
          </section>
        )}
        {strategy.principles.length > 0 && (
          <section className={styles.strategySection}>
            <h3 className={styles.sectionTitle}>Como comunicar</h3>
            <ul className={styles.signList}>
              {strategy.principles.map((principle, index) => (
                <li className={styles.signItem} key={`${index}-${principle}`}>
                  <Check aria-hidden="true" className={styles.signCheck} />
                  <span>{principle}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {strategy.risks.length > 0 && (
          <section className={styles.strategySection}>
            <h3 className={styles.sectionTitle}>Cuidados de comunicação</h3>
            <ul className={styles.signList}>
              {strategy.risks.map((risk, index) => (
                <li className={styles.signItem} key={`${index}-${risk}`}>
                  <CircleAlert aria-hidden="true" className={styles.signWarning} />
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {(strategy.active || contentsReady) && (
        <aside className={styles.strategyAside}>
          {strategy.active && (
            <section className={styles.asideCard}>
              <h2>Estratégia</h2>
              <p className={styles.asideStatus}>Ativa</p>
              <p>Esta estratégia orienta os conteúdos deste produto.</p>
            </section>
          )}
          {contentsReady && (
            <section className={styles.asideCard}>
              <h2>Conteúdos</h2>
              <p>
                {job.targetContentCount} {job.targetContentCount === 1 ? "conteúdo preparado" : "conteúdos preparados"} com esta estratégia
              </p>
              {onOpenContents && (
                <Button onClick={onOpenContents} type="button" variant="outline">Ver conteúdos</Button>
              )}
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

/**
 * Aba Conteúdos: estação de revisão de Briefings em master-detail — lista
 * compacta para navegar (escala para 20+), painel do Briefing selecionado.
 * Mobile usa fluxo lista → detalhe; nunca exibe resultado parcial.
 */
export function ContentsView({ job, active }: { job: GenerationRecord | null; active: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (active) {
    return (
      <section className={styles.panel} id="generated-contents">
        <p>A análise está em andamento. Os Briefings aparecem aqui quando concluir — nenhum conteúdo parcial é exibido.</p>
      </section>
    );
  }
  if (!job || job.status !== "SUCCEEDED") {
    return (
      <section className={styles.panel} id="generated-contents">
        <p>Os Briefings aparecem aqui quando a análise concluir.</p>
      </section>
    );
  }
  if (job.contents.length !== job.targetContentCount) {
    return (
      <section className={styles.panel} id="generated-contents">
        <p role="alert">Os conteúdos ainda não estão prontos. Nenhum resultado parcial será apresentado. Tente novamente em instantes.</p>
      </section>
    );
  }
  const items = briefingItems(job.contents);
  const approved = items.filter((item) => item.status === "APPROVED").length;
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;
  return (
    <section aria-labelledby="contents-title" className={styles.panel} id="generated-contents">
      <header className={styles.contentsHeader}>
        <h2 id="contents-title">Conteúdos</h2>
        <p>{contentsSummaryLabel(items.length, approved)}</p>
      </header>
      <div className={styles.contentsLayout} data-selected={selected ? "true" : "false"}>
        <ol aria-label="Lista de conteúdos" className={styles.contentsList}>
          {items.map((item) => (
            <li key={item.id}>
              <button
                aria-current={item.id === selected?.id ? "true" : undefined}
                className={styles.contentRow}
                data-selected={item.id === selected?.id ? "true" : undefined}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <span className={styles.contentRowTop}>
                  <span className={styles.contentRowPosition}>{pad2(item.position)}</span>
                  <span className={styles.statusTag}>{contentStatusLabel(item.status)}</span>
                </span>
                <span className={styles.contentRowHook}>{item.hook}</span>
                {item.angle && <span className={styles.contentRowAngle}>{item.angle}</span>}
              </button>
            </li>
          ))}
        </ol>
        <div className={styles.detailPane}>
          {selected ? (
            <BriefingDetail
              index={selectedIndex}
              item={selected}
              key={selected.id}
              onBack={() => setSelectedId(null)}
              onNavigate={(nextIndex) => setSelectedId(items[nextIndex]?.id ?? null)}
              total={items.length}
            />
          ) : (
            <p className={styles.blockedNote}>Selecione um conteúdo para revisar o Briefing.</p>
          )}
        </div>
      </div>
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
