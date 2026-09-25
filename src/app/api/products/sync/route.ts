// POST /api/products/sync — Sincronização da Vitrine: upsert idempotente dos itens da
// Vitrine como Products do Tenant da sessão (fonte temporária até a API real existir).
export { handleSyncShowcaseProducts as POST } from "@/modules/products/http";
