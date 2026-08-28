// Client HTTP do Browser Service. Contrato mínimo: start/get/resume/extract/close.
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

export type BrowserProductSnapshot = {
  pageUrl: string;
  title: string;
  accessibilityNames: string[];
  text: string[];
  jsonLd: unknown[];
  imageUrls: string[];
  metaImageUrls: string[];
};

export type BrowserRawCandidate = {
  name?: string;
  description?: string;
  category?: string;
  brand?: string;
  variants?: string[];
  price?: { amount: number; currency: string };
  features: string[];
  images: string[];
  seller?: string;
  sourceUrl: string;
  snapshot?: BrowserProductSnapshot;
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

export class BrowserServiceUnavailableError extends Error {}
export class BrowserSessionNotFoundError extends Error {}
export class BrowserBusyError extends Error {}
export class ProfileInUseError extends Error {}
export class BrowserInvalidStateError extends Error {}
export class BrowserUrlRejectedError extends Error {}
export class BrowserHandoffExpiredError extends Error {}
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

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length <= maxLength).slice(0, maxItems)
    : [];
}

function parseSnapshot(value: unknown): BrowserProductSnapshot | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.pageUrl !== "string" || typeof record.title !== "string") return undefined;
  return {
    pageUrl: record.pageUrl,
    title: record.title,
    accessibilityNames: strings(record.accessibilityNames, 500, 2_000),
    text: strings(record.text, 500, 2_000),
    jsonLd: Array.isArray(record.jsonLd) ? record.jsonLd.slice(0, 50) : [],
    imageUrls: strings(record.imageUrls, 200, 2_048),
    metaImageUrls: strings(record.metaImageUrls, 50, 2_048),
  };
}

function parseCandidate(value: unknown): BrowserRawCandidate | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.sourceUrl !== "string") return undefined;
  const candidate: BrowserRawCandidate = {
    sourceUrl: record.sourceUrl,
    features: strings(record.features, 20, 300),
    images: strings(record.images, 10, 2_048),
  };
  if (typeof record.name === "string") candidate.name = record.name;
  if (typeof record.description === "string") candidate.description = record.description;
  if (typeof record.category === "string") candidate.category = record.category;
  if (typeof record.brand === "string") candidate.brand = record.brand;
  if (typeof record.seller === "string") candidate.seller = record.seller;
  if (Array.isArray(record.variants) && record.variants.every((item) => typeof item === "string")) candidate.variants = record.variants;
  if (typeof record.price === "object" && record.price !== null) {
    const price = record.price as Record<string, unknown>;
    if (typeof price.amount === "number" && typeof price.currency === "string") candidate.price = { amount: price.amount, currency: price.currency };
  }
  const snapshot = parseSnapshot(record.snapshot);
  if (snapshot) candidate.snapshot = snapshot;
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
      throw new BrowserServiceUnavailableError();
    }
    if (response.status === 401) throw new BrowserServiceUnavailableError();
    const payload: unknown = await response.json().catch(() => null);
    const error = typeof payload === "object" && payload !== null ? (payload as { error?: { code?: unknown } }).error : undefined;
    if (!response.ok) throw errorFor(typeof error?.code === "string" ? error.code : undefined);
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
