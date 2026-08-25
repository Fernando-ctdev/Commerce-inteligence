// Guardas SSRF do adaptador de enriquecimento de URL — SPEC/PLAN 002 e ADR-008.
// Bloqueia loopback, redes privadas, link-local (inclui metadata), multicast e faixas reservadas,
// validando o destino em cada redirecionamento e na resolução DNS efetiva usada no request.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isValidPublicHttpUrlString } from "./validation";

export const URL_MAX_BYTES = 1024 * 1024; // 1 MiB
export const URL_TOTAL_TIMEOUT_MS = 5_000;
export const URL_MAX_REDIRECTS = 3;

export type GuardedFetchResult =
  | { kind: "completed"; mime: string; text: string }
  | { kind: "unavailable"; reason: "invalid-url" | "blocked-host" | "dns" | "redirects" | "timeout" | "too-large" | "bad-mime" | "network" | "http-error" };

const IPV4_BLOCKED: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8 ("this host")
  [0x0A000000, 8], // 10.0.0.0/8 privado
  [0x7F000000, 8], // 127.0.0.0/8 loopback
  [0x64400000, 10], // 100.64.0.0/10 CGNAT
  [0xA9FE0000, 16], // 169.254.0.0/16 link-local/metadata
  [0xAC100000, 12], // 172.16.0.0/12 privado
  [0xC0A80000, 16], // 192.168.0.0/16 privado
  [0xC0000000, 24], // 192.0.0.0/24 reservado
  [0xC6120000, 15], // 198.18.0.0/15 benchmarking
  [0xE0000000, 4], // 224.0.0.0/4 multicast
  [0xF0000000, 4], // 240.0.0.0/4 reservado + 255.255.255.255
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** IP está em faixa bloqueada (loopback, privada, link-local, multicast, reservada, análoga IPv6)? */
export function ipIsBlocked(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    if (n === null) return true; // não-parseável → bloqueia
    return IPV4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (family === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true; // unspecified / loopback
    if (v.startsWith("::ffff:")) {
      const mapped = v.slice(7);
      return isIP(mapped) === 4 ? ipIsBlocked(mapped) : true;
    }
    const first = parseInt(v.split(":")[0] || "0", 16) || 0;
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA privada
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if ((first & 0xfffe) === 0x2001 && v.startsWith("2001:db8")) return true; // 2001:db8::/32 doc
    return false;
  }
  return true; // não-IP → bloqueia
}

/** Resolve o host e bloqueia se qualquer endereço resolvido cair em faixa proibida (rebinding: valida imediatamente antes do fetch). */
export async function assertHostAllowed(url: URL): Promise<boolean> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !ipIsBlocked(host);
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !ipIsBlocked(a.address));
  } catch {
    return false;
  }
}

function isTextualMime(mime: string): boolean {
  const m = mime.split(";")[0].trim().toLowerCase();
  return m.startsWith("text/") || ["application/json", "application/xml", "application/xhtml+xml", "application/rss+xml"].includes(m);
}

/** Fetch best-effort com todos os limites da SPEC 002. Nunca lança — resultado `unavailable` é estado observável. */
export async function guardedFetch(startUrl: string): Promise<GuardedFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_TOTAL_TIMEOUT_MS);
  try {
    if (!isValidPublicHttpUrlString(startUrl)) return { kind: "unavailable", reason: "invalid-url" };
    let current = new URL(startUrl);
    for (let redirects = 0; redirects <= URL_MAX_REDIRECTS; redirects++) {
      if (!(await assertHostAllowed(current))) return { kind: "unavailable", reason: "blocked-host" };
      const res = await fetch(current, { redirect: "manual", signal: controller.signal });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { kind: "unavailable", reason: "redirects" };
        const next = new URL(loc, current); // destino relativo resolve contra a origem
        if (next.protocol !== "http:" && next.protocol !== "https:") return { kind: "unavailable", reason: "invalid-url" };
        if (next.username || next.password) return { kind: "unavailable", reason: "invalid-url" };
        current = next;
        continue;
      }
      if (!res.ok) return { kind: "unavailable", reason: "http-error" };
      const mime = res.headers.get("content-type") ?? "";
      if (!isTextualMime(mime)) return { kind: "unavailable", reason: "bad-mime" };
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > URL_MAX_BYTES) return { kind: "unavailable", reason: "too-large" };
      if (!res.body) return { kind: "unavailable", reason: "network" };
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > URL_MAX_BYTES) {
          await reader.cancel();
          return { kind: "unavailable", reason: "too-large" };
        }
        chunks.push(value);
      }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
      return { kind: "completed", mime, text };
    }
    return { kind: "unavailable", reason: "redirects" }; // excedeu 3 redirecionamentos
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { kind: "unavailable", reason: "timeout" };
    return { kind: "unavailable", reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
