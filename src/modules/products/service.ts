// Casos de uso Product do Slice 002: cadastro manual e listagem, escopados ao Tenant
// resolvido pela sessão (SPEC RI-005). Salvar não cria job nem inicia geração (B-005);
// as preferências de preparação ficam persistidas como restrições da primeira geração.
// Idempotência de criação: mesma chave + mesmo Tenant devolve o mesmo Product (RI-007).
import { Prisma, type Product } from "@prisma/client";

import { prisma } from "../db";

export type ManualProductInput = Record<string, unknown>;


export class ProductValidationError extends Error {
  readonly fieldErrors: Record<string, string>;
  readonly code: string;
  constructor(fieldErrors: Record<string, string>, code: string) {
    super("Dados do Product inválidos.");
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

// Ordem determinística dos códigos da SPEC §7 quando vários campos falham juntos.
const FIELD_CODE_PRIORITY = [
  "name",
  "description",
  "price",
  "category",
  "features",
  "targetContentCount",
  "creatorPresence",
  "constraints",
] as const;
export const CREATOR_PRESENCE_OPTIONS = ["on_camera", "hands_only_product", "either"] as const;
export type CreatorPresence = (typeof CREATOR_PRESENCE_OPTIONS)[number];

// Defaults e limites da SPEC (RI-002/RI-003).
export const DEFAULT_TARGET_CONTENT_COUNT = 20;
export const DEFAULT_CREATOR_PRESENCE: CreatorPresence = "either";
const QUANTITY_MIN = 1;
const QUANTITY_MAX = 30;
const NOTES_MAX = 300;
const CURRENCIES = ["BRL", "USD", "EUR"];
// Formato monetário não negativo: decimal canônico com ponto ou pt-BR com vírgula e milhar.
const PRICE_PATTERN = /^(?:\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+\.\d{1,2})$/;

// Teto defensivo dos fatos opcionais além dos limites da SPEC (PRINCIPLES §7).
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const CATEGORY_MAX = 100;
const FEATURES_MAX_ITEMS = 30;
const FEATURE_MAX_LENGTH = 200;

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{16,128}$/.test(value);
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function requireBoundedText(
  value: unknown,
  field: string,
  emptyMessage: string,
  lengthMessage: string,
  max: number,
  code: string,
  fail: (field: string, message: string, code: string) => void,
): string {
  const trimmed = asTrimmedString(value);
  if (!trimmed) {
    fail(field, emptyMessage, code);
    return "";
  }
  if (trimmed.length > max) {
    fail(field, lengthMessage, code);
    return "";
  }
  return trimmed;
}

type ValidatedManualProduct = {
  name: string;
  description: string;
  category: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
  features: string[];
  targetContentCount: number;
  generationConstraints: Prisma.InputJsonValue;
};

/** Valida e normaliza o corpo do POST. Erros ficam em ProductValidationError (fieldErrors + code). */
export function validateManualProductInput(input: ManualProductInput): ValidatedManualProduct {
  const errors: Record<string, string> = {};
  const codes: Record<string, string> = {};
  // Primeira falha de cada campo vence — mensagem e código ficam sempre em par.
  const fail = (field: string, message: string, code: string) => {
    if (field in errors) return;
    errors[field] = message;
    codes[field] = code;
  };

  const name = requireBoundedText(
    input.name,
    "name",
    "Informe o nome do produto.",
    `O nome do produto deve ter até ${NAME_MAX} caracteres.`,
    NAME_MAX,
    "VAL-NAME-REQUIRED",
    fail,
  );
  const description = requireBoundedText(
    input.description,
    "description",
    "Informe uma descrição do produto.",
    `A descrição deve ter até ${DESCRIPTION_MAX} caracteres.`,
    DESCRIPTION_MAX,
    "VAL-DESCRIPTION-REQUIRED",
    fail,
  );

  const category = asTrimmedString(input.category);
  if (category && category.length > CATEGORY_MAX) {
    fail("category", `A categoria deve ter até ${CATEGORY_MAX} caracteres.`, "VAL-CATEGORY-INVALID");
  }

  // Preço/Moeda são um par opcional (RI-002): ambos preenchidos ou ambos vazios.
  const price = asTrimmedString(input.price);
  const priceCurrency = asTrimmedString(input.priceCurrency)?.toUpperCase() ?? null;
  if (price && !PRICE_PATTERN.test(price)) {
    fail("price", "Informe um preço válido e não negativo, como 29,90.", "VAL-PRICE-FORMAT");
  }
  if (priceCurrency && !CURRENCIES.includes(priceCurrency)) {
    fail("price", "Moeda não suportada. Use BRL, USD ou EUR.", "VAL-PRICE-FORMAT");
  }
  if ((price === null) !== (priceCurrency === null)) {
    fail("price", "Preço e moeda devem ser preenchidos juntos ou deixados vazios.", "VAL-PRICE-CURRENCY-PAIR");
  }

  // Características: uma por linha no formulário; aqui chegam como lista de strings não vazias.
  const rawFeatures = input.features;
  let features: string[] = [];
  if (rawFeatures == null) {
    features = [];
  } else if (Array.isArray(rawFeatures)) {
    features = rawFeatures
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    if (features.length > FEATURES_MAX_ITEMS) {
      fail("features", `Use até ${FEATURES_MAX_ITEMS} características.`, "VAL-FEATURES-INVALID");
    } else if (features.some((item) => item.length > FEATURE_MAX_LENGTH)) {
      fail("features", `Cada característica deve ter até ${FEATURE_MAX_LENGTH} caracteres.`, "VAL-FEATURES-INVALID");
    }
  } else {
    fail("features", "Informe as características como lista de textos.", "VAL-FEATURES-INVALID");
  }

  // Preparação (RI-003): defaults 20 / "either" quando omitidos (PLAN §4.2).
  const rawCount = input.targetContentCount;
  let targetContentCount = DEFAULT_TARGET_CONTENT_COUNT;
  if (rawCount != null) {
    if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < QUANTITY_MIN || rawCount > QUANTITY_MAX) {
      fail("targetContentCount", `A quantidade inicial deve ser um inteiro entre ${QUANTITY_MIN} e ${QUANTITY_MAX}.`, "VAL-QUANTITY-RANGE");
    } else {
      targetContentCount = rawCount;
    }
  }

  const rawPresence = input.creatorPresence;
  let creatorPresence: CreatorPresence = DEFAULT_CREATOR_PRESENCE;
  if (rawPresence != null) {
    if (typeof rawPresence === "string" && (CREATOR_PRESENCE_OPTIONS as readonly string[]).includes(rawPresence)) {
      creatorPresence = rawPresence as CreatorPresence;
    } else {
      fail("creatorPresence", "Formato do creator inválido.", "VAL-CREATOR-FORMAT");
    }
  }

  const constraints = asTrimmedString(input.constraints);
  if (constraints && constraints.length > NOTES_MAX) {
    fail("constraints", `As observações devem ter até ${NOTES_MAX} caracteres.`, "VAL-NOTES-LENGTH");
  }

  if (Object.keys(errors).length > 0) {
    const code = FIELD_CODE_PRIORITY.map((field) => codes[field]).find(Boolean) ?? "VAL-PRODUCT-INVALID";
    throw new ProductValidationError(errors, code);
  }

  // Restrições guardam somente a preparação da primeira geração (RI-004) — sem fatos estratégicos.
  const generationConstraints: Prisma.InputJsonValue = constraints
    ? { creatorPresence, constraints }
    : { creatorPresence };

  return {
    name,
    description,
    category,
    priceAmount: price
      ? price.includes(",")
        ? price.replace(/\./g, "").replace(",", ".")
        : /^\d{1,3}(?:\.\d{3})+$/.test(price)
          ? price.replace(/\./g, "")
          : price
      : null,
    priceCurrency: priceCurrency,
    features,
    targetContentCount,
    generationConstraints,
  };
}

export type ManualProductResult = { product: Product; replay: boolean };

/** Cria o Product no Tenant resolvido; chave já usada no Tenant devolve o mesmo registro (replay). */
export async function createManualProduct(tenantId: string, input: ManualProductInput, idempotencyKey: string): Promise<ManualProductResult> {
  const data = validateManualProductInput(input);

  const existing = await prisma.product.findUnique({
    where: { tenantId_createIdempotencyKey: { tenantId, createIdempotencyKey: idempotencyKey } },
  });
  if (existing) return { product: existing, replay: true };

  try {
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        category: data.category,
        priceAmount: data.priceAmount,
        priceCurrency: data.priceCurrency,
        features: data.features,
        images: [],
        provenance: { origin: "manual" },
        targetContentCount: data.targetContentCount,
        generationConstraints: data.generationConstraints,
        createIdempotencyKey: idempotencyKey,
      },
    });
    return { product, replay: false };
  } catch (error) {
    // Corrida entre retries concorrentes: o índice único decide — o vencedor retorna replay.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const product = await prisma.product.findUnique({
        where: { tenantId_createIdempotencyKey: { tenantId, createIdempotencyKey: idempotencyKey } },
      });
      if (product) return { product, replay: true };
    }
    throw error;
  }
}

/** Listagem sempre filtrada pelo Tenant da sessão (AC-002-10). */
export async function listTenantProducts(tenantId: string): Promise<Product[]> {
  return prisma.product.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}
