import type { ProductManualDraft } from "./product-form-model";

/* Contrato do Slice 012 (ADR-028): o candidato é transitório, factual e
   limitado aos fatos suportados pelo formulário/serviço manual. Seller,
   marca e variantes não existem neste contrato e nunca viram gap.
   features segue no candidato como contrato externo transitório do
   importer, mas não é gap acionável: o formulário não tem mais o campo. */
export type CandidateGap =
  | "name"
  | "description"
  | "category"
  | "price"
  | "priceCurrency";

export type ProductSignals = {
  salesCount?: number;
  ratingValue?: number;
  reviewCount?: number;
};

export type ProductImportCandidate = {
  name?: string;
  description?: string;
  category?: string;
  price?: string;
  priceCurrency?: string;
  features: string[];
  imageRefs: string[];
  sourceUrl: string;
  discountType?: "PERCENTAGE";
  discountValue?: string;
  gaps: CandidateGap[];
  signals?: ProductSignals;
};

/* A consulta por URL nunca retorna Product: partial/gaps/message descrevem
   o candidato e a confirmação continua sendo o POST manual. */
export type ProductImportResult = {
  candidate: ProductImportCandidate;
  partial: boolean;
  gaps: CandidateGap[];
  message: string;
};

export type ContentPreparationPreferences = {
  targetContentCount: number;
  creatorPresence: "on_camera" | "hands_only_product" | "either";
  constraints?: string;
};

export function contentPreparationPreferencesAreValid(preferences: ContentPreparationPreferences) {
  return Number.isInteger(preferences.targetContentCount)
    && preferences.targetContentCount >= 1
    && preferences.targetContentCount <= 10
    && ["on_camera", "hands_only_product", "either"].includes(preferences.creatorPresence)
    && (preferences.constraints === undefined || Array.from(preferences.constraints).length <= 300);
}

/* Merge não destrutivo: só fatos presentes no candidato sobrescrevem o
   manual; ausência não apaga o que o creator digitou. */
function hasManualImages(draft: Pick<ProductManualDraft, "imageReferences">) {
  return (draft.imageReferences ?? "")
    .split(/\r?\n/)
    .some((line) => line.trim().length > 0);
}

export function mergeImportedCandidate(
  draft: ProductManualDraft,
  candidate: ProductImportCandidate,
): ProductManualDraft {
  const currencySupported = (value?: string) =>
    value !== undefined && ["R$", "USD", "EUR"].includes(value);
  return {
    ...draft,
    ...(candidate.name ? { name: candidate.name } : {}),
    ...(candidate.description ? { description: candidate.description } : {}),
    ...(candidate.category ? { category: candidate.category } : {}),
    ...(candidate.price ? { price: candidate.price } : {}),
    ...(currencySupported(candidate.priceCurrency) ? { currency: candidate.priceCurrency } : {}),
    /* Primeira imagem importada apenas — e somente quando o creator ainda
       não tem imagem manual/upload; imagens existentes têm prioridade. */
    ...(candidate.imageRefs[0] && !hasManualImages(draft)
      ? { imageReferences: candidate.imageRefs[0] }
      : {}),
    url: candidate.sourceUrl || draft.url || "",
    /* Desconto do Candidate fica transitório (ADR-031): não mapeia
       para draft/Product/CI — a persistência manual nunca o recebe. */
  };
}

export function candidateState(candidate: Pick<ProductImportCandidate, "gaps">) {
  return candidate.gaps.length === 0 ? "candidate-ready" : "candidate-partial";
}

const GAP_LABELS: Record<CandidateGap, string> = {
  name: "Nome",
  description: "Descrição",
  category: "Categoria",
  price: "Preço",
  priceCurrency: "Moeda",
};

/* Gaps na ordem recebida, com nome legível — texto, nunca só cor. Dados de
   rede chegam como string[]: valores desconhecidos são descartados. */
export function gapLabels(gaps: readonly string[]) {
  return gaps
    .filter((gap): gap is CandidateGap => gap in GAP_LABELS)
    .map((gap) => GAP_LABELS[gap]);
}

const numberSignal = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

const formatSignal = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/* Sinais são exibição somente leitura; nunca entram em draft nem payload. */
export function candidateSignalsForDisplay(
  signals?: ProductSignals,
): Array<{ label: string; value: string }> {
  if (!signals) return [];
  const display: Array<{ label: string; value: string }> = [];
  const salesCount = numberSignal(signals.salesCount);
  const ratingValue = numberSignal(signals.ratingValue);
  const reviewCount = numberSignal(signals.reviewCount);
  if (salesCount !== undefined) display.push({ label: "Vendas", value: formatSignal(salesCount) });
  if (ratingValue !== undefined) display.push({ label: "Nota média", value: formatSignal(ratingValue) });
  if (reviewCount !== undefined) display.push({ label: "Avaliações", value: formatSignal(reviewCount) });
  return display;
}

/* Estados visíveis da importação (SPEC): idle, importing, ready,
   partial e fallback. Mensagens estáveis em pt-BR, sem texto do provedor. */
export type ImportStatusState = "idle" | "importing" | "ready" | "partial" | "fallback";

const IMPORT_STATUS_TEXT: Record<Exclude<ImportStatusState, "idle">, string> = {
  importing: "Importando dados do produto…",
  ready: "Dados importados. Confira e salve o produto.",
  partial: "Importação parcial. Confira, complete o que falta e salve o produto.",
  fallback: "Não foi possível importar agora. Continue com o preenchimento manual; seus dados continuam aqui.",
};

export function importStatusAnnouncement(
  state: ImportStatusState,
  detail?: string,
) {
  if (state === "idle") return "";
  return detail?.trim() ? detail : IMPORT_STATUS_TEXT[state];
}

export function importDisabled(importing: boolean, saving: boolean) {
  return importing || saving;
}
