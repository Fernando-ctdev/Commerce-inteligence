// Testes do Slice 011: validação dos PATCH de AccountContext e CreatorPreferences
// (contratos separados), snapshot dual do Job e projeção normalizada. Integração exige
// PostgreSQL em DATABASE_URL; skip automático caso o banco esteja inacessível.
// Executar: npx tsx --test src/modules/creator-preferences/service.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { PrismaClient, type TenantPreference } from "@prisma/client";

import { DEFAULT_ACCOUNT_CONTEXT } from "./contract.js";
import {
  captureJobPreferenceSnapshots,
  extractJobCreatorContext,
  getAccountContext,
  getCreatorPreferences,
  normalizeAccountContext,
  normalizeCreatorPreferences,
  parseAccountContextPatch,
  parseCreatorPreferencesPatch,
  updateAccountContext,
  updateCreatorPreferences,
} from "./service.js";
import { registerUser, resolveSession } from "../identity/service.js";

// —— AccountContext ——

test("account parse: PATCH válido normaliza trim", () => {
  assert.deepEqual(parseAccountContextPatch({ language: "  pt-BR  ", market: " Brasil " }), {
    language: "pt-BR",
    market: "Brasil",
  });
});

test("account parse: corpo vazio é PATCH válido sem mudanças (parcial)", () => {
  assert.deepEqual(parseAccountContextPatch({}), {});
});

test("account parse: null limpa market; language não aceita null/vazio", () => {
  assert.deepEqual(parseAccountContextPatch({ market: null }), { market: null });
  assert.throws(() => parseAccountContextPatch({ language: null }));
  assert.throws(() => parseAccountContextPatch({ language: "   " }));
});

