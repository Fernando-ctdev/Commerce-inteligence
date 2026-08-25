import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE } from "../http";
import { resolveSession, type AuthContext } from "../service";

/** Guards Server Components without mutating the cookie or session. */
export async function requireSession(): Promise<AuthContext> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/access");

  const session = await resolveSession(token);
  if (!session) redirect("/access?reason=session-expired");
  return session;
}
