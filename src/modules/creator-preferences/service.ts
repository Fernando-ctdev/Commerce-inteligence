// Casos de uso do Slice 011 (ADR-018/SPEC): AccountContext e CreatorPreferences —
// contratos distintos que compartilham o mesmo registro one-to-one TenantPreference,
// com namespaces de contrato, use case, API e projeção separados. O servidor é a
// autoridade: allowlist estrita, trim, limites, enums e defaults validados aqui.
import { Prisma, type TenantPreference } from "@prisma/client";

import { prisma } from "../db";
import { DEFAULT_TARGET_CONTENT_COUNT } from "../products/service";
import {
  CREATOR_PREFERENCES_LIMITS,
  DEFAULT_ACCOUNT_CONTEXT,
  RECORDING_EQUIPMENT_VALUES,
  RECORDING_SUPPORT_VALUES,
  type AccountContext,
  type CreatorPreferences,
  type RecordingEquipment,
  type RecordingSupport,
} from "./contract";

export class PreferencesValidationError extends Error {
  readonly fieldErrors: Record<string, string>;
  readonly code: string;
  constructor(fieldErrors: Record<string, string>, code: string) {
    super("Preferências inválidas.");
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

type Fail = (field: string, message: string, code: string) => void;

const LIMITS = CREATOR_PREFERENCES_LIMITS;
const LABELS: Record<string, string> = {
  language: "Idioma",
  market: "Mercado",
  appearsOnCamera: "Aparição em câmera",
  prefersVoiceOver: "Narração",
  preferredDurationSeconds: "Duração",
  tone: "Tom de voz",
  executionStyle: "Estilo de execução",
  recordingEquipment: "Equipamento de gravação",
  recordingSupport: "Suporte de gravação",
  recordsAlone: "Grava sozinho",
  restrictions: "Restrições",
  notes: "Observações",
};

// —— Validação compartilhada: PATCH parcial e atômico — ausente mantém, null limpa,
// desconhecidos/tipos inválidos/vazios/limites falham fechado sem mutação parcial. ——

function makeFail(errors: Record<string, string>, codes: Record<string, string>): Fail {
  // Primeira falha de cada campo vence — mensagem e código ficam sempre em par.
  return (field, message, code) => {
    if (field in errors) return;
    errors[field] = message;
    codes[field] = code;
  };
}

function throwIfErrors(errors: Record<string, string>, codes: Record<string, string>, fallback: string): void {
  if (Object.keys(errors).length === 0) return;
  throw new PreferencesValidationError(errors, codes[Object.keys(errors)[0]] ?? fallback);
}

function failUnknown(fail: Fail, body: Record<string, unknown>, allowed: Set<string>, code: string): void {
  for (const key of Object.keys(body))
    if (!allowed.has(key)) fail(key, "Campo desconhecido.", code);
}

function parseOptionalString(
  fail: Fail,
  field: string,
  value: unknown,
  prefix: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    fail(field, `${LABELS[field]} não pode ser vazio.`, `${prefix}-EMPTY`);
    return undefined;
  }
  if (trimmed.length > LIMITS.stringMax) {
    fail(field, `${LABELS[field]} deve ter no máximo ${LIMITS.stringMax} caracteres.`, `${prefix}-LIMIT`);
    return undefined;
  }
  return trimmed;
}

function parseBooleanField(
  fail: Fail,
  field: string,
  value: unknown,
  prefix: string,
): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "boolean") {
    fail(field, `${LABELS[field]} deve ser verdadeiro ou falso.`, `${prefix}-TYPE`);
    return undefined;
  }
  return value;
}

/**
 * Arrays de enums (contrato do Slice 011): trim por item, allowlist por item, dedupe
 * preservando a ordem e valor exclusivo (ex.: "none" do suporte só aparece sozinho).
 * [] é PATCH válido e limpa o campo.
 */
function parseEnumArrayField<T extends string>(
  fail: Fail,
  field: string,
  value: unknown,
  values: readonly T[],
  prefix: string,
  exclusive?: T,
): T[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) {
    fail(field, `${LABELS[field]} deve ser uma lista de opções.`, `${prefix}-TYPE`);
    return undefined;
  }
  const trimmed = value.map((item) => (typeof item === "string" ? item.trim() : ""));
  if (trimmed.some((item) => !values.includes(item as T))) {
    fail(field, `${LABELS[field]} tem valor inválido.`, `${prefix}-ENUM`);
    return undefined;
  }
  const deduped = [...new Set(trimmed as T[])];
  if (exclusive !== undefined && deduped.includes(exclusive) && deduped.length > 1) {
    fail(field, `${LABELS[field]}: "Nenhum" não pode ser combinado com outras opções.`, `${prefix}-ENUM`);
    return undefined;
  }
  return deduped;
}

