// Casos de uso de Product Import — SPEC/PLAN 002.
// Estados persistidos do attempt: opening | paused | extracting | ready | error | cancelled | confirmed.
// Estados derivados da UI (IDLE/CONFIRMING/CONFIRMED/DUPLICATE/PROFILE_UNAVAILABLE/LIMIT e os bloqueios
// LOGIN_REQUIRED/CAPTCHA_REQUIRED/2FA_REQUIRED/USER_INTERACTION_REQUIRED como razões de `paused`).
// Chamadas ao Browser Service ficam FORA da transação de confirmação; idempotência por (tenant, chave).
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { preflightImportCapacity } from "../entitlements/service";
import { isValidPublicHttpUrlString, MAX_PRICE_CENTS } from "../product/validation";
import {
  BrowserBusyError,
  BrowserClient,
  BrowserHarnessFailedError,
  BrowserHandoffExpiredError,
  BrowserInsufficientFactsError,
  BrowserInvalidStateError,
  BrowserServiceUnavailableError,
  BrowserSessionNotFoundError,
  BrowserUrlRejectedError,
  ProfileInUseError,
  createBrowserClient,
  resolveBrowserServiceConfig,
} from "../browser/client";
import type { BrowserRawCandidate, BrowserSessionView } from "../browser/client";
import { canonicalizeSourceUrl, validateImportUrl } from "../browser/url";
import {
  createConfiguredCandidateAssistProvider,
  validateCandidateAssistInput,
  validateCandidateAssistOutput,
  type CandidateAssistInputV1,
  type CandidateAssistProvider,
  type CandidateFactField,
} from "../../lib/llm";
import { candidateAmountToCents, candidateCurrency, normalizeCandidate, type CandidateFacts, type CandidateProvenance as DeterministicCandidateProvenance, type NormalizedCandidate } from "./normalize";

export class ImportUrlInvalidError extends Error {}
export class ImportIdempotencyConflictError extends Error {}
export class ImportNotFoundError extends Error {} // uniforme: inexistente ou de outro Tenant
export class ImportStateConflictError extends Error {}
export class ImportProfileUnavailableError extends Error {}

type CandidateProvenance = Record<string, DeterministicCandidateProvenance[string] | "llm-normalized" | "llm-suggested">;

export type ImportUiState =
  | "OPENING"
  | "LOGIN_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "2FA_REQUIRED"
  | "USER_INTERACTION_REQUIRED"
  | "PAUSED"
  | "EXTRACTING"
  | "READY"
  | "ERROR"
  | "CANCELLED"
  | "CONFIRMED"
  | "PROFILE_UNAVAILABLE";

export type ImportCandidateView = {
  id: string;
  version: number;
  facts: CandidateFacts;
  gaps: string[];
  provenance: CandidateProvenance;
  sourceUrl: string;
  expiresAt: string;
  expired: boolean;
};

export type ImportView = {
  id: string;
  status: string;
  uiState: ImportUiState;
  sourceUrl: string;
  canonicalUrl: string | null;
  pauseReason: string | null;
  interactiveUrl: string | null;
  handoffExpired: boolean; // derivado: resume com handle expirado — cancelar/retry sem retomar
  errorCode: string | null;
  candidate: ImportCandidateView | null;
  productId: string | null;
  replay?: boolean;
  createdAt: string;
  expiresAt: string;
};

