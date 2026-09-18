"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Compass, Copy, Gift, Heart, HeartCrack, Hourglass, Megaphone, Mic, ScrollText, Shield, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { GenerationRecord } from "./generation-api";
import {
  BLOCKED_ACTIVE_MESSAGE,
  blockedActionCopy,
  isActiveGeneration,
  phaseStateLabels,
  phaseStates,
  projectionDegradedModel,
  stageMessage,
  statusLabels,
  statusMessage,
  partialModel,
  briefingItems,
  strategyModel,
  type BriefingItem,
  scriptParagraphs,
  scenesProjection,
  type GenerationActionProjection,
  type ScenesProjection,
} from "./generation-ui-model";
import type { ProductHistoryResponse } from "./history-api";
import { historyViewModel } from "./history-ui-model";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
function SectionLabel({ icon: Icon, iconClassName, className, children }: { icon: typeof Mic; iconClassName?: string; className?: string; children: string }) {
  return (
    <p className={[styles.sectionLabel, className].filter(Boolean).join(" ")}>
      <Icon aria-hidden="true" className={[styles.sectionIcon, iconClassName].filter(Boolean).join(" ")} />
      {children}
    </p>
  );
}

/** Cópia do roteiro inteiro (texto bruto, com quebras originais) para a área de
    transferência; ícone e aria-label comunicam copiado/erro por 2s. */
function CopyScriptButton({ script }: { script: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);
  const label = copyState === "copied"
    ? "Roteiro copiado"
    : copyState === "error"
      ? "Não foi possível copiar o roteiro"
      : "Copiar roteiro";
  return (
    <Button
      aria-label={label}
      className={styles.copyScriptButton}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(script);
          setCopyState("copied");
        } catch {
          setCopyState("error");
        }
      }}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
    </Button>
  );
}

/**
 * Painel do Briefing selecionado em duas abas: "Script" (hook dominante,
 * desenvolvimento real em bullets, roteiro oral em parágrafos e CTA) e
 * "Cenas" (estados do contrato ADR-019). Estratégia profunda segue em
 * progressive disclosure ("Por que este conteúdo?").
 * Somente leitura — nenhum botão de Aprovação/Edição/Regeneração: a curadoria
 * do quality gate é interna e a capability de backend ainda não foi exposta.
 */
/** Aba Cenas: estados do contrato ADR-019 — nenhuma ação de geração/regeneração na UI. */
function ScenesNote({ scenes }: { scenes: ScenesProjection }) {
  if (!scenes || (scenes.status === "AVAILABLE" && scenes.scenes.length === 0))
    return <p className={styles.scenesNote}>Cenas entram na próxima análise deste produto.</p>;
  if (scenes.status === "FILTERED")
    return <p className={styles.scenesNote}>As ideias de cenas geradas não passaram nos critérios de qualidade.</p>;
  if (scenes.status === "ERROR")
    return <p className={styles.scenesNote}>Não foi possível gerar as cenas agora.</p>;
  return (
    <ol aria-label="Sugestões de cenas" className={styles.bulletList}>
      {scenes.scenes.map((scene, index) => (
        <li key={`${index}-${scene.description.slice(0, 24)}`}>{scene.description}</li>
      ))}
    </ol>
  );
}