// —— AccountContext: language (obrigatório no contexto efetivo) e market ——

// Campos do contrato; qualquer chave fora desta lista (incl. tenantId/userId) falha fechado.
const ACCOUNT_PATCH_FIELDS = new Set<string>(["language", "market"]);

export type AccountContextPatch = { language?: string; market?: string | null };

export function parseAccountContextPatch(body: Record<string, unknown>): AccountContextPatch {
  const errors: Record<string, string> = {};
  const codes: Record<string, string> = {};
  const fail = makeFail(errors, codes);
  failUnknown(fail, body, ACCOUNT_PATCH_FIELDS, "VAL-ACC-UNKNOWN");
  const data: AccountContextPatch = {};

  const language = body.language;
  if (language !== undefined) {
    const trimmed = typeof language === "string" ? language.trim() : "";
    if (!trimmed) fail("language", "Idioma é obrigatório.", "VAL-ACC-LANGUAGE");
    else if (trimmed.length > LIMITS.stringMax)
      fail("language", `Idioma deve ter no máximo ${LIMITS.stringMax} caracteres.`, "VAL-ACC-LIMIT");
    else data.language = trimmed;
  }

  const market = parseOptionalString(fail, "market", body.market, "VAL-ACC");
  if (market !== undefined) data.market = market;

  throwIfErrors(errors, codes, "VAL-ACC-INVALID");
  return data;
}

/** Projeta a linha persistida no contrato da conta; ausência de language produz pt-BR. */
export function normalizeAccountContext(row: TenantPreference | null): AccountContext {
  if (!row) return { ...DEFAULT_ACCOUNT_CONTEXT };
  const account: AccountContext = {
    language: row.language?.trim() || DEFAULT_ACCOUNT_CONTEXT.language,
  };
  const market = row.market?.trim();
  if (market) account.market = market;
  return account;
}

// —— CreatorPreferences: estilo e execução de gravação (sem language/market) ——

const CREATOR_PATCH_FIELDS = new Set<string>([
  "appearsOnCamera",
  "prefersVoiceOver",
  "preferredDurationSeconds",
  "tone",
  "executionStyle",
  "recordingEquipment",
  "recordingSupport",
  "recordsAlone",
  "restrictions",
  "notes",
]);
const STRING_FIELDS = ["tone", "executionStyle"] as const;
const BOOLEAN_FIELDS = ["appearsOnCamera", "prefersVoiceOver", "recordsAlone"] as const;
const LIST_FIELDS = ["restrictions", "notes"] as const;

export type CreatorPreferencesPatch = {
  appearsOnCamera?: boolean | null;
  prefersVoiceOver?: boolean | null;
  preferredDurationSeconds?: number | null;
  tone?: string | null;
  executionStyle?: string | null;
  recordingEquipment?: RecordingEquipment[] | null;
  recordingSupport?: RecordingSupport[] | null;
  recordsAlone?: boolean | null;
  restrictions?: string[] | null;
  notes?: string[] | null;
};

