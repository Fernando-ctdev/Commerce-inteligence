// POST /api/access/login — contrato Marechal: {email,password} → 200 {redirectTo:'/today'} + Set-Cookie.
export { handleLogin as POST } from "@/modules/identity/http";