const ATTEMPT_TTL_MS = (Number(process.env.BROWSER_IMPORT_ATTEMPT_TTL_MINUTES) || 30) * 60_000;
const CANDIDATE_TTL_MS = (Number(process.env.BROWSER_IMPORT_CANDIDATE_TTL_HOURS) || 24) * 3_600_000;
const LLM_ASSIST_TIMEOUT_MS = 65_000;
const ACTIVE_STATUSES: Record<string, true> = { opening: true, paused: true, extracting: true };
const BROWSER_ERROR_CODES = new Set([
  "BROWSER_SERVICE_UNAVAILABLE",
  "BROWSER_BUSY",
  "PROFILE_IN_USE",
  "URL_REJECTED",
  "HARNESS_FAILED",
  "INSUFFICIENT_PRODUCT_FACTS",
  "SESSION_LOST",
  "INVALID_STATE",
  "SESSION_CLOSED",
  "BROWSER_ERROR",
]);
const PROMPT_INJECTION_PATTERNS = [
  /\b(ignore|disregard|override|forget)\b.{0,80}\b(previous|prior|above|system|developer|instructions?|prompt)\b/i,
  /\b(desconsidere|ignore|substitua|revele)\b.{0,80}\b(instruções?|prompt|mensagem|segredo|sistema)\b/i,
  /\b(ignore|disregard|override|forget)\b.{0,100}\b(instructions?|prompt|system|developer)\b/i,
  /\b(desconsidere|ignore|substitua|revele)\b.{0,100}\b(instruções?|prompt|sistema|segredo)\b/i,
  /\b(system prompt|developer message|assistant message|user message|jailbreak|do not follow|não siga)\b/i,
];
type AttemptRow = Prisma.ProductImportAttemptGetPayload<{ include: { candidate: true } }>;

function intentHash(url: string): string {
  return createHash("sha256").update(JSON.stringify(["product-import", url])).digest("hex");
}

function candidateExpired(row: AttemptRow): boolean {
  return row.candidate !== null && row.candidate.expiresAt.getTime() <= Date.now();
}

function deriveUiState(row: AttemptRow): ImportUiState {
  switch (row.status) {
    case "opening":
      return "OPENING";
    case "extracting":
      return "EXTRACTING";
    case "paused":
      if (row.pauseReason === "LOGIN_REQUIRED") return "LOGIN_REQUIRED"; // QR Code é detalhe do login
      if (row.pauseReason === "CAPTCHA_REQUIRED") return "CAPTCHA_REQUIRED";
      if (row.pauseReason === "2FA_REQUIRED") return "2FA_REQUIRED";
      if (row.pauseReason === "USER_INTERACTION_REQUIRED") return "USER_INTERACTION_REQUIRED";
      return "PAUSED";
    case "ready":
      return candidateExpired(row) ? "ERROR" : "READY";
    case "error":
      return row.errorCode === "BROWSER_SERVICE_UNAVAILABLE" || row.errorCode === "PROFILE_UNAVAILABLE" ? "PROFILE_UNAVAILABLE" : "ERROR";
    case "cancelled":
      return "CANCELLED";
    case "confirmed":
      return "CONFIRMED";
    default:
      return "ERROR";
  }
}

function toView(row: AttemptRow, handoffExpired = false): ImportView {
  const c = row.candidate;
  return {
    id: row.id,
    status: row.status,
    uiState: deriveUiState(row),
    sourceUrl: row.sourceUrl,
    canonicalUrl: row.canonicalUrl,
    pauseReason: row.pauseReason,
    interactiveUrl: row.interactiveUrl,
    handoffExpired,
    errorCode: candidateExpired(row) && row.status === "ready" ? "CANDIDATE_EXPIRED" : row.errorCode,
    candidate:
      c === null
        ? null
        : {
            id: c.id,
            version: c.version,
            facts: c.payload as unknown as CandidateFacts,
            gaps: c.gaps as unknown as string[],
            provenance: c.provenance as unknown as CandidateProvenance,
            sourceUrl: c.sourceUrl,
            expiresAt: c.expiresAt.toISOString(),
            expired: c.expiresAt.getTime() <= Date.now(),
          },
    productId: c?.confirmedProductId ?? null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Código estável/sanitizado por classe de erro — nada do serviço vira payload persistido. */
function sanitizeErrorCode(e: unknown): string {
  if (e instanceof BrowserServiceUnavailableError) return "BROWSER_SERVICE_UNAVAILABLE";
  if (e instanceof BrowserBusyError) return "BROWSER_BUSY";
  if (e instanceof ProfileInUseError) return "PROFILE_IN_USE";
  if (e instanceof BrowserUrlRejectedError) return "URL_REJECTED";
  if (e instanceof BrowserHarnessFailedError) return "HARNESS_FAILED";
  if (e instanceof BrowserInsufficientFactsError) return "INSUFFICIENT_PRODUCT_FACTS";
  if (e instanceof BrowserSessionNotFoundError) return "SESSION_LOST";
  if (e instanceof BrowserInvalidStateError) return "INVALID_STATE";
  return "BROWSER_ERROR";
}

export function sanitizeBrowserErrorCode(code: unknown): string {
  return typeof code === "string" && BROWSER_ERROR_CODES.has(code) ? code : "BROWSER_ERROR";
}

async function failAttempt(attemptId: string, errorCode: string): Promise<ImportView> {
  await prisma.productImportAttempt.updateMany({
    where: { id: attemptId, status: { in: ["opening", "paused", "extracting"] } },
    data: { status: "error", errorCode, pauseReason: null, interactiveUrl: null, finishedAt: new Date() },
  });
  const row = await prisma.productImportAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { candidate: true } });
  return toView(row);
}

