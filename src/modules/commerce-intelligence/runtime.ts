import { createHash } from "node:crypto";
import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const marker = join(tmpdir(), "commerce-intelligence-worker.heartbeat");
export function databaseIdentity() { const raw = process.env.DATABASE_URL; if (!raw) return { configured: false, target: null, fingerprint: null }; try { const url = new URL(raw); return { configured: true, target: `${url.protocol}//${url.host}${url.pathname}`, fingerprint: createHash("sha256").update(raw).digest("hex").slice(0, 12) }; } catch { return { configured: false, target: null, fingerprint: null }; } }
const ttlMs = Number(process.env.GENERATION_HEARTBEAT_TTL_MS ?? 10000);
export function heartbeat() { writeFileSync(marker, String(Date.now()), { encoding: "utf8" }); }
export function resetHeartbeatForTests() { if (existsSync(marker)) unlinkSync(marker); }
export function generationHealth() { const heartbeatAt = existsSync(marker) ? statSync(marker).mtimeMs : 0; const alive = heartbeatAt > 0 && Date.now() - heartbeatAt <= ttlMs; return { status: alive ? "ok" : "unavailable", heartbeatAt: heartbeatAt ? new Date(heartbeatAt).toISOString() : null }; }
