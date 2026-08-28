// Casos de uso de Identity/Tenant do Slice 001: registrar, entrar, resolver sessão, sair.
// Contratos observáveis da SPEC: provisionamento atômico e idempotente (1 usuário = 1 workspace),
// sessão opaca com apenas o hash persistido, expiração/revogação/rotação server-side.
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class AccountExistsError extends Error {}

export type AuthContext = {
  userId: string;
  tenantId: string;
  email: string;
};

function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Login com e-mail inexistente executa um hash dummy para equalizar timing (anti-enumeration).
let dummyHashPromise: Promise<string> | null = null;
function dummyVerify(password: string): Promise<boolean> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise.then((h) => verifyPassword(password, h));
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Cria conta + workspace pessoal + sessão em uma transação. Email já existente → AccountExistsError. */
export async function registerUser(email: string, password: string, previousToken?: string | null): Promise<string> {
  const passwordHash = await hashPassword(password);
  const token = newOpaqueToken();
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash } });
      const tenant = await tx.tenant.create({ data: { userId: user.id } });
      await tx.session.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      if (previousToken) {
        await tx.session.updateMany({
          where: { tokenHash: hashToken(previousToken), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
  } catch (e) {
    // unicidade de email/userId converte submissões repetidas/concorrentes em um único par User/Workspace
    if (isUniqueViolation(e)) throw new AccountExistsError();
    throw e;
  }
  return token;
}

/**
 * Verifica credencial e cria sessão. Retorna token opaco ou null (erro uniforme, sem enumeração).
 * Rotação na entrada: se houver cookie anterior válido na request, a referência antiga é
 * revogada na mesma transação da criação da nova — sempre pareada com Set-Cookie.
 */
export async function loginUser(
  email: string,
  password: string,
  previousToken?: string | null
): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : await dummyVerify(password);
  // conta sem workspace resolvido não autentica (sem workspace substituto silencioso)
  if (!ok || !user?.tenant) return null;
  const token = newOpaqueToken();
  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId: user.id,
        tenantId: user.tenant.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    }),
    ...(previousToken
      ? [
          prisma.session.updateMany({
            where: { tokenHash: hashToken(previousToken), revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]
      : []),
  ]);
  return token;
}

/**
 * Resolve sessão → usuário + tenant. Inválida/expirada/revogada → null.
 * Somente leitura: resolução nunca rotaciona nem revoga (diretriz de integração —
 * rotação/revogação acontecem só nos handlers que emitem Set-Cookie).
 */
export async function resolveSession(token: string): Promise<AuthContext | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { tenant: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.tenant) return null;
  return {
    userId: session.userId,
    tenantId: session.tenantId,
    email: session.user.email,
  };
}

/** Revoga a sessão referenciada pelo token (idempotente). */
export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Limpeza operacional: remove sessões expiradas/revogadas sem tocar em sessões válidas. */
export async function purgeStaleSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // retenção de 1 dia após revogação
  const res = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
  });
  return res.count;
}
