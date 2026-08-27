// GET /api/product-imports/[id] — status da importação (avança no máximo um passo por poll).
export { handleGetImport as GET } from "@/modules/product-import/http";
