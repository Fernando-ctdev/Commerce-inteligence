"use client";

// Slice 013 — view de conteúdos publicados do Produto: galeria de cards com o
// DTO público do read model (published-content-contract) e drawer do conteúdo
// selecionado (src/components/ui/drawer.tsx). Nenhuma normalização de
// métricas/negócio no cliente: valores escalam como chegam do endpoint, zero,
// false e null preservados, campo conhecido ausente é "—". Sem busca, ordenação
// client-side, autoplay, fetch de mídia ou geração de roteiro.
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Search, ShoppingCart, TrendingUp, XIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

import type { LinkedContentsResponse, PublishedVideo } from "../../modules/products/published-content-contract";
import { loadPublishedContents } from "./published-contents-api";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import styles from "./published-contents-view.module.css";

/** Recorte do cliente: 10 itens por página do endpoint (decisão do usuário
 *  2026-09-24; antes 9). Só recorte da galeria — nada derivado no cliente. */
export const PAGE_SIZE = 10;

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

/* Recorte do detail (decisão do usuário 2026-09-24): seis métricas apenas.
   vvCnt é a ÚNICA visualização (views é inválida/duplicada); ctr e
   completionRate seguem só no card da galeria; directGmv e newFollowerCnt
   removidos. Allowlist do contrato inalterada — o filtro é só de exibição. */
