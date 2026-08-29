// GET/POST /api/products — Slice 002: listagem e cadastro manual de Product escopados ao Tenant da sessão.
export { handleListProducts as GET, handleCreateProduct as POST } from "@/modules/products/http";