/** Encerra a sessão no Browser Service sem destruir o profile; falha é sanitizada (cleanup pendente). */
async function bestEffortClose(client: BrowserClient | null, sessionId: string | null): Promise<boolean> {
  if (!sessionId) return true;
  if (!client) {
    console.error("browser session close pending: client unavailable");
    return false;
  }
  try {
    const closed = await client.close(sessionId);
    if (closed.state !== "CLOSED") {
      console.error("browser session close pending: service did not confirm CLOSED");
      return false;
    }
    try {
      await prisma.productImportAttempt.updateMany({ where: { sessionId }, data: { sessionId: null } });
    } catch {
      console.error("browser session close pending: local state update failed");
      return false;
    }
    return true;
  } catch (e) {
    console.error("browser session close pending:", e instanceof Error ? e.constructor.name : "unknown");
    return false;
  }
}

function optionalBrowserClient(sessionId: string | null): BrowserClient | null {
  if (!sessionId) return null;
  try {
    return createBrowserClient();
  } catch {
    return null;
  }
}

async function loadAttempt(tenantId: string, attemptId: string): Promise<AttemptRow | null> {
  return prisma.productImportAttempt.findFirst({ where: { id: attemptId, tenantId }, include: { candidate: true } });
}

async function updateActiveAttempt(
  attemptId: string,
  data: Prisma.ProductImportAttemptUpdateManyMutationInput,
): Promise<{ changed: boolean; view: ImportView }> {
  const result = await prisma.productImportAttempt.updateMany({
    where: { id: attemptId, status: { in: ["opening", "paused", "extracting"] } },
    data,
  });
  const row = await prisma.productImportAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { candidate: true } });
  return { changed: result.count === 1, view: toView(row) };
}

const ASSIST_FIELD_TO_FACT: Record<CandidateFactField, string> = {
  name: "name",
  description: "description",
  category: "category",
  brand: "brand",
  seller: "seller",
  price: "priceCents",
  features: "features",
  variants: "variants",
  images: "imageRefs",
};

function fieldGaps(facts: CandidateFacts): CandidateFactField[] {
  return [
    facts.description === null ? "description" : null,
    facts.category === null ? "category" : null,
    facts.brand === null ? "brand" : null,
    facts.seller === null ? "seller" : null,
    facts.priceCents === null || facts.priceCurrency === null ? "price" : null,
    facts.features.length === 0 ? "features" : null,
    facts.variants === null ? "variants" : null,
    facts.imageRefs.length === 0 ? "images" : null,
  ].filter((field): field is CandidateFactField => field !== null);
}

function providerSafeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    const sanitized = url.toString();
    return isValidPublicHttpUrlString(sanitized) ? sanitized : null;
  } catch {
    return null;
  }
}

function containsPromptInjection(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "string") return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Array.isArray(value)
    ? value.some((item) => containsPromptInjection(item, seen))
    : Object.values(value).some((item) => containsPromptInjection(item, seen));
}

