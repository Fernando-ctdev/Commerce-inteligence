// Client HTTP do Browser Service (ADR-011) — único dono do lifecycle do Chromium.
// Config fail-closed: sem BROWSER_SERVICE_URL/TOKEN a importação não declara sucesso.
// Erros são sempre sanitizados: nenhum corpo bruto, CDP, cookie ou profile vaza do adapter.
export type BrowserSessionState =
  | "OPENING"
  | "READY"
  | "LOGIN_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "2FA_REQUIRED"
  | "USER_INTERACTION_REQUIRED"
  | "EXTRACTING"
  | "EXTRACTED"
  | "ERROR"
  | "CLOSED";

export type BrowserRawCandidate = {
  name?: string;
  description?: string;
  price?: { amount: number; currency: string };
  features: string[];
  images: string[];
  seller?: string;
  sourceUrl: string;
};

export type BrowserSessionView = {
  sessionId: string;
  profileId: string;
  sourceUrl: string;
  state: BrowserSessionState;
  candidate?: BrowserRawCandidate;
  interactiveUrl?: string;
  error?: { code: string; message: string };
};

export class BrowserServiceUnavailableError extends Error {} // config ausente, rede ou 5xx
export class BrowserSessionNotFoundError extends Error {}
export class BrowserBusyError extends Error {} // capacidade do serviço ocupada
export class ProfileInUseError extends Error {} // profile com sessão ativa
export class BrowserInvalidStateError extends Error {} // ação incompatível com o estado
export class BrowserUrlRejectedError extends Error {} // allowlist/egress do serviço rejeitou
export class BrowserHandoffExpiredError extends Error {} // handle interativo expirado/revogado
export class BrowserHarnessFailedError extends Error {}
export class BrowserInsufficientFactsError extends Error {}

export type BrowserClient = {
  start(profileId: string, url: string): Promise<BrowserSessionView>;
  get(sessionId: string): Promise<BrowserSessionView>;
  resume(sessionId: string, handoff: string): Promise<BrowserSessionView>;
  extract(sessionId: string): Promise<BrowserSessionView>;
  close(sessionId: string): Promise<BrowserSessionView>;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.BROWSER_SERVICE_TIMEOUT_MS ?? 30000);

/** Config validada server-side; ausente/inválida falha fechada (SPEC 002: nunca confiar em default aberto). */
export function resolveBrowserServiceConfig(env: NodeJS.ProcessEnv = process.env): { baseUrl: string; token: string } {
  const baseUrl = (env.BROWSER_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
  const token = (env.BROWSER_SERVICE_TOKEN ?? "").trim();
  if (!/^https?:\/\/.+/.test(baseUrl) || token.length < 16) throw new BrowserServiceUnavailableError();
  return { baseUrl, token };
}

function errorFor(code: string | undefined): Error {
  switch (code) {
    case "HANDOFF_NOT_FOUND":
      return new BrowserHandoffExpiredError();
    case "SESSION_NOT_FOUND":
      return new BrowserSessionNotFoundError();
    case "BROWSER_BUSY":
      return new BrowserBusyError();
    case "PROFILE_IN_USE":
      return new ProfileInUseError();
    case "INVALID_STATE":
      return new BrowserInvalidStateError();
    case "URL_REJECTED":
      return new BrowserUrlRejectedError();
    case "HARNESS_FAILED":
      return new BrowserHarnessFailedError();
    case "INSUFFICIENT_PRODUCT_FACTS":
      return new BrowserInsufficientFactsError();
    default:
      return new BrowserServiceUnavailableError();
  }
}
function isBrowserState(value: unknown): value is BrowserSessionState {
  return typeof value === "string" && {
    OPENING: true,
    READY: true,
    LOGIN_REQUIRED: true,
    CAPTCHA_REQUIRED: true,
    "2FA_REQUIRED": true,
    USER_INTERACTION_REQUIRED: true,
    EXTRACTING: true,
    EXTRACTED: true,
    ERROR: true,
    CLOSED: true,
  }[value] === true;
}

function parseCandidate(value: unknown): BrowserRawCandidate | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.sourceUrl !== "string" || !Array.isArray(record.features) || !record.features.every((item) => typeof item === "string") || !Array.isArray(record.images) || !record.images.every((item) => typeof item === "string")) {
    return undefined;
  }
  const candidate: BrowserRawCandidate = {
    sourceUrl: record.sourceUrl,
    features: record.features.filter((item): item is string => typeof item === "string"),
    images: record.images.filter((item): item is string => typeof item === "string"),
  };
  if (typeof record.name === "string") candidate.name = record.name;
  if (typeof record.description === "string") candidate.description = record.description;
  if (typeof record.seller === "string") candidate.seller = record.seller;
  if (typeof record.price === "object" && record.price !== null && "amount" in record.price && "currency" in record.price && typeof record.price.amount === "number" && typeof record.price.currency === "string") {
    candidate.price = { amount: record.price.amount, currency: record.price.currency };
  }
  return candidate;
}

function parseSessionView(value: unknown): BrowserSessionView | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.sessionId !== "string" || typeof record.profileId !== "string" || typeof record.sourceUrl !== "string" || !isBrowserState(record.state)) return null;
  const parsed: BrowserSessionView = {
    sessionId: record.sessionId,
    profileId: record.profileId,
    sourceUrl: record.sourceUrl,
    state: record.state,
  };
  if (typeof record.interactiveUrl === "string") parsed.interactiveUrl = record.interactiveUrl;
  if (typeof record.error === "object" && record.error !== null) {
    const error = record.error as Record<string, unknown>;
    if (typeof error.code === "string" && typeof error.message === "string") parsed.error = { code: error.code, message: error.message };
  }
  const candidate = parseCandidate(record.candidate);
  if (candidate) parsed.candidate = candidate;
  return parsed;
}

/** Client real sobre fetch; testes injetam um BrowserClient falso — sem mudar o contrato. */
export function createBrowserClient(config?: { baseUrl: string; token: string }): BrowserClient {
  const resolved = config ?? resolveBrowserServiceConfig();
  const timeoutMs = Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0 ? DEFAULT_TIMEOUT_MS : 30000;

  async function call(method: string, path: string, body?: Record<string, unknown>): Promise<BrowserSessionView> {
    let response: Response;
    try {
      response = await fetch(`${resolved.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${resolved.token}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch {
      throw new BrowserServiceUnavailableError(); // rede/timeout: nada do serviço vaza
    }
    if (response.status === 401) throw new BrowserServiceUnavailableError(); // token inválido é falha de config
    const payload: unknown = await response.json().catch(() => null);
    let errorCode: string | undefined;
    if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "object" && payload.error !== null && "code" in payload.error && typeof payload.error.code === "string") {
      errorCode = payload.error.code;
    }
    if (!response.ok) throw errorFor(errorCode);
    const parsed = parseSessionView(payload);
    if (!parsed) throw new BrowserServiceUnavailableError();
    return parsed;
  }

  return {
    start: (profileId, url) => call("POST", "/v1/browser-sessions", { profileId, url }),
    get: (sessionId) => call("GET", `/v1/browser-sessions/${encodeURIComponent(sessionId)}`),
    resume: (sessionId, handoff) => call("POST", `/v1/browser-sessions/${encodeURIComponent(sessionId)}/resume`, { handoff }),
    extract: (sessionId) => call("POST", `/v1/browser-sessions/${encodeURIComponent(sessionId)}/extract`),
    close: (sessionId) => call("POST", `/v1/browser-sessions/${encodeURIComponent(sessionId)}/close`),
  };
}
