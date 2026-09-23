"use client";

// Slice 013 — view de conteúdos publicados do Produto: galeria de cards com o
// DTO público do read model (published-content-contract) e drawer do conteúdo
// selecionado (src/components/ui/drawer.tsx). Nenhuma normalização de
// métricas/negócio no cliente: valores escalam como chegam do endpoint, zero,
// false e null preservados, campo conhecido ausente é "—". Sem busca, ordenação
// client-side, autoplay, fetch de mídia ou geração de roteiro.
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, ShoppingCart, TrendingUp } from "lucide-react";

import type { LinkedContentsResponse, PublishedVideo } from "../../modules/products/published-content-contract";
import { loadPublishedContents } from "./published-contents-api";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import styles from "./published-contents-view.module.css";

const PAGE_SIZE = 20;

type GalleryState = {
  response: LinkedContentsResponse | null;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  currentPage: number;
};

const IDLE: GalleryState = {
  response: null,
  error: null,
  loading: false,
  loadingMore: false,
  currentPage: 0,
};

/* Rótulos estáticos dos campos allowlisted do contrato (brief Step 5). Chaves
   fora destes mapas nunca devem chegar da API; se chegarem, aparecem com a
   chave crua em vez de serem escondidas silenciosamente. */
const BUSINESS_LABELS: Record<string, string> = {
  productTitle: "Produto",
  title: "Título",
  categoryName: "Categoria",
  priceLabel: "Preço",
  sellerName: "Vendedor",
  sellerId: "ID do vendedor",
  stockCount: "Estoque",
  canAdd: "Pode ser adicionado",
  commission: "Comissão",
  commissionRate: "Taxa de comissão",
  commissionExpense: "Despesa de comissão",
  labels: "Etiquetas",
};

const METRIC_LABELS: Record<string, string> = {
  views: "Visualizações",
  vvCnt: "Visualizações válidas",
  newFollowerCnt: "Novos seguidores",
  ctr: "CTR",
  gmv: "GMV",
  directGmv: "GMV direto",
  itemSoldCnt: "Itens vendidos",
  completionRate: "Taxa de conclusão",
  likes: "Curtidas",
  comments: "Comentários",
  shares: "Compartilhamentos",
};

const PRODUCT_METRIC_LABELS: Record<string, string> = {
  productClicks: "Cliques no produto",
  productUnits: "Unidades vendidas",
  productRevenue: "Receita do produto",
};

const ALL_METRIC_LABELS = { ...METRIC_LABELS, ...PRODUCT_METRIC_LABELS };

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatDate(iso?: string) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

/* Escalar do DTO como chega: null permanece "null" (preservado, distinto de
   ausência "—"); nenhum valor é derivado, formatado ou somado no cliente. */
const scalar = (value: LinkedContentsResponse["videos"][number]["metrics"][string]) =>
  value === null ? "null" : String(value);

/** Seleção efetiva (SPEC §8): escolha do usuário prevalece; sem escolha, a
 *  primeira entrada — estável quando páginas seguintes são anexadas. */
export function resolveSelection(
  selectedItemId: string | null,
  videos: PublishedVideo[],
): PublishedVideo | null {
  return videos.find((video) => video.itemId === selectedItemId) ?? videos[0] ?? null;
}

/** Fallback único (SPEC §9): a primeira falha troca para o backup quando ele
 *  existe e é diferente; qualquer falha seguinte encerra, sem loop. */
export function playbackFallbackState(
  fallbackUsed: boolean,
  video: Pick<PublishedVideo, "playbackUrl" | "fallbackPlaybackUrl">,
): { fallbackUsed: boolean; playbackFailed: boolean } {
  if (
    !fallbackUsed &&
    video.fallbackPlaybackUrl &&
    video.fallbackPlaybackUrl !== video.playbackUrl
  ) {
    return { fallbackUsed: true, playbackFailed: false };
  }
  return { fallbackUsed: false, playbackFailed: true };
}

/** Paginação por anexo: itens já renderizados permanecem; página, total e
 *  hasMore vêm da resposta mais recente do endpoint. */
export function mergePage(
  previous: LinkedContentsResponse,
  next: LinkedContentsResponse,
): LinkedContentsResponse {
  return { ...next, videos: [...previous.videos, ...next.videos] };
}

/** Foco do título do detail após seleção, apenas em viewport móvel (SPEC §8).
 *  O matchMedia fica no chamador; aqui só a decisão determinística. */
