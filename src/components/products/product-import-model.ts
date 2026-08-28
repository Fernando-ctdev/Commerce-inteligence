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
  errorCode?: string;
  productId?: string;
  interactiveUrl?: string;
  canResume?: boolean;
  handoffExpired: boolean;
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

export function productImportShouldPoll(state: ProductImportState) {
  return state === "OPENING" || state === "EXTRACTING";
}

export function productImportCanResume(record: Pick<ProductImportRecord, "state" | "handoffExpired" | "canResume">) {
  return ["PAUSED", "LOGIN_REQUIRED", "CAPTCHA_REQUIRED", "2FA_REQUIRED", "USER_INTERACTION_REQUIRED"].includes(record.state) &&
    !record.handoffExpired && record.canResume !== false;
}

const errorCodeMessages: Record<string, string> = {
  CANDIDATE_EXPIRED: "A revisão expirou. Tente analisar o produto novamente ou adicione-o manualmente.",
  BROWSER_SERVICE_UNAVAILABLE: "O serviço de importação está indisponível. Tente novamente ou adicione o produto manualmente.",
  PROFILE_UNAVAILABLE: "O profile do navegador não está disponível. Tente novamente ou adicione o produto manualmente.",
  BROWSER_BUSY: "O navegador já está ocupado com outra análise. Tente novamente em instantes.",
  PROFILE_IN_USE: "O profile do navegador já está em uso. Tente novamente em instantes.",
  URL_REJECTED: "A URL não pôde ser aberta pelo serviço de importação. Confira o endereço e tente novamente.",
  HARNESS_FAILED: "Não foi possível ler os dados desta página. Tente novamente ou adicione o produto manualmente.",
  INSUFFICIENT_PRODUCT_FACTS: "Não encontramos fatos suficientes nesta página. Revise os dados ou adicione o produto manualmente.",
  SESSION_LOST: "A sessão do navegador foi encerrada. Tente analisar o produto novamente.",
  INVALID_STATE: "A análise não está mais disponível neste estado. Tente novamente.",
  SESSION_CLOSED: "A sessão do navegador foi encerrada. Tente analisar o produto novamente.",
  HANDOFF_EXPIRED: "A janela de interação expirou. Não é possível retomar esta análise; tente novamente.",
  BROWSER_ERROR: "Não foi possível concluir a análise deste produto. Tente novamente ou adicione-o manualmente.",
};

export function productImportErrorMessage(errorCode?: string) {
  if (!errorCode) return "";
  return errorCodeMessages[errorCode.toUpperCase()] ?? "Não foi possível concluir a análise deste produto. Tente novamente.";
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

export type CandidateValidationOptions = {
  requireCompleteFacts?: boolean;
  validateSourceUrl?: boolean;
  ignoreHiddenFields?: boolean;
};

export type CreatorPresence = "on_camera" | "hands_only_product" | "either";

export type ContentPreparationPreferences = {
  targetContentCount: number;
  creatorPresence: CreatorPresence;
  constraints?: string;
};

export function contentPreparationPreferencesAreValid(preferences: ContentPreparationPreferences) {
  return Number.isInteger(preferences.targetContentCount) && preferences.targetContentCount >= 1 && preferences.targetContentCount <= 50 &&
    ["on_camera", "hands_only_product", "either"].includes(preferences.creatorPresence) &&
    (preferences.constraints === undefined || Array.from(preferences.constraints).length <= 300);
}

export function candidateCanBeConfirmed(candidate?: ProductCandidateDraft | null, options?: CandidateValidationOptions) {
  return Boolean(candidate && Object.keys(validateCandidateDraft(candidate, options)).length === 0);
}

export function validateCandidateDraft(draft: ProductCandidateDraft, options: CandidateValidationOptions = {}): ProductCandidateFieldErrors {
  const errors: ProductCandidateFieldErrors = {};
  const length = (value: string) => Array.from(value.trim()).length;
  if (!draft.name.trim()) errors.name = "Informe o nome do produto.";
  else if (length(draft.name) > 200) errors.name = "Máximo de 200 caracteres.";
  if (!draft.description.trim()) errors.description = "Informe uma descrição do produto.";
  else if (length(draft.description) > 5000) errors.description = "Máximo de 5.000 caracteres.";
  if (length(draft.category) > 120) errors.category = "Máximo de 120 caracteres.";
  if (length(draft.brand) > 120) errors.brand = "Máximo de 120 caracteres.";
  if (!options.ignoreHiddenFields) {
    if (length(draft.seller) > 200) errors.seller = "Máximo de 200 caracteres.";
  }

  for (const [field, maxItems] of [["features", 20], ["variants", 20], ["images", 10]] as const) {
    if (options.ignoreHiddenFields && (field === "variants" || field === "images")) continue;
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
    if (!Number.isFinite(amount) || amount < 0 || amount * 100 > 9_999_999_999 || !/^\d+(?:[.,]\d{1,2})?$/.test(draft.price.trim())) errors.price = "Informe um preço não negativo com até duas casas.";
  }
  if (draft.currency.trim() && !/^[A-Za-z]{3}$/.test(draft.currency.trim())) errors.currency = "Moeda inválida: use 3 letras (ex.: BRL, USD).";
  if (draft.price.trim() && !draft.currency.trim()) errors.currency = "Informe a moeda quando houver preço.";
  if (options.validateSourceUrl !== false && draft.sourceUrl.trim() && !isValidPublicHttpUrl(draft.sourceUrl.trim())) {
    errors.sourceUrl = "Use uma URL http(s) sem credenciais.";
  }
  return errors;
}

function isValidPublicHttpUrl(value: string) {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
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

export function productImportAllowsManualFallback(state: ProductImportState, handoffExpired = false) {
  return handoffExpired || importStateAllowsRetry(state);
}
