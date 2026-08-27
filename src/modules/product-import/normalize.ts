// Normalização factual do Candidate — SPEC 002: fatos descobertos + lacunas + proveniência.
// Saída do Browser Service é não confiável: valida schema, tamanho, cardinalidade e URLs.
// Normalização limpa representação, nunca inventa fato ausente (variantes/categoria/marca
// não extraídas pela POC permanecem lacunas).
import type { BrowserRawCandidate } from "../browser/client";
import { isValidPublicHttpUrlString } from "../product/validation";

export const CANDIDATE_FACTS_LIMITS = {
  name: 200,
  description: 5000,
  seller: 200,
  brand: 120,
  category: 120,
  features: { items: 20, itemLen: 300 },
  variants: { items: 20, itemLen: 300 },
  images: { items: 10, itemLen: 2048 },
} as const;

export type CandidateFacts = {
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  seller: string | null;
  priceCents: number | null;
  priceCurrency: string | null;
  features: string[];
  imageRefs: string[];
  variants: string[] | null; // null = ausente (não extraído); lista vazia não é fato inventado
  sourceUrl: string;
};

/** Proveniência por fato: de onde veio o valor confirmado (SPEC: creator-confirmed prevalece). */
export type CandidateProvenance = Record<string, "browser-extraction" | "creator-confirmed">;

export type NormalizedCandidate = { facts: CandidateFacts; gaps: string[]; provenance: CandidateProvenance };

const clip = (s: string, max: number) => {
  const trimmed = s.trim().replace(/\s+/g, " ");
  return Array.from(trimmed).slice(0, max).join("");
};

/** Preço do Candidate em centavos: finito, ≥0, ≤2 casas — sem arredondamento silencioso. */
export function candidateAmountToCents(amount: unknown): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  const cents = amount * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) return null; // 3+ casas: rejeita, não arredonda
  return Math.round(cents);
}

export function candidateCurrency(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : null;
}

/**
 * Converte o Candidate bruto do Browser Service na forma factual persistível.
 * Retorna null quando estruturalmente inválido (sem nome utilizável ou preço íntegro)
 * — o attempt vai para ERROR com retry/fallback, nunca para confirmação.
 */
export function normalizeCandidate(raw: BrowserRawCandidate, maxPriceCents: number): NormalizedCandidate | null {
  const name = typeof raw.name === "string" ? clip(raw.name, CANDIDATE_FACTS_LIMITS.name) : "";
  if (name.length === 0) return null;

  const description = typeof raw.description === "string" ? clip(raw.description, CANDIDATE_FACTS_LIMITS.description) : null;

  let priceCents: number | null = null;
  let priceCurrency: string | null = null;
  const price = raw.price;
  if (price && typeof price === "object" && "amount" in price) {
    priceCents = candidateAmountToCents(price.amount);
    if (priceCents !== null && priceCents > maxPriceCents) return null;
    // moeda ausente/inválida vira lacuna; o preço extraído permanece (SPEC: moeda informada quando existente)
    priceCurrency = candidateCurrency(price.currency);
  }

  const features = Array.isArray(raw.features)
    ? raw.features
        .filter((f): f is string => typeof f === "string")
        .map((f) => clip(f, CANDIDATE_FACTS_LIMITS.features.itemLen))
        .filter((f) => f.length > 0)
        .slice(0, CANDIDATE_FACTS_LIMITS.features.items)
    : [];

  const imageRefs = Array.isArray(raw.images)
    ? raw.images
        .filter((i): i is string => typeof i === "string" && i.length <= CANDIDATE_FACTS_LIMITS.images.itemLen && isValidPublicHttpUrlString(i.trim()))
        .map((i) => i.trim())
        .slice(0, CANDIDATE_FACTS_LIMITS.images.items)
    : [];

  const seller = typeof raw.seller === "string" ? clip(raw.seller, CANDIDATE_FACTS_LIMITS.seller) || null : null;
  const sourceUrl = typeof raw.sourceUrl === "string" && isValidPublicHttpUrlString(raw.sourceUrl) ? raw.sourceUrl : "";

  const facts: CandidateFacts = {
    name,
    description: description && description.length > 0 ? description : null,
    category: null, // não extraído pela POC: lacuna, nunca inventado
    brand: null,
    seller,
    priceCents,
    priceCurrency,
    features,
    imageRefs,
    variants: null,
    sourceUrl,
  };

  const gaps = Object.entries(facts)
    .filter(([field, value]) => field !== "name" && field !== "sourceUrl" && (value === null || (Array.isArray(value) && value.length === 0)))
    .map(([field]) => field);

  const provenance: CandidateProvenance = { name: "browser-extraction" };
  const present: Array<[string, unknown]> = [
    ["description", facts.description],
    ["seller", facts.seller],
    ["priceCents", facts.priceCents],
    ["priceCurrency", facts.priceCurrency],
    ["features", facts.features],
    ["imageRefs", facts.imageRefs],
    ["variants", facts.variants],
    ["category", facts.category],
    ["brand", facts.brand],
  ];
  for (const [field, value] of present) {
    if (value !== null && !(Array.isArray(value) && value.length === 0)) provenance[field] = "browser-extraction";
  }
  return { facts, gaps, provenance };
}
