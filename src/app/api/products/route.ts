// /api/products — criação com Idempotency-Key (POST) e listagem do Tenant da sessão (GET).
export { handleCreateProduct as POST, handleListProducts as GET } from "@/modules/product/http";
