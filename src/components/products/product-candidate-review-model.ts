import type { GapCode, ImportCandidate, ImportFacts, ImportPrice, ImportVariant } from "./import-contracts";

// Modelo puro do editor de revisão (PLAN T24; CONF-AC1..4; UX-AC4).
// O cliente envia APENAS as correções (SPEC §Contratos): o candidate é sempre recarregado server-side.

export const REVIEW_FIELD_ORDER = [
  "name",
  "description",
  "category",
  "brand",
  "price",
  "features",
  "variants",
  "images",
  "seller",
  "quantity",
] as const;

export type ReviewFieldKey = (typeof REVIEW_FIELD_ORDER)[number];

export type ReviewVariantDraft = { name: string; value: string; price?: ImportPrice };

export type ReviewDraft = {
  name: string;
  description: string;
  category: string;
  brand: string;
  seller: string;
  price: string;
  features: string[];
  variants: ReviewVariantDraft[];
  images: string[];
  quantity: string;
};

export type ReviewFieldErrors = Partial<Record<ReviewFieldKey, string>>;

export const REVIEW_FIELD_LIMITS = {
  name: 300,
  description: 5000,
  category: 200,
  brand: 200,
  seller: 200,
  feature: 200,
  variantName: 100,
  variantValue: 100,
  featuresCount: 30,
  variantsCount: 30,
  imagesCount: 15,
} as const;

export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 50;
export const QUANTITY_PRESETS = [10, 20, 30] as const;
export const DEFAULT_QUANTITY = 10;

export const QUANTITY_MESSAGE = `Escolha uma quantidade entre ${QUANTITY_MIN} e ${QUANTITY_MAX}.`;
export function formatPriceAmount(amount: number) {
  return amount.toFixed(2).replace(".", ",");
}

function trimmed(value: string) {
  return value.trim();
}

function textChanged(candidateValue: string | undefined, draftValue: string) {
  return trimmed(draftValue) !== (candidateValue ?? "");
}

// Preço no input em formato pt-BR ("39,90"); vazio = sem preço.
export function parsePriceInput(value: string): number | null {
  const normalized = trimmed(value).replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}


export function reviewDraftFromCandidate(candidate: ImportCandidate, initialQuantity: number): ReviewDraft {
  return {
    name: candidate.name,
    description: candidate.description ?? "",
    category: candidate.category ?? "",
    brand: candidate.brand ?? "",
    seller: candidate.seller ?? "",
    price: candidate.price ? formatPriceAmount(candidate.price.amount) : "",
    features: [...candidate.features],
    variants: (candidate.variants ?? []).map((variant) => ({ ...variant })),
    images: [...candidate.images],
    quantity: String(initialQuantity),
  };
}

// Origem exibida por fato (CONF-AC1): extraído da página, lacuna explícita ou confirmado por você.
export type ReviewOrigin = "extracted" | "gap" | "confirmed";

export function reviewOrigin(field: ReviewFieldKey, draft: ReviewDraft, candidate: ImportCandidate, gaps: GapCode[]): ReviewOrigin {
  const dirty = fieldChanged(field, draft, candidate);
  if (dirty) return "confirmed";
  if (field !== "name" && field !== "quantity" && gaps.includes(field as GapCode)) return "gap";
  return "extracted";
}

function fieldChanged(field: ReviewFieldKey, draft: ReviewDraft, candidate: ImportCandidate): boolean {
  switch (field) {
    case "name":
      return textChanged(candidate.name, draft.name);
    case "description":
      return textChanged(candidate.description, draft.description);
    case "category":
      return textChanged(candidate.category, draft.category);
    case "brand":
      return textChanged(candidate.brand, draft.brand);
    case "seller":
      return textChanged(candidate.seller, draft.seller);
    case "price":
      return priceChanged(candidate.price, draft.price);
    case "features":
      return listChanged(candidate.features, draft.features);
    case "variants":
      return variantsChanged(candidate.variants ?? [], draft.variants);
    case "images":
      return listChanged(candidate.images, draft.images);
    case "quantity":
      return false;
  }
}

function priceChanged(candidatePrice: ImportPrice | undefined, draftPrice: string) {
  const amount = parsePriceInput(draftPrice);
  if (amount === null) return Boolean(candidatePrice);
  return amount !== candidatePrice?.amount;
}

function listChanged(candidateList: string[], draftList: string[]) {
  return draftList.join("\n") !== candidateList.join("\n");
}

function variantsChanged(candidateVariants: ImportVariant[], draftVariants: ReviewVariantDraft[]) {
  return (
    JSON.stringify(draftVariants.map(({ name, value, price }) => ({ name: trimmed(name), value: trimmed(value), price }))) !==
    JSON.stringify(candidateVariants.map(({ name, value, price }) => ({ name, value, price })))
  );
}

