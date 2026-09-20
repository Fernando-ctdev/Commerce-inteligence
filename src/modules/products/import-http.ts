import { createManualProduct, findTenantProductByIdempotencyKey, isValidIdempotencyKey } from "./service";
import { CaptApiImportError, fetchCaptApiProduct, validateTikTokShopUrl } from "./captapi";
import { SESSION_COOKIE, json, readCookie, readJsonBody, sameOriginRequest } from "../identity/http";
import { resolveSession } from "../identity/service";

export async function handleImportProduct(req: Request): Promise<Response> {
  if (!sameOriginRequest(req)) return json(403, { error: "Origem não permitida." });
  const token = readCookie(req, SESSION_COOKIE);
  const session = token ? await resolveSession(token) : null;
  if (!session) return json(401, { error: "Sessão necessária para importar o Product.", code: "AUTH-SESSION" });
  const key = req.headers.get("idempotency-key");
  if (!isValidIdempotencyKey(key)) return json(400, { error: "Chave de importação inválida.", code: "IMPORT-IDEMPOTENCY-INVALID" });
  const body = await readJsonBody(req);
  if (!body) return json(400, { error: "Informe uma URL válida.", code: "IMPORT-URL-INVALID", fieldErrors: { url: "Informe uma URL válida." } });
  try {
    const submittedUrl = validateTikTokShopUrl(body.url).toString();
    const existing = await findTenantProductByIdempotencyKey(session.tenantId, key);
    if (existing) {
      if (existing.submittedUrl !== submittedUrl) return json(409, { error: "Esta chave já foi usada para outra URL.", code: "IMPORT-IDEMPOTENCY-CONFLICT" });
      return new Response(JSON.stringify({ id: existing.id, version: existing.version, replay: true }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    const imported = await fetchCaptApiProduct(submittedUrl);
    const result = await createManualProduct(session.tenantId, {
      name: imported.name,
      description: imported.description,
      category: imported.category,
      price: imported.price,
      priceCurrency: imported.priceCurrency,
      features: imported.features,
      imageRefs: imported.imageRefs,
      url: imported.url,
      ...(imported.discountType ? { discountType: imported.discountType, discountValue: imported.discountValue } : {}),
    }, key, "captapi");
    return new Response(JSON.stringify({ id: result.product.id, version: result.product.version, replay: result.replay }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CaptApiImportError) return json(422, { error: error.message, code: error.code, fieldErrors: error.code === "IMPORT-URL-INVALID" ? { url: error.message } : undefined });
    console.error("[products] import failed:", error instanceof Error ? error.constructor.name : "unknown");
    return json(500, { error: "Não foi possível salvar o Product importado; preencha os dados manualmente.", code: "IMPORT-SAVE-FAILED" });
  }
}
