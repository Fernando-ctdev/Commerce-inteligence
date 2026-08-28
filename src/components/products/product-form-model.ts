export type ProductDraft = {
  name: string;
  description: string;
  category: string;
  seller?: string;
  variants?: string;
  price: string;
  characteristics: string;
  imageReferences: string;
  observations: string;
  url: string;
};

export type ProductFieldErrors = Partial<Record<keyof ProductDraft, string>>;

export type ProductPayload = {
  name: string;
  description: string;
  category: string | null;
  seller?: string | null;
  variants?: string[] | null;
  price: string | null;
  priceCurrency?: string | null;
  features: string[];
  imageRefs: string[];
  notes: string | null;
  url: string | null;
  idempotency_key?: string;
  expectedVersion?: number;
};

function clean(value: string) {
  return value.trim();
}

function cleanNullable(value: string) {
  const result = clean(value);
  return result || null;
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);
}

export function validateProductDraft(draft: Pick<ProductDraft, "name" | "description">): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  if (!clean(draft.name)) errors.name = "Informe o nome do produto.";
  if (!clean(draft.description)) errors.description = "Informe uma descrição do produto.";
  return errors;
}

export function visibleProductFieldErrors(
  draft: Pick<ProductDraft, "name" | "description">,
  fieldErrors: ProductFieldErrors,
  validationVisible: boolean,
): ProductFieldErrors {
  return validationVisible ? { ...validateProductDraft(draft), ...fieldErrors } : fieldErrors;
}

export function buildProductPayload(draft: ProductDraft, idempotencyKey?: string, version?: number): ProductPayload {
  return {
    name: clean(draft.name),
    description: clean(draft.description),
    category: cleanNullable(draft.category),
    ...(draft.seller === undefined ? {} : { seller: cleanNullable(draft.seller) }),
    ...(draft.variants === undefined ? {} : { variants: lines(draft.variants) }),
    price: cleanNullable(draft.price),
    features: lines(draft.characteristics),
    imageRefs: lines(draft.imageReferences),
    notes: cleanNullable(draft.observations),
    url: cleanNullable(draft.url),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    ...(version === undefined ? {} : { expectedVersion: version }),
  };
}

export function emptyProductDraft(): ProductDraft {
  return {
    name: "",
    description: "",
    category: "",
    price: "",
    characteristics: "",
    imageReferences: "",
    observations: "",
    url: "",
  };
}