// Só correções vão no `facts` (SPEC: "o cliente envia apenas as correções").
export function buildReviewFacts(draft: ReviewDraft, candidate: ImportCandidate): ImportFacts {
  const facts: ImportFacts = {};
  if (textChanged(candidate.name, draft.name)) facts.name = trimmed(draft.name);
  // Campo opcional limpo ⇒ tratado como "sem correção" (mantém o extraído); string vazia não vai em facts.
  if (textChanged(candidate.description, draft.description) && trimmed(draft.description)) facts.description = trimmed(draft.description);
  if (textChanged(candidate.category, draft.category) && trimmed(draft.category)) facts.category = trimmed(draft.category);
  if (textChanged(candidate.brand, draft.brand) && trimmed(draft.brand)) facts.brand = trimmed(draft.brand);
  if (textChanged(candidate.seller, draft.seller) && trimmed(draft.seller)) facts.seller = trimmed(draft.seller);

  const price = parsePriceInput(draft.price);
  if (price !== null && price !== candidate.price?.amount) facts.price = { amount: price, currency: "BRL" };
  if (listChanged(candidate.features, draft.features)) facts.features = draft.features.map(trimmed);
  if (variantsChanged(candidate.variants ?? [], draft.variants)) {
    facts.variants = draft.variants.map((variant) => ({ ...variant, name: trimmed(variant.name), value: trimmed(variant.value) }));
  }
  if (listChanged(candidate.images, draft.images)) facts.images = draft.images.map(trimmed);
  return facts;
}

function imageUrlError(value: string): string | null {
  const url = trimmed(value);
  if (!/^https?:\/\//i.test(url)) return "Use uma URL de imagem http(s).";
  return null;
}

export function validateReviewDraft(draft: ReviewDraft): ReviewFieldErrors {
  const errors: ReviewFieldErrors = {};
  if (!trimmed(draft.name)) errors.name = "Informe o nome do produto.";
  else if (draft.name.length > REVIEW_FIELD_LIMITS.name) errors.name = `O nome deve ter no máximo ${REVIEW_FIELD_LIMITS.name} caracteres.`;

  if (draft.description.length > REVIEW_FIELD_LIMITS.description) errors.description = `A descrição deve ter no máximo ${REVIEW_FIELD_LIMITS.description} caracteres.`;
  if (draft.category.length > REVIEW_FIELD_LIMITS.category) errors.category = `A categoria deve ter no máximo ${REVIEW_FIELD_LIMITS.category} caracteres.`;
  if (draft.brand.length > REVIEW_FIELD_LIMITS.brand) errors.brand = `A marca deve ter no máximo ${REVIEW_FIELD_LIMITS.brand} caracteres.`;
  if (draft.seller.length > REVIEW_FIELD_LIMITS.seller) errors.seller = `O vendedor deve ter no máximo ${REVIEW_FIELD_LIMITS.seller} caracteres.`;
  if (draft.price && parsePriceInput(draft.price) === null) errors.price = "Informe um preço válido maior que zero.";

  if (draft.features.length > REVIEW_FIELD_LIMITS.featuresCount) errors.features = `Use no máximo ${REVIEW_FIELD_LIMITS.featuresCount} características.`;
  if (draft.variants.length > REVIEW_FIELD_LIMITS.variantsCount) errors.variants = `Use no máximo ${REVIEW_FIELD_LIMITS.variantsCount} variantes.`;
  if (draft.variants.some((variant) => !trimmed(variant.name) || !trimmed(variant.value))) errors.variants = "Preencha atributo e valor de cada variante.";
  if (draft.images.length > REVIEW_FIELD_LIMITS.imagesCount) errors.images = `Use no máximo ${REVIEW_FIELD_LIMITS.imagesCount} imagens.`;
  const badImage = draft.images.find((image) => imageUrlError(image));
  if (badImage !== undefined) errors.images = imageUrlError(badImage) ?? undefined;

  const quantity = validateQuantity(draft.quantity);
  if (quantity) errors.quantity = quantity;
  return errors;
}

export function validateQuantity(value: string): string | null {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < QUANTITY_MIN || quantity > QUANTITY_MAX) {
    return QUANTITY_MESSAGE;
  }
  return null;
}

export function firstReviewErrorField(errors: ReviewFieldErrors): ReviewFieldKey | undefined {
  return REVIEW_FIELD_ORDER.find((field) => Boolean(errors[field]));
}

export function reviewFieldId(field: ReviewFieldKey) {
  return `import-review-${field}`;
}

// Erros de server-side usam `targetContentCount`; a UI fala `quantity`.
export function mapServerFieldErrors(fieldErrors: Record<string, string>): ReviewFieldErrors {
  const mapped: Record<string, string> = { ...fieldErrors };
  if (mapped.targetContentCount) {
    mapped.quantity = mapped.targetContentCount;
    delete mapped.targetContentCount;
  }
  return mapped as ReviewFieldErrors;
}
