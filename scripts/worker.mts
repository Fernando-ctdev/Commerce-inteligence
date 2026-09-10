// ADR-016/gate interno: carregamento com precedência explícita env-injetado > .env.
// process.loadEnvFile removido: dependia de semântica implícita do runtime (varia entre
// versões) e rodava em paralelo com um segundo loader — dupla via sem teste. O loader
// único preenche apenas variáveis ausentes/vazias e devolve NOMES de chaves (nunca valores).
import { loadDotEnvFile } from "../src/modules/env-loader";
import { claimGeneration, processGeneration, reclaimExpiredGenerations, validateGenerationConfig } from "../src/modules/commerce-intelligence/worker";
import { heartbeat, databaseIdentity } from "../src/modules/commerce-intelligence/runtime";
import { providerRuntimeConfig } from "../src/modules/commerce-intelligence/provider";

const loadedKeys = loadDotEnvFile(".env");
console.error("[generation-worker] starting", { database: databaseIdentity(), envFileKeys: loadedKeys ?? null, llmConfigured: Boolean(process.env.LLM_BASE_URL && process.env.LLM_API_KEY && (process.env.LLM_MODEL_BALANCED || process.env.LLM_MODEL_FAST || process.env.LLM_MODEL_QUALITY || process.env.LLM_MODEL_MID || process.env.LLM_MODEL_HIGH)), provider: providerRuntimeConfig() });
async function main() { validateGenerationConfig(); for (;;) { heartbeat(); await reclaimExpiredGenerations(); const job = await claimGeneration(); if (job) await processGeneration(job.id, job.ownerId); await new Promise((resolve) => setTimeout(resolve, 1000)); } }
// Falha = sair com erro; o reinício é do orquestrador (compose `restart`), não de loop interno.
main().catch((error: unknown) => { console.error("[generation-worker] startup/runtime failure", error instanceof Error ? error.message : "unknown error"); process.exit(1); });
