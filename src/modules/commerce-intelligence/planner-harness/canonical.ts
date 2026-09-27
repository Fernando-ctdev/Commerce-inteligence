// Etapa 3 — CANONICAL_SERIALIZATION_V1: árvore tagged-CBOR-like em JSON
// compacto UTF-8 sem whitespace. Keys ordenadas por bytes UTF-8 da forma NFC;
// arrays ordered preservam sequência; sets são deduplicados e ordenados pela
// serialização canônica; opcional ausente é distinto de null/vazio.
// Hash SHA-256, hexadecimal lowercase de 64 caracteres. IDs são case-sensitive.
import { createHash } from "node:crypto";

export function nfc(value: string): string {
  return value.normalize("NFC");
}

export function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function numberToDecimalAscii(value: number): string {
  if (!Number.isFinite(value)) throw new Error("CANONICAL_SERIALIZATION_V1: número não finito");
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(20);
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

type CanonicalNode =
  | ["absent"]
  | ["null"]
  | ["string", string]
  | ["number", string]
  | ["boolean", boolean]
  | ["array", CanonicalNode[]]
  | ["set", CanonicalNode[]]
  | ["object", [string, CanonicalNode][]];

function canonicalNode(value: unknown): CanonicalNode {
  if (value === undefined) return ["absent"];
  if (value === null) return ["null"];
  if (typeof value === "string") return ["string", nfc(value)];
  if (typeof value === "number") return ["number", numberToDecimalAscii(value)];
  if (typeof value === "boolean") return ["boolean", value];
  if (Array.isArray(value)) return ["array", value.map(canonicalNode)];
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, nested]) => [nfc(key), canonicalNode(nested)] as [string, CanonicalNode])
    .sort(([a], [b]) => compareUtf8(a, b));
  return ["object", entries];
}

// Set-like: deduplica e ordena pela serialização canônica de cada elemento.
export function canonicalSet(values: readonly unknown[]): CanonicalNode {
  const nodes = values.map(canonicalNode);
  const unique = new Map<string, CanonicalNode>();
  for (const node of nodes) unique.set(JSON.stringify(node), node);
  return ["set", [...unique.values()].sort((a, b) => compareUtf8(JSON.stringify(a), JSON.stringify(b)))];
}

export function canonicalOrdered(values: readonly unknown[]): CanonicalNode {
  return ["array", values.map(canonicalNode)];
}

// Serialização final: JSON compacto (sem whitespace) da árvore tagged.
export function canonicalSerialization(value: unknown): string {
  return JSON.stringify(canonicalNode(value));
}

export function sha256Hex(utf8Input: string): string {
  return createHash("sha256").update(utf8Input, "utf8").digest("hex");
}

// `absent` para opcional não fornecido — distinto de null/string vazia/vazio.
export function canonicalCandidateKey(parts: {
  sourceOpportunityId: string;
  evidenceRefs: readonly unknown[];
  recipeId?: string;
  attentionMechanisms: readonly string[];
  psychologicalEffects: readonly string[];
  format: string;
  narrativeMoves: readonly string[];
  productRole: string;
  angle: string;
  noveltyTargets: readonly string[];
}): string {
  return sha256Hex(canonicalSerialization([
    "PLANNER_CANDIDATE_V1",
    parts.sourceOpportunityId,
    canonicalSet(parts.evidenceRefs),
    parts.recipeId === undefined ? ["absent"] : parts.recipeId,
    canonicalOrdered(parts.attentionMechanisms),
    canonicalSet(parts.psychologicalEffects),
    parts.format,
    canonicalOrdered(parts.narrativeMoves),
    parts.productRole,
    parts.angle,
    canonicalSet(parts.noveltyTargets),
  ]));
}

export function tieHash(seed: string, candidateKey: string): string {
  return sha256Hex("PLANNER_TIE_V1\0" + seed + "\0" + candidateKey);
}

// Helper do runner para construir PlannerInput.seed. planPortfolio usa
// exatamente o seed recebido — não deriva, substitui ou ignora.
export function harnessSeedForFixture(parts: {
  fixtureId: string;
  targetContentCount: number;
  plannerPolicyVersion: string;
  skillBinding: { platformSkillVersion: string; creativeSystemVersion: string; source: string };
  inputFingerprint: string;
}): string {
  return sha256Hex(canonicalSerialization([
    "PLANNER_SEED_V1",
    parts.fixtureId,
    parts.targetContentCount,
    parts.plannerPolicyVersion,
    ["object", [
      ["creativeSystemVersion", parts.skillBinding.creativeSystemVersion],
      ["platformSkillVersion", parts.skillBinding.platformSkillVersion],
      ["source", parts.skillBinding.source],
    ]],
    parts.inputFingerprint,
  ]));
}

// memorySignalKey — chave versionada das nove dimensões do sinal.
// commercialEffects é set-like (canonicalSet); atenção primária e
// narrativeShape são ordered.
export function memorySignalKey(signal: {
  signalsSchemaVersion: string;
  recipeId?: string;
  attentionMechanisms: readonly string[];
  psychologicalEffects: readonly string[];
  format?: string;
  productRole?: string;
  narrativeShape: readonly string[];
  commercialEffects?: readonly string[];
  audienceContext?: string;
  proofPattern?: string;
}): string {
  return sha256Hex(canonicalSerialization([
    "PLANNER_MEMORY_SIGNAL_V1",
    signal.signalsSchemaVersion,
    signal.recipeId === undefined ? ["absent"] : signal.recipeId,
    canonicalOrdered(signal.attentionMechanisms),
    canonicalSet(signal.psychologicalEffects),
    signal.format === undefined ? ["absent"] : signal.format,
    signal.productRole === undefined ? ["absent"] : signal.productRole,
    canonicalOrdered(signal.narrativeShape),
    canonicalSet(signal.commercialEffects ?? []),
    signal.audienceContext === undefined ? ["absent"] : signal.audienceContext,
    signal.proofPattern === undefined ? ["absent"] : signal.proofPattern,
  ]));
}
