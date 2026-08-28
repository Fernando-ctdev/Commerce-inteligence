// Configuração do Product Importer (PLAN T2/T8). Falha fechada na inicialização:
// ausente/inválida ⇒ erro com mensagem clara; nenhum default silencioso de produção.
export type ImportMode = "poc" | "durable";

export class ConfigError extends Error {}

export function loadMode(env: NodeJS.ProcessEnv = process.env): ImportMode {
  const raw = env.IMPORT_MODE;
  if (raw === "poc" || raw === "durable") return raw;
  throw new ConfigError(
    `IMPORT_MODE inválido ou ausente: "${raw ?? ""}" (esperado "poc" ou "durable").`,
  );
}
