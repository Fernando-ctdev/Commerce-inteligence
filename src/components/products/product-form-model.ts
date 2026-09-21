import type { ContentPreparationPreferences } from "./product-import-model";

export type ProductDraft = {
  name: string;
  description: string;
  category: string;
  seller?: string;
  variants?: string;
  price: string;
  imageReferences: string;
  observations: string;
  url: string;
  /** Desconto tipado — contrato oficial (Gate 5): discountType + discountValue. */
  discountType?: DiscountType;
  discountValue?: string;
};

export type ProductFieldErrors = Partial<Record<keyof ProductDraft, string>>;

export const DEFAULT_PRODUCT_CURRENCY = "R$";
/** Contrato do backend (service.ts CURRENCIES): símbolos, não códigos ISO. */
export const SUPPORTED_CURRENCIES = ["R$", "USD", "EUR"] as const;
/* Desconto tipado — contrato oficial (Gate 5): PERCENTAGE (0–100) ou FIXED
   (valor na moeda do produto). Exclusivamente tipado; sem campo legado. */
export const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];


export type ProductPayload = {
  name: string;
  description: string;
  category: string | null;
  seller?: string | null;
  variants?: string[] | null;
  price: string | null;
  priceCurrency?: string | null;
  imageRefs?: string[];
  notes?: string | null;
  url?: string | null;
  idempotency_key?: string;
  targetContentCount?: number;
  creatorPresence?: ContentPreparationPreferences["creatorPresence"];
  constraints?: string;
  expectedVersion?: number;
  discountType?: DiscountType;
  discountValue?: string;
};

/* Máscara do Preço: o input exibe pt-BR (10,50) e o draft guarda o
   formato aceito pelo gate (10.50). Digitação estilo caixa: cada dígito
   entra como centavo. */
export function digitsToPrice(raw: string) {
  /* 10 dígitos = 99.999.999,99 — teto exato aceito pelo gate. */
  /* Zeros à esquerda colapsam: sem eles, apagar ficava travado em 0,00. */
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10);
  if (!digits) return "";
  return (Number(digits) / 100).toFixed(2);
}