const METRIC_LABELS: Record<string, string> = {
  vvCnt: "Visualizações",
  gmv: "GMV",
  itemSoldCnt: "Itens vendidos",
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
 *  existe e é diferente; qualquer falha seguinte é terminal e PRESERVA
 *  fallbackUsed — a src não volta ao principal, então um terceiro onError
 *  não reinicia o ciclo. */
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
  return { fallbackUsed, playbackFailed: true };
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

export type PublishedContentsSort = "recent" | "oldest";

/** Duração em MM:SS (minutos não limitados); ausente/inválida → null. */
export function formatDuration(seconds?: number): string | null {
  if (
    seconds === undefined ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return null;
  }
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

const publishedTime = (video: PublishedVideo): number | null => {
  if (!video.publishedAt) return null;
  const time = new Date(video.publishedAt).getTime();
  return Number.isNaN(time) ? null : time;
};

/** Busca por título/assunto (business.productTitle) e ordenação por publicação
 *  sobre os vídeos JÁ carregados — nunca sugere dados fora das páginas.
 *  Sem data válida afunda nos dois modos, ordem relativa preservada. */
export function filterAndSortVideos(
  videos: PublishedVideo[],
  query: string,
  sort: PublishedContentsSort,
): PublishedVideo[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? videos.filter((video) =>
        [video.title ?? "", String(video.business.productTitle ?? "")]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
    : [...videos];
  const dated = filtered.filter((video) => publishedTime(video) !== null);
  const undated = filtered.filter((video) => publishedTime(video) === null);
  const direction = sort === "oldest" ? 1 : -1;
  dated.sort(
    (a, b) => direction * ((publishedTime(a) ?? 0) - (publishedTime(b) ?? 0)),
  );
  return [...dated, ...undated];
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
  absentValue = "—",
  renderWhenEmpty = false,
}: {
  title: string;
  labels: Record<string, string>;
  record: PublishedVideo["metrics"];
  /** Métricas de vídeo ausentes mostram 0 (decisão do usuário); negócio e
   *  métricas de produto continuam com — explícito. null real segue "null". */
  absentValue?: string;
  /** Renderiza os tiles mesmo sem nenhuma chave presente (usado só pela
   *  seção de métricas de vídeo, que vira 0 com record vazio). */
  renderWhenEmpty?: boolean;
}) {
  /* Só rótulos estáticos allowlisted: chave fora do mapa nunca aparece, nem
     com rótulo cru. */
  const present = Object.keys(labels).filter((key) => key in record);
  if (present.length === 0 && !renderWhenEmpty) return null;
  return (
    <section className={styles.metricsSection}>
      <h4>{title}</h4>
      <dl className={styles.tiles}>
        {Object.keys(labels).map((key) =>
          key in record ? (
            <MetricTile key={key} label={labels[key]} value={scalar(record[key])} />
          ) : (
            <MetricTile key={key} label={labels[key]} value={absentValue} />
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
        <MetricSection
          title="Métricas"
          labels={METRIC_LABELS}
          record={video.metrics}
          absentValue="0"
          renderWhenEmpty
        />
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

/** Lista (master) de conteúdos publicados: contagem contextual, controles de
 *  busca/ordenação FUNCIONAIS sobre os vídeos já carregados (decisão do
 *  usuário 2026-09-23; nunca sugerem dados fora das páginas), botão de
 *  seleção acessível e Carregar mais quando houver página. Exportado para
 *  teste de markup. */
export function PublishedContentsGallery({
  error,
  loading,
  loadingMore,
  onSelect,
  onLoadMore,
  onQueryChange,
  onRetry,
  onSortChange,
  query,
  response,
  selectedItemId,
  sort,
}: {
  response: LinkedContentsResponse | null;
  selectedItemId: string | null;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  sort: PublishedContentsSort;
  onSortChange: (sort: PublishedContentsSort) => void;
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

  const visibleVideos = filterAndSortVideos(videos, query, sort);

  return (
    <div className={styles.gallery}>
      <h3 className={styles.count}>Conteúdos vinculados ({response.total})</h3>
      <div className={styles.controls}>
        <div className={styles.searchField}>
          <label className={styles.srOnly} htmlFor="published-contents-search">
            Buscar por título ou assunto
          </label>
          <Search aria-hidden="true" className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            id="published-contents-search"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar por título ou assunto..."
            type="search"
            value={query}
          />
        </div>
        <div>
          <label className={styles.srOnly} htmlFor="published-contents-sort">
            Ordenar conteúdos
          </label>
          <select
            aria-label="Ordenar conteúdos"
            className={styles.sortSelect}
            id="published-contents-sort"
            onChange={(event) =>
              onSortChange(event.target.value as PublishedContentsSort)
            }
            value={sort}
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
          </select>
        </div>
      </div>
      {visibleVideos.length === 0 ? (
        <p className={styles.state}>Nenhum conteúdo encontrado para a busca.</p>
      ) : (
        <ul className={styles.cards}>
          {visibleVideos.map((video) => {
            const selected = video.itemId === selectedItemId;
            const date = formatDate(video.publishedAt);
            const duration = formatDuration(video.duration);
            return (
              <li key={video.itemId}>
                <button
                  type="button"
                  className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(video.itemId)}
                >
                  {/* Frame da thumb: capa + badge de duração ancorados aqui,
                      não no card inteiro. */}
                  <span className={styles.coverFrame}>
                    <CardCover key={video.coverUrl} coverUrl={video.coverUrl} />
                    {duration ? (
                      <span className={styles.durationBadge}>{duration}</span>
                    ) : null}
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.cardTitle}>{video.title ?? video.itemId}</span>
                    {date ? <span className={styles.cardDate}>{date}</span> : null}
                    <span className={styles.cardMetrics}>
                      <CardMetric
                        label="Visualizações"
                        icon={<Eye aria-hidden />}
                        value={video.metrics.vvCnt}
                      />
                      <CardMetric label="GMV" icon={<ShoppingCart aria-hidden />} value={video.metrics.gmv} />
                      <CardMetric label="CTR" icon={<TrendingUp aria-hidden />} value={video.metrics.ctr} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
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

/** Decisão do fallback da capa, espelho do fallback único do player: img só
 *  enquanto coverUrl existe E ainda não falhou; erro é terminal (não volta a
 *  tentar a mesma URL a cada render). Exportado para teste unitário. */
export function coverFallbackActive(failed: boolean, coverUrl?: string): boolean {
  return failed || !coverUrl;
}

/** Capa do card: começa com img quando coverUrl existe; erro de carga troca
 *  para o fallback visual existente — ícone quebrado/área branca nunca aparecem
 *  (bug 098773fb). O chamador keya por coverUrl: URL nova remonta e zera o
 *  estado. Duração/frame/seleção ficam fora e não dependem da capa. */
function CardCover({ coverUrl }: { coverUrl?: string }) {
  const [failed, setFailed] = useState(false);
  if (coverFallbackActive(failed, coverUrl)) {
    return <span className={styles.coverFallback}>Sem prévia</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- thumbnail do DTO; next/image exige domínios em runtime
    <img
      alt=""
      className={styles.cover}
      loading="lazy"
      onError={() => setFailed(true)}
      src={coverUrl}
    />
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
  productTitle,
  productId,
}: {
  active: boolean;
  /** Nome do Product para o header do overlay (vem do ProductRecord, não do payload). */
  productTitle: string;
  productId: string;
}) {
  const [gallery, setGallery] = useState<GalleryState>(IDLE);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PublishedContentsSort>("recent");
  const isMobile = useIsMobile();
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
     layout empilhado (≤767px). Depende também de drawerOpen: abrir o drawer
     do item padrão (primeira entrada, já seleção efetiva) agenda o foco.
     rAF com cancel cobre montagem do portal do drawer no commit seguinte;
     com o drawer fechado o ref é null e o helper não faz nada. */
  useEffect(() => {
    if (!drawerOpen || !effectiveId) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    let raf = 0;
    raf = window.requestAnimationFrame(() =>
      focusDetailTitle(headingRef.current, true),
    );
    return () => window.cancelAnimationFrame(raf);
  }, [drawerOpen, effectiveId]);

  if (!active) return null;

  const handlePlaybackError = () => {
    if (!effectiveSelected) return;
    const next = playbackFallbackState(fallbackUsed, effectiveSelected);
    setFallbackUsed(next.fallbackUsed);
    setPlaybackFailed(next.playbackFailed);
  };

  const drawerBody = (
    <div className={styles.drawerScroll}>
      {effectiveSelected ? (
        <PublishedContentDetail
          video={effectiveSelected}
          fallbackUsed={fallbackUsed}
          playbackFailed={playbackFailed}
          onPlaybackError={handlePlaybackError}
          headingRef={headingRef}
        />
      ) : null}
    </div>
  );

  return (
    <section className={styles.view}>
      <PublishedContentsGallery
        response={gallery.response}
        selectedItemId={effectiveId}
        error={gallery.error}
        loading={gallery.loading}
        loadingMore={gallery.loadingMore}
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        onSelect={(itemId) => {
          setSelectedItemId(itemId);
          setDrawerOpen(true);
        }}
        onLoadMore={() => void load(gallery.currentPage + 1, true)}
        onRetry={() => void load(gallery.currentPage || 1, gallery.currentPage > 1)}
      />
      {/* Mesmo padrão reutilizável do ProductCreateOverlay (DESIGN.md §3):
          Sheet lateral no desktop, Drawer bottom sheet no mobile. */}
      {isMobile ? (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} swipeDirection="right">
          <DrawerContent className="data-[swipe-axis=x]:w-full max-w-[40rem]">
            <DrawerHeader className="flex-row items-center justify-between border-b px-4 py-3">
              <DrawerTitle className="min-w-0 truncate text-base font-semibold">
                {productTitle}
              </DrawerTitle>
              <DrawerClose
                aria-label="Fechar conteúdo selecionado"
                render={<Button size="icon-sm" variant="ghost" />}
              >
                <XIcon aria-hidden="true" />
              </DrawerClose>
            </DrawerHeader>
            {drawerBody}
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-xl"
            showCloseButton={false}
          >
            {/* Header visível de uma linha: título à esquerda, close dentro
                do header (sem × absoluto do primitivo). Mesmo padrão do
                Drawer mobile. */}
            <SheetHeader className="flex-row items-center justify-between gap-2 border-b py-3 pl-4 pr-2">
              <SheetTitle className="min-w-0 truncate text-base font-semibold">
                {productTitle}
              </SheetTitle>
              <SheetDescription className="sr-only">
                Detalhe do conteúdo publicado selecionado.
              </SheetDescription>
              <SheetClose
                aria-label="Fechar conteúdo selecionado"
                render={<Button size="icon-sm" variant="ghost" />}
              >
                <XIcon aria-hidden="true" />
              </SheetClose>
            </SheetHeader>
            {drawerBody}
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}