export function parseCreatorPreferencesPatch(body: Record<string, unknown>): CreatorPreferencesPatch {
  const errors: Record<string, string> = {};
  const codes: Record<string, string> = {};
  const fail = makeFail(errors, codes);
  failUnknown(fail, body, CREATOR_PATCH_FIELDS, "VAL-PREF-UNKNOWN");
  const data: CreatorPreferencesPatch = {};

  for (const field of STRING_FIELDS) {
    const value = parseOptionalString(fail, field, body[field], "VAL-PREF");
    if (value !== undefined) data[field] = value;
  }

  for (const field of BOOLEAN_FIELDS) {
    const value = parseBooleanField(fail, field, body[field], "VAL-PREF");
    if (value !== undefined) data[field] = value;
  }

  const duration = body.preferredDurationSeconds;
  if (duration !== undefined) {
    if (duration === null) data.preferredDurationSeconds = null;
    else if (
      typeof duration !== "number" ||
      !Number.isInteger(duration) ||
      duration < LIMITS.durationMin ||
      duration > LIMITS.durationMax
    )
      fail(
        "preferredDurationSeconds",
        `Duração deve ser um inteiro entre ${LIMITS.durationMin} e ${LIMITS.durationMax} segundos.`,
        "VAL-PREF-DURATION",
      );
    else data.preferredDurationSeconds = duration;
  }

  const equipment = parseEnumArrayField(fail, "recordingEquipment", body.recordingEquipment, RECORDING_EQUIPMENT_VALUES, "VAL-PREF");
  if (equipment !== undefined) data.recordingEquipment = equipment;
  const support = parseEnumArrayField(fail, "recordingSupport", body.recordingSupport, RECORDING_SUPPORT_VALUES, "VAL-PREF", "none");
  if (support !== undefined) data.recordingSupport = support;

  for (const field of LIST_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value === null) {
      data[field] = null;
      continue;
    }
    if (!Array.isArray(value)) {
      fail(field, `${LABELS[field]} deve ser uma lista de textos.`, "VAL-PREF-TYPE");
      continue;
    }
    const items = value.map((item) => (typeof item === "string" ? item.trim() : ""));
    if (items.length > LIMITS.arrayMax)
      fail(field, `${LABELS[field]} aceita no máximo ${LIMITS.arrayMax} itens.`, "VAL-PREF-CARDINALITY");
    else if (items.some((item) => !item))
      fail(field, `Itens de ${LABELS[field]} não podem ser vazios.`, "VAL-PREF-EMPTY");
    else if (items.some((item) => item.length > LIMITS.itemMax))
      fail(field, `Cada item de ${LABELS[field]} deve ter no máximo ${LIMITS.itemMax} caracteres.`, "VAL-PREF-LIMIT");
    else data[field] = items;
  }

  throwIfErrors(errors, codes, "VAL-PREF-INVALID");
  return data;
}

/**
 * Projeta a coluna JSONB no contrato: array filtrado pela allowlist, dedupe na ordem
 * persistida; vazio, não-array ou "none" combinado (dado legado/corrompido) vira campo
 * ausente — nunca falha a leitura.
 */
function pickEnumArray<T extends string>(
  values: readonly T[],
  raw: unknown,
  exclusive?: T,
): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const valid = (raw.filter(
    (item): item is T => typeof item === "string" && values.includes(item.trim() as T),
  ).map((item) => item.trim()) as T[]).filter((item, index, all) => all.indexOf(item) === index);
  if (valid.length === 0) return undefined;
  if (exclusive !== undefined && valid.includes(exclusive) && valid.length > 1) return undefined;
  return valid;
}

/** Projeta a linha persistida no contrato; ausência/vazio vira campo ausente, nunca null. */
export function normalizeCreatorPreferences(row: TenantPreference | null): CreatorPreferences {
  if (!row) return {};
  const preferences: CreatorPreferences = {};
  for (const field of STRING_FIELDS) {
    const trimmed = row[field]?.trim();
    if (trimmed) preferences[field] = trimmed;
  }
  for (const field of BOOLEAN_FIELDS)
    if (row[field] != null) preferences[field] = row[field];
  if (row.preferredDurationSeconds != null)
    preferences.preferredDurationSeconds = row.preferredDurationSeconds;
  const equipment = pickEnumArray(RECORDING_EQUIPMENT_VALUES, row.recordingEquipment);
  if (equipment) preferences.recordingEquipment = equipment;
  const support = pickEnumArray(RECORDING_SUPPORT_VALUES, row.recordingSupport, "none");
  if (support) preferences.recordingSupport = support;
  const list = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    return items.length > 0 ? items : undefined;
  };
  const restrictions = list(row.restrictions);
  if (restrictions) preferences.restrictions = restrictions;
  const notes = list(row.notes);
  if (notes) preferences.notes = notes;
  return preferences;
}

// —— Casos de uso (escopo resolvido pela sessão server-side) ——

export async function getAccountContext(scope: {
  tenantId: string;
  userId: string;
}): Promise<AccountContext> {
  return normalizeAccountContext(
    await prisma.tenantPreference.findUnique({ where: { tenantId: scope.tenantId } }),
  );
}

export async function getCreatorPreferences(scope: {
  tenantId: string;
  userId: string;
}): Promise<CreatorPreferences> {
  return normalizeCreatorPreferences(
    await prisma.tenantPreference.findUnique({ where: { tenantId: scope.tenantId } }),
  );
}

