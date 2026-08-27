// POST /api/access/login — contrato Marechal: {email,password} → 200 {redirectTo:'/home'} + Set-Cookie.
export { handleLogin as POST } from "@/modules/identity/http";
