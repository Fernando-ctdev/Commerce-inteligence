export const PRODUCT_IMPORT_STATES = [
  "IDLE",
  "OPENING",
  "LOGIN_REQUIRED",
  "CAPTCHA_REQUIRED",
  "2FA_REQUIRED",
  "USER_INTERACTION_REQUIRED",
  "PAUSED",
  "CANCELLED",
  "EXTRACTING",
  "READY",
  "ERROR",
  "CONFIRMING",
  "CONFIRMED",
  "DUPLICATE",
  "PROFILE_UNAVAILABLE",
  "LIMIT",
] as const;

export type ProductImportState = (typeof PRODUCT_IMPORT_STATES)[number];

export type ProductCandidate = {
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  price?: { amount: number; currency: string };
  features: string[];
  images: string[];
  seller?: string;
  variants?: string[];
  sourceUrl: string;
};

export type ProductCandidateDraft = {
  name: string;
  description: string;
  category: string;
  brand: string;
  seller: string;
  price: string;
  currency: string;
  features: string;
  variants: string;
  images: string;
  sourceUrl: string;
};

export type ProductCandidateFieldErrors = Partial<Record<keyof ProductCandidateDraft, string>>;

export type ProductImportRecord = {
  id: string;
  version: number;
  state: ProductImportState;
  sourceUrl: string;
  candidate?: ProductCandidate;
  gaps?: string[];
  error?: string;
  productId?: string;
  interactiveUrl?: string;
  canResume?: boolean;
};

const stateLabels: Record<ProductImportState, string> = {
  IDLE: "Pronto para analisar",
  OPENING: "Abrindo TikTok…",
  LOGIN_REQUIRED: "Faça login no TikTok nesta janela para continuar",
  CAPTCHA_REQUIRED: "Conclua a verificação no TikTok para continuar",
  "2FA_REQUIRED": "Conclua a confirmação em duas etapas no TikTok",
  USER_INTERACTION_REQUIRED: "Conclua a confirmação solicitada no TikTok",
  PAUSED: "A análise está pausada",
  CANCELLED: "Análise cancelada",
  EXTRACTING: "Extraindo dados…",
  READY: "Produto encontrado para revisão",
  ERROR: "Não foi possível analisar o produto",
  CONFIRMING: "Confirmando produto…",
  CONFIRMED: "Produto confirmado",
  DUPLICATE: "Você já adicionou este produto",
  PROFILE_UNAVAILABLE: "Browser indisponível",
  LIMIT: "Capacidade de produtos indisponível",
};

export function productImportStateLabel(state: ProductImportState) {
  return stateLabels[state];
}

export function productImportShowsInteractiveBrowser(state: ProductImportState, interactiveUrl?: string) {
  return Boolean(interactiveUrl && ["LOGIN_REQUIRED", "CAPTCHA_REQUIRED", "2FA_REQUIRED", "USER_INTERACTION_REQUIRED"].includes(state));
}

export function validateProductImportUrl(value: string) {
  if (!value.trim()) return "Cole a URL do produto do TikTok Shop.";
  if (value.length > 2048) return "A URL deve ter no máximo 2.048 caracteres.";
  try {
    const url = new URL(value.trim());
    if (!(url.protocol === "http:" || url.protocol === "https:")) return "Use uma URL http ou https.";
    if (url.username || url.password) return "A URL não pode conter credenciais.";
    if (!(url.hostname === "shop.tiktok.com" || url.hostname.endsWith(".tiktok.com"))) return "Use uma URL reconhecida do TikTok Shop.";
    if (url.hash) return "Remova o fragmento da URL antes de analisar.";
    if (!url.hostname) return "Informe uma URL válida do TikTok Shop.";
  } catch {
    return "Informe uma URL válida do TikTok Shop.";
  }
  return null;
}

export function candidateCanBeConfirmed(candidate?: Pick<ProductCandidateDraft, "name" | "description"> | null) {
  return Boolean(candidate?.name.trim() && candidate?.description.trim());
}

export function validateCandidateDraft(draft: ProductCandidateDraft): ProductCandidateFieldErrors {
  const errors: ProductCandidateFieldErrors = {};
  const length = (value: string) => Array.from(value.trim()).length;
  if (!draft.name.trim()) errors.name = "Informe o nome do produto.";
  else if (length(draft.name) > 200) errors.name = "Máximo de 200 caracteres.";
  if (!draft.description.trim()) errors.description = "Informe uma descrição do produto.";
  else if (length(draft.description) > 5000) errors.description = "Máximo de 5.000 caracteres.";
  if (length(draft.category) > 120) errors.category = "Máximo de 120 caracteres.";

  for (const [field, maxItems] of [["features", 20], ["variants", 20], ["images", 10]] as const) {
    const items = draft[field].split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (items.length > maxItems) errors[field] = `Máximo de ${maxItems} itens.`;
    if (items.some((item) => Array.from(item).length > (field === "images" ? 2048 : 300))) errors[field] = field === "images" ? "Cada imagem pode ter até 2.048 caracteres." : "Cada item pode ter até 300 caracteres.";
    if (field === "images" && items.some((item) => {
      try {
        const url = new URL(item);
        return !(url.protocol === "http:" || url.protocol === "https:") || Boolean(url.username || url.password);
      } catch {
        return true;
      }
    })) errors.images = "Use somente URLs http(s) sem credenciais.";
  }

  if (draft.price.trim()) {
    const amount = Number(draft.price.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || !/^\d+(?:[.,]\d{1,2})?$/.test(draft.price.trim())) errors.price = "Informe um preço não negativo com até duas casas.";
    else if (!draft.currency.trim()) errors.currency = "Informe a moeda quando houver preço.";
  }
  return errors;
}

export function candidateDraftFromCandidate(candidate: ProductCandidate): ProductCandidateDraft {
  return {
    name: candidate.name,
    description: candidate.description ?? "",
    category: candidate.category ?? "",
    brand: candidate.brand ?? "",
    seller: candidate.seller ?? "",
    price: candidate.price ? String(candidate.price.amount) : "",
    currency: candidate.price?.currency ?? "",
    features: candidate.features.join("\n"),
    variants: candidate.variants?.join("\n") ?? "",
    images: candidate.images.join("\n"),
    sourceUrl: candidate.sourceUrl,
  };
}

export function candidateFromDraft(draft: ProductCandidateDraft): ProductCandidate {
  const list = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const amount = Number(draft.price.replace(",", "."));
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    category: draft.category.trim() || undefined,
    brand: draft.brand.trim() || undefined,
    seller: draft.seller.trim() || undefined,
    price: draft.price.trim() && Number.isFinite(amount) ? { amount, currency: draft.currency.trim() } : undefined,
    features: list(draft.features),
    variants: list(draft.variants),
    images: list(draft.images),
    sourceUrl: draft.sourceUrl.trim(),
  };
}

export function importStateAllowsCancel(state: ProductImportState) {
  return ["OPENING", "LOGIN_REQUIRED", "CAPTCHA_REQUIRED", "2FA_REQUIRED", "USER_INTERACTION_REQUIRED", "PAUSED", "EXTRACTING"].includes(state);
}

export function importStateAllowsRetry(state: ProductImportState) {
  return ["CANCELLED", "ERROR", "PROFILE_UNAVAILABLE", "LIMIT"].includes(state);
}
