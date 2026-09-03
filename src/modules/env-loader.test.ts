import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyDotEnv, parseDotEnv, loadDotEnvFile } from "./env-loader";

test("env injetado tem precedência sobre o arquivo: arquivo só preenche ausente", () => {
  const env: Record<string, string | undefined> = { PROBE_KEY: "injected" };
  const result = applyDotEnv("PROBE_KEY=from_file\nONLY_FILE=yes", env);
  assert.equal(env.PROBE_KEY, "injected");
  assert.equal(env.ONLY_FILE, "yes");
  assert.deepEqual(result, { loaded: ["ONLY_FILE"], skipped: ["PROBE_KEY"] });
});

test("reproduz semântica observada no Node 20.19.5: empty-string injetada é preenchida pelo arquivo", () => {
  const env: Record<string, string | undefined> = { EMPTY_FILE: "injected_empty" };
  applyDotEnv("EMPTY_FILE=", env);
  assert.equal(env.EMPTY_FILE, "injected_empty");
});

test("parse suporta quotes simples/duplas, valor bare e comentário inline", () => {
  // Em valor não-quoted, # inicia comentário (semântica dotenv/Node): D vira "v4".
  const parsed = parseDotEnv('A="v1"\nB=\'v2\'\nC=v3 # comentário\nD=v4#sem-espaco\n# comentário puro\n\nlinha inválida sem igual');
  assert.deepEqual(parsed, { A: "v1", B: "v2", C: "v3", D: "v4" });
});

test("loadDotEnvFile retorna nomes de chaves carregadas e null quando arquivo ausente", async (t) => {
  const env: Record<string, string | undefined> = {};
  assert.equal(loadDotEnvFile(".env-inexistente-adr016-" + Date.now(), env), null);
  const dir = await mkdtemp(join(tmpdir(), "env-loader-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, ".env");
  await writeFile(file, 'DATABASE_URL="postgres://x"\nLLM_API_KEY=sk-secreto\n');
  const keys = loadDotEnvFile(file, env);
  assert.deepEqual(keys, ["DATABASE_URL", "LLM_API_KEY"]);
  assert.equal(env.LLM_API_KEY, "sk-secreto", "valor vai para o env, nunca para o retorno");
});
