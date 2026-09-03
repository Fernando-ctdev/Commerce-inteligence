// Casos de uso Product do Slice 002: cadastro manual e listagem, escopados ao Tenant
// resolvido pela sessão (SPEC RI-005). Salvar não cria job nem inicia geração (B-005);
// as preferências de preparação ficam persistidas como restrições da primeira geração.
// Idempotência de criação: mesma chave + mesmo Tenant devolve o mesmo Product (RI-007).
import { Prisma, type Product } from "@prisma/client";

import { prisma } from "../db";
import { provisionDefaultEntitlement } from "../entitlements/products";

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

/** Product inexistente ou fora do Tenant da sessão — responde 404 sem vazar existência. */
export class ProductNotFoundError extends Error {
  constructor() {
    super("PRODUCT_NOT_FOUND");
    this.name = "ProductNotFoundError";
  }
}

/** Conflito do controle otimista de versão no PATCH — responde 409. */
export class ProductVersionConflictError extends Error {
  constructor() {
    super("VERSION_CONFLICT");
    this.name = "ProductVersionConflictError";
  }
}
export class ProductDeleteRejectedError extends Error {
  constructor(public readonly code: "PRODUCT_HAS_HISTORY" | "PRODUCT_DELETE_UNSUPPORTED") {
    super(code);
    this.name = "ProductDeleteRejectedError";
  }
}

// Ordem determinística dos códigos da SPEC §7 quando vários campos falham juntos.
const FIELD_CODE_PRIORITY = [
  "name",
  "description",
  "category",
  "price",
  "priceCurrency",
  "features",
  "imageRefs",
  "url",
  "constraints",
  "targetContentCount",
  "creatorPresence",
] as const;
export const CREATOR_PRESENCE_OPTIONS = [
  "on_camera",
  "hands_only_product",
  "either",
] as const;
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
// Imagens: refs http(s) ou data URL de imagem em base64 — o projeto não tem storage de arquivos.
const IMAGE_REFS_MAX = 6;
const IMAGE_DATA_MAX_BYTES = 2_000_000;
const DATA_URL_PATTERN =
  /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/;

type Fail = (field: string, message: string, code: string) => void;

function dataUrlBytes(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/** Aceita somente http(s) e data:image/*;base64, com teto de quantidade e tamanho. */
function validateImageRefs(value: unknown, fail: Fail): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    fail(
      "imageRefs",
      "Informe as imagens como lista de URLs ou data URLs de imagem.",
      "VAL-IMAGE-INVALID",
    );
    return [];
  }
  const items: unknown[] = value;
  if (items.some((item) => typeof item !== "string")) {
    fail(
      "imageRefs",
      "Informe as imagens como lista de URLs ou data URLs de imagem.",
      "VAL-IMAGE-INVALID",
    );
    return [];
  }
  const refs = items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (refs.length > IMAGE_REFS_MAX) {
    fail("imageRefs", `Use até ${IMAGE_REFS_MAX} imagens.`, "VAL-IMAGE-LIMIT");
    return [];
  }
  for (const ref of refs) {
    const dataUrl = DATA_URL_PATTERN.exec(ref);
    if (dataUrl) {
      if (dataUrlBytes(dataUrl[1] ?? "") > IMAGE_DATA_MAX_BYTES) {
        fail(
          "imageRefs",
          "Cada imagem embutida deve ter até 2 MB.",
          "VAL-IMAGE-LIMIT",
        );
        return [];
      }
      continue;
    }
    try {
      const url = new URL(ref);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error(ref);
    } catch {
      fail(
        "imageRefs",
        "Use URLs http(s) ou data URL de imagem (base64).",
        "VAL-IMAGE-INVALID",
      );
      return [];
    }
  }
  return refs;
}

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
/** 23,44 → 23.44 | 1.234 / 1.234.567 → 1234 / 1234567 | 23.44 → 23.44. */
function normalizePriceAmount(price: string): string {
  if (price.includes(",")) return price.replace(/\./g, "").replace(",", ".");
  if (/^\d{1,3}(?:\.\d{3})+$/.test(price)) return price.replace(/\./g, "");
  return price;
}

type ValidatedFacts = {
  name: string;
  description: string;
  category: string;
  priceAmount: string;
  priceCurrency: string;
  features: string[];
  imageRefs: string[];
};

type ValidatedManualProduct = ValidatedFacts & {
  targetContentCount: number;
  generationConstraints: Prisma.InputJsonValue;
  submittedUrl: string | null;
};

