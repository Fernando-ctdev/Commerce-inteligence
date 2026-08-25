import { prisma } from "../db";
import { readGenerationRuntimeConfig } from "./runtime";
import { generationHealth } from "./health";
import { loadWorkerHeartbeat } from "./worker";

export async function handleGenerationHealth(): Promise<Response> {
  let config;
  try {
    config = readGenerationRuntimeConfig();
  } catch {
    config = undefined;
  }
  const health = await generationHealth({
    config,
    heartbeatAt: await loadWorkerHeartbeat(), // heartbeat persistido pelo worker em processo separado
    checkDatabase: async () => { await prisma.$queryRaw`select 1`; },
    checkQueue: async () => { await prisma.generationRun.findFirst({ where: { status: "queued" }, select: { id: true } }); },
  });
  return new Response(JSON.stringify(health), { status: health.status === "ok" ? 200 : 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
