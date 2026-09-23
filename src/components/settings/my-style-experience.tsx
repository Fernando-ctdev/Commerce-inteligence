"use client";

import { toast } from "sonner";

import { Fingerprint, Sparkles } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CREATOR_PREFERENCES_LIMITS,
  type CreatorPreferences,
} from "@/modules/creator-preferences/contract";

import styles from "./my-style.module.css";

/**
 * Página dedicada /my-style (SPEC slice-011 + nota "isso-ai-virou-uma-tela-de-conf"):
 * experiência de seleção, sem inputs técnicos. Integra /api/creator-preferences
 * (GET/PATCH) serializando diretamente os campos ausentes do contrato:
 * appearsOnCamera/prefersVoiceOver/recordsAlone tri-state (null = não definido /
 * "Depende do vídeo"), recordingEquipment (phone|camera|other), recordingSupport
 * (tripod|handheld|none|other), preferredDurationSeconds (15–30s→22, 30–60s→45,
 * +60s→90, decidir→null), restrictions[] (chips fixos), notes[] (observação).
 * language/market pertencem a /api/account/preferences e não aparecem aqui.
 *
 * Serialização: sem heurística — os valores carregados do servidor preservam-se
 * intactos enquanto o bloco correspondente não for alterado.
 *
 * ponytail: energia/venda são seleções locais (não são tone/executionStyle);
 * quando o contrato ganhar campos próprios, entram no PATCH aqui.
 */

type RecordingEquipment = "phone" | "camera" | "other";
type RecordingSupport = "tripod" | "handheld" | "none" | "other";
type DurationBucket = "22" | "45" | "90" | "decide";

/** Rascunho por dados — campos do contrato; energia persiste em tone, venda em executionStyle. */
type Draft = {
  appearsOnCamera: boolean | null;
  prefersVoiceOver: boolean | null;
  preferredDurationSeconds: number | null;
  /** Multiseleção (SPEC slice-011): arrays deduplicados; `none` de suporte é exclusivo. */
  recordingEquipment: RecordingEquipment[];
  recordingSupport: RecordingSupport[];
  recordsAlone: boolean | null;
  restrictions: string[];
  notes: string;
  tone: string | null;
  executionStyle: string | null;
};
/* Valores canônicos enviados ao contrato: energia → tone, venda → executionStyle. */
const ENERGY_TOKENS: Record<string, string> = {
  "Natural e direto": "natural-direto",
  Animado: "animado",
  Calmo: "calmo",
  "Bem-humorado": "bem-humorado",
  Técnico: "tecnico",
  "Sem preferência": "sem-preferencia",
};
const TONE_ENERGY: Record<string, string> = Object.fromEntries(
  Object.entries(ENERGY_TOKENS).map(([label, token]) => [token, label]),
);
const SELLING_TOKENS: Record<string, string> = {
  Sutil: "sutil",
  Natural: "natural-venda",
  Direto: "direto",
};
const EXECUTION_SELLING: Record<string, string> = Object.fromEntries(
  Object.entries(SELLING_TOKENS).map(([label, token]) => [token, label]),
);

/** "a, b e c" em pt-BR (sem Oxford comma). */
function naturalJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** naturalJoin com cada item em minúsculas (frases narrativas). */
function lowerJoin(items: string[]): string {
  return naturalJoin(items.map((item) => item.charAt(0).toLowerCase() + item.slice(1)));
}

const HOW_YOU_RECORD: Array<{ id: Exclude<string, never>; label: string; hint: string }> = [
  { id: "camera", label: "Falando para a câmera", hint: "Meu rosto aparece no vídeo" },
  { id: "product-only", label: "Só produto / mãos", hint: "Mostro o produto, não o rosto" },
  { id: "voiceover", label: "Voice-over", hint: "Minha voz por cima das imagens" },
  { id: "depends", label: "Depende do conteúdo", hint: "Varia por vídeo" },
];

const ENERGY = ["Natural e direto", "Animado", "Calmo", "Bem-humorado", "Técnico", "Sem preferência"];

