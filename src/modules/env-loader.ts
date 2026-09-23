// Carregamento de .env com precedência canônica e testável: env injetado > arquivo.
// O arquivo só preenche variáveis ausentes ou vazias — nunca sobrescreve o ambiente
// injetado pelo deploy. Valores nunca são retornados/logados: applyDotEnv devolve
// apenas NOMES de chaves (loaded/skipped), então segredos não vazam em telemetria.
import { readFileSync } from "node:fs";

type EnvLike = Record<string, string | undefined>;

export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#]*?))\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    result[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

export function applyDotEnv(content: string, env: EnvLike = process.env): { loaded: string[]; skipped: string[] } {
  const loaded: string[] = [];
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(parseDotEnv(content))) {
    const current = env[key];
    if (current !== undefined && current !== "") {
      skipped.push(key);
      continue;
    }
    env[key] = value;
    loaded.push(key);
  }
  return { loaded, skipped };
}

// Deploy pode não ter .env (env totalmente injetado): ausência do arquivo não é erro.
// Retorna os NOMES das chaves carregadas do arquivo (evidência sem segredo) ou null.
export function loadDotEnvFile(path: string, env: EnvLike = process.env): string[] | null {
  try {
    return applyDotEnv(readFileSync(path, "utf8"), env).loaded;
  } catch {
    return null;
  }
}