function assistFacts(facts: CandidateFacts, safeImages: string[]): Record<string, unknown> {
  return {
    name: facts.name,
    description: facts.description,
    category: facts.category,
    brand: facts.brand,
    seller: facts.seller,
    price: facts.priceCents === null && facts.priceCurrency === null
      ? null
      : { amount: facts.priceCents === null ? null : facts.priceCents / 100, currency: facts.priceCurrency },
    features: facts.features,
    variants: facts.variants,
    images: safeImages,
  };
}

function excerpt(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const sanitized = text.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return sanitized.length > 0 && !containsPromptInjection(sanitized) ? sanitized.slice(0, 2_000) : null;
}

function buildAssistInput(facts: CandidateFacts): CandidateAssistInputV1 | null {
  const sourceUrl = providerSafeUrl(facts.sourceUrl);
  const safeImages = facts.imageRefs.flatMap((image) => {
    const safe = providerSafeUrl(image);
    return safe ? [safe] : [];
  });
  const providerFacts = assistFacts(facts, safeImages);
  if (!sourceUrl || containsPromptInjection(providerFacts)) return null;
  const values: Array<[string, unknown]> = [
    ["browser-name", facts.name],
    ["browser-description", facts.description],
    ["browser-price", facts.priceCents === null && facts.priceCurrency === null ? null : { amount: facts.priceCents === null ? null : facts.priceCents / 100, currency: facts.priceCurrency }],
    ["browser-features", facts.features],
    ["browser-images", safeImages],
    ["browser-seller", facts.seller],
  ];
  return validateCandidateAssistInput({
    contract_version: "1",
    source_url: sourceUrl,
    candidate_version: 1,
    facts: providerFacts,
    gaps: fieldGaps(facts),
    evidence: values.flatMap(([id, value]) => {
      const text = excerpt(value);
      return text ? [{ id, kind: "browser-observation" as const, excerpt: text }] : [];
    }),
  });
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function valueStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(valueStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(valueStrings);
  if (typeof value === "number" && Number.isFinite(value)) return [String(value)];
  return [];
}

function supportedByEvidence(value: unknown, evidenceIds: string[], input: CandidateAssistInputV1): boolean {
  const excerpts = input.evidence.filter((item) => evidenceIds.includes(item.id)).map((item) => normalizedText(item.excerpt));
  const strings = valueStrings(value).map(normalizedText).filter(Boolean);
  return strings.length > 0 && strings.every((part) => excerpts.some((item) => item.includes(part)));
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().replace(/\s+/g, " ");
  return result.length > 0 && Array.from(result).length <= max ? result : null;
}

function boundedList(value: unknown, maxItems: number, maxItemLength: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) return null;
  const values = value.map((item) => boundedString(item, maxItemLength));
  return values.every((item): item is string => item !== null) ? values : null;
}

function applyCompletion(facts: CandidateFacts, field: CandidateFactField, value: unknown): boolean {
  switch (field) {
    case "description": {
      const next = boundedString(value, 5_000);
      if (next === null || facts.description !== null) return false;
      facts.description = next;
      return true;
    }
    case "category": {
      const next = boundedString(value, 120);
      if (next === null || facts.category !== null) return false;
      facts.category = next;
      return true;
    }
    case "brand": {
      const next = boundedString(value, 120);
      if (next === null || facts.brand !== null) return false;
      facts.brand = next;
      return true;
    }
    case "seller": {
      const next = boundedString(value, 200);
      if (next === null || facts.seller !== null) return false;
      facts.seller = next;
      return true;
    }
    case "features": {
      const next = boundedList(value, 20, 300);
      if (next === null || facts.features.length > 0) return false;
      facts.features = next;
      return true;
    }
    case "variants": {
      const next = boundedList(value, 20, 300);
      if (next === null || facts.variants !== null) return false;
      facts.variants = next;
      return true;
    }
    case "images": {
      const next = boundedList(value, 10, 2_048);
      if (next === null || facts.imageRefs.length > 0 || !next.every(isValidPublicHttpUrlString)) return false;
      facts.imageRefs = next;
      return true;
    }
    case "price": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const price = value as { amount?: unknown; currency?: unknown };
      if (Object.keys(price).sort().join(",") !== "amount,currency") return false;
      const cents = candidateAmountToCents(price.amount);
      const currency = candidateCurrency(price.currency);
      if (cents === null || cents > MAX_PRICE_CENTS || currency === null) return false;
      if (facts.priceCents !== null && facts.priceCents !== cents) return false;
      if (facts.priceCurrency !== null && facts.priceCurrency !== currency) return false;
      if (facts.priceCents !== null && facts.priceCurrency !== null) return false;
      facts.priceCents = cents;
      facts.priceCurrency = currency;
      return true;
    }
    case "name":
      return false;
  }
  return false;
}

