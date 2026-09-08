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
  state: "READY";
  sourceUrl: string;
  candidate?: unknown;
  gaps?: string[];
  error?: string;
  errorCode?: string;
  productId?: string;
  interactiveUrl?: string;
  canResume?: boolean;
  handoffExpired: boolean;
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

export function candidateCanBeConfirmed(candidate?: ProductCandidateDraft | null) {
  return Boolean(candidate && candidate.name.trim() && candidate.description.trim());
}

export function validateCandidateDraft(draft: ProductCandidateDraft): ProductCandidateFieldErrors {
  const errors: ProductCandidateFieldErrors = {};
  if (!draft.name.trim()) errors.name = "Informe o nome do produto.";
  else if (Array.from(draft.name.trim()).length > 200) errors.name = "Máximo de 200 caracteres.";
  if (!draft.description.trim()) errors.description = "Informe uma descrição do produto.";
  else if (Array.from(draft.description.trim()).length > 5000) errors.description = "Máximo de 5.000 caracteres.";
  if (Array.from(draft.category.trim()).length > 120) errors.category = "Máximo de 120 caracteres.";
  if (Array.from(draft.brand.trim()).length > 120) errors.brand = "Máximo de 120 caracteres.";
  if (Array.from(draft.seller.trim()).length > 200) errors.seller = "Máximo de 200 caracteres.";
  if (draft.price.trim() && (!/^\d+(?:[.,]\d{1,2})?$/.test(draft.price.trim()) || Number(draft.price.replace(",", ".")) < 0)) {
    errors.price = "Informe um preço não negativo com até duas casas.";
  }
  if (draft.price.trim() && !["R$", "USD", "EUR"].includes(draft.currency.trim().toUpperCase()))
    errors.currency = "Informe uma moeda válida.";
  return errors;
}

export function candidateFieldId(name: keyof ProductCandidateDraft) {
  return `candidate-${name}`;
}
