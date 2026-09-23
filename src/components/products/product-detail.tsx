"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArchiveRestore,
  CircleAlert,
  FileStack,
  MonitorPlay,
  Pencil,
  Save,
  Sparkles,
  Store,
  Video
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionSwitcher, SectionSwitcherContent, SectionSwitcherList, SectionSwitcherTrigger } from "@/components/ui/section-switcher";

import {
  getProduct,
  ProductApiError,
  ProductRecord,
  updateProduct,
} from "./product-api";
import { formatPriceWithCurrency } from "./product-form-model";
import { loadProductHistory, type ProductHistoryResponse } from "./history-api";
import {
  ContentsView,
  GenerationActions,
  HistoryView,
  StrategyView,
} from "./generation-views";
import { PublishedContentsView } from "./published-contents-view";
import { statusMessage } from "./generation-ui-model";
import { ProductCreateForm } from "./product-create-form";
import { useGenerationJob } from "./use-generation-job";
import styles from "./product-detail.module.css";
import showcaseStyles from "./showcase.module.css";

type ProductTab = "strategy" | "contents" | "history";

/* Deep-links separados (Slice 013): #generated-contents continua abrindo o
   conteúdo gerado interno, agora sob Roteiros; a leitura externa de conteúdos
   publicados tem alvo próprio (#published-contents). Histórico não tem hash. */
export const hashToTab = (hash: string): ProductTab | null =>
  hash === "#generated-contents"
    ? "strategy"
    : hash === "#published-contents"
      ? "contents"
      : null;

export const tabToHash = (tab: ProductTab): string =>
  tab === "contents"
    ? "#published-contents"
    : tab === "strategy"
      ? "#generated-contents"
      : "";

/* Ciclo navegável do MVP: Conteúdos → Estratégia → Conteúdos.
   Histórico permanece no código, fora da navegação visível. */
const cycleTabs = ["contents", "strategy"] as const;
type CycleTab = (typeof cycleTabs)[number];

const tabLabels: Record<ProductTab, string> = {
  contents: "Conteúdos",
  strategy: "Roteiros",
  history: "Histórico",
};

function cycleNeighbours(tab: ProductTab): { prev: CycleTab; next: CycleTab } {
  const index = cycleTabs.indexOf(tab as CycleTab);
  const safe = index === -1 ? 0 : index;
  return {
    prev: cycleTabs[(safe + cycleTabs.length - 1) % cycleTabs.length],
    next: cycleTabs[(safe + 1) % cycleTabs.length],
  };
}

/* Vislumbre do produto removido: a aba Produto saiu da navegação; edição
   acontece no drawer da Vitrine e o resumo completo vive no drawer/edição. */