test("account parse: campos de Meu estilo são desconhecidos aqui (contratos separados)", () => {
  for (const intruso of ["tone", "recordingEquipment", "tenantId", "userId", "targetContentCount"]) {
    assert.throws(
      () => parseAccountContextPatch({ [intruso]: "x" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const validation = error as { fieldErrors?: Record<string, string>; code?: string };
        assert.ok(validation.fieldErrors?.[intruso]);
        assert.equal(validation.code, "VAL-ACC-UNKNOWN");
        return true;
      },
    );
  }
});

test("account parse: limite de 120 caracteres falha fechado", () => {
  assert.throws(() => parseAccountContextPatch({ market: "a".repeat(121) }));
  assert.doesNotThrow(() => parseAccountContextPatch({ market: "a".repeat(120) }));
});

// —— CreatorPreferences ——

const patchValido = {
  appearsOnCamera: true,
  prefersVoiceOver: false,
  preferredDurationSeconds: 45,
  tone: " direto ",
  executionStyle: "demonstração",
  recordingEquipment: [" phone ", "camera"],
  recordingSupport: [" tripod ", "handheld"],
  recordsAlone: true,
  restrictions: [" sem gírias ", "sem promessas médicas"],
  notes: ["foco no benefício"],
};

test("parse: PATCH válido normaliza trim e preserva tipos e enums", () => {
  assert.deepEqual(parseCreatorPreferencesPatch(patchValido), {
    appearsOnCamera: true,
    prefersVoiceOver: false,
    preferredDurationSeconds: 45,
    tone: "direto",
    executionStyle: "demonstração",
    recordingEquipment: ["phone", "camera"],
    recordingSupport: ["tripod", "handheld"],
    recordsAlone: true,
    restrictions: ["sem gírias", "sem promessas médicas"],
    notes: ["foco no benefício"],
  });
});

test("parse: arrays de enums deduplicam preservando a ordem e aceitam []", () => {
  assert.deepEqual(parseCreatorPreferencesPatch({ recordingEquipment: ["phone", " phone ", "camera", "phone"] }), {
    recordingEquipment: ["phone", "camera"],
  });
  assert.deepEqual(parseCreatorPreferencesPatch({ recordingSupport: [] }), { recordingSupport: [] });
});

test("parse: corpo vazio é PATCH válido sem mudanças (parcial)", () => {
  assert.deepEqual(parseCreatorPreferencesPatch({}), {});
});

test("parse: null limpa o campo explicitamente (booleanos, enums, listas)", () => {
  assert.deepEqual(
    parseCreatorPreferencesPatch({
      appearsOnCamera: null,
      tone: null,
      recordingEquipment: null,
      recordingSupport: null,
      recordsAlone: null,
      restrictions: null,
    }),
    {
      appearsOnCamera: null,
      tone: null,
      recordingEquipment: null,
      recordingSupport: null,
      recordsAlone: null,
      restrictions: null,
    },
  );
});

test("parse: campo ausente mantém o valor atual (não limpa)", () => {
  const parsed = parseCreatorPreferencesPatch({ tone: "didático" });
  assert.deepEqual(parsed, { tone: "didático" });
  assert.equal("recordingEquipment" in parsed, false);
});

test("parse: language/market e ownership falham fechado (contratos separados)", () => {
  for (const intruso of ["language", "market", "tenantId", "userId", "targetContentCount", "quota"]) {
    assert.throws(
      () => parseCreatorPreferencesPatch({ [intruso]: "x" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const validation = error as { fieldErrors?: Record<string, string>; code?: string };
        assert.ok(validation.fieldErrors?.[intruso]);
        assert.equal(validation.code, "VAL-PREF-UNKNOWN");
        return true;
      },
    );
  }
});

test("parse: enums de gravação (arrays) aceitam somente os valores da SPEC", () => {
  assert.throws(() => parseCreatorPreferencesPatch({ recordingEquipment: ["webcam"] }));
  assert.throws(() => parseCreatorPreferencesPatch({ recordingSupport: ["gimbal"] }));
  assert.throws(() => parseCreatorPreferencesPatch({ recordingEquipment: 42 }));
  assert.throws(() => parseCreatorPreferencesPatch({ recordingEquipment: "phone" })); // escalar não é array
  assert.throws(() => parseCreatorPreferencesPatch({ recordingEquipment: ["phone", ""] }));
  for (const equipment of ["phone", "camera", "other"])
    assert.doesNotThrow(() => parseCreatorPreferencesPatch({ recordingEquipment: [equipment] }));
  for (const support of ["tripod", "handheld", "none", "other"])
    assert.doesNotThrow(() => parseCreatorPreferencesPatch({ recordingSupport: [support] }));
});

test("parse: none do suporte é exclusivo — sozinho ou nada", () => {
  assert.deepEqual(parseCreatorPreferencesPatch({ recordingSupport: ["none"] }), {
    recordingSupport: ["none"],
  });
  assert.deepEqual(parseCreatorPreferencesPatch({ recordingSupport: ["none", "none"] }), {
    recordingSupport: ["none"],
  });
  assert.throws(() => parseCreatorPreferencesPatch({ recordingSupport: ["none", "tripod"] }));
  assert.doesNotThrow(() => parseCreatorPreferencesPatch({ recordingSupport: ["tripod", "handheld"] }));
});

test("parse: string vazia e limite de 120 falham fechado", () => {
  assert.throws(() => parseCreatorPreferencesPatch({ tone: "   " }));
  assert.throws(() => parseCreatorPreferencesPatch({ tone: "a".repeat(121) }));
  assert.doesNotThrow(() => parseCreatorPreferencesPatch({ tone: "a".repeat(120) }));
});

test("parse: duração exige inteiro entre 15 e 600", () => {
  for (const invalido of [14, 601, 30.5, "30", true]) {
    assert.throws(() => parseCreatorPreferencesPatch({ preferredDurationSeconds: invalido }));
  }
  assert.doesNotThrow(() => parseCreatorPreferencesPatch({ preferredDurationSeconds: 15 }));
  assert.doesNotThrow(() => parseCreatorPreferencesPatch({ preferredDurationSeconds: 600 }));
});

test("parse: listas exigem até 10 itens, sem vazios, itens até 300", () => {
  assert.throws(() => parseCreatorPreferencesPatch({ restrictions: Array.from({ length: 11 }, () => "x") }));
  assert.throws(() => parseCreatorPreferencesPatch({ restrictions: ["ok", "   "] }));
  assert.throws(() => parseCreatorPreferencesPatch({ restrictions: ["a".repeat(301)] }));
  assert.throws(() => parseCreatorPreferencesPatch({ restrictions: "sem gírias" }));
  assert.doesNotThrow(() =>
    parseCreatorPreferencesPatch({ restrictions: Array.from({ length: 10 }, () => "x") }),
  );
});

// —— Snapshots e normalização ——

test("extractJobCreatorContext: combina os dois snapshots separados e é estável", () => {
  const inputSnapshot = {
    accountContext: { language: "pt-BR", market: "Brasil" },
    creatorPreferences: { tone: "direto" },
    targetContentCount: 5,
  };
  const first = extractJobCreatorContext(inputSnapshot);
  assert.deepEqual(first, { language: "pt-BR", market: "Brasil", tone: "direto" });
  assert.deepEqual(extractJobCreatorContext(inputSnapshot), first);
  assert.equal("targetContentCount" in first, false);
});

test("extractJobCreatorContext: Job legado (só creatorPreferences) e inválidos produzem contexto estável", () => {
  assert.deepEqual(extractJobCreatorContext({ creatorPreferences: { tone: "direto" } }), { tone: "direto" });
  for (const invalido of [null, undefined, "lixo", { accountContext: "lixo" }, 42])
    assert.deepEqual(extractJobCreatorContext(invalido), {});
});

test("normalize: ausência de registro produz defaults válidos por contrato", () => {
  assert.deepEqual(normalizeAccountContext(null), { ...DEFAULT_ACCOUNT_CONTEXT });
  assert.deepEqual(normalizeCreatorPreferences(null), {});
});

test("normalize: linha persistida vira contrato sem campos nulos/vazios", () => {
  const row = {
    tenantId: "t1",
    targetContentCount: 5,
    language: "pt-BR",
    market: "Brasil",
    appearsOnCamera: null,
    prefersVoiceOver: null,
    preferredDurationSeconds: null,
    tone: "direto",
    executionStyle: null,
    recordingEquipment: [" phone ", "camera", "phone"],
    recordingSupport: ["tripod"],
    recordsAlone: true,
    restrictions: [],
    notes: ["foco no benefício"],
  } as unknown as TenantPreference;
  assert.deepEqual(normalizeAccountContext(row), { language: "pt-BR", market: "Brasil" });
  assert.deepEqual(normalizeCreatorPreferences(row), {
    tone: "direto",
    recordingEquipment: ["phone", "camera"],
    recordingSupport: ["tripod"],
    recordsAlone: true,
    notes: ["foco no benefício"],
  });
});

test("normalize: arrays de enums defensivos — escalar legado, vazio e none combinado ficam ausentes", () => {
  const row = {
    tenantId: "t1",
    targetContentCount: 5,
    recordingEquipment: "phone",
    recordingSupport: [],
    recordsAlone: null,
    restrictions: null,
    notes: null,
  } as unknown as TenantPreference;
  const preferences = normalizeCreatorPreferences(row);
  assert.equal("recordingEquipment" in preferences, false);
  assert.equal("recordingSupport" in preferences, false);
});

// —— Integração (banco) ——

const prisma = new PrismaClient();
let dbUp = false;

test.after(() => prisma.$disconnect());

test("setup: banco acessível (skip dos testes de integração caso contrário)", async (t) => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    t.skip("DATABASE_URL inacessível — testes de integração pulados");
  }
});