const SELLING: Array<{ id: string; label: string; hint: string; recommended?: boolean }> = [
  { id: "sutil", label: "Sutil", hint: "O produto aparece naturalmente no conteúdo." },
  { id: "natural-venda", label: "Natural", hint: "Existe intenção de venda, mas sem parecer anúncio.", recommended: true },
  { id: "direto", label: "Direto", hint: "Pode falar mais claramente da compra." },
];

const AVOID = [
  "Linguagem de propaganda",
  "Gírias demais",
  "Cenas difíceis de gravar",
  "Mostrar o rosto",
  "Muitos cortes",
  "CTA muito vendedor",
];

const EQUIPMENT: Array<{ id: RecordingEquipment; label: string }> = [
  { id: "phone", label: "Celular" },
  { id: "camera", label: "Câmera" },
  { id: "other", label: "Outro" },
];

const SUPPORT_OPTIONS: Array<{ id: RecordingSupport; label: string }> = [
  { id: "handheld", label: "Na mão" },
  { id: "tripod", label: "Tripé" },
  { id: "none", label: "Nenhum" },
  { id: "other", label: "Outro" },
];

const DURATION_OPTIONS: Array<{ id: DurationBucket; label: string }> = [
  { id: "22", label: "15–30s" },
  { id: "45", label: "30–60s" },
  { id: "90", label: "+60s" },
  { id: "decide", label: "Deixo a Viewefy decidir" },
];

/** Projeção do servidor → rascunho. Valores não reconhecidos preservam-se brutos. */
function preferencesToPreview(preferences: CreatorPreferences): Draft {
  const equipment = preferences.recordingEquipment;
  const support = preferences.recordingSupport;
  return {
    appearsOnCamera: preferences.appearsOnCamera ?? null,
    prefersVoiceOver: preferences.prefersVoiceOver ?? null,
    preferredDurationSeconds: preferences.preferredDurationSeconds ?? null,
    recordingEquipment: Array.isArray(equipment)
      ? equipment.filter((item): item is RecordingEquipment =>
          EQUIPMENT.some((option) => option.id === item))
      : [],
    recordingSupport: Array.isArray(support)
      ? support.filter((item): item is RecordingSupport =>
          SUPPORT_OPTIONS.some((option) => option.id === item))
      : [],
    recordsAlone: preferences.recordsAlone ?? null,
    restrictions: preferences.restrictions ?? [],
    notes: (preferences.notes ?? []).join("\n"),
    tone: preferences.tone ?? null,
    executionStyle: preferences.executionStyle ?? null,
  };
}

function draftToCreator(draft: Draft) {
  return {
    appearsOnCamera: draft.appearsOnCamera,
    prefersVoiceOver: draft.prefersVoiceOver,
    preferredDurationSeconds: draft.preferredDurationSeconds,
    // Energia/venda persistem nos campos semânticos (tone/executionStyle);
    // null apenas para estado não definido ("Sem preferência"/não definido).
    tone: draft.tone,
    executionStyle: draft.executionStyle,
    recordingEquipment: draft.recordingEquipment,
    // `none` é exclusivo: sozinho ou nada.
    recordingSupport: draft.recordingSupport.includes("none") ? ["none"] : draft.recordingSupport,
    recordsAlone: draft.recordsAlone,
    restrictions: draft.restrictions,
    notes: draft.notes.trim() ? [draft.notes.trim()] : [],
  };
}


/** Valor do bloco "Como você grava" — combinação exata; estranho = sem seleção. */
function howYouRecordValue(draft: Draft): string | null {
  const camera = draft.appearsOnCamera;
  const voice = draft.prefersVoiceOver;
  if (camera === true && voice !== true) return "camera";
  if (voice === true && camera !== true) return "voiceover";
  if (camera === false && voice === false) return "product-only";
  if (camera === null && voice === null) return "depends";
  return null;
}

const HOW_YOU_RECORD_PAIRS: Record<string, { appearsOnCamera: boolean | null; prefersVoiceOver: boolean | null }> = {
  camera: { appearsOnCamera: true, prefersVoiceOver: false },
  "product-only": { appearsOnCamera: false, prefersVoiceOver: false },
  voiceover: { appearsOnCamera: false, prefersVoiceOver: true },
  depends: { appearsOnCamera: null, prefersVoiceOver: null },
};