export function ProductDetail({
  id,
}: {
  id: string;
}) {
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProductHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  /* Descrição editável no cabeçalho: lápis entra em edição, o mesmo botão
     vira salvar; clicar fora (blur) ou Escape cancela sem salvar. */
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [tab, setTab] = useState<ProductTab>(() =>
    hashToTab(typeof window === "undefined" ? "" : window.location.hash) ??
      "contents",
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProduct(await getProduct(id));
    } catch (caught) {
      setError(
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível carregar este Product agora.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let disposed = false;
    void loadProductHistory(id)
      .then((value) => {
        if (!disposed) setHistory(value);
      })
      .catch((caught: unknown) => {
        if (!disposed) setHistoryError(caught instanceof Error ? caught.message : "Não foi possível carregar o histórico agora.");
      })
      .finally(() => {
        if (!disposed) setHistoryLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [id]);

  // Deep-link do indicador global: /products/:id#generated-contents abre Conteúdos.
  useEffect(() => {
    const sync = () => {
      const fromHash = hashToTab(window.location.hash);
      if (fromHash) setTab(fromHash);
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function changeTab(next: string) {
    const value = next as ProductTab;
    setTab(value);
    const hash = tabToHash(value);
    window.history.replaceState(
      null,
      "",
      hash ? hash : window.location.pathname,
    );
  }

  const cycle = cycleNeighbours(tab);

  const generation = useGenerationJob({
    productId: product?.active ? product.id : null,
    readiness: product?.readiness ?? "PENDING",
    onProjectionStale: () => void load(),
  });

  if (loading) {
    return (
      <div aria-busy="true" className={styles.state} role="status">
        <h2>Carregando produto…</h2>
        <p>
          O resumo do produto aparece aqui quando os dados chegarem.
        </p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className={styles.state} role="alert">
        <h2>Não foi possível abrir este produto.</h2>
        <p>{error ?? "O produto não está disponível para este Workspace."}</p>
        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={() => void load()}
            type="button"
          >
            Tentar novamente
          </button>
          <Link className={styles.secondaryLink} href="/products">
            Voltar para Vitrine
          </Link>
        </div>
      </div>
    );
  }

  const firstImage = product.imageReferences[0];

  function beginDescriptionEdit() {
    if (!product) return;
    setDescriptionDraft(product.description);
    setDescriptionEditing(true);
  }

  function cancelDescriptionEdit() {
    setDescriptionEditing(false);
    setDescriptionDraft("");
  }

  async function saveDescription() {
    if (!product || descriptionSaving) return;
    const next = descriptionDraft.trim();
    if (!next) {
      toast.error("Informe a descrição do produto.");
      return;
    }
    setDescriptionSaving(true);
    try {
      /* PATCH valida os fatos completos: reenvia os existentes com a
         descrição nova e controle otimista de versão. */
      const mutation = await updateProduct(product.id, {
        name: product.name,
        description: next,
        category: product.category || null,
        price: product.price || null,
        priceCurrency: product.priceCurrency,
        imageRefs: product.imageReferences,
        notes: product.observations || null,
        url: product.url || null,
        expectedVersion: product.version,
      });
      setProduct({
        ...product,
        description: next,
        version: mutation.version ?? product.version,
      });
      cancelDescriptionEdit();
    } catch (caught) {
      toast.error(
        caught instanceof ProductApiError
          ? caught.message
          : "Não foi possível salvar a descrição agora.",
      );
    } finally {
      setDescriptionSaving(false);
    }
  }
  const imageUrl =
    firstImage &&
    /^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,)/i.test(firstImage)
      ? firstImage
      : null;
  const priceText = formatPriceWithCurrency(
    product.price,
    product.priceCurrency,
  );
  const sourceLabel = product.origin
    ? product.origin === "showcase"
      ? "TikTok Shop"
      : "Manual"
    : /tiktok/i.test(product.url)
      ? "TikTok Shop"
      : "Manual";
  const commissionText = product.commission
    ? product.commissionRate !== undefined && product.commissionRate > 0
      ? `${product.commission} (${(product.commissionRate / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)`
      : product.commission
    : null;
  /* "Gerar roteiro de posts" carrega a ação real de análise (PENDING):
      bloqueada enquanto busy, job ativo, bloqueio preventivo (projeção
      ADR-016 ou job ativo em outro Produto) ou readiness ≠ PENDING. */
  const analysisBlocked =
    generation.busy ||
    generation.active ||
    generation.blockedByOther ||
    product.generationAction?.state === "BLOCKED" ||
    generation.readiness !== "PENDING";

  return (
    <>
      {product.active ? (
        <>
          <section
            aria-labelledby="product-summary-title"
            className={styles.objectCard}
          >
            {imageUrl ? (
              <Image
                alt={`Imagem de ${product.name}`}
                className={styles.objectImage}
                height={160}
                src={imageUrl}
                unoptimized
                width={96}
              />
            ) : (
              <div
                aria-label={`Produto ${product.name} sem imagem cadastrada`}
                className={styles.objectImageFallback}
                role="img"
              >
                Sem imagem
              </div>
            )}
            <div className={styles.objectBody}>
              <span className={showcaseStyles.badge}>{sourceLabel}</span>
              <h3 className={styles.objectName} id="product-summary-title">
                {product.name}
              </h3>
              <div className={styles.objectDescriptionRow}>
                {descriptionEditing ? (
                  <textarea
                    aria-label="Descrição do produto"
                    autoFocus
                    className={styles.objectDescriptionInput}
                    maxLength={2000}
                    onBlur={cancelDescriptionEdit}
                    onChange={(event) =>
                      setDescriptionDraft(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") cancelDescriptionEdit();
                    }}
                    rows={3}
                    value={descriptionDraft}
                  />
                ) : (
                  <p
                    className={
                      product.description
                        ? styles.objectDescription
                        : `${styles.objectDescription} ${styles.objectDescriptionEmpty}`
                    }
                    onClick={beginDescriptionEdit}
                  >
                    {product.description}
                  </p>
                )}
                <button
                  aria-label={
                    descriptionEditing
                      ? "Salvar descrição"
                      : "Editar descrição"
                  }
                  className={styles.objectDescriptionAction}
                  disabled={descriptionSaving}
                  onClick={
                    descriptionEditing
                      ? () => void saveDescription()
                      : beginDescriptionEdit
                  }
                  onMouseDown={(event) => {
                    /* Evita o blur do textarea antes do clique: blur fora do
                       botão cancela; clicar em salvar salva. */
                    if (descriptionEditing) event.preventDefault();
                  }}
                  type="button"
                >
                  {descriptionEditing ? (
                    <Save aria-hidden="true" />
                  ) : (
                    <Pencil aria-hidden="true" />
                  )}
                </button>
              </div>
              {/* Quatro fatos da referência: Comissão/Estoque vêm do contrato
                  do Product quando projetados; sem dados, exibem "—". */}
              <dl className={styles.objectFacts}>
                <div>
                  <dt>Categoria</dt>
                  <dd>{product.category || "—"}</dd>
                </div>
                <div>
                  <dt>Preço</dt>
                  <dd>{priceText ?? "—"}</dd>
                </div>
                <div>
                  <dt>Comissão</dt>
                  <dd>{commissionText ?? "—"}</dd>
                </div>
                <div>
                  <dt>Estoque</dt>
                  <dd>
                    {product.stockCount !== undefined
                      ? product.stockCount
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>
            {/* Ação real de análise no botão primário (PENDING); live e
                multiplicador permanecem visuais sem handler por decisão de
                escopo. */}
            <div className={styles.objectActions}>
              <Button
                aria-busy={generation.busy}
                className={styles.objectActionPrimary}
                disabled={analysisBlocked}
                onClick={() => void generation.start()}
                type="button"
              >
                <Sparkles aria-hidden="true" />
                {generation.busy
                  ? "Iniciando análise…"
                  : "Gerar roteiro de posts"}
              </Button>
              <Button className={styles.objectActionSoft} type="button">
                <Video aria-hidden="true" />
                Gerar roteiro de live
              </Button>
              <Button className={styles.objectActionOutline} type="button">
                <FileStack aria-hidden="true" />
                Multiplicar conteúdos
              </Button>
            </div>
          </section>
          {generation.failed && generation.job && (
            <div className={styles.failureBanner} role="alert">
              <CircleAlert aria-hidden="true" />
              <p>{`${statusMessage(generation.job.status)} Você pode tentar novamente.`}</p>
            </div>
          )}
          <SectionSwitcher
            className={styles.tabs}
            onValueChange={changeTab}
            value={tab}
          >
          <div className={styles.tabsScroller}>
            <SectionSwitcherList className={styles.tabsList}>
              <SectionSwitcherTrigger value="contents">Conteúdos</SectionSwitcherTrigger>
              <SectionSwitcherTrigger value="strategy">Roteiros</SectionSwitcherTrigger>
              <SectionSwitcherTrigger value="history">Histórico</SectionSwitcherTrigger>
            </SectionSwitcherList>
          </div>
          <nav aria-label="Navegar entre seções" className={styles.tabsMobile}>
            <button
              aria-label={`Seção anterior: ${tabLabels[cycle.prev]}`}
              className={styles.tabsMobileButton}
              onClick={() => changeTab(cycle.prev)}
              type="button"
            >
              {tabLabels[cycle.prev]}
            </button>
            <button
              aria-label={`Próxima seção: ${tabLabels[cycle.next]}`}
              className={styles.tabsMobileButton}
              onClick={() => changeTab(cycle.next)}
              type="button"
            >
              {tabLabels[cycle.next]}
            </button>
          </nav>
          {/* Conteúdos = leitura externa tenant-scoped (Slice 013); carrega
              só com a aba ativa. Conteúdo gerado interno permanece sob
              Roteiros, sem PublishedVideo cruzando para lá. */}
          <SectionSwitcherContent className={styles.tabContent} value="contents">
            <PublishedContentsView
              active={tab === "contents"}
              productId={product.id}
              productTitle={product.name}
            />
          </SectionSwitcherContent>
          <SectionSwitcherContent className={styles.tabContent} value="strategy">
            <StrategyView job={generation.job} />
            <GenerationActions
              generationAction={product.generationAction}
              onGenerateMissing={() => void generation.generateMissing()}
              readiness={generation.readiness}
              showPrimaryAction={false}
              state={generation}
            />
            <ContentsView
              active={generation.active}
              job={generation.job}
            />
          </SectionSwitcherContent>
          <SectionSwitcherContent className={styles.tabContent} value="history">
            <HistoryView error={historyError} history={history} loading={historyLoading} />
          </SectionSwitcherContent>
        </SectionSwitcher>
        </>
      ) : (
        <>
          <section
            aria-labelledby="product-actions-title"
            className={styles.objectHeader}
          >
            <div className={styles.objectIdentity}>
              <h2 className={styles.objectTitle} id="product-actions-title">
                <Store aria-hidden="true" className={styles.pageTitleIcon} />
                <span className={styles.objectTitleText}>{product.name}</span>
              </h2>
            </div>
          </section>
          <div className={styles.archivedLayout}>
            <ProductCreateForm
              mode="edit"
              onSaved={setProduct}
              product={product}
            />
            <section aria-labelledby="product-actions-card-title" className={styles.sideCard}>
              <div className={styles.sideCardHeading}>
                <ArchiveRestore aria-hidden="true" />
                <h2 id="product-actions-card-title">Produto arquivado</h2>
              </div>
              <p>Este produto não aparece entre os produtos ativos.</p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
