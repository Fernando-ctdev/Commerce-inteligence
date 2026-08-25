export type ProductDraft = {
  name: string;
  description: string;
  category: string;
  price: string;
  characteristics: string;
  imageReferences: string;
  observations: string;
  url: string;
  objective: string;
  audience: string;
  style: string;
  presence: string;
  experience: string;
  restrictions: string;
  market: string;
  contextObservations: string;
};

export type ProductFieldErrors = Partial<Record<keyof ProductDraft, string>>;

export type ProductPayload = {
  name: string;
  description: string;
  category: string | null;
  price: string | null;
  features: string[];
  imageRefs: string[];
  notes: string | null;
  url: string | null;
  idempotency_key?: string;
  expectedVersion?: number;
  context: {
    locale: "pt-BR";
    goal: string | null;
    audience: string | null;
    style: string | null;
    creatorPresence: string | null;
    experience: string | null;
    constraints: string | null;
    market: string | null;
    notes: string | null;
  };
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
    price: cleanNullable(draft.price),
    features: lines(draft.characteristics),
    imageRefs: lines(draft.imageReferences),
    notes: cleanNullable(draft.observations),
    url: cleanNullable(draft.url),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    ...(version === undefined ? {} : { expectedVersion: version }),
    context: {
      locale: "pt-BR",
      goal: cleanNullable(draft.objective),
      audience: cleanNullable(draft.audience),
      style: cleanNullable(draft.style),
      creatorPresence: cleanNullable(draft.presence),
      experience: cleanNullable(draft.experience),
      constraints: cleanNullable(draft.restrictions),
      market: cleanNullable(draft.market),
      notes: cleanNullable(draft.contextObservations),
    },
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
    objective: "",
    audience: "",
    style: "",
    presence: "",
    experience: "",
    restrictions: "",
    market: "Brasil",
    contextObservations: "",
  };
}
