import { readFileSync } from "node:fs";
import { claimGeneration, processGeneration, reclaimExpiredGenerations, validateGenerationConfig } from "../src/modules/commerce-intelligence/worker";
import { heartbeat, databaseIdentity } from "../src/modules/commerce-intelligence/runtime";
import { providerRuntimeConfig } from "../src/modules/commerce-intelligence/provider";

function loadDotEnv(path = ".env") { try { for (const line of readFileSync(path, "utf8").split(/\r?\n/)) { const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/.exec(line); if (match && (process.env[match[1]] === undefined || process.env[match[1]] === "")) process.env[match[1]] = match[2] ?? match[3] ?? match[4] ?? ""; } } catch { /* deployment may inject env directly */ } }
if ("loadEnvFile" in process && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");
loadDotEnv();
console.error("[generation-worker] starting", { database: databaseIdentity(), llmConfigured: Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && (process.env.LLM_MODEL_BALANCED || process.env.LLM_MODEL_FAST || process.env.LLM_MODEL_QUALITY || process.env.LLM_MODEL_MID || process.env.LLM_MODEL_HIGH)), provider: providerRuntimeConfig() });
async function main() { validateGenerationConfig(); for (;;) { heartbeat(); await reclaimExpiredGenerations(); const job = await claimGeneration(); if (job) await processGeneration(job.id, job.ownerId); await new Promise((resolve) => setTimeout(resolve, 1000)); } }
main().catch((error: unknown) => { console.error("[generation-worker] startup/runtime failure", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; });