type AssistedCandidate = Omit<NormalizedCandidate, "provenance"> & { provenance: CandidateProvenance };

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("LLM_TIMEOUT")), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Assistência é best-effort: qualquer falha mantém exatamente a saída determinística. */
export async function assistCandidateWithLLM(
  normalized: NormalizedCandidate,
  provider?: CandidateAssistProvider | null,
  attemptId = "product-import",
): Promise<AssistedCandidate> {
  const configured = provider === undefined ? (() => {
    try {
      return createConfiguredCandidateAssistProvider();
    } catch {
      return null;
    }
  })() : provider;
  if (!configured || normalized.gaps.length === 0) return normalized;

  try {
    const input = buildAssistInput(normalized.facts);
    if (!input || input.evidence.length === 0) return normalized;
    const result = await withTimeout(configured.assist({ input, tier: "balanced", attempt_id: attemptId }), LLM_ASSIST_TIMEOUT_MS);
    const output = validateCandidateAssistOutput(result.output, input);
    const facts = { ...normalized.facts, features: [...normalized.facts.features], imageRefs: [...normalized.facts.imageRefs], variants: normalized.facts.variants ? [...normalized.facts.variants] : null };
    const gaps = new Set(normalized.gaps);
    const provenance: CandidateProvenance = { ...normalized.provenance };
    for (const suggestion of output.suggestions) {
      if (suggestion.operation !== "complete" || !input.gaps.includes(suggestion.field) || containsPromptInjection(suggestion.value) || !supportedByEvidence(suggestion.value, suggestion.evidence_ids, input)) continue;
      if (!applyCompletion(facts, suggestion.field, suggestion.value)) continue;
      const factField = ASSIST_FIELD_TO_FACT[suggestion.field];
      provenance[factField] = "llm-suggested";
      if (suggestion.field === "price") {
        gaps.delete("priceCents");
        gaps.delete("priceCurrency");
      } else if (suggestion.field === "images") {
        gaps.delete("imageRefs");
      } else {
        gaps.delete(factField);
      }
    }
    return { facts, gaps: [...gaps], provenance };
  } catch {
    return normalized;
  }
}

/** Persiste o Candidate normalizado; estruturalmente inválido → attempt ERROR sem Candidate. */
async function persistCandidate(attemptId: string, raw: BrowserRawCandidate, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  const attempt = await prisma.productImportAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: { tenantId: true, sourceUrl: true },
  });
  // The opened URL is authoritative; browser output cannot redirect Candidate provenance.
  const normalized = normalizeCandidate({ ...raw, sourceUrl: attempt.sourceUrl }, MAX_PRICE_CENTS);
  if (!normalized) return failAttempt(attemptId, "INSUFFICIENT_PRODUCT_FACTS");
  const assisted = await assistCandidateWithLLM(normalized, provider, attemptId);

  const row = await prisma.$transaction(async (tx) => {
    const claimed = await tx.productImportAttempt.updateMany({
      where: { id: attemptId, status: { in: ["opening", "paused", "extracting"] }, candidateId: null },
      data: { status: "extracting" },
    });
    if (claimed.count === 0) return null;
    await tx.productCandidate.deleteMany({ where: { attemptId, confirmedProductId: null } }); // retry descarta rascunho não confirmado
    const candidate = await tx.productCandidate.create({
      data: {
        tenantId: attempt.tenantId,
        attemptId,
        payload: assisted.facts as unknown as object,
        gaps: assisted.gaps,
        provenance: assisted.provenance,
        sourceUrl: attempt.sourceUrl,
        expiresAt: new Date(Date.now() + CANDIDATE_TTL_MS),
      },
    });
    return tx.productImportAttempt.update({
      where: { id: attemptId },
      data: { status: "ready", candidateId: candidate.id, errorCode: null, pauseReason: null, interactiveUrl: null },
      include: { candidate: true },
    });
  });
  if (row) return toView(row);
  const current = await prisma.productImportAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { candidate: true } });
  return toView(current);
}

