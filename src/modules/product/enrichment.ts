// Ação de enriquecimento de URL — best-effort, pós-commit, fora da transação de Product (SPEC/PLAN 002).
// O adapter é port: testes injetam resultados determinísticos; o adapter real aplica as guardas SSRF.
import { setEnrichmentStatus } from "./service";
import { guardedFetch, type GuardedFetchResult } from "./url-guard";

export type UrlFetchAdapter = (url: string) => Promise<GuardedFetchResult>;

export const defaultUrlAdapter: UrlFetchAdapter = guardedFetch;

/**
 * Executa uma tentativa de enriquecimento e registra apenas o estado observável
 * (`completed`/`unavailable`). Não armazena conteúdo externo, não substitui fatos
 * manuais e não altera a `version` do Product (não é edição concorrente do usuário).
 */
export async function runEnrichment(
  product: { id: string; url: string | null },
  adapter: UrlFetchAdapter = defaultUrlAdapter,
  setStatus: (productId: string, status: "completed" | "unavailable") => Promise<void> = setEnrichmentStatus
): Promise<"completed" | "unavailable"> {
  if (!product.url) return "unavailable";
  const result = await adapter(product.url);
  const status = result.kind === "completed" ? "completed" : "unavailable";
  await setStatus(product.id, status);
  return status;
}