export function focusDetailTitle(
  heading: HTMLElement | null,
  narrowViewport: boolean,
): void {
  if (narrowViewport && heading) heading.focus();
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tile}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MetricSection({
  title,
  labels,
  record,
}: {
  title: string;
  labels: Record<string, string>;
  record: PublishedVideo["metrics"];
}) {
  /* Só rótulos estáticos allowlisted: chave fora do mapa nunca aparece, nem
     com rótulo cru. Campo conhecido ausente continua como "—" explícito. */
  const present = Object.keys(labels).filter((key) => key in record);
  if (present.length === 0) return null;
  return (
    <section className={styles.metricsSection}>
      <h4>{title}</h4>
      <dl className={styles.tiles}>
        {Object.keys(labels).map((key) =>
          key in record ? (
            <MetricTile key={key} label={labels[key]} value={scalar(record[key])} />
          ) : (
            <MetricTile key={key} label={labels[key]} value="—" />
          ),
        )}
      </dl>
    </section>
  );
}

/** Detail do conteúdo selecionado: player sem autoplay com fallback único,
 *  todas as entradas allowlisted presentes, ausência explícita e CTA de
 *  roteiro derivado desabilitado. Exportado para teste de markup direto. */
export function PublishedContentDetail({
  video,
  fallbackUsed,
  playbackFailed,
  onPlaybackError,
  headingRef,
}: {
  video: PublishedVideo;
  fallbackUsed: boolean;
  playbackFailed: boolean;
  onPlaybackError: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const date = formatDate(video.publishedAt);
  const src =
    fallbackUsed && video.fallbackPlaybackUrl
      ? video.fallbackPlaybackUrl
      : video.playbackUrl;
  return (
    <div className={styles.detail}>
      <div className={styles.playerArea}>
        {src ? (
          <video
            className={styles.player}
            src={src}
            poster={video.coverUrl}
            controls
            preload="none"
            playsInline
            onError={onPlaybackError}
          />
        ) : (
          <p className={styles.playerUnavailable}>Reprodução indisponível para este conteúdo.</p>
        )}
        {playbackFailed ? (
          <p role="alert" className={styles.playbackError}>
            Não foi possível reproduzir este vídeo agora.
          </p>
        ) : null}
      </div>
      <div className={styles.detailBody}>
        <h3 ref={headingRef} className={styles.detailTitle} tabIndex={-1}>
          {video.title ?? video.itemId}
        </h3>
        {date ? <p className={styles.detailDate}>{date}</p> : null}

        <MetricSection
          title="Dados do conteúdo"
          labels={BUSINESS_LABELS}
          record={video.business}
        />
        <MetricSection title="Métricas" labels={METRIC_LABELS} record={video.metrics} />
        <MetricSection
          title="Métricas do produto neste conteúdo"
          labels={PRODUCT_METRIC_LABELS}
          record={video.metrics}
        />

        <footer className={styles.ctaArea}>
          <button type="button" className={styles.cta} disabled>
            Gerar roteiro derivado
          </button>
          <p className={styles.ctaNote}>
            Disponível em uma etapa futura; esta visualização não gera roteiros.
          </p>
        </footer>
      </div>
    </div>
  );
}

/** Lista (master) de conteúdos publicados: contagem contextual, ordem do
 *  endpoint, botão de seleção acessível e Carregar mais quando houver página.
 *  Sem busca nem ordenação client-side. Exportado para teste de markup. */
export function PublishedContentsGallery({
  error,
  loading,
  loadingMore,
  onSelect,
  onLoadMore,
  onRetry,
  response,
  selectedItemId,
}: {
  response: LinkedContentsResponse | null;
  selectedItemId: string | null;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  onSelect: (itemId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <p className={styles.state} aria-live="polite">
        Carregando conteúdos publicados…
      </p>
    );
  }

  /* Erro com cards já renderizados: alert de retry junto da lista — só erro
     inicial (sem resposta) substitui o estado vazio. */
  const hasCards = response !== null && response.videos.length > 0;
  if (error && !hasCards) {
    return (
      <div className={styles.state} role="alert">
        <p>{error}</p>
        <button type="button" className={styles.retry} onClick={onRetry}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!response) return null;

  const videos = response.videos;

  if (videos.length === 0) {
    return (
      <div className={styles.state}>
        <h3>Nenhum conteúdo publicado vinculado</h3>
        <p>
          Quando vídeos publicados ficarem associados ao item da Vitrine deste
          Produto, eles aparecem aqui com as métricas disponíveis.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.gallery}>
      <h3 className={styles.count}>Conteúdos vinculados ({response.total})</h3>
      <ul className={styles.cards}>
        {videos.map((video) => {
          const selected = video.itemId === selectedItemId;
          const date = formatDate(video.publishedAt);
          return (
            <li key={video.itemId}>
              <button
                type="button"
                className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
                aria-pressed={selected}
                onClick={() => onSelect(video.itemId)}
              >
                {video.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thumbnail do DTO; next/image exige domínios em runtime
                  <img className={styles.cover} src={video.coverUrl} alt="" loading="lazy" />
                ) : (
                  <span className={styles.coverFallback}>Sem prévia</span>
                )}
                <span className={styles.cardBody}>
                  <span className={styles.cardTitle}>{video.title ?? video.itemId}</span>
                  {date ? <span className={styles.cardDate}>{date}</span> : null}
                  <span className={styles.cardMetrics}>
                    <CardMetric label="Visualizações" icon={<Eye aria-hidden />} value={video.metrics.views} />
                    <CardMetric label="GMV" icon={<ShoppingCart aria-hidden />} value={video.metrics.gmv} />
                    <CardMetric label="CTR" icon={<TrendingUp aria-hidden />} value={video.metrics.ctr} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <div className={styles.inlineError} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      ) : null}
      {response.hasMore ? (
        <button
          type="button"
          className={styles.loadMore}
          onClick={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? "Carregando…" : "Carregar mais"}
        </button>
      ) : null}
    </div>
  );
}

function CardMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: unknown;
}) {
  if (value === undefined) return null;
  return (
    <span className={styles.cardMetric}>
      {icon}
      <span className={styles.srOnly}>{label} </span>
      {value === null ? "—" : String(value)}
    </span>
  );
}

/** Aba Conteúdos do Produto (Task 5 monta): carrega sob demanda quando ativa,
 *  invalida resposta/seleção ao trocar de Product, ignora resposta stale,
 *  pagina anexando vídeos e mantém o playback fallback por seleção. */
export function PublishedContentsView({
  active,
  productId,
}: {
  active: boolean;
  productId: string;
}) {
  const [gallery, setGallery] = useState<GalleryState>(IDLE);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const requestSeq = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const load = useCallback(
    async (page: number, append: boolean) => {
      const seq = ++requestSeq.current;
      setGallery((prev) => ({
        response: append ? prev.response : null,
        error: null,
        loading: !append,
        loadingMore: append,
        currentPage: page,
      }));
      try {
        const next = await loadPublishedContents(productId, page, PAGE_SIZE);
        if (seq !== requestSeq.current) return;
        setGallery((prev) => ({
          response: append && prev.response ? mergePage(prev.response, next) : next,
          error: null,
          loading: false,
          loadingMore: false,
          currentPage: page,
        }));
      } catch (error) {
        if (seq !== requestSeq.current) return;
        setGallery((prev) => ({
          ...prev,
          error:
            error instanceof Error && error.message
              ? error.message
              : "Não foi possível carregar os conteúdos publicados agora.",
          loading: false,
          loadingMore: false,
        }));
      }
    },
    [productId],
  );

  useEffect(() => {
    if (!active) return;
    setSelectedItemId(null);
    setDrawerOpen(false);
    setFallbackUsed(false);
    setPlaybackFailed(false);
    void load(1, false);
    return () => {
      requestSeq.current += 1;
    };
  }, [active, productId, load]);

  const videos = gallery.response?.videos ?? [];
  /* Primeira entrada é a seleção efetiva até o usuário escolher outra;
     páginas seguintes não trocam (videos[0] permanece). */
  const effectiveSelected = resolveSelection(selectedItemId, videos);
  const effectiveId = effectiveSelected?.itemId ?? null;

  useEffect(() => {
    setFallbackUsed(false);
    setPlaybackFailed(false);
  }, [effectiveId]);

  /* SPEC §8: selecionar move o foco para o título do detail, apenas no
     layout empilhado (≤767px). Com o drawer fechado o ref é null e não há
     o que focar. */
  useEffect(() => {
    if (!effectiveId) return;
    focusDetailTitle(
      headingRef.current,
      window.matchMedia("(max-width: 767px)").matches,
    );
  }, [effectiveId]);

  if (!active) return null;

  const handlePlaybackError = () => {
    if (!effectiveSelected) return;
    const next = playbackFallbackState(fallbackUsed, effectiveSelected);
    setFallbackUsed(next.fallbackUsed);
    setPlaybackFailed(next.playbackFailed);
  };

  return (
    <section className={styles.view}>
      <PublishedContentsGallery
        response={gallery.response}
        selectedItemId={effectiveId}
        error={gallery.error}
        loading={gallery.loading}
        loadingMore={gallery.loadingMore}
        onSelect={(itemId) => {
          setSelectedItemId(itemId);
          setDrawerOpen(true);
        }}
        onLoadMore={() => void load(gallery.currentPage + 1, true)}
        onRetry={() => void load(gallery.currentPage || 1, gallery.currentPage > 1)}
      />
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className={styles.drawerContent}>
          <DrawerHeader className={styles.drawerHeader}>
            <DrawerTitle>Conteúdo selecionado</DrawerTitle>
          </DrawerHeader>
          {effectiveSelected ? (
            <div className={styles.drawerScroll}>
              <PublishedContentDetail
                video={effectiveSelected}
                fallbackUsed={fallbackUsed}
                playbackFailed={playbackFailed}
                onPlaybackError={handlePlaybackError}
                headingRef={headingRef}
              />
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    </section>
  );
}
