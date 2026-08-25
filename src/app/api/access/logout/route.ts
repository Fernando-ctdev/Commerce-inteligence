// POST /api/access/logout — revoga a sessão e limpa o cookie → 200 {redirectTo:'/access'}.
export { handleLogout as POST } from "@/modules/identity/http";
