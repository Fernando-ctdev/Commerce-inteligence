import { isIP } from "node:net";

import "./server-only";
import { LLM_MODEL_TIERS, type LLMModelTier } from "./types";

export type LLMProviderName = "openai-compatible";

export type LLMConfig = {
  provider: LLMProviderName;
  baseUrl: string;
  apiKey: string;
  models: Readonly<Record<LLMModelTier, string>>;
  allowInsecureLocalhost?: boolean;
};

export class LLMConfigurationError extends Error {
  readonly code = "LLM_CONFIGURATION_INVALID" as const;

  constructor() {
    super("A configuração do LLM está ausente ou inválida.");
    this.name = "LLMConfigurationError";
  }
}

const MAX_BASE_URL_LENGTH = 2048;
const MAX_SECRET_LENGTH = 4096;
const MAX_MODEL_LENGTH = 200;

export type LLMConfigOptions = {
  allowInsecureLocalhost?: boolean;
};

function required(value: string | undefined, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (/[\u0000-\u001F\u007F]/.test(normalized)) return null;
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)) || (a === 203 && b === 0) || a >= 224;
}

function mappedIpv4(hostname: string): string | null {
  const [left, right, ...extra] = hostname.split("::");
  if (extra.length > 0) return null;
  const leftGroups = left ? left.split(":") : [];
  const rightGroups = right ? right.split(":") : [];
  const groups = [...leftGroups, ...Array(8 - leftGroups.length - rightGroups.length).fill("0"), ...rightGroups];
  if (groups.length !== 8 || groups.slice(5).some((group) => !/^[0-9a-f]{1,4}$/.test(group)) || groups.slice(0, 5).some((group) => Number.parseInt(group, 16) !== 0) || Number.parseInt(groups[5], 16) !== 0xffff) return null;
  const high = Number.parseInt(groups[6], 16);
  const low = Number.parseInt(groups[7], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.+$/, "");
  const blockedNames = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data.ec2.internal"]);
  if (blockedNames.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return true;
  const addressType = isIP(host);
  if (addressType === 4) return isPrivateIpv4(host);
  if (addressType === 6) {
    const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1] ?? mappedIpv4(host);
    return (mapped !== undefined && mapped !== null) || host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") || host.startsWith("ff");
  }
  return false;
}

export function isLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function parseBaseUrl(value: string | undefined, production: boolean, allowInsecureLocalhost: boolean): string | null {
  const normalized = required(value, MAX_BASE_URL_LENGTH)?.replace(/\/+$/, "") ?? "";
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const localTestEndpoint = allowInsecureLocalhost && isLocalHost(url.hostname);
    if (url.protocol !== "https:" && !(localTestEndpoint && url.protocol === "http:")) return null;
    if (production && url.protocol !== "https:") return null;
    if (isPrivateHost(url.hostname) && !localTestEndpoint) return null;
    if (!localTestEndpoint && url.port !== "" && url.port !== "443") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Server-only configuration reader. */
export function readLLMConfig(env: Record<string, string | undefined> = process.env, options: LLMConfigOptions = {}): LLMConfig | null {
  const provider = env.LLM_PROVIDER?.trim() ?? "";
  const hasLLMConfiguration = [
    provider,
    env.LLM_BASE_URL,
    env.LLM_API_KEY,
    ...LLM_MODEL_TIERS.map((tier) => env[`LLM_MODEL_${tier.toUpperCase()}`]),
  ].some((value) => typeof value === "string" && value.trim() !== "");
  if (!hasLLMConfiguration) return null;

  if (provider !== "openai-compatible") throw new LLMConfigurationError();
  const allowInsecureLocalhost = options.allowInsecureLocalhost === true && env.NODE_ENV === "test";
  const baseUrl = parseBaseUrl(env.LLM_BASE_URL, env.NODE_ENV === "production", allowInsecureLocalhost);
  const apiKey = required(env.LLM_API_KEY, MAX_SECRET_LENGTH);
  const models = Object.fromEntries(
    LLM_MODEL_TIERS.map((tier) => [tier, required(env[`LLM_MODEL_${tier.toUpperCase()}`], MAX_MODEL_LENGTH)]),
  ) as Record<LLMModelTier, string | null>;
  if (!baseUrl || !apiKey || LLM_MODEL_TIERS.some((tier) => models[tier] === null)) throw new LLMConfigurationError();

  return {
    provider: "openai-compatible",
    baseUrl,
    apiKey,
    models: models as Record<LLMModelTier, string>,
    allowInsecureLocalhost,
  };
}