function BriefingDetail({ index, item, onNavigate, total }: {
  index: number;
  item: BriefingItem;
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
  /* Linha de contexto sob o gancho: somente o objetivo é creator-facing. */
  const context = [
    ["Objetivo", item.objective],
  ].filter((pair): pair is [string, string] => !!pair[1]);
  return (
    <article className={styles.detail}>
      <header className={styles.detailHeader}>
        <h3 className={styles.detailTitle}>{`Conteúdo ${pad2(item.position)}`}</h3>
        <div className={styles.detailMeta}>
          <span className={styles.contentProgress}>
            {`${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`}
          </span>
        </div>
      </header>
      <Tabs className={styles.detailTabs} defaultValue="script">
        <TabsList aria-label="Seções do conteúdo" variant="line">
          <TabsTrigger value="script">Script</TabsTrigger>
          <TabsTrigger value="cenas">Cenas</TabsTrigger>
        </TabsList>
        <TabsContent className={styles.scriptFlow} value="script">
      <section aria-label="Gancho" className={styles.hookBlock}>
        <p className={styles.sectionLabel}>
          <Mic aria-hidden="true" className={[styles.sectionIcon, styles.sectionIconIntelligence].join(" ")} />
          GANCHO
        </p>
        <p className={styles.briefingHook}>{item.hook}</p>
      </section>
      {item.development.length > 0 && (
        <section aria-label="Desenvolvimento" className={styles.detailSection}>
          <SectionLabel className={styles.sectionLabelBrand} icon={Sparkles} iconClassName={styles.sectionIconBrand}>DESENVOLVIMENTO</SectionLabel>
          <ul className={styles.developmentList}>
            {item.development.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}
          </ul>
        </section>
      )}
      {item.cta && (
        <section
          aria-label="CTA"
          className={item.development.length > 0 ? [styles.detailSection, styles.ctaSection].join(" ") : styles.detailSection}
        >
          <SectionLabel className={styles.sectionLabelBrand} icon={Megaphone} iconClassName={styles.sectionIconBrand}>CTA</SectionLabel>
          <p className={[styles.readingText, styles.ctaText].join(" ")}>{item.cta}</p>
        </section>
      )}
      {item.script.trim() !== "" && (
        <section
          aria-label="Roteiro"
          className={[styles.detailSection, styles.scriptSection].join(" ")}
        >
          <div className={styles.scriptHeader}>
            <SectionLabel icon={ScrollText} iconClassName={styles.sectionIconIntelligence}>ROTEIRO</SectionLabel>
            <CopyScriptButton script={item.script} />
          </div>
          <div className={styles.scriptParagraphs}>
            {scriptParagraphs(item.script).map((paragraph, index) => (
              <p className={styles.readingText} key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>
            ))}
          </div>
        </section>
      )}
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
        </TabsContent>
        <TabsContent value="cenas">
          <ScenesNote scenes={item.scenes} />
        </TabsContent>
      </Tabs>
      <nav aria-label="Navegação entre conteúdos" className={styles.contentsNav}>
        <Button
          className={styles.readerNavButton}
          disabled={index <= 0}
          onClick={() => onNavigate(index - 1)}
          type="button"
          variant="outline"
        >
          <ChevronLeft aria-hidden="true" />
          Anterior
        </Button>
        <Button
          className={styles.readerNavButton}
          disabled={index >= total - 1}
          onClick={() => onNavigate(index + 1)}
          type="button"
          variant="outline"
        >
          Próximo conteúdo
          <ChevronRight aria-hidden="true" />
        </Button>
      </nav>
    </article>
  );
}

function EmptyRegion({ children }: { children: React.ReactNode }) {
  return <div className={styles.panel}><p>{children}</p></div>;
}

/** Aba Conteúdos: bloco de ações contextuais da análise, sem card "Próxima ação". */
export function GenerationActions({ generationAction, onGenerateMissing, readiness, state }: {
  generationAction?: GenerationActionProjection;
  onGenerateMissing: () => void;
  readiness: GenerationRecord["readiness"];
  state: GenerationState;
}) {
  const { job, busy, error, active, failed, blockedByOther, start, retry } = state;
  const partial = partialModel(job);
  /* RI-003-20: GEN-PROJECTION em terminal positivo é anomalia de dados —
     retry suprimido (/retry responderia 404); /complete só no parcial degradado. */
  const degraded = projectionDegradedModel(job);
  /* ADR-016: a projeção é a fonte do bloqueio preventivo; GET current é fallback
     para payload que ainda não a carrega. */
  const projectedBlocked = generationAction?.state === "BLOCKED" ? generationAction : null;
  const projectedNote = projectedBlocked ? blockedActionCopy(projectedBlocked) : null;
  const fallbackNote = !generationAction && blockedByOther ? BLOCKED_ACTIVE_MESSAGE : null;
  /* Em andamento o ContentsView já comunica o estado; sucesso pleno não oferece ação. */
  if (active || (!job && readiness !== "PENDING") || (job?.status === "SUCCEEDED" && !degraded.degraded)) return null;
  return (
    <div aria-busy={busy} className={[styles.state, styles.contentsActions].join(" ")}>
      {failed && job ? (
        <div aria-live="polite" role="alert">
          <p className={styles.stateLine}>
            <strong>{statusLabels[job.status]}</strong>{job.error ? ` · ${job.error}` : ` · ${statusMessage(job.status)}`}
          </p>
          <div className={styles.actions}>
            <Button disabled={busy} onClick={() => void retry()} type="button">
              {busy ? "Tentando novamente…" : "Tentar novamente"}
            </Button>
          </div>
        </div>
      ) : degraded.degraded && job ? (
        <div aria-live="polite" role="alert">
          <p className={styles.stateLine}>
            <strong>{statusLabels[job.status]}</strong> · Não foi possível carregar o resultado desta análise. Seus dados permanecem preservados.
          </p>
          {degraded.generateMissing && (
            <div className={styles.actions}>
              <Button className={styles.stateAction} disabled={busy} onClick={onGenerateMissing} type="button">
                {busy ? "Gerando faltantes…" : "Gerar faltantes"}
              </Button>
            </div>
          )}
        </div>
      ) : partial && job ? (
        <div aria-live="polite" role="status">
          <p className={styles.stateLine}>
            <strong>{statusLabels[job.status]}</strong> · {`${partial.delivered} de ${partial.expected} conteúdos prontos.`}
          </p>
          {partial.missing.length > 0 && (
            <ul className={styles.missingList}>
              {partial.missing.map((item, index) => (
                <li key={`${index}-${item.position ?? "x"}-${item.reason.slice(0, 20)}`}>
                  {item.position !== null ? `Conteúdo ${pad2(item.position)} ` : "Um conteúdo "}
                  {item.reason}.
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <Button className={styles.stateAction} disabled={busy} onClick={onGenerateMissing} type="button">
              {busy ? "Gerando faltantes…" : "Gerar faltantes"}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          {/* PENDING sem job: nunca teve análise comprovada em mãos (ou a carga
              falhou antes) — o backend segue autoritativo no POST. */}
          <Button disabled={busy || blockedByOther || !!projectedBlocked} onClick={() => void start()} type="button">
            {busy ? "Iniciando análise…" : "Analisar produto"}
          </Button>
          {(projectedNote ?? fallbackNote) && <p className={styles.blockedNote}>{projectedNote ?? fallbackNote}</p>}
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
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
        <p className={styles.eyebrow}>
          <Sparkles aria-hidden="true" className={[styles.sectionIcon, styles.sectionIconIntelligence].join(" ")} />
          Commerce Intelligence
        </p>
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
                  {phase.state === "done" && <Check aria-hidden="true" />}
                  {phase.state === "failed" && <CircleAlert aria-hidden="true" />}
                  {phase.state === "active" && phaseStateLabels[phase.state]}
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
export function StrategyView({ job }: { job: GenerationRecord | null }) {
  if (!job?.strategy) return <EmptyRegion>A estratégia aparece aqui quando a análise concluir.</EmptyRegion>;
  const strategy = strategyModel(job.strategy);
  const triplet = [
    { icon: HeartCrack, title: "Dores", items: strategy.pains },
    { icon: Heart, title: "Desejos", items: strategy.desires },
    { icon: Gift, title: "Benefícios", items: strategy.benefits },
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
            <p className={styles.positioningLabel}>
              <Sparkles aria-hidden="true" className={[styles.sectionIcon, styles.sectionIconIntelligence].join(" ")} />
              Posicionamento
            </p>
            <p className={styles.positioningText}>{strategy.positioning}</p>
          </section>
        )}
        <section aria-label="Resumo para criação" className={styles.strategySummary}>
          <h3>Direção para criar</h3>
          {strategy.audiences[0] && (
            <p><strong>Público prioritário:</strong> {strategy.audiences[0]}</p>
          )}
          {strategy.benefits[0] && (
            <p><strong>Benefício principal:</strong> {strategy.benefits[0]}</p>
          )}
        </section>
        <details className={styles.strategyDetails}>
          <summary>Ver estratégia completa</summary>
          <div className={styles.strategyDetailsBody}>
        {strategy.audiences.length > 0 && (
          <section className={styles.strategySection}>
            <h3 className={styles.sectionTitle}>
              <Users aria-hidden="true" className={styles.sectionIcon} />
              Públicos prioritários
            </h3>
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
                  <h3 className={[styles.sectionTitle, styles.tripletTitle].join(" ")}>
                    <column.icon aria-hidden="true" className={styles.sectionIcon} />
                    {column.title}
                  </h3>
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
            <h3 className={styles.sectionTitle}>
              <Shield aria-hidden="true" className={styles.sectionIcon} />
              Objeções que precisamos vencer
            </h3>
            <ul className={styles.objectionList}>
              {strategy.objections.map((objection, index) => {
                const argument = strategy.objectionArguments.get(objection);
                return (
                  <li className={styles.objectionItem} key={`${index}-${objection}`}>
                    {argument ? (
                      <details>
                        <summary>
                          {objection}
                          <ChevronRight aria-hidden="true" className={styles.objectionChevron} />
                        </summary>
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
            <h3 className={styles.sectionTitle}>
              <Megaphone aria-hidden="true" className={styles.sectionIcon} />
              Argumentos de venda
            </h3>
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
            <h3 className={styles.sectionTitle}>
              <Compass aria-hidden="true" className={styles.sectionIcon} />
              Ângulos prioritários
            </h3>
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
          </div>
        </details>
      </div>
      {strategy.active && (
        <aside className={styles.strategyAside}>
          <section className={styles.asideCard}>
            <h2>Estratégia</h2>
            <p className={styles.asideStatus}>Ativa</p>
            <p>Esta estratégia orienta os conteúdos deste produto.</p>
          </section>
        </aside>
      )}
    </div>
  );
}

/** Aba Conteúdos: leitor de Briefings com navegação linear entre conteúdos. */
export function ContentsView({ job, active }: { job: GenerationRecord | null; active: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (active) {
    return (
      <section className={styles.panel} id="generated-contents">
        <p>A análise está em andamento. Os Briefings aparecem aqui quando concluir — nenhum conteúdo parcial é exibido.</p>
      </section>
    );
  }
  const published = !!job && (job.status === "SUCCEEDED" || job.status === "SUCCEEDED_PARTIAL");
  if (!job || !published) {
    return (
      <section className={styles.panel} id="generated-contents">
        <p>Os Briefings aparecem aqui quando a análise concluir.</p>
      </section>
    );
  }
  // SUCCEEDED_PARTIAL publica os D itens aprovados pelo envelope (server-
  // authoritative); SUCCEEDED pleno permanece exato-N (ADR-021).
  const expectedPublished = job.status === "SUCCEEDED" ? job.targetContentCount : job.deliveredCount ?? -1;
  if (job.status !== "SUCCEEDED_PARTIAL" && job.contents.length !== expectedPublished) {
    return (
      <section className={styles.panel} id="generated-contents">
        <p role="alert">Os conteúdos ainda não estão prontos. Nenhum resultado parcial será apresentado. Tente novamente em instantes.</p>
      </section>
    );
  }
  if (job.contents.length < 1) {
    return (
      <section className={styles.panel} id="generated-contents">
        <p role="alert">Os conteúdos ainda não estão prontos. Nenhum resultado parcial será apresentado. Tente novamente em instantes.</p>
      </section>
    );
  }
  const items = briefingItems(job.contents);
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  return (
    <section aria-label="Conteúdos" className={styles.panel} id="generated-contents" tabIndex={-1}>
      {selected && (
        <BriefingDetail
          index={selectedIndex}
          item={selected}
          key={selected.id}
          onNavigate={(nextIndex) => setSelectedId(items[nextIndex]?.id ?? null)}
          total={items.length}
        />
      )}
    </section>
  );
}

/** Aba Histórico: agregados financeiros, com detalhes por Conteúdo sob demanda. */
export function HistoryView({
  history,
  loading,
  error,
}: {
  history: ProductHistoryResponse | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) return <EmptyRegion>Carregando o histórico de custos…</EmptyRegion>;
  if (error) return <section className={styles.panel} role="alert"><p>{error}</p></section>;
  if (!history || history.jobs.length === 0) return <EmptyRegion>Nenhuma análise registrada até agora.</EmptyRegion>;

  const model = historyViewModel(history);
  return (
    <section aria-label="Histórico de custos" className={styles.historyList}>
      {model.jobs.map((item, index) => (
        <article className={styles.historyItem} key={`${item.dateLabel}-${index}`}>
          <div className={styles.historyHeader}>
            <div>
              <h2>{item.dateLabel}</h2>
              <p>{item.statusLabel} · {item.requestedContentsLabel}</p>
            </div>
            <div aria-label={`Custo estimado: ${item.cost.label}. ${item.cost.completenessLabel}.`} className={styles.historyCost}>
              <strong>{item.cost.label}</strong>
              <span>{item.cost.completenessLabel}</span>
            </div>
          </div>
          {item.contents.length > 0 && (
            <details className={styles.disclosure}>
              <summary>Ver custos por Conteúdo</summary>
              <ul className={styles.historyContentList}>
                {item.contents.map((content, contentIndex) => (
                  <li key={`${content.positionLabel}-${contentIndex}`}>
                    <span>{content.positionLabel}</span>
                    <span aria-label={`Custo: ${content.cost.label}. ${content.cost.completenessLabel}.`}>
                      {content.cost.label} · {content.cost.completenessLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