const email = () => `slice011-${randomBytes(8).toString("hex")}@teste.local`;

async function sessionOf() {
  const token = await registerUser("Creator", email(), "Senha123");
  const session = await resolveSession(token);
  assert.ok(session);
  return session;
}

test("AccountContext: GET sem registro retorna pt-BR; PATCH persiste e GET devolve normalizado", async (t) => {
  if (!dbUp) return t.skip();
  const session = await sessionOf();
  assert.deepEqual(await getAccountContext(session), { language: "pt-BR" });
  const saved = await updateAccountContext(session, { language: " en-US ", market: "Estados Unidos" });
  assert.deepEqual(saved, { language: "en-US", market: "Estados Unidos" });
  assert.deepEqual(await getAccountContext(session), saved);
  await updateAccountContext(session, { market: null });
  assert.deepEqual(await getAccountContext(session), { language: "en-US" });
});

test("CreatorPreferences: GET sem registro retorna {}; PATCH válido persiste enums e GET devolve normalizado", async (t) => {
  if (!dbUp) return t.skip();
  const session = await sessionOf();
  assert.deepEqual(await getCreatorPreferences(session), {});
  const saved = await updateCreatorPreferences(session, patchValido);
  assert.deepEqual(saved, {
    appearsOnCamera: true,
    prefersVoiceOver: false,
    preferredDurationSeconds: 45,
    tone: "direto",
    executionStyle: "demonstração",
    recordingEquipment: ["phone", "camera"],
    recordingSupport: ["tripod", "handheld"],
    recordsAlone: true,
    restrictions: ["sem gírias", "sem promessas médicas"],
    notes: ["foco no benefício"],
  });
  assert.deepEqual(await getCreatorPreferences(session), saved);
});