function validateOptionalUrl(value: unknown, fail: Fail): string | null {
  const submittedUrl = asTrimmedString(value);
  if (!submittedUrl) return null;
  try {
    const parsed = new URL(submittedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error(submittedUrl);
    return submittedUrl;
  } catch {
    fail(
      "url",
      "Informe uma URL http(s) válida ou deixe vazia.",
      "VAL-URL-INVALID",
    );
    return null;
  }
}

/** Fatos compartilhados entre POST e PATCH: mesmas obrigatoriedades e códigos. */
function validateFacts(input: ManualProductInput, fail: Fail): ValidatedFacts {
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
  const category = requireBoundedText(
    input.category,
    "category",
    "Informe a categoria do produto.",
    `A categoria deve ter até ${CATEGORY_MAX} caracteres.`,
    CATEGORY_MAX,
    "VAL-CATEGORY-REQUIRED",
    fail,
  );

  // Preço e Moeda são obrigatórios e informados em par (RI-002); preço não negativo, até 2 casas.
  const price = asTrimmedString(input.price) ?? "";
  const priceCurrency = (
    asTrimmedString(input.priceCurrency) ?? ""
  ).toUpperCase();
  if (!price) {
    fail("price", "Informe o preço do produto.", "VAL-PRICE-REQUIRED");
  } else if (!PRICE_PATTERN.test(price)) {
    fail(
      "price",
      "Informe um preço válido e não negativo, com até duas casas decimais, como 29,90.",
      "VAL-PRICE-FORMAT",
    );
  }
  if (!priceCurrency) {
    fail(
      "priceCurrency",
      "Informe a moeda do produto.",
      "VAL-CURRENCY-REQUIRED",
    );
  } else if (!CURRENCIES.includes(priceCurrency)) {
    fail(
      "priceCurrency",
      "Moeda não suportada. Use BRL, USD ou EUR.",
      "VAL-PRICE-FORMAT",
    );
  }

  // Características: uma por linha no formulário; aqui chegam como lista de strings não vazias.
  const rawFeatures = input.features;
  let features: string[] = [];
  if (rawFeatures == null) {
    fail(
      "features",
      "Informe ao menos uma característica do produto.",
      "VAL-FEATURES-REQUIRED",
    );
  } else if (Array.isArray(rawFeatures)) {
    features = rawFeatures
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
    if (features.length === 0) {
      fail(
        "features",
        "Informe ao menos uma característica do produto.",
        "VAL-FEATURES-REQUIRED",
      );
    } else if (features.length > FEATURES_MAX_ITEMS) {
      fail(
        "features",
        `Use até ${FEATURES_MAX_ITEMS} características.`,
        "VAL-FEATURES-INVALID",
      );
    } else if (features.some((item) => item.length > FEATURE_MAX_LENGTH)) {
      fail(
        "features",
        `Cada característica deve ter até ${FEATURE_MAX_LENGTH} caracteres.`,
        "VAL-FEATURES-INVALID",
      );
    }
  } else {
    fail(
      "features",
      "Informe as características como lista de textos.",
      "VAL-FEATURES-INVALID",
    );
  }

  const imageRefs = validateImageRefs(input.imageRefs, fail);

  return {
    name,
    description,
    category,
    priceAmount: normalizePriceAmount(price),
    priceCurrency,
    features,
    imageRefs,
  };
}

function throwIfErrors(
  errors: Record<string, string>,
  codes: Record<string, string>,
): void {
  if (Object.keys(errors).length > 0) {
    const code =
      FIELD_CODE_PRIORITY.map((field) => codes[field]).find(Boolean) ??
      "VAL-PRODUCT-INVALID";
    throw new ProductValidationError(errors, code);
  }
}

/** Valida e normaliza o corpo do POST (fatos + preparação). Erros ficam em ProductValidationError. */
export function validateManualProductInput(
  input: ManualProductInput,
): ValidatedManualProduct {
  const errors: Record<string, string> = {};
  const codes: Record<string, string> = {};
  // Primeira falha de cada campo vence — mensagem e código ficam sempre em par.
  const fail: Fail = (field, message, code) => {
    if (field in errors) return;
    errors[field] = message;
    codes[field] = code;
  };

  const facts = validateFacts(input, fail);
  const submittedUrl = validateOptionalUrl(input.url, fail);

  // Preparação (RI-003): defaults 20 / "either" quando omitidos (PLAN §4.2).
  const rawCount = input.targetContentCount;
  let targetContentCount = DEFAULT_TARGET_CONTENT_COUNT;
  if (rawCount != null) {
    if (
      typeof rawCount !== "number" ||
      !Number.isInteger(rawCount) ||
      rawCount < QUANTITY_MIN ||
      rawCount > QUANTITY_MAX
    ) {
      fail(
        "targetContentCount",
        `A quantidade inicial deve ser um inteiro entre ${QUANTITY_MIN} e ${QUANTITY_MAX}.`,
        "VAL-QUANTITY-RANGE",
      );
    } else {
      targetContentCount = rawCount;
    }
  }

  const rawPresence = input.creatorPresence;
  let creatorPresence: CreatorPresence = DEFAULT_CREATOR_PRESENCE;
  if (rawPresence != null) {
    if (
      typeof rawPresence === "string" &&
      (CREATOR_PRESENCE_OPTIONS as readonly string[]).includes(rawPresence)
    ) {
      creatorPresence = rawPresence as CreatorPresence;
    } else {
      fail(
        "creatorPresence",
        "Formato do creator inválido.",
        "VAL-CREATOR-FORMAT",
      );
    }
  }

  // Observações/restrições são opcionais e limitadas a 300 caracteres.
  const constraints = asTrimmedString(input.constraints) ?? "";
  if (constraints.length > NOTES_MAX) {
    fail(
      "constraints",
      `As observações devem ter até ${NOTES_MAX} caracteres.`,
      "VAL-NOTES-LENGTH",
    );
  }

  throwIfErrors(errors, codes);

  // Restrições guardam somente a preparação da primeira geração (RI-004) — sempre com creatorPresence e constraints.
  const generationConstraints: Prisma.InputJsonValue = {
    creatorPresence,
    constraints,
  };

  return { ...facts, targetContentCount, generationConstraints, submittedUrl };
}

/**
 * Valida somente os fatos editáveis do PATCH: mesmo contrato do POST, sem a
 * preparação da primeira geração — não editável e ignorada se enviada.
 */
export function validateProductFacts(
  input: ManualProductInput,
): ValidatedFacts & { submittedUrl: string | null } {
  const errors: Record<string, string> = {};
  const codes: Record<string, string> = {};
  const fail: Fail = (field, message, code) => {
    if (field in errors) return;
    errors[field] = message;
    codes[field] = code;
  };

  const facts = validateFacts(input, fail);

  // URL opcional: vazia limpa; presente precisa ser http(s).
  const submittedUrl = validateOptionalUrl(input.url, fail);

  throwIfErrors(errors, codes);
  return { ...facts, submittedUrl };
}

export type ManualProductResult = { product: Product; replay: boolean };

/** Cria o Product no Tenant resolvido; chave já usada no Tenant devolve o mesmo registro (replay). */
export async function createManualProduct(
  tenantId: string,
  input: ManualProductInput,
  idempotencyKey: string,
): Promise<ManualProductResult> {
  const data = validateManualProductInput(input);

  const existing = await prisma.product.findUnique({
    where: {
      tenantId_createIdempotencyKey: {
        tenantId,
        createIdempotencyKey: idempotencyKey,
      },
    },
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
        images: data.imageRefs,
        submittedUrl: data.submittedUrl,
        provenance: { origin: "manual" },
        targetContentCount: data.targetContentCount,
        generationConstraints: data.generationConstraints,
        createIdempotencyKey: idempotencyKey,
      },
    });
    return { product, replay: false };
  } catch (error) {
    // Corrida entre retries concorrentes: o índice único decide — o vencedor retorna replay.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const product = await prisma.product.findUnique({
        where: {
          tenantId_createIdempotencyKey: {
            tenantId,
            createIdempotencyKey: idempotencyKey,
          },
        },
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

export async function getTenantProduct(
  tenantId: string,
  id: string,
): Promise<Product | null> {
  // Sem id não há Product: evita que findFirst ignore o filtro e vaze outro registro.
  if (!id) return null;
  return prisma.product.findFirst({ where: { id, tenantId } });
}

/**
 * Substitui os fatos editáveis do Product no Tenant da sessão, com controle
 * otimista de versão. Preparação não é editável aqui.
 */
export async function updateTenantProduct(
  tenantId: string,
  id: string,
  expectedVersion: number,
  input: ManualProductInput,
): Promise<Product> {
  const facts = validateProductFacts(input);
  try {
    return await prisma.product.update({
      // Filtros extras no where (extendedWhereUnique): tenant, id e versão decidem juntos.
      where: { id, tenantId, version: expectedVersion },
      data: {
        name: facts.name,
        description: facts.description,
        category: facts.category,
        priceAmount: facts.priceAmount,
        priceCurrency: facts.priceCurrency,
        features: facts.features,
        images: facts.imageRefs,
        submittedUrl: facts.submittedUrl,
        version: { increment: 1 },
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      // Sem correspondência: inexistente/fora do tenant (404) ou versão desatualizada (409).
      const existing = await getTenantProduct(tenantId, id);
      if (!existing) throw new ProductNotFoundError();
      throw new ProductVersionConflictError();
    }
    throw error;
  }
}

/**
 * Transição de lifecycle do Product no Tenant da sessão, sem apagar dados
 * (PRD: ACTIVE/ARCHIVED). Idempotente: 200 só retorna com o Product no estado
 * alvo — já no estado dá replay sem mudar nada; corrida com PATCH/DELETE
 * reavalia o estado relido (replay, retry ou 404) em vez de confiar na leitura
 * antiga. Versão bumpa apenas na transição real, mantendo o optimistic locking.
 */
async function transitionTenantProduct(
  tenantId: string,
  id: string,
  target: "ACTIVE" | "ARCHIVED",
): Promise<Product> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "tenantId" FROM "tenant_entitlements" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
    const existing = await tx.product.findFirst({ where: { tenantId, id } });
    if (!existing) throw new ProductNotFoundError();
    if (existing.lifecycle === target) return existing;
    // ADR-006: entitlement default idempotente; linhas históricas pré-backfill se auto-provisionam
    // aqui (nunca sobrescreve limite já resolvido). Sem limite configurado, fail-closed abaixo.
    const entitlement = await provisionDefaultEntitlement(tenantId, tx);
    const activeCount = await tx.product.count({ where: { tenantId, lifecycle: "ACTIVE" } });
    if (target === "ACTIVE") {
      if (!Number.isInteger(entitlement.activeProductsLimit) || entitlement.activeProductsLimit! < 0) throw new ProductValidationError({ lifecycle: "Limite de produtos não configurado." }, "GEN-PRODUCT-CAPACITY");
      if (activeCount >= entitlement.activeProductsLimit!) throw new ProductValidationError({ lifecycle: "Limite de produtos ativos atingido." }, "GEN-PRODUCT-CAPACITY");
    }
    const changed = await tx.product.updateMany({ where: { id, tenantId, version: existing.version }, data: { lifecycle: target, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ProductVersionConflictError();
    const updated = await tx.product.findFirst({ where: { tenantId, id } });
    if (!updated) throw new ProductNotFoundError();
    if (entitlement) await tx.tenantEntitlement.update({ where: { tenantId }, data: { activeProductsUsed: target === "ACTIVE" ? activeCount + 1 : Math.max(0, activeCount - 1) } });
    return updated;
  });
}

export async function archiveTenantProduct(tenantId: string, id: string): Promise<Product> {
  try { return await transitionTenantProduct(tenantId, id, "ARCHIVED"); }
  catch (error) { if (error instanceof ProductVersionConflictError) return transitionTenantProduct(tenantId, id, "ARCHIVED"); throw error; }
}

/** Desarquivar/reativar: volta o Product para ACTIVE, idempotente como archive. */
export async function reactivateTenantProduct(tenantId: string, id: string): Promise<Product> {
  try { return await transitionTenantProduct(tenantId, id, "ACTIVE"); }
  catch (error) { if (error instanceof ProductVersionConflictError) return transitionTenantProduct(tenantId, id, "ACTIVE"); throw error; }
}
export async function deleteTenantProduct(tenantId: string, id: string): Promise<never> {
  const product = await prisma.product.findFirst({ where: { tenantId, id }, select: { id: true } });
  if (!product) throw new ProductNotFoundError();
  const [jobs, runs, strategies, plans, opportunities, contents, briefs, memory] = await Promise.all([
    prisma.commerceIntelligenceJob.count({ where: { tenantId, productId: id } }),
    prisma.intelligenceRun.count({ where: { tenantId, productId: id } }),
    prisma.productStrategy.count({ where: { tenantId, productId: id } }),
    prisma.contentPlan.count({ where: { tenantId, productId: id } }),
    prisma.contentOpportunity.count({ where: { tenantId, productId: id } }),
    prisma.content.count({ where: { tenantId, productId: id } }),
    prisma.contentBriefVersion.count({ where: { tenantId, productId: id } }),
    prisma.productMemorySnapshot.count({ where: { tenantId, productId: id } }),
  ]);
  const hasHistory = jobs + runs + strategies + plans + opportunities + contents + briefs + memory > 0;
  throw new ProductDeleteRejectedError(hasHistory ? "PRODUCT_HAS_HISTORY" : "PRODUCT_DELETE_UNSUPPORTED");
}
