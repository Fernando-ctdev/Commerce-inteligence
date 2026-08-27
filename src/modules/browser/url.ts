// Validação de entrada e canonicalização de URL TikTok Shop — SPEC/PLAN 002.
// Preflight barato no Node: URL inválida nunca inicia Chromium (o Browser Service
// reaplica a allowlist/egress/DNS na conexão real — camada de defesa própria dele).
import { isValidPublicHttpUrlString } from "../product/validation";

export const MAX_IMPORT_URL_LENGTH = 2048;

/** Allowlist server-side de hosts TikTok Shop suportados (mesma configuração do Browser Service). */
export function allowedImportHosts(): string[] {
  const raw = process.env.BROWSER_IMPORT_ALLOWED_HOSTS ?? "shop.tiktok.com,*.tiktok.com";
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/\.+$/, ""))
    .filter(Boolean);
}

/**
 * URL de produto TikTok Shop aceita como entrada da importação:
 * https, host na allowlist, sem userinfo, sem porta explícita e ≤2048 caracteres.
 * Retorna a URL aparada ou null (erro associado ao campo na UI).
 */
export function validateImportUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length === 0 || t.length > MAX_IMPORT_URL_LENGTH) return null;
  if (!isValidPublicHttpUrlString(t)) return null; // http/https, sem credenciais embutidas
  let parsed: URL;
  try {
    parsed = new URL(t);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null; // serviço aceita somente HTTPS TikTok
  if (parsed.username || parsed.password) return null;
  if (parsed.port !== "") return null; // porta explícita não é suportada
  const host = parsed.hostname.toLowerCase();
  const allowed = allowedImportHosts();
  if (!allowed.some((a) => (a.startsWith("*.") ? host.endsWith(a.slice(1)) : host === a))) return null;
  return t;
}

/**
 * Identidade canônica de duplicação (PLAN Passo 2): scheme + host + path, sem query/fragment.
 * Retorna null quando não há path — sem identidade comprovada, não deduplica.
 */
export function canonicalizeSourceUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (path === "" || path === "/") return null;
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}
