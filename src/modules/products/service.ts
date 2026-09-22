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
// Ordem determinística dos códigos da SPEC §7 quando vários campos falham juntos.
const FIELD_CODE_PRIORITY = [
  "name",
  "description",
  "category",
  "price",
  "priceCurrency",
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
export const DEFAULT_TARGET_CONTENT_COUNT = 5;
export const DEFAULT_CREATOR_PRESENCE: CreatorPresence = "either";
const QUANTITY_MIN = 1;
const QUANTITY_MAX = 10;
const NOTES_MAX = 300;
const CURRENCIES = ["R$", "USD", "EUR"];
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
export const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
export const CATEGORY_MAX = 100;

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
export function normalizePriceAmount(price: string): string {
  if (price.includes(",")) return price.replace(/\./g, "").replace(",", ".");
  if (/^\d{1,3}(?:\.\d{3})+$/.test(price)) return price.replace(/\./g, "");
  return price;
}
// ADR-031: fora do contrato ativo — discountType/discountValue/
// discountPercentage não são validados, escritos, lidos nem projetados; colunas
// históricas permanecem isoladas no banco e nunca são sobrescritas.

type ValidatedFacts = {
  name: string;
  description: string;
  category: string;
  priceAmount: string;
  priceCurrency: string;
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
      "Moeda não suportada. Use R$, USD ou EUR.",
      "VAL-PRICE-FORMAT",
    );
  }

  // Características/comissão (ADR-030): fora do contrato ativo — enviados, são
  // ignorados (sem erro, sem escrita); colunas históricas nunca são sobrescritas.

  // ADR-031: fora do contrato ativo — enviado, é ignorado
  // (sem erro, sem escrita); colunas históricas nunca são sobrescritas.

  const imageRefs = validateImageRefs(input.imageRefs, fail);

  return {
    name,
    description,
    category,
    priceAmount: normalizePriceAmount(price),
    priceCurrency,
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
 * Valida somente os fatos editáveis do PATCH: mesmo contrato do POST, sem
 * creatorPresence/targetContentCount — não editáveis e ignorados se enviados.
 * constraints é opcional: presente, valida o limite (300) e normaliza o trim;
 * string vazia limpa; ausente preserva o valor atual.
 */
export function validateProductFacts(
  input: ManualProductInput,
): ValidatedFacts & { submittedUrl: string | null; constraints?: string } {
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

  // RI-004 (rev): constraints é a única parte da preparação editável no PATCH.
  let constraints: string | undefined;
  if (input.constraints !== undefined) {
    constraints = asTrimmedString(input.constraints) ?? "";
    if (constraints.length > NOTES_MAX) {
      fail(
        "constraints",
        `As observações devem ter até ${NOTES_MAX} caracteres.`,
        "VAL-NOTES-LENGTH",
      );
    }
  }

  throwIfErrors(errors, codes);
  return {
    ...facts,
    submittedUrl,
    ...(constraints !== undefined ? { constraints } : {}),
  };
}

export type ManualProductResult = { product: Product; replay: boolean };

export async function findTenantProductByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
): Promise<Product | null> {
  return prisma.product.findUnique({
    where: { tenantId_createIdempotencyKey: { tenantId, createIdempotencyKey: idempotencyKey } },
  });
}

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
        // ADR-031: fora do contrato ativo — nunca escrito;
        // colunas históricas (discountType/discountValue/discountPercentage)
        // permanecem isoladas no banco.
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
 * otimista de versão. Da preparação, somente `constraints` é editável aqui:
 * presente no PATCH atualiza (string vazia limpa), ausente preserva — e
 * `creatorPresence`/`targetContentCount` nunca mudam neste caminho (RI-004).
 */