test("PATCH parcial preserva campos não enviados; null limpa; PATCH inválido não altera", async (t) => {
  if (!dbUp) return t.skip();
  const session = await sessionOf();
  await updateCreatorPreferences(session, patchValido);
  await updateCreatorPreferences(session, { tone: "didático" });
  assert.equal((await getCreatorPreferences(session)).tone, "didático");
  assert.deepEqual((await getCreatorPreferences(session)).recordingEquipment, ["phone", "camera"]);
  await updateCreatorPreferences(session, { recordingEquipment: null, recordsAlone: null });
  const cleared = await getCreatorPreferences(session);
  assert.equal("recordingEquipment" in cleared, false);
  assert.equal("recordsAlone" in cleared, false);
  await assert.rejects(
    () => updateCreatorPreferences(session, { tone: "" }),
    (error: unknown) => error instanceof Error && "fieldErrors" in error,
  );
  await assert.rejects(() => updateCreatorPreferences(session, { language: "pt-BR" }));
  assert.equal((await getCreatorPreferences(session)).tone, "didático");
});

test("arrays de enums persistem no banco; none exclusivo rejeitado sem mutação", async (t) => {
  if (!dbUp) return t.skip();
  const session = await sessionOf();
  await updateCreatorPreferences(session, {
    recordingEquipment: ["phone", "other"],
    recordingSupport: ["none"],
  });
  const saved = await getCreatorPreferences(session);
  assert.deepEqual(saved.recordingEquipment, ["phone", "other"]);
  assert.deepEqual(saved.recordingSupport, ["none"]);
  // `none` combinado falha na validação (antes do banco) sem alterar o estado atual.
  await assert.rejects(() => updateCreatorPreferences(session, { recordingSupport: ["none", "tripod"] }));
  assert.deepEqual((await getCreatorPreferences(session)).recordingSupport, ["none"]);
});

test("isolamento por Tenant: contexto de um Tenant não vaza no outro", async (t) => {
  if (!dbUp) return t.skip();
  const tenantA = await sessionOf();
  const tenantB = await sessionOf();
  await updateCreatorPreferences(tenantA, { tone: "exclusivo" });
  await updateAccountContext(tenantA, { market: "Brasil" });
  assert.deepEqual(await getCreatorPreferences(tenantB), {});
  assert.deepEqual(await getAccountContext(tenantB), { language: "pt-BR" });
});

test("snapshot dual capturado no Job é estável e não carrega restrições de geração", async (t) => {
  if (!dbUp) return t.skip();
  const session = await sessionOf();
  await updateCreatorPreferences(session, patchValido);
  await updateAccountContext(session, { market: "Brasil" });
  const snapshot = await captureJobPreferenceSnapshots(session.tenantId, prisma);
  assert.deepEqual(snapshot.accountContext, { language: "pt-BR", market: "Brasil" });
  assert.equal(snapshot.creatorPreferences.tone, "direto");
  assert.equal("targetContentCount" in snapshot.creatorPreferences, false);
  assert.equal("targetContentCount" in snapshot.accountContext, false);
  // Mutação posterior não altera o snapshot já capturado por uma execução em andamento.
  await updateCreatorPreferences(session, { tone: "mudou depois" });
  await updateAccountContext(session, { market: "Argentina" });
  assert.equal(snapshot.creatorPreferences.tone, "direto");
  assert.equal(snapshot.accountContext.market, "Brasil");
});
