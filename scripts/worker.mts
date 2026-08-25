// Worker do Slice 003 — segundo processo do mesmo repositório/deploy (ADR-005/PLAN Passo 5).
// Loop único: purge de intenções expiradas, recuperação de leases, processamento e métricas.
// Gates reais: a configuração operacional (lease/tentativas/backoff/stuck) é obrigatória e
// fail-closed; sem gold-standard aprovado e sem engine/provider, toda run falha sanitizada (sem mock).
import { generationWorkerIteration } from "../src/modules/generation/worker.js";

const intervalMs = Number(process.env.GENERATION_WORKER_INTERVAL_MS ?? 5000);
if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
  console.error(JSON.stringify({ event: "generation.worker.invalid_interval" }));
  process.exit(1);
}

// Verificação externa documentada (PLAN Passo 0): flag server-side do gold-standard aprovado.
const goldStandardApproved = process.env.GENERATION_GOLD_STANDARD_APPROVED === "1";

async function main(): Promise<void> {
  console.info(JSON.stringify({ event: "generation.worker.started", gold_standard_approved: goldStandardApproved }));
  for (;;) {
    try {
      await generationWorkerIteration({ goldStandardApproved });
    } catch (error) {
      const name = error instanceof Error ? error.name : "unknown";
      console.error(JSON.stringify({ event: "generation.worker.iteration_failed", error: name }));
      if (name === "GenerationOperationalConfigError") process.exit(1); // gate operacional: sem config, sem worker
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

void main();