/**
 * Aplica o estado da sessão do Browser Service ao attempt. Uma chamada avança no máximo
 * um passo (abrir → extrair; retomar → extrair) — polling da UI dirige a máquina.
 */
async function applySessionView(attemptId: string, view: BrowserSessionView, client: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  switch (view.state) {
    case "OPENING": {
      return (await updateActiveAttempt(attemptId, { status: "opening", pauseReason: null, interactiveUrl: null })).view;
    }
    case "EXTRACTING": {
      return (await updateActiveAttempt(attemptId, { status: "extracting", pauseReason: null, interactiveUrl: null })).view;
    }
    case "READY": {
      const next = await updateActiveAttempt(attemptId, { status: "extracting", pauseReason: null, interactiveUrl: null });
      if (!next.changed) return next.view;
      return applySessionView(attemptId, await client.extract(view.sessionId), client, provider);
    }
    case "LOGIN_REQUIRED":
    case "CAPTCHA_REQUIRED":
    case "2FA_REQUIRED":
    case "USER_INTERACTION_REQUIRED": {
      return (await updateActiveAttempt(attemptId, { status: "paused", pauseReason: view.state, interactiveUrl: view.interactiveUrl ?? null })).view;
    }
    case "EXTRACTED": {
      try {
        if (!view.candidate) return failAttempt(attemptId, "INSUFFICIENT_PRODUCT_FACTS");
        return await persistCandidate(attemptId, view.candidate, provider);
      } finally {
        await bestEffortClose(client, view.sessionId);
      }
    }
    case "ERROR":
      await bestEffortClose(client, view.sessionId);
      return failAttempt(attemptId, sanitizeBrowserErrorCode(view.error?.code));
    default: // CLOSED ou desconhecido
      return failAttempt(attemptId, "SESSION_CLOSED");
  }
}

async function startBrowserSession(attemptId: string, tenantId: string, url: string, client: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  // profile persistente isolado por Tenant; indisponível é erro recuperável sem auto-delete
  const profile = await prisma.browserProfile.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
  if (profile.status !== "available") return failAttempt(attemptId, "PROFILE_UNAVAILABLE");
  await prisma.productImportAttempt.update({ where: { id: attemptId }, data: { browserProfileId: profile.id } });
  let sessionId: string | null = null;
  try {
    const view = await client.start(profile.id, url);
    sessionId = view.sessionId;
    if (view.profileId !== profile.id) throw new BrowserServiceUnavailableError();
    await prisma.productImportAttempt.update({ where: { id: attemptId }, data: { sessionId } });
    return applySessionView(attemptId, view, client, provider);
  } catch (e) {
    await bestEffortClose(client, sessionId);
    return failAttempt(attemptId, sanitizeErrorCode(e));
  }
}

/**
 * Inicia (ou repete/reinicia) uma importação. Idempotência por (tenant, chave):
 * mesma chave+payload → mesma tentativa (replay devolve estado vigente; erro/cancelado reinicia);
 * payload divergente → conflito sem nova mutação. URL inválida e preflight falham antes do Chromium.
 */
