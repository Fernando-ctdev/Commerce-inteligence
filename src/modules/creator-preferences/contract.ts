// Contratos AccountContext e CreatorPreferences (ADR-018 / SPEC slice-011). Contratos
// distintos — language/market pertencem à conta; estilo/execução de gravação pertence a
// Meu estilo. Espelha os limites da SPEC para feedback imediato no cliente; o servidor
// é a autoridade e revalida tudo no PATCH.

/** Contexto da conta (Tenant) — administrado por /api/account/preferences. */
export type AccountContext = {
  language: string; // default efetivo: pt-BR
  market?: string;
};

export const DEFAULT_ACCOUNT_CONTEXT: AccountContext = { language: "pt-BR" };

export type RecordingEquipment = "phone" | "camera" | "other";
export type RecordingSupport = "tripod" | "handheld" | "none" | "other";

/** Preferências de estilo e execução de gravação — /api/creator-preferences. */
export type CreatorPreferences = {
  appearsOnCamera?: boolean;
  prefersVoiceOver?: boolean;
  preferredDurationSeconds?: number;
  tone?: string;
  executionStyle?: string;
  recordingEquipment?: RecordingEquipment[];
  recordingSupport?: RecordingSupport[];
  recordsAlone?: boolean;
  restrictions?: string[];
  notes?: string[];
};

export const CREATOR_PREFERENCES_LIMITS = {
  stringMax: 120,
  itemMax: 300,
  arrayMax: 10,
  durationMin: 15,
  durationMax: 600,
} as const;

/**
 * Body do PATCH de CreatorPreferences: somente campos de estilo/execução — nunca
 * language/market (ficam em /api/account/preferences). "Ausente" mantém o valor atual;
 * null limpa o campo (booleanos voltam ao estado não definido, ex.: "Depende do vídeo").
 * Arrays de enums: itens deduplicados pela allowlist; [] limpa; `none` de suporte é
 * exclusivo (sozinho ou nada).
 */
export type CreatorPreferencesPatchBody = {
  appearsOnCamera: boolean | null;
  prefersVoiceOver: boolean | null;
  preferredDurationSeconds: number | null;
  tone: string | null;
  executionStyle: string | null;
  recordingEquipment: RecordingEquipment[];
  recordingSupport: RecordingSupport[];
  recordsAlone: boolean | null;
  restrictions: string[];
  notes: string[];
};

/** Body do PATCH de AccountContext (mesma semântica: ausente mantém, null limpa). */
export type AccountContextPatchBody = {
  language: string;
  market: string | null;
};

/**
 * Estado do formulário Meu estilo. Booleanos são tri-state: null = "Depende do vídeo"
 * (não definido), true/false = resposta explícita — sem mapeamento heurístico.
 */
export type CreatorPreferencesForm = {
  appearsOnCamera: boolean | null;
  prefersVoiceOver: boolean | null;
  preferredDurationSeconds: string;
  tone: string;
  executionStyle: string;
  recordingEquipment: RecordingEquipment[];
  recordingSupport: RecordingSupport[];
  recordsAlone: boolean | null;
  restrictions: string;
  notes: string;
};

export type CreatorPreferencesFieldErrors = Partial<
  Record<
    | "preferredDurationSeconds"
    | "tone"
    | "executionStyle"
    | "recordingEquipment"
    | "recordingSupport"
    | "restrictions"
    | "notes",
    string
  >
>;

export type AccountContextForm = { language: string; market: string };

export type AccountContextFieldErrors = Partial<Record<"language" | "market", string>>;

function checkString(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > CREATOR_PREFERENCES_LIMITS.stringMax) {
    return `${label} deve ter no máximo ${CREATOR_PREFERENCES_LIMITS.stringMax} caracteres.`;
  }
  return undefined;
}

function checkList(value: string, label: string): string | undefined {
  const items = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length > CREATOR_PREFERENCES_LIMITS.arrayMax) {
    return `${label} aceita no máximo ${CREATOR_PREFERENCES_LIMITS.arrayMax} itens.`;
  }
  if (items.some((item) => item.length > CREATOR_PREFERENCES_LIMITS.itemMax)) {
    return `Cada item de ${label} deve ter no máximo ${CREATOR_PREFERENCES_LIMITS.itemMax} caracteres.`;
  }
  return undefined;
}

/** Arrays de enums: cada item na allowlist; valor exclusivo (ex.: "none") fica sozinho. */
function checkEnumList(
  value: readonly string[],
  label: string,
  values: readonly string[],
  exclusive?: string,
): string | undefined {
  if (value.some((item) => !values.includes(item))) return `${label} tem valor inválido.`;
  if (exclusive !== undefined && value.includes(exclusive) && value.length > 1)
    return `${label}: "Nenhum" não pode ser combinado com outras opções.`;
  return undefined;
}

export const RECORDING_EQUIPMENT_VALUES: readonly RecordingEquipment[] = ["phone", "camera", "other"];
export const RECORDING_SUPPORT_VALUES: readonly RecordingSupport[] = ["tripod", "handheld", "none", "other"];