export function formatPriceDisplay(price: string) {
  if (!price) return "";
  const amount = Number(price.replace(",", "."));
  if (!Number.isFinite(amount)) return price;
  return amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* Exibição: símbolo antes do valor (R$ 23,44); BRL é legado de importação. */
const CURRENCY_SYMBOLS: Record<string, string> = { "R$": "R$", BRL: "R$", USD: "$", EUR: "€" };

export function formatPriceWithCurrency(price: string | null, currency: string | null | undefined) {
  if (!price) return null;
  const amount = formatPriceDisplay(price);
  const symbol = CURRENCY_SYMBOLS[(currency ?? "").trim().toUpperCase()] ?? (currency ?? "").trim();
  return symbol ? `${symbol} ${amount}` : amount;
}

/* Desconto exibido no resumo: percentual literal ou valor na moeda do produto. */
export function formatDiscount(
  discountType: string | null | undefined,
  discountValue: string,
  currency?: string | null,
): string | null {
  const value = discountValue?.trim() ?? "";
  if (!value) return null;
  if (discountType === "FIXED") return formatPriceWithCurrency(value, currency);
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number)
    ? `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
    : `${value}%`;
}
export type ProductManualDraft = {
  name: string;
  description: string;
  category: string;
  price: string;
  imageReferences?: string;
  currency: string;
  url?: string;
  discountType?: DiscountType;
  discountValue?: string;
};

export type ProductManualFieldErrorKey =
  | keyof ProductManualDraft
  | "imageReferences"
  | "targetContentCount"
  | "creatorPresence"
  | "constraints";
export type ProductManualFieldErrors = Partial<
  Record<ProductManualFieldErrorKey, string>
>;

function clean(value: string) {
  return value.trim();
}

function cleanNullable(value: string) {
  const result = clean(value);
  return result || null;
}

function lines(value: string) {
  return value.split(/\r?\n/).map(clean).filter(Boolean);
}
/* Desconto tipado no payload: só emite com valor. Sem valor nenhum, nada é
   enviado e o backend mantém a semântica de limpar (null). */
function discountFields(draft: {
  discountType?: DiscountType;
  discountValue?: string;
}) {
  const value = cleanNullable(draft.discountValue ?? "") ?? "";
  if (!value) return {};
  return {
    discountType: draft.discountType === "FIXED" ? ("FIXED" as const) : ("PERCENTAGE" as const),
    discountValue: formatPriceDisplay(value),
  };
}

export function validateProductDraft(
  draft: Pick<ProductDraft, "name" | "description">,
): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  if (!clean(draft.name)) errors.name = "Informe o nome do produto.";
  if (!clean(draft.description))
    errors.description = "Informe uma descrição do produto.";
  return errors;
}

export function visibleProductFieldErrors(
  draft: Pick<ProductDraft, "name" | "description">,
  fieldErrors: ProductFieldErrors,
  validationVisible: boolean,
): ProductFieldErrors {
  return validationVisible
    ? { ...validateProductDraft(draft), ...fieldErrors }
    : fieldErrors;
}

export function buildProductPayload(
  draft: ProductDraft,
  idempotencyKey?: string,
  version?: number,
): ProductPayload {
  return {
    name: clean(draft.name),
    description: clean(draft.description),
    category: cleanNullable(draft.category),
    ...(draft.seller === undefined
      ? {}
      : { seller: cleanNullable(draft.seller) }),
    ...(draft.variants === undefined
      ? {}
      : { variants: lines(draft.variants) }),
    price: cleanNullable(draft.price),
    imageRefs: lines(draft.imageReferences),
    notes: cleanNullable(draft.observations),
    url: cleanNullable(draft.url),
    ...discountFields(draft),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    ...(version === undefined ? {} : { expectedVersion: version }),
  };
}
/* Criação manual do Slice 002: normaliza os fatos do modal e anexa a
   preparação da primeira geração. Preço/Moeda é um par opcional. */
export function buildManualProductPayload(
  draft: ProductManualDraft,
  preparation: ContentPreparationPreferences,
  idempotencyKey?: string,
): ProductPayload {
  const price = cleanNullable(draft.price);
  /* O draft guarda o formato da máscara (39.90); a API espera pt-BR (39,90). */
  const pricePtBr = price ? formatPriceDisplay(price) : null;
  const constraints = cleanNullable(preparation.constraints ?? "");
  const imageRefs = lines(draft.imageReferences ?? "");
  const url = cleanNullable(draft.url ?? "");
  return {
    name: clean(draft.name),
    description: clean(draft.description),
    category: cleanNullable(draft.category),
    price: pricePtBr,
    priceCurrency: pricePtBr
      ? cleanNullable(draft.currency) || DEFAULT_PRODUCT_CURRENCY
      : null,
    ...(imageRefs.length > 0 ? { imageRefs } : {}),
    ...(url ? { url } : {}),
    ...(constraints ? { constraints } : {}),
    targetContentCount: preparation.targetContentCount,
    creatorPresence: preparation.creatorPresence,
    ...discountFields(draft),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  };
}
export function validateProductManualDraft(
  draft: ProductManualDraft,
  notes: string,
): ProductManualFieldErrors {
  const errors: ProductManualFieldErrors = {};
  if (!clean(draft.name)) errors.name = "Informe o nome do produto.";
  if (!clean(draft.description))
    errors.description = "Informe uma descrição do produto.";
  if (!draft.category.trim())
    errors.category = "Informe a categoria do produto.";
  else if (Array.from(draft.category.trim()).length > 120)
    errors.category = "Máximo de 120 caracteres.";
  const price = draft.price.trim();
  if (!price) errors.price = "Informe o preço do produto.";
  else if (
    !/^\d+(?:[.,]\d{1,2})?$/.test(price) ||
    Number(price.replace(",", ".")) < 0
  ) {
    errors.price = "Informe um preço não negativo com até duas casas.";
  }
  const currency = draft.currency.trim().toUpperCase();
  if (!currency) errors.currency = "Informe a moeda do produto.";
  else if (!SUPPORTED_CURRENCIES.includes(currency as (typeof SUPPORTED_CURRENCIES)[number]))
    errors.currency = "Informe uma moeda válida.";
  const discountType = draft.discountType === "FIXED" ? "FIXED" : "PERCENTAGE";
  const discountValue = (draft.discountValue?.trim() || "").trim();
  if (discountValue && !/^\d+(?:[.,]\d{1,2})?$/.test(discountValue)) {
    errors.discountValue = "Informe um desconto válido e não negativo, com até duas casas decimais.";
  } else if (discountValue && discountType === "PERCENTAGE" && Number(discountValue.replace(",", ".")) > 100) {
    errors.discountValue = "O desconto percentual deve estar entre 0 e 100.";
  }
  const url = draft.url?.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        throw new Error(url);
    } catch {
      errors.url = "Informe uma URL http(s) válida ou deixe vazia.";
    }
  }
  return errors;
}

/* Preparação: quantidade 1–10, formato conhecido e notas até 300 caracteres. */
export function preparationIsWithinLimits(
  preparation: ContentPreparationPreferences,
) {
  return (
    Number.isInteger(preparation.targetContentCount) &&
    preparation.targetContentCount >= 1 &&
    preparation.targetContentCount <= 10 &&
    ["on_camera", "hands_only_product", "either"].includes(
      preparation.creatorPresence,
    ) &&
    Array.from(preparation.constraints ?? "").length <= 300
  );
}

export function emptyProductDraft(): ProductDraft {
  return {
    name: "",
    description: "",
    category: "",
    price: "",
    imageReferences: "",
    observations: "",
    url: "",
    discountType: "PERCENTAGE",
    discountValue: "",
  };
}