export async function startImport(tenantId: string, rawUrl: unknown, idempotencyKey: string, client?: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  const url = validateImportUrl(rawUrl);
  if (!url) throw new ImportUrlInvalidError();
  const hash = intentHash(url);

  const existing = await prisma.productImportAttempt.findUnique({
    where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    include: { candidate: true },
  });
  if (existing) {
    if (existing.payloadHash !== hash) throw new ImportIdempotencyConflictError();
    if (existing.status === "confirmed" || existing.status === "ready" && !candidateExpired(existing)) {
      return { ...toView(existing), replay: true };
    }
    if (ACTIVE_STATUSES[existing.status] === true) {
      return { ...(await advance(existing.id, tenantId, client ?? createBrowserClient(), provider)), replay: true };
    }
    // error/cancelled/candidate expirado: retry com a mesma chave reinicia o fluxo na mesma tentativa
    resolveBrowserServiceConfig();
    await preflightImportCapacity(tenantId);
    return restartAttempt(existing, client ?? createBrowserClient(), provider);
  }

  resolveBrowserServiceConfig(); // fail-closed: sem serviço configurado não há importação
  await preflightImportCapacity(tenantId); // LIMIT cedo; recheck atômico na confirmação
  const browser = client ?? createBrowserClient();
  const created = await prisma.productImportAttempt
    .create({
      data: {
        tenantId,
        idempotencyKey,
        payloadHash: hash,
        sourceUrl: url,
        canonicalUrl: canonicalizeSourceUrl(url),
        status: "opening",
        expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
      },
    })
    .catch(async (e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // corrida da mesma chave
      throw e;
    });
  if (created === null) {
    const winner = await prisma.productImportAttempt.findUniqueOrThrow({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      include: { candidate: true },
    });
    if (winner.payloadHash !== hash) throw new ImportIdempotencyConflictError();
    const view = ACTIVE_STATUSES[winner.status] === true
      ? await advance(winner.id, tenantId, browser, provider)
      : toView(winner);
    return { ...view, replay: true };
  }
  return startBrowserSession(created.id, tenantId, url, browser, provider);
}

/** Reinicia uma tentativa terminal (error/cancelled/expirada) preservando chave, URL e profile. */
async function restartAttempt(row: AttemptRow, client: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  await bestEffortClose(client, row.sessionId);
  const reset = await prisma.$transaction(async (tx) => {
    const claimed = await tx.productImportAttempt.updateMany({
      where: { id: row.id, status: row.status },
      data: {
        status: "opening",
        sessionId: null,
        candidateId: null,
        errorCode: null,
        pauseReason: null,
        interactiveUrl: null,
        finishedAt: null,
        expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
      },
    });
    if (claimed.count === 0) return null;
    await tx.productCandidate.deleteMany({ where: { attemptId: row.id, confirmedProductId: null } });
    return tx.productImportAttempt.findUniqueOrThrow({ where: { id: row.id }, include: { candidate: true } });
  });
  if (!reset) {
    const current = await prisma.productImportAttempt.findUniqueOrThrow({ where: { id: row.id }, include: { candidate: true } });
    return toView(current);
  }
  return startBrowserSession(reset.id, reset.tenantId, reset.sourceUrl, client, provider);
}

async function advance(attemptId: string, tenantId: string, client: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  const row = await loadAttempt(tenantId, attemptId);
  if (!row) throw new ImportNotFoundError();
  return advanceRow(row, client, provider);
}

async function advanceRow(row: AttemptRow, client: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  const sessionId = row.sessionId;
  if (ACTIVE_STATUSES[row.status] === true && row.expiresAt.getTime() <= Date.now()) {
    await bestEffortClose(client, sessionId);
    return failAttempt(row.id, "ATTEMPT_EXPIRED");
  }
  if (ACTIVE_STATUSES[row.status] !== true) return toView(row); // ready/terminal: sem chamadas ao serviço
  if (!sessionId) return toView(row); // start em voo: próximo poll avança
  try {
    return applySessionView(row.id, await client.get(sessionId), client, provider);
  } catch (e) {
    await bestEffortClose(client, sessionId);
    return failAttempt(row.id, sanitizeErrorCode(e));
  }
}

/** Consulta o estado vigente; avança no máximo um passo (opening→ready→extract; paused revalida sessão). */
export async function getImport(tenantId: string, attemptId: string, client?: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  const row = await loadAttempt(tenantId, attemptId);
  if (!row) throw new ImportNotFoundError();
  if (ACTIVE_STATUSES[row.status] !== true) return toView(row);
  const browser = client ?? createBrowserClient();
  return advanceRow(row, browser, provider);
}

