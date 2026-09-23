import { isValidIdempotencyKey } from "./service";
import { URL_IMPORT_ENABLED } from "./import-config";
import { CaptApiImportError, fetchCaptApiProduct, validateTikTokShopUrl } from "./captapi";
import { SESSION_COOKIE, json, readCookie, readJsonBody, sameOriginRequest } from "../identity/http";
import { resolveSession } from "../identity/service";

function candidateResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function handleImportProduct(req: Request): Promise<Response> {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não permitida." });
  if (!URL_IMPORT_ENABLED) {
    return json(503, {
      error: "A importação por URL está temporariamente indisponível; preencha os dados manualmente.",
      code: "IMPORT-DISABLED",
    });
  }
  const token = readCookie(req, SESSION_COOKIE);
  const session = token ? await resolveSession(token) : null;
  if (!session) return json(401, { error: "Sessão necessária para importar o Product.", code: "AUTH-SESSION" });
  const key = req.headers.get("idempotency-key");
  if (!isValidIdempotencyKey(key)) return json(400, { error: "Chave de importação inválida.", code: "IMPORT-IDEMPOTENCY-INVALID" });
  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Informe uma URL válida.", code: "IMPORT-URL-INVALID", fieldErrors: { url: "Informe uma URL válida." } });
  try {
    const submittedUrl = validateTikTokShopUrl(body.url).toString();
    const imported = await fetchCaptApiProduct(submittedUrl);
    return candidateResponse({
      candidate: imported,
      partial: imported.gaps.length > 0,
      gaps: imported.gaps,
      message: imported.gaps.length > 0
        ? "Confira os dados importados e complete os campos obrigatórios antes de salvar."
        : "Confira os dados importados antes de salvar.",
    });
  } catch (error) {
    if (error instanceof CaptApiImportError) return json(422, { error: error.message, code: error.code, fieldErrors: error.code === "IMPORT-URL-INVALID" ? { url: error.message } : undefined });
    console.error("[products] import failed:", error instanceof Error ? error.constructor.name : "unknown");
    return json(500, { error: "Não foi possível salvar o Product importado; preencha os dados manualmente.", code: "IMPORT-SAVE-FAILED" });
  }
}
