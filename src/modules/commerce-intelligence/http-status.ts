import { CommerceIntelligenceJobStatus } from "@prisma/client";
import { prisma } from "../db";
import { readCookie, sameOriginRequest, SESSION_COOKIE, json } from "../identity/http";
import { resolveSession } from "../identity/service";
import { isValidIdempotencyKey } from "../products/service";
import { GenerationError, generationErrorStatus, publicGenerationError } from "./errors";
import { startCommerceIntelligence, findBlockingGeneration, activeJobWhere } from "./service";
type GenerationEnvelopeJob = { id: string; productId: string; status: string; stage: string | null; targetContentCount: number; publicErrorMessage: string | null; metadata?: unknown; createdAt: Date; startedAt: Date | null; finishedAt: Date | null; attempt: number; strategies?: Array<{ payload: unknown }>; plan?: { payload: unknown } | null; contents?: Array<{ id: string; productId: string; planId: string; opportunityId: string | null; position: number; status: string; currentBriefVersionId: string | null; briefs?: Array<{ payload: unknown }>; sceneSets?: Array<{ briefVersionId: string; status: string; payload: unknown }> }> };
function payloadObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function projectBriefPayload(value: unknown): Record<string, unknown> { const payload = payloadObject(value); if (!Array.isArray(payload.development) || payload.development.length < 1 || payload.development.length > 4 || payload.development.some((point) => typeof point !== "string" || !point.trim())) throw new GenerationError("GEN-SCHEMA", "Brief persistido contém development inválido", false); const result = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "scenes")); return { ...result, development: payload.development }; }
async function session(req: Request) { const token = readCookie(req, SESSION_COOKIE); return token ? resolveSession(token) : null; }
/* metadata é escalar (Json?) — vem por padrão no include; include só aceita relações. */
const include = { strategies: true, plan: true, contents: { include: { briefs: { orderBy: { version: "asc" as const }, take: 1 }, sceneSets: true } } };
function noStore(response: Response) { response.headers.set("cache-control", "no-store, max-age=0"); return response; }
// ADR-019: projeção de cenas do envelope — sempre escopada ao tenant (a query já
// é) e à briefVersion corrente. Estados distintos sem vazar detalhes internos:
// null = não-gerado; status AVAILABLE/FILTERED/ERROR + cenas/contadores.
export function projectScenes(content: { currentBriefVersionId: string | null; sceneSets?: Array<{ briefVersionId: string; status: string; payload: unknown }> }): { status: string; scenes: Array<{ description: string }>; generated: number; dropped: number } | null {
  const current = content.sceneSets?.find((set) => set.briefVersionId === content.currentBriefVersionId);
  // null = legado anterior ao ADR-019 (sem scene set): ausência, não corrupção.
  if (!current) return null;
  const payload = payloadObject(current.payload);
  const scenes = Array.isArray(payload.scenes)
    ? payload.scenes.filter((scene): scene is { description: string } => {
        if (!scene || typeof scene !== "object" || Array.isArray(scene)) return false;
        const description = (scene as { description?: unknown }).description;
        // Mesmo critério de text() (contract.ts:27) usado por validateContentSceneSetDraft:
        // description string não vazia APÓS trim — só espaços não conta como cena.
        return typeof description === "string" && description.trim().length > 0;
      })
    : [];
  // Mesmo critério do engine (engine.ts:1909/2000): scene set presente com status
  // != AVAILABLE ou < 2 cenas válidas não publica — projeção fail-closed GEN-SCHEMA
  // → GEN-PROJECTION em vez de expor sucesso com cenas vazias.
  if (current.status !== "AVAILABLE" || scenes.length < 2) throw new GenerationError("GEN-SCHEMA", "Cenas persistidas inválidas", false);
  return {
    status: current.status,
    scenes: scenes.map(({ description }) => ({ description })),
    generated: typeof payload.generated === "number" ? payload.generated : scenes.length,
    dropped: typeof payload.dropped === "number" ? payload.dropped : 0,
  };
}
export function currentGenerationFilter(tenantId: string, userId: string, productId?: string) {
  return { tenantId, userId, ...(productId ? { productId } : {}), status: { in: [CommerceIntelligenceJobStatus.QUEUED, CommerceIntelligenceJobStatus.RUNNING, CommerceIntelligenceJobStatus.SUCCEEDED, CommerceIntelligenceJobStatus.SUCCEEDED_PARTIAL, CommerceIntelligenceJobStatus.FAILED, CommerceIntelligenceJobStatus.CANCELLED] as CommerceIntelligenceJobStatus[] } };
}
// ADR-021/UI: `missing` público do parcial — um token por item faltante
// (position + reasonCode server-side); sem issues livres, diagnóstico ou payload.
// reasonCode prefere o checkCode da cascata; cai para o reason do particionamento
// (HARD_GATE/JUDGE/VARIETY_CAP) quando o item não tem checkCode mapeado.
function projectMissing(value: unknown): Array<{ position: number | null; reasonCode: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const v = payloadObject(item);
    if (typeof v.contentId !== "string") return [];
    const checkCodes = Array.isArray(v.checkCodes) ? v.checkCodes.filter((code): code is string => typeof code === "string") : [];
    const reasonCode = checkCodes[0] ?? (typeof v.reason === "string" && ["HARD_GATE", "JUDGE", "VARIETY_CAP"].includes(v.reason) ? v.reason : "");
    if (!reasonCode) return [];
    return [{ position: typeof v.position === "number" ? v.position : null, reasonCode }];
  });
}
// ADR-021: parcial é declarado no envelope — contagens D de N + assinatura sanitizada por item.
export async function envelope(job: GenerationEnvelopeJob) {
  const meta = payloadObject(job.metadata);
  const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  const partial = job.status === "SUCCEEDED_PARTIAL" ? {
    expectedCount: num(meta.expectedCount, job.targetContentCount),
    deliveredCount: num(meta.deliveredCount, (job.contents ?? []).length),
    failedCount: num(meta.failedCount, 0),
    failedItems: Array.isArray(meta.failedItems) ? meta.failedItems : [],
  } : null;
  const publish = job.status === "SUCCEEDED" || job.status === "SUCCEEDED_PARTIAL";
  const contents = publish ? (job.contents ?? []).map((content) => ({ id: content.id, productId: content.productId, planId: content.planId, opportunityId: content.opportunityId, position: content.position, status: content.status, scenes: projectScenes(content), ...projectBriefPayload(content.briefs?.[0]?.payload) })) : [];
  // Terminal positivo sem conteúdos persistidos viola exact-N / D>0 (ADR-021) —
  // degrada fail-closed via GEN-PROJECTION (projectJobEnvelope) sem mascarar o status.
  if (publish && contents.length < 1) throw new GenerationError("GEN-PROJECTION", "Terminal positivo sem conteúdos persistidos", false);
  return { id: job.id, productId: job.productId, status: job.status, stage: job.stage, targetContentCount: job.targetContentCount, error: job.publicErrorMessage, createdAt: job.createdAt.toISOString(), startedAt: job.startedAt?.toISOString() ?? null, finishedAt: job.finishedAt?.toISOString() ?? null, attempt: job.attempt, readiness: publish ? "READY" : job.status === "FAILED" || job.status === "CANCELLED" ? "FAILED" : "ANALYZING", strategy: publish ? payloadObject(job.strategies?.[0]?.payload) : {}, plan: publish ? payloadObject(job.plan?.payload) : {}, contents, ...(partial ? { expectedCount: partial.expectedCount, deliveredCount: partial.deliveredCount, failedCount: partial.failedCount, missing: projectMissing(meta.failedItems) } : {}) };
}
export async function handleCurrent(req: Request) { const s = await session(req); if (!s) return json(401, { error: "Sessão inválida", code: "UNAUTHENTICATED" }); const productId = new URL(req.url).searchParams.get("productId"); if (productId !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(productId)) return json(400, { error: "Product inválido", code: "GEN-PRODUCT" }); const active = await findBlockingGeneration(s.tenantId, s.userId, productId ?? undefined); console.info("[generation-current]", { tenantId: s.tenantId, userId: s.userId, productId: productId ?? null, activeJobId: active?.id ?? null, activeStatus: active?.status ?? null }); if (active) return noStore(Response.json(await projectJobEnvelope(active))); const where = currentGenerationFilter(s.tenantId, s.userId, productId ?? undefined); const job = await prisma.commerceIntelligenceJob.findFirst({ where: { ...where, status: { in: [CommerceIntelligenceJobStatus.SUCCEEDED, CommerceIntelligenceJobStatus.SUCCEEDED_PARTIAL, CommerceIntelligenceJobStatus.FAILED, CommerceIntelligenceJobStatus.CANCELLED] } }, include, orderBy: { createdAt: "desc" } }); return noStore(Response.json(job ? await projectJobEnvelope(job) : null)); }
// Estado sem job segue 404 (idle tratado pela UI). Payload persistido inválido
// NÃO derruba o GET: envelope degradado terminal preserva o estado real sem
// expor payload; erros de job válido continuam propagando (fail-closed).
export async function projectJobEnvelope(job: GenerationEnvelopeJob): Promise<Record<string, unknown>> {
  try {
    return await envelope(job);
  } catch (error) {
    if (!(error instanceof GenerationError)) throw error;
    return { id: job.id, productId: job.productId, status: job.status, stage: job.stage, targetContentCount: job.targetContentCount, error: "Não foi possível carregar o resultado desta análise.", code: "GEN-PROJECTION", createdAt: job.createdAt.toISOString(), startedAt: job.startedAt?.toISOString() ?? null, finishedAt: job.finishedAt?.toISOString() ?? null, attempt: job.attempt, readiness: "FAILED", strategy: {}, plan: {}, contents: [] };
  }
}
export async function handleGet(req: Request, id: string) { const s = await session(req); if (!s) return json(401, { error: "Sessão inválida", code: "UNAUTHENTICATED" }); const job = await prisma.commerceIntelligenceJob.findFirst({ where: { id, tenantId: s.tenantId }, include }); return job ? noStore(Response.json(await projectJobEnvelope(job))) : json(404, { error: "Não encontrado", code: "NOT_FOUND" }); }
// ADR-021: retry integral (FAILED/CANCELLED) e completar faltantes (SUCCEEDED_PARTIAL).
// F esperado pelo /complete = expectedCount − deliveredCount (fallback: N do job e 0).
export function partialMissing(old: { status: string; targetContentCount: number; metadata?: unknown }): number | undefined {
  if (old.status !== "SUCCEEDED_PARTIAL") return undefined;
  const meta = payloadObject(old.metadata);
  return (typeof meta.expectedCount === "number" ? meta.expectedCount : old.targetContentCount) - (typeof meta.deliveredCount === "number" ? meta.deliveredCount : 0);
}
async function restartFrom(req: Request, id: string, allowed: CommerceIntelligenceJobStatus[], action: "retry" | "complete") {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não autorizada", code: "ORIGIN_FORBIDDEN" });
  const s = await session(req);
  const key = req.headers.get("Idempotency-Key");
  if (!s || !isValidIdempotencyKey(key)) return json(400, { error: "Requisição inválida", code: "GEN-IDEMPOTENCY" });
  const old = await prisma.commerceIntelligenceJob.findFirst({ where: { id, tenantId: s.tenantId, userId: s.userId, status: { in: allowed } } });
  if (!old) return json(404, { error: "Não encontrado", code: "NOT_FOUND" });
  const missing = partialMissing(old);
  if (action === "complete" && (!Number.isInteger(missing) || (missing ?? 0) < 1)) return json(409, { error: "Nada a completar neste job.", code: "GEN-NOTHING-TO-COMPLETE" });
  try {
    const job = await startCommerceIntelligence({ tenantId: s.tenantId, userId: s.userId, productId: old.productId, idempotencyKey: key, mode: action, ...(missing && missing > 0 ? { targetContentCount: missing } : {}) });
    console.info("[generation-recovery]", { tenantId: s.tenantId, userId: s.userId, fromJobId: id, jobId: job.id, mode: action, code: null });
    return noStore(Response.json(await envelope(job), { status: 202 }));
  } catch (error) {
    const code = error instanceof GenerationError ? error.code : "GEN-PROVIDER";
    console.info("[generation-recovery]", { tenantId: s.tenantId, userId: s.userId, fromJobId: id, jobId: null, mode: action, code });
    const status = generationErrorStatus(code);
    return json(status, { error: publicGenerationError(code), code });
  }
}
// ADR-021: partições explícitas — /retry nunca toca SUCCEEDED_PARTIAL;
// somente /complete usa o modo complete (reuso de Strategy/memória, reserva F).
export const RETRY_ALLOWED_STATUSES = [CommerceIntelligenceJobStatus.FAILED, CommerceIntelligenceJobStatus.CANCELLED];
export const COMPLETE_ALLOWED_STATUSES = [CommerceIntelligenceJobStatus.SUCCEEDED_PARTIAL];
export async function handleRetry(req: Request, id: string) { return restartFrom(req, id, RETRY_ALLOWED_STATUSES, "retry"); }
export async function handleCompleteMissing(req: Request, id: string) { return restartFrom(req, id, COMPLETE_ALLOWED_STATUSES, "complete"); }
export async function handleCancel(req: Request, id: string) { if (!sameOriginRequest(req)) return json(403, { error: "Origem não autorizada", code: "ORIGIN_FORBIDDEN" }); const s = await session(req); if (!s) return json(401, { error: "Sessão inválida", code: "UNAUTHENTICATED" }); const current = await prisma.commerceIntelligenceJob.findFirst({ where: { id, tenantId: s.tenantId, userId: s.userId } }); if (!current || current.status !== "QUEUED") { console.info("[generation-cancel]", { tenantId: s.tenantId, userId: s.userId, jobId: id, code: "GEN-CANCEL-UNSAFE" }); return json(409, { error: "O cancelamento não está disponível durante a execução.", code: "GEN-CANCEL-UNSAFE" }); } const result = await prisma.$transaction(async (tx) => { const changed = await tx.commerceIntelligenceJob.updateMany({ where: { id, tenantId: s.tenantId, userId: s.userId, status: "QUEUED" }, data: { status: "CANCELLED", finishedAt: new Date(), leaseOwnerId: null, leaseDeadlineAt: null } }); if (changed.count) await tx.generationUsageReservation.updateMany({ where: { tenantId: s.tenantId, jobId: id, status: "RESERVED" }, data: { status: "RELEASED", reason: "CANCELLED" } }); return changed.count; }); if (!result) return json(404, { error: "Não encontrado", code: "NOT_FOUND" }); // Mesma projeção do envelope (strategy/plan {}, readiness FAILED) — o cancel
// não pode ter shape divergente do resto do contrato.
const cancelled = await prisma.commerceIntelligenceJob.findFirst({ where: { id, tenantId: s.tenantId }, include }); if (!cancelled) return json(404, { error: "Não encontrado", code: "NOT_FOUND" }); console.info("[generation-cancel]", { tenantId: s.tenantId, userId: s.userId, jobId: id, code: null }); return noStore(Response.json(await projectJobEnvelope(cancelled))); }