function ChoiceGroup({
  legend,
  name,
  columns,
  options,
  value,
  onChange,
  /** Oculto quando o h2 imediatamente acima já nomeia o grupo; visível nos
      blocos com vários grupos (ex.: "Seu jeito de gravar"). */
  srLegend = false,
}: {
  legend: string;
  name: string;
  columns: 1 | 2 | 3;
  options: Array<{ id: string; label: string; hint?: string; recommended?: boolean }>;
  value: string | null;
  onChange: (id: string) => void;
  srLegend?: boolean;
}) {
  const uid = useId();
  return (
    <fieldset className={styles.group}>
      <legend className={srLegend ? styles.srLegend : undefined}>{legend}</legend>
      <div
        className={
          columns === 1 ? styles.options1 : columns === 3 ? styles.options3 : styles.options2
        }
      >
        {options.map((option) => {
          const id = `${uid}-${name}-${option.id.replace(/[^a-z0-9]+/gi, "-")}`;
          const selected = value === option.id;
          return (
            <label
              className={selected ? `${styles.choice} ${styles.choiceSelected}` : styles.choice}
              key={id}
            >
              <input
                checked={selected}
                className={styles.choiceInput}
                id={id}
                name={name}
                onChange={() => onChange(option.id)}
                type="radio"
              />
              <span>
                <span className={styles.choiceLabel}>{option.label}</span>
                {option.recommended && (
                  <span className={styles.choiceBadge}>Recomendado</span>
                )}
                {option.hint && <span className={styles.choiceHint}>{option.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Grupo multisseleção (checkbox chips) — SPEC: arrays deduplicados; `none` exclusivo. */
function ChipGroup({
  legend,
  name,
  options,
  values,
  onToggle,
}: {
  legend: string;
  name: string;
  options: Array<{ id: string; label: string }>;
  values: string[];
  onToggle: (id: string) => void;
}) {
  const uid = useId();
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      <div className={styles.chips}>
        {options.map((option) => {
          const selected = values.includes(option.id);
          const id = `${uid}-${name}-${option.id}`;
          return (
            <label
              className={selected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
              key={id}
            >
              <input
                checked={selected}
                className={styles.chipInput}
                id={id}
                name={name}
                onChange={() => onToggle(option.id)}
                type="checkbox"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type SaveState = "idle" | "saving" | "saved";

export function MyStyleExperience() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [baselineJson, setBaselineJson] = useState("");
  const headingId = useId();

  async function loadPreferences(): Promise<void> {
    const response = await fetch("/api/creator-preferences", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    const data: unknown =
      response && response.ok ? await response.json().catch(() => null) : null;
    if (response?.ok && data && typeof data === "object" && "preferences" in data) {
      const next = preferencesToPreview(data.preferences as CreatorPreferences);
      setDraft(next);
      setBaselineJson(JSON.stringify(next));
      setStatus("ready");
      return;
    }
    setLoadError(
      response?.status === 401
        ? "Sua sessão expirou. Recarregue a página para entrar novamente."
        : "Não foi possível carregar seu estilo agora. Tente novamente.",
    );
    setStatus("error");
  }

  // Carregamento no mount; setState ocorre após o await (sem setState síncrono).
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch("/api/creator-preferences", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }).catch(() => null);
      if (controller.signal.aborted) return;
      const data: unknown =
        response && response.ok ? await response.json().catch(() => null) : null;
      if (response?.ok && data && typeof data === "object" && "preferences" in data) {
        const next = preferencesToPreview(data.preferences as CreatorPreferences);
        setDraft(next);
        setBaselineJson(JSON.stringify(next));
        setStatus("ready");
        return;
      }
      setLoadError(
        response?.status === 401
          ? "Sua sessão expirou. Recarregue a página para entrar novamente."
          : "Não foi possível carregar seu estilo agora. Tente novamente.",
      );
      setStatus("error");
    })();
    return () => controller.abort();
  }, []);

  async function save(): Promise<void> {
    if (!draft) return;
    setSaveState("saving");
    const response = await fetch("/api/creator-preferences", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(draftToCreator(draft)),
    }).catch(() => null);
    const data: unknown =
      response && response.ok ? await response.json().catch(() => null) : null;
    if (response?.ok && data && typeof data === "object" && "preferences" in data) {
      const normalized = preferencesToPreview(data.preferences as CreatorPreferences);
      setDraft(normalized);
      toast.success("Seu estilo salvo.");
      setSaveState("saved");
      return;
    }
    toast.error(
      response?.status === 401
        ? "Sua sessão expirou. Recarregue a página para entrar novamente."
        : response?.status === 400
          ? "Alguns valores são inválidos. Recarregue a página e tente novamente."
          : "Não foi possível salvar seu estilo agora. Tente novamente.",
    );
    setSaveState("idle");
  }

  if (status === "loading") {
    return (
      <div aria-busy="true" className={styles.surface}>
        <header className={styles.hero}>
          <h1 className={styles.heroTitle}>
            <Fingerprint aria-hidden="true" className={styles.heroIcon} strokeWidth={1.8} />
            Como é o seu jeito de criar?
          </h1>
          <p className={styles.heroCopy}>Carregando suas preferências…</p>
        </header>
      </div>
    );
  }

  if (status === "error" || draft === null) {
    return (
      <div className={styles.surface}>
        <header className={styles.hero}>
          <h1 className={styles.heroTitle}>
            <Fingerprint aria-hidden="true" className={styles.heroIcon} strokeWidth={1.8} />
            Como é o seu jeito de criar?
          </h1>
          <p className={styles.heroCopy} role="alert">
            {loadError ?? "Não foi possível carregar seu estilo agora. Tente novamente."}
          </p>
          <Button className={styles.retryButton} onClick={() => void loadPreferences()} variant="outline">
            Tentar novamente
          </Button>
        </header>
      </div>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const dirty = JSON.stringify(draft) !== baselineJson;

  /** Card narrativo: um parágrafo por grupo da página; equipamento/suporte/
      sozinho permanecem juntos numa frase (são o mesmo bloco na UI). */
  const paragraphs: string[][] = [];
  const narrative = howYouRecordValue(draft) === "camera"
    ? "Costumo gravar falando para a câmera."
    : howYouRecordValue(draft) === "product-only"
      ? "Costumo gravar mostrando só o produto ou minhas mãos."
      : howYouRecordValue(draft) === "voiceover"
        ? "Costumo gravar com minha voz por cima das imagens."
        : howYouRecordValue(draft) === "depends"
          ? "Como eu gravo depende do conteúdo."
          : null;
  if (narrative) paragraphs.push([narrative]);
  const energySentences: Record<string, string> = {
    "natural-direto": "Eu diria que minha energia é natural e direta.",
    animado: "Eu diria que minha energia é bem animada.",
    calmo: "Eu diria que minha energia é mais calma.",
    "bem-humorado": "Eu diria que minha energia é bem-humorada.",
    tecnico: "Eu diria que minha energia é mais técnica.",
  };
  if (draft.tone && draft.tone !== "sem-preferencia")
    paragraphs.push([energySentences[draft.tone] ?? `Eu diria que minha energia é ${draft.tone}.`]);
  const sellingSentences: Record<string, string> = {
    sutil: "Prefiro uma abordagem sutil para vender.",
    "natural-venda": "Prefiro uma abordagem natural para vender.",
    direto: "Prefiro uma abordagem direta para vender.",
  };
  if (draft.executionStyle)
    paragraphs.push([sellingSentences[draft.executionStyle] ?? `Minha abordagem para vender é ${draft.executionStyle}.`]);
  if (draft.preferredDurationSeconds === 22)
    paragraphs.push(["Costumo fazer vídeos de 15–30s."]);
  else if (draft.preferredDurationSeconds === 45)
    paragraphs.push(["Costumo fazer vídeos de 30–60s."]);
  else if (draft.preferredDurationSeconds === 90)
    paragraphs.push(["Costumo fazer vídeos com mais de 1 minuto."]);
  const equipmentParts: string[] = draft.recordingEquipment.map((item) =>
    item === "phone" ? "celular" : item === "camera" ? "câmera" : "outro equipamento",
  );
  const supportParts: string[] = draft.recordingSupport.map((item) =>
    item === "handheld"
      ? "na mão"
      : item === "tripod"
        ? "no tripé"
        : item === "none"
          ? "sem apoio fixo"
          : "com suporte alternativo",
  );
  const setupParts: string[] = [];
  if (equipmentParts.length)
    setupParts.push(`com ${naturalJoin(equipmentParts)}`);
  if (supportParts.length) setupParts.push(naturalJoin(supportParts));
  if (setupParts.length || draft.recordsAlone !== null) {
    let sentence = "Gravo";
    if (setupParts.length) sentence += ` ${setupParts.join(", ")}`;
    if (draft.recordsAlone === true) sentence += setupParts.length ? ", e gravo sozinho." : " e gravo sozinho.";
    else if (draft.recordsAlone === false)
      sentence += setupParts.length ? ", e normalmente tenho alguém me ajudando." : " e normalmente tenho alguém me ajudando.";
    else sentence += ".";
    if (!sentence.endsWith(".")) sentence += ".";
    paragraphs.push([sentence]);
  }
  if (draft.restrictions.length)
    paragraphs.push([`Evito ${lowerJoin(draft.restrictions)}.`]);
  if (draft.notes.trim())
    paragraphs.push([`A Viewefy deve saber: ${draft.notes.trim()}`]);
  const summary = paragraphs.length ? paragraphs : null;
  return (
    <>
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>
          <Fingerprint aria-hidden="true" className={styles.heroIcon} strokeWidth={1.8} />
          Como é o seu jeito de criar?
        </h1>
        <p className={styles.heroCopy}>
          Conte como você costuma criar. Isso ajuda os próximos conteúdos a
          parecerem mais com você.
        </p>
      </header>
      <h2 className={styles.blockTitle} id="style-record-block">
        Como você grava?
      </h2>
      <div className={styles.surface}>
      <div className={styles.mainColumn}>
      <ChoiceGroup
        columns={2}
        srLegend
        legend="Como você grava"
        name="como-grava"
        onChange={(next) => set(HOW_YOU_RECORD_PAIRS[next])}
        options={HOW_YOU_RECORD.map((option) => ({ id: option.id, label: option.label, hint: option.hint }))}
        value={howYouRecordValue(draft)}
      />

      <section aria-labelledby="style-energy-block">
        <h2 className={styles.blockTitle} id="style-energy-block">
          Qual energia combina mais com você?
        </h2>
        <ChoiceGroup
          columns={3}
          srLegend
          legend="Energia dos vídeos"
          name="energia"
          onChange={(next) => set({ tone: next === "sem-preferencia" ? null : next })}
          options={Object.entries(ENERGY_TOKENS).map(([label, token]) => ({ id: token, label }))}
          value={draft.tone === null ? "sem-preferencia" : draft.tone}
        />
      </section>

      <section aria-labelledby="style-selling-block">
        <h2 className={styles.blockTitle} id="style-selling-block">
          Como você prefere vender?
        </h2>
        <ChoiceGroup
          columns={1}
          legend="Estilo de venda"
          name="venda"
          srLegend
          onChange={(next) => set({ executionStyle: next })}
          options={SELLING}
          value={draft.executionStyle}
        />
      </section>

      <section aria-labelledby="style-duration-block">
        <h2 className={styles.blockTitle} id="style-duration-block">
          Seus vídeos costumam ser…
        </h2>
        <ChoiceGroup
          columns={2}
          srLegend
          legend="Duração preferida"
          name="duracao"
          onChange={(next) =>
            set({ preferredDurationSeconds: next === "decide" ? null : Number(next) })
          }
          options={DURATION_OPTIONS}
          value={draft.preferredDurationSeconds === 22 ? "22" : draft.preferredDurationSeconds === 45 ? "45" : draft.preferredDurationSeconds === 90 ? "90" : draft.preferredDurationSeconds === null ? "decide" : null}
        />
      </section>

      <section aria-labelledby="style-avoid-block">
        <h2 className={styles.blockTitle} id="style-avoid-block">
          O que você prefere evitar?
        </h2>
        <div className={styles.chips}>
          {AVOID.map((label) => {
            const selected = draft.restrictions.includes(label);
            return (
              <label
                className={selected ? `${styles.chip} ${styles.chipSelected}` : styles.chip}
                key={label}
              >
                <input
                  checked={selected}
                  className={styles.chipInput}
                  name="evitar"
                  onChange={() =>
                    set({
                      restrictions: draft.restrictions.includes(label)
                        ? draft.restrictions.filter((item) => item !== label)
                        : [...draft.restrictions, label],
                    })
                  }
                  type="checkbox"
                />
                {label}
              </label>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="style-setup">
        <h2 className={styles.blockTitle} id="style-setup">
          Seu jeito de gravar
        </h2>
        <ChipGroup
          legend="Equipamento"
          name="equipamento"
          onToggle={(next) =>
            set({
              recordingEquipment: draft.recordingEquipment.includes(next as RecordingEquipment)
                ? draft.recordingEquipment.filter((item) => item !== next)
                : [...draft.recordingEquipment, next as RecordingEquipment],
            })
          }
          options={EQUIPMENT}
          values={draft.recordingEquipment}
        />
        <ChipGroup
          legend="Como você apoia a câmera"
          name="apoio"
          onToggle={(next) =>
            set({
              // `none` é exclusivo: escolher Nenhum limpa os outros; escolher
              // outro suporte remove Nenhum (SPEC slice-011).
              recordingSupport:
                next === "none"
                  ? draft.recordingSupport.includes("none")
                    ? []
                    : ["none"]
                  : [...draft.recordingSupport.filter((item) => item !== "none" && item !== next), next as RecordingSupport],
            })
          }
          options={SUPPORT_OPTIONS}
          values={draft.recordingSupport}
        />
        <ChoiceGroup
          columns={2}
          legend="Você grava sozinho?"
          name="sozinho"
          onChange={(next) => set({ recordsAlone: next === "sim" })}
          options={[
            { id: "sim", label: "Sim" },
            { id: "nao", label: "Não" },
          ]}
          value={draft.recordsAlone === null ? null : draft.recordsAlone ? "sim" : "nao"}
        />
      </section>

      <section aria-labelledby="style-observation-block">
        <h2 className={styles.blockTitle} id="style-observation-block">
          Tem algo que a Viewefy deve saber?
        </h2>
        <textarea
          aria-describedby="style-observation-help"
          className={styles.textarea}
          id="style-observation"
          maxLength={CREATOR_PREFERENCES_LIMITS.itemMax}
          onChange={(event) => set({ notes: event.target.value })}
          placeholder="Ex.: normalmente gravo sentado, sozinho, no meu quarto…"
          rows={3}
          value={draft.notes}
        />
        <p className={styles.hint} id="style-observation-help">
          Opcional, uma frase curta.
        </p>
      </section>
      </div>

      <aside aria-labelledby={headingId} className={styles.summary}>
        <h2 className={styles.summaryTitle} id={headingId}>
          <Sparkles aria-hidden="true" className={styles.heroIcon} strokeWidth={1.8} />
          Seu estilo
        </h2>
        {summary ? (
          <>
            <p className={styles.summaryText}>{summary[0]}</p>
            {summary.slice(1).map((paragraph) => (
              <p className={styles.summaryText} key={paragraph[0].slice(0, 24)}>
                {paragraph[0]}
              </p>
            ))}
          </>
        ) : (
          <p className={styles.summaryPlaceholder}>
            Suas escolhas viram um resumo aqui conforme você responde — nada é
            salvo até você apertar o botão abaixo.
          </p>
        )}
        <div className={styles.actions}>
          <Button
            disabled={saveState === "saving"}
            onClick={() => void save()}
          >
            {saveState === "saving" ? "Salvando…" : "Salvar meu estilo"}
          </Button>
        </div>
      </aside>
      </div>
    </>
  );
}