// null em lista vira [] persistido: "sem itens" e "campo limpo" são o mesmo estado lido.
// Payload inferido e atribuído por contexto: sem anotação Prisma intermediária, cada campo
// é checado contra o input exato de `update` e `create` (sem widening nem cast).
function accountPayload(data: AccountContextPatch) {
  return {
    ...(data.language !== undefined ? { language: data.language } : {}),
    ...(data.market !== undefined ? { market: data.market } : {}),
  };
}

function creatorPayload(data: CreatorPreferencesPatch) {
  return {
    ...(data.appearsOnCamera !== undefined ? { appearsOnCamera: data.appearsOnCamera } : {}),
    ...(data.prefersVoiceOver !== undefined ? { prefersVoiceOver: data.prefersVoiceOver } : {}),
    ...(data.preferredDurationSeconds !== undefined
      ? { preferredDurationSeconds: data.preferredDurationSeconds }
      : {}),
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(data.executionStyle !== undefined ? { executionStyle: data.executionStyle } : {}),
    ...(data.recordingEquipment !== undefined
      ? { recordingEquipment: data.recordingEquipment ?? [] }
      : {}),
    ...(data.recordingSupport !== undefined
      ? { recordingSupport: data.recordingSupport ?? [] }
      : {}),
    ...(data.recordsAlone !== undefined ? { recordsAlone: data.recordsAlone } : {}),
    ...(data.restrictions !== undefined ? { restrictions: data.restrictions ?? [] } : {}),
    ...(data.notes !== undefined ? { notes: data.notes ?? [] } : {}),
  };
}

/** PATCH parcial e atômico: upsert no registro one-to-one do Tenant da sessão. */
export async function updateAccountContext(
  scope: { tenantId: string; userId: string },
  patch: Record<string, unknown>,
): Promise<AccountContext> {
  const payload = accountPayload(parseAccountContextPatch(patch));
  const row = await prisma.tenantPreference.upsert({
    where: { tenantId: scope.tenantId },
    update: payload,
    // targetContentCount é GenerationConstraint (ADR-018): coluna NOT NULL legada, sem uso
    // neste fluxo — create usa o default canônico da SPEC, nunca valor inventado.
    create: { tenantId: scope.tenantId, targetContentCount: DEFAULT_TARGET_CONTENT_COUNT, ...payload },
  });
  return normalizeAccountContext(row);
}

export async function updateCreatorPreferences(
  scope: { tenantId: string; userId: string },
  patch: Record<string, unknown>,
): Promise<CreatorPreferences> {
  const payload = creatorPayload(parseCreatorPreferencesPatch(patch));
  const row = await prisma.tenantPreference.upsert({
    where: { tenantId: scope.tenantId },
    update: payload,
    create: { tenantId: scope.tenantId, targetContentCount: DEFAULT_TARGET_CONTENT_COUNT, ...payload },
  });
  return normalizeCreatorPreferences(row);
}

// —— Snapshot do Job (SPEC slice-011): os DOIS contextos são capturados separados no
// início do Job; retry técnico reutiliza e mutação posterior não altera a execução. ——

export type JobPreferenceSnapshots = {
  accountContext: AccountContext;
  creatorPreferences: CreatorPreferences;
};

/** Captura autorizada na transação do Job; `tx` garante leitura consistente. */
export async function captureJobPreferenceSnapshots(
  tenantId: string,
  tx: Pick<Prisma.TransactionClient, "tenantPreference">,
): Promise<JobPreferenceSnapshots> {
  const row = await tx.tenantPreference.findUnique({ where: { tenantId } });
  return {
    accountContext: normalizeAccountContext(row),
    creatorPreferences: normalizeCreatorPreferences(row),
  };
}

/**
 * Combina os snapshots separados no contexto interno do worker. Jobs legados
 * (snapshot só de creatorPreferences) e snapshots inválidos produzem contexto estável.
 */
export function extractJobCreatorContext(inputSnapshot: unknown): Record<string, unknown> {
  if (!inputSnapshot || typeof inputSnapshot !== "object" || Array.isArray(inputSnapshot))
    return {};
  const source = inputSnapshot as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  for (const key of ["accountContext", "creatorPreferences"] as const) {
    const part = source[key];
    if (part && typeof part === "object" && !Array.isArray(part)) Object.assign(merged, part);
  }
  return merged;
}