export async function updateTenantProduct(
  tenantId: string,
  id: string,
  input: ManualProductInput,
  expectedVersion: number,
): Promise<Product> {
  const facts = validateProductFacts(input);
  const existing = await getTenantProduct(tenantId, id);
  if (!existing) throw new ProductNotFoundError();
  // creatorPresence atual é preservado; somente o texto de constraints muda.
  const current = (existing.generationConstraints ?? {}) as {
    creatorPresence?: string;
  };
  const generationConstraints: Prisma.InputJsonValue | undefined =
    facts.constraints !== undefined
      ? {
          creatorPresence: current.creatorPresence ?? DEFAULT_CREATOR_PRESENCE,
          constraints: facts.constraints,
        }
      : undefined;
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
        // ADR-031: ausente no data — legado nunca sobrescrito
        // em edições; histórico preservado.
        images: facts.imageRefs,
        submittedUrl: facts.submittedUrl,
        ...(generationConstraints ? { generationConstraints } : {}),
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
    const activeCount = await tx.product.count({
      where: { tenantId, lifecycle: "ACTIVE" },
    });
    if (target === "ACTIVE") {
      if (
        !Number.isInteger(entitlement.activeProductsLimit) ||
        entitlement.activeProductsLimit! < 0
      )
        throw new ProductValidationError(
          { lifecycle: "Limite de produtos não configurado." },
          "GEN-PRODUCT-CAPACITY",
        );
      if (activeCount >= entitlement.activeProductsLimit!)
        throw new ProductValidationError(
          { lifecycle: "Limite de produtos ativos atingido." },
          "GEN-PRODUCT-CAPACITY",
        );
    }
    const changed = await tx.product.updateMany({
      where: { id, tenantId, version: existing.version },
      data: { lifecycle: target, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ProductVersionConflictError();
    const updated = await tx.product.findFirst({ where: { tenantId, id } });
    if (!updated) throw new ProductNotFoundError();
    if (entitlement)
      await tx.tenantEntitlement.update({
        where: { tenantId },
        data: {
          activeProductsUsed:
            target === "ACTIVE"
              ? activeCount + 1
              : Math.max(0, activeCount - 1),
        },
      });
    return updated;
  });
}

export async function archiveTenantProduct(
  tenantId: string,
  id: string,
): Promise<Product> {
  try {
    return await transitionTenantProduct(tenantId, id, "ARCHIVED");
  } catch (error) {
    if (error instanceof ProductVersionConflictError)
      return transitionTenantProduct(tenantId, id, "ARCHIVED");
    throw error;
  }
}

/** Desarquivar/reativar: volta o Product para ACTIVE, idempotente como archive. */
export async function reactivateTenantProduct(
  tenantId: string,
  id: string,
): Promise<Product> {
  try {
    return await transitionTenantProduct(tenantId, id, "ACTIVE");
  } catch (error) {
    if (error instanceof ProductVersionConflictError)
      return transitionTenantProduct(tenantId, id, "ACTIVE");
    throw error;
  }
}
export async function deleteTenantProduct(
  tenantId: string,
  id: string,
): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { tenantId, id },
    select: { id: true, submittedUrl: true, sourceUrl: true },
  });
  if (!product) throw new ProductNotFoundError();
  // Vínculo determinístico de ProductImportAttempt: mesma URL submetida/origem
  // no mesmo tenant (a tabela não tem FK productId).
  const attemptUrlFilter = {
    OR: [
      ...(product.submittedUrl ? [{ submittedUrl: product.submittedUrl }] : []),
      ...(product.sourceUrl ? [{ sourceUrl: product.sourceUrl }] : []),
    ],
  };
  // Exclusão Big Bang (decisão do Arquiteto): apaga TODO o histórico relacionado,
  // direto ou indireto, em uma única transação — sem preservar histórico e sem
  // bloquear por conteúdo. Sempre tenant-scoped. Ordem respeita FKs e quebra o
  // ciclo Content↔ContentBriefVersion antes de apagar versões.
  await prisma.$transaction(async (tx) => {
    await tx.productImportAttempt.deleteMany({
      where: { tenantId, ...attemptUrlFilter },
    });
    // Ciclo: Content.currentBriefVersionId → ContentBriefVersion.contentId.
    await tx.content.updateMany({
      where: { tenantId, productId: id },
      data: { currentBriefVersionId: null, approvedBriefVersionId: null },
    });
    // ADR-019: sets de cenas referenciam brief versions/contents — apagar antes.
    await tx.contentSceneSet.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.briefValidationReport.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.contentBriefVersion.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.content.deleteMany({ where: { tenantId, productId: id } });
    await tx.contentOpportunity.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.contentPlan.deleteMany({ where: { tenantId, productId: id } });
    // Snapshot referencia sourceJob: apagar antes dos jobs.
    await tx.productMemorySnapshot.deleteMany({
      where: { tenantId, productId: id },
    });
    // Reservas de quota referenciam job: apagar via filtro de relação, antes dos jobs.
    await tx.generationUsageReservation.deleteMany({
      where: { tenantId, job: { productId: id } },
    });
    await tx.intelligenceRun.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.productUnderstanding.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.productStrategy.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.commerceIntelligenceJob.deleteMany({
      where: { tenantId, productId: id },
    });
    await tx.product.delete({ where: { tenantId_id: { tenantId, id } } });
  });
}
