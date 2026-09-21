// POST /api/access/register — contrato: {name,email,password,passwordConfirmation} → 200 {redirectTo:'/today'} + Set-Cookie.
export { handleRegister as POST } from "@/modules/identity/http";
