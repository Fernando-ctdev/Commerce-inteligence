// Leitura tenant-scoped do Histórico do Produto (Slice 010): projeção allowlisted
// SOMENTE com agregados financeiros, status, datas e position — sem IDs técnicos,
// provider/modelo/tokens/metadata (ADR-013 com a exceção aprovada no design 2026-09-18).
import { CommerceIntelligenceJobStatus, type CommerceIntelligenceJob, type Content, type IntelligenceRun } from "@prisma/client";
import { prisma } from "../db";
import { readCookie, SESSION_COOKIE, json } from "../identity/http";
import { resolveSession } from "../identity/service";
import { aggregateRunCosts, type CostTotal } from "./cost-observability";

export type ProductHistoryCost = CostTotal;

export type ProductHistoryResponse = {
  jobs: Array<{
    status: CommerceIntelligenceJobStatus;
    createdAt: string;
    finishedAt: string | null;
    requestedContents: number;
    cost: ProductHistoryCost;
    contents: Array<{ position: number; cost: ProductHistoryCost }>;
  }>;
};

const UNAVAILABLE: ProductHistoryCost = { currency: null, amountMinor: null, completeness: "UNAVAILABLE" };

// Jobs terminais apenas: estados em andamento pertencem ao envelope de geração atual.
const TERMINAL_STATUSES = [
  CommerceIntelligenceJobStatus.SUCCEEDED,
  CommerceIntelligenceJobStatus.SUCCEEDED_PARTIAL,
  CommerceIntelligenceJobStatus.FAILED,
  CommerceIntelligenceJobStatus.CANCELLED,
];

type HistoryJob = Pick<CommerceIntelligenceJob, "id" | "status" | "createdAt" | "finishedAt" | "targetContentCount">;
type HistoryContent = Pick<Content, "jobId" | "position" | "id">;
type HistoryRun = Pick<IntelligenceRun, "jobId" | "metadata">;

// Projeção pura e determinística: jobs JÁ ordenados por createdAt desc na query,
// contents JÁ ordenados por position asc. Legacy sem metadata/run projeta UNAVAILABLE.
export function projectProductHistory(jobs: HistoryJob[], contents: HistoryContent[], runs: HistoryRun[]): ProductHistoryResponse {
  const runByJob = new Map(runs.map((run) => [run.jobId, run] as const));
  const contentsByJob = new Map<string, HistoryContent[]>();
  for (const content of contents) {
    const list = contentsByJob.get(content.jobId) ?? [];
    list.push(content);
    contentsByJob.set(content.jobId, list);
  }
  return {
    jobs: jobs.map((job) => {
      const aggregates = aggregateRunCosts(runByJob.get(job.id)?.metadata ?? null);
      const costByContent = new Map(aggregates.contents.map((entry) => [entry.contentId, entry.total] as const));
      return {
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
        requestedContents: job.targetContentCount,
        cost: aggregates.job,
        contents: (contentsByJob.get(job.id) ?? []).map((content) => ({
          position: content.position,
          cost: costByContent.get(content.id) ?? UNAVAILABLE,
        })),
      };
    }),
  };
}

// Fronteira única autorizada: TODA query é tenantId + productId (fail-closed).
export async function getProductHistoryCost(tenantId: string, productId: string): Promise<ProductHistoryResponse> {
  const jobs = await prisma.commerceIntelligenceJob.findMany({
    where: { tenantId, productId, status: { in: TERMINAL_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, finishedAt: true, targetContentCount: true },
  });
  if (jobs.length === 0) return { jobs: [] };
  const jobIds = jobs.map((job) => job.id);
  const [contents, runs] = await Promise.all([
    prisma.content.findMany({
      where: { tenantId, productId, jobId: { in: jobIds } },
      orderBy: [{ jobId: "asc" }, { position: "asc" }],
      select: { id: true, jobId: true, position: true },
    }),
    prisma.intelligenceRun.findMany({
      where: { tenantId, jobId: { in: jobIds } },
      select: { jobId: true, metadata: true },
    }),
  ]);
  return projectProductHistory(jobs, contents, runs);
}

const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export async function handleGetProductHistory(req: Request, productId: string): Promise<Response> {
  const token = readCookie(req, SESSION_COOKIE);
  const session = token ? await resolveSession(token) : null;
  if (!session) return json(401, { error: "Sessão inválida", code: "UNAUTHENTICATED" });
  // 404 uniforme para formato inválido, produto inexistente ou de outro tenant.
  if (!PRODUCT_ID_RE.test(productId)) return json(404, { error: "Produto não encontrado", code: "GEN-PRODUCT" });
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId: session.tenantId }, select: { id: true } });
  if (!product) return json(404, { error: "Produto não encontrado", code: "GEN-PRODUCT" });
  const history = await getProductHistoryCost(session.tenantId, productId);
  const response = Response.json(history);
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}
