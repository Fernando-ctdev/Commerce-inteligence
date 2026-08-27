// POST /api/access/register — contrato Marechal: {email,password} → 200 {redirectTo:'/home'} + Set-Cookie.
export { handleRegister as POST } from "@/modules/identity/http";