/**
 * Cancelamento server-side (SPEC: sempre disponível na aplicação). Preserva URL, intenção,
 * chave e profile; encerra a sessão sem destruir o profile — cleanup pendente é sanitizado.
 */
export async function cancelImport(tenantId: string, attemptId: string, client?: BrowserClient): Promise<ImportView> {
  const row = await loadAttempt(tenantId, attemptId);
  if (!row) throw new ImportNotFoundError();
  if (row.status === "confirmed") return toView(row); // nada a cancelar após confirmação
  const browser = client ?? optionalBrowserClient(row.sessionId);
  await bestEffortClose(browser, row.sessionId);
  await prisma.productImportAttempt.updateMany({
    where: { id: row.id, status: { not: "confirmed" } },
    data: { status: "cancelled", pauseReason: null, interactiveUrl: null, finishedAt: new Date() },
  });
  const current = await prisma.productImportAttempt.findUniqueOrThrow({ where: { id: row.id }, include: { candidate: true } });
  return toView(current);
}

/** Retry explícito da tentativa (mesma chave/payload): permitido somente de estados recuperáveis. */
export async function retryImport(tenantId: string, attemptId: string, client?: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  const row = await loadAttempt(tenantId, attemptId);
  if (!row) throw new ImportNotFoundError();
  const retryable = row.status === "error" || row.status === "cancelled" || (row.status === "ready" && candidateExpired(row));
  if (!retryable) throw new ImportStateConflictError();
  resolveBrowserServiceConfig();
  await preflightImportCapacity(tenantId);
  return restartAttempt(row, client ?? createBrowserClient(), provider);
}

/**
 * Retoma após intervenção humana: consome o handle de uso único e, se a sessão ficou pronta,
 * executa a extração na mesma intenção (sem nova URL). Handle expirado mantém `paused` com
 * `handoffExpired` — cancelamento/retry permanecem disponíveis.
 */
export async function resumeImport(tenantId: string, attemptId: string, client?: BrowserClient, provider?: CandidateAssistProvider | null): Promise<ImportView> {
  const row = await loadAttempt(tenantId, attemptId);
  if (!row) throw new ImportNotFoundError();
  if (row.status !== "paused") throw new ImportStateConflictError();
  const token = row.interactiveUrl?.match(/\/interactive\/([A-Za-z0-9_-]+)\//)?.[1];
  if (!token || !row.sessionId) return toView(row, true);
  const browser = client ?? createBrowserClient();
  try {
    const view = await browser.resume(row.sessionId, token);
    return applySessionView(row.id, view, browser, provider);
  } catch (e) {
    if (e instanceof BrowserHandoffExpiredError) return toView(row, true);
    await bestEffortClose(browser, row.sessionId);
    return failAttempt(row.id, sanitizeErrorCode(e));
  }
}

/** Loader autorizado para o módulo Product confirmar Candidate dentro da sua transação. */
export async function loadCandidateForConfirmation(
  db: Pick<PrismaClient, "productImportAttempt">,
  tenantId: string,
  attemptId: string
): Promise<{ attempt: { id: string; status: string; sourceUrl: string; canonicalUrl: string | null; sessionId: string | null }; candidate: { id: string; version: number; confirmedProductId: string | null; payload: CandidateFacts; gaps: string[]; provenance: CandidateProvenance; expiresAt: Date } } | null> {
  const row = await db.productImportAttempt.findFirst({ where: { id: attemptId, tenantId }, include: { candidate: true } });
  if (!row || !row.candidate) return null;
  return {
    attempt: { id: row.id, status: row.status, sourceUrl: row.sourceUrl, canonicalUrl: row.canonicalUrl, sessionId: row.sessionId },
    candidate: {
      id: row.candidate.id,
      version: row.candidate.version,
      confirmedProductId: row.candidate.confirmedProductId,
      payload: row.candidate.payload as unknown as CandidateFacts,
      gaps: row.candidate.gaps as unknown as string[],
      provenance: row.candidate.provenance as unknown as CandidateProvenance,
      expiresAt: row.candidate.expiresAt,
    },
  };
}