export function validateCreatorPreferencesForm(
  form: Omit<CreatorPreferencesForm, "appearsOnCamera" | "prefersVoiceOver" | "recordsAlone">,
): CreatorPreferencesFieldErrors {
  const errors: CreatorPreferencesFieldErrors = {};

  const toneError = checkString(form.tone, "Tom de voz");
  if (toneError) errors.tone = toneError;

  const executionStyleError = checkString(form.executionStyle, "Estilo de execução");
  if (executionStyleError) errors.executionStyle = executionStyleError;

  const duration = form.preferredDurationSeconds.trim();
  if (duration) {
    const parsed = Number(duration);
    if (!Number.isInteger(parsed) || parsed < CREATOR_PREFERENCES_LIMITS.durationMin || parsed > CREATOR_PREFERENCES_LIMITS.durationMax) {
      errors.preferredDurationSeconds = `Duração deve ser um inteiro entre ${CREATOR_PREFERENCES_LIMITS.durationMin} e ${CREATOR_PREFERENCES_LIMITS.durationMax} segundos.`;
    }
  }

  const equipmentError = checkEnumList(form.recordingEquipment, "Equipamento de gravação", RECORDING_EQUIPMENT_VALUES);
  if (equipmentError) errors.recordingEquipment = equipmentError;

  const supportError = checkEnumList(form.recordingSupport, "Suporte de gravação", RECORDING_SUPPORT_VALUES, "none");
  if (supportError) errors.recordingSupport = supportError;

  const restrictionsError = checkList(form.restrictions, "Restrições");
  if (restrictionsError) errors.restrictions = restrictionsError;

  const notesError = checkList(form.notes, "Observações");
  if (notesError) errors.notes = notesError;

  return errors;
}

export function validateAccountContextForm(form: AccountContextForm): AccountContextFieldErrors {
  const errors: AccountContextFieldErrors = {};
  const language = form.language.trim();
  if (!language) {
    errors.language = "Idioma é obrigatório.";
  } else if (language.length > CREATOR_PREFERENCES_LIMITS.stringMax) {
    errors.language = `Idioma deve ter no máximo ${CREATOR_PREFERENCES_LIMITS.stringMax} caracteres.`;
  }
  const marketError = checkString(form.market, "Mercado");
  if (marketError) errors.market = marketError;
  return errors;
}

/**
 * Converte o estado do formulário para o body do PATCH de CreatorPreferences. Envia o
 * estado completo e explícito: booleanos true/false ou null ("Depende do vídeo"),
 * null limpa strings/duração/enums, [] limpa listas — nunca omitir campos, pois
 * "ausente" significa "manter atual" no servidor.
 */
export function formToPatch(form: CreatorPreferencesForm): CreatorPreferencesPatchBody {
  const splitList = (value: string): string[] =>
    value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  const optional = (value: string): string | null => value.trim() || null;
  const duration = form.preferredDurationSeconds.trim();
  return {
    appearsOnCamera: form.appearsOnCamera,
    prefersVoiceOver: form.prefersVoiceOver,
    preferredDurationSeconds: duration ? Number(duration) : null,
    tone: optional(form.tone),
    executionStyle: optional(form.executionStyle),
    recordingEquipment: [...new Set(form.recordingEquipment)],
    recordingSupport: form.recordingSupport.includes("none")
      ? ["none"]
      : [...new Set(form.recordingSupport)],
    recordsAlone: form.recordsAlone,
    restrictions: splitList(form.restrictions),
    notes: splitList(form.notes),
  };
}

/** Converte o formulário de conta para o body do PATCH de AccountContext. */
export function formToAccountPatch(form: AccountContextForm): AccountContextPatchBody {
  return {
    language: form.language.trim(),
    market: form.market.trim() || null,
  };
}

/** Projeta preferências normalizadas do servidor no estado do formulário. */
export function preferencesToForm(preferences: CreatorPreferences): CreatorPreferencesForm {
  return {
    appearsOnCamera: preferences.appearsOnCamera ?? null,
    prefersVoiceOver: preferences.prefersVoiceOver ?? null,
    preferredDurationSeconds:
      preferences.preferredDurationSeconds !== undefined
        ? String(preferences.preferredDurationSeconds)
        : "",
    tone: preferences.tone ?? "",
    executionStyle: preferences.executionStyle ?? "",
    recordingEquipment: preferences.recordingEquipment ?? [],
    recordingSupport: preferences.recordingSupport ?? [],
    recordsAlone: preferences.recordsAlone ?? null,
    restrictions: (preferences.restrictions ?? []).join("\n"),
    notes: (preferences.notes ?? []).join("\n"),
  };
}

/** Projeta o contexto de conta normalizado no estado do formulário de conta. */
export function accountContextToForm(account: AccountContext): AccountContextForm {
  return {
    language: account.language || DEFAULT_ACCOUNT_CONTEXT.language,
    market: account.market ?? "",
  };
}
