// Validação e normalização de entrada de Product/contexto — SPEC/PLAN 002.
// Normalização: trim, NFC, quebras canônicas, null para ausentes, preço em centavos,
// caixa e ordem das listas preservadas (o hash de idempotência usa exatamente esta forma).
import { createHash } from "node:crypto";

export const MAX_PRICE_CENTS = 9_999_999_999; // 99.999.999,99 BRL
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{22,128}$/; // base64url (16 bytes aleatórios = 22 chars)

export type FieldErrors = Record<string, string>;

export type NormalizedContext = {
  goal: string | null;
  audience: string | null;
  style: string | null;
  creatorPresence: string | null;
  experience: string | null;
  constraints: string | null;
  market: string | null;
  notes: string | null;
};

export type NormalizedProductInput = {
  name: string;
  description: string;
  category: string | null;
  priceCents: number | null;
  features: string[] | null;
  imageRefs: string[] | null;
  notes: string | null;
  url: string | null;
  context: NormalizedContext | null;
};

const len = (s: string) => Array.from(s).length; // caracteres (code points), não code units

function normText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  return t === "" ? null : t;
}

function text(v: unknown, field: string, max: number, errors: FieldErrors, required = false): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) errors[field] = "Campo obrigatório.";
    return null;
  }
  if (typeof v !== "string") {
    errors[field] = "Valor inválido.";
    return null;
  }
  const t = normText(v);
  if (t === null) {
    if (required) errors[field] = "Campo obrigatório.";
    return null;
  }
  if (len(t) > max) {
    errors[field] = `Máximo de ${max} caracteres.`;
    return null;
  }
  return t;
}

/** URL http/https ≤2048 sem credenciais embutidas (regra de entrada da SPEC 002). */
export function isValidPublicHttpUrlString(v: string): boolean {
  if (v.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  return (u.protocol === "http:" || u.protocol === "https:") && u.username === "" && u.password === "" && u.hostname !== "";
}

/**
 * Converte preço BRL em centavos inteiros. Aceita número JSON com ≤2 casas ou string
 * em formato pt-BR ("1.234,56") / decimal simples ("1234.56"). Retorna null se inválido.
 * Sem arredondamento silencioso: mais de 2 casas decimais é rejeitado.
 */
export function parseBrlToCents(v: unknown): number | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    const cents = v * 100;
    if (!Number.isInteger(cents) || cents > MAX_PRICE_CENTS) return null;
    return cents;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "" || !/^[0-9.,]+$/.test(s)) return null;
  let normalized: string;
  if (s.includes(",")) {
    if (/,[^]*,/.test(s)) return null; // mais de uma vírgula
    if (s.includes(".")) {
      const [intPart, decPart] = s.split(",");
      if (!/^\d{1,3}(\.\d{3})+$/.test(intPart) || !/^\d{1,2}$/.test(decPart)) return null; // separadores misturados
    } else {
      const dec = s.split(",")[1] ?? "";
      if (!/^\d{1,2}$/.test(dec)) return null; // >2 casas decimais
    }
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // sem vírgula, pontos são decimais; "1.234" (milhar ambíguo) falha abaixo no limite de 2 casas
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  const cents = n * 100;
  if (!Number.isInteger(cents) || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

function stringList(
  v: unknown,
  field: string,
  maxItems: number,
  maxItemLen: number,
  errors: FieldErrors,
  itemValidator?: (s: string) => boolean
): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) {
    errors[field] = "Valor inválido.";
    return null;
  }
  if (v.length > maxItems) {
    errors[field] = `Máximo de ${maxItems} itens.`;
    return null;
  }
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") {
      errors[field] = "Valor inválido.";
      return null;
    }
    const t = normText(item);
    if (t === null || len(t) > maxItemLen) {
      errors[field] = `Cada item deve ter entre 1 e ${maxItemLen} caracteres.`;
      return null;
    }
    if (itemValidator && !itemValidator(t)) {
      errors[field] = "Item inválido.";
      return null;
    }
    out.push(t);
  }
  return out;
}

function normalizeContext(v: unknown, errors: FieldErrors): NormalizedContext | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") {
    errors["context"] = "Valor inválido.";
    return null;
  }
  const c = v as Record<string, unknown>;
  const ctx: NormalizedContext = {
    goal: text(c.goal, "context.goal", 5000, errors),
    audience: text(c.audience, "context.audience", 5000, errors),
    style: text(c.style, "context.style", 5000, errors),
    creatorPresence: text(c.creatorPresence, "context.creatorPresence", 5000, errors),
    experience: text(c.experience, "context.experience", 5000, errors),
    constraints: text(c.constraints, "context.constraints", 5000, errors),
    market: text(c.market, "context.market", 5000, errors),
    notes: text(c.notes, "context.notes", 5000, errors),
  };
  if (Object.values(ctx).every((x) => x === null)) return null;
  return ctx;
}

/**
 * Valida e normaliza a entrada de criação. Retorna erros por campo ou a forma normalizada.
 * `partial = true` (PATCH): valida somente os campos presentes — ausentes são preservados pelo chamador;
 * name/description presentes mas vazios/nulos são rejeitados (invariante do schema).
 */
export function validateProductInput(v: unknown, partial = false): { errors: FieldErrors } | { input: NormalizedProductInput } {
  const errors: FieldErrors = {};
  if (typeof v !== "object" || v === null) return { errors: { name: "Requisição inválida." } };
  const b = v as Record<string, unknown>;

  // No PATCH, campo ausente é preservado (não obrigatório); presente-vazio em campo
  // obrigatório do schema (name/description) é rejeitado — não pode apagar o invariante.
  const name = text(b.name, "name", 200, errors, !partial || b.name !== undefined) ?? "";
  const description = text(b.description, "description", 5000, errors, !partial || b.description !== undefined) ?? "";
  const category = text(b.category, "category", 120, errors);
  const notes = text(b.notes, "notes", 5000, errors);

  let priceCents: number | null = null;
  if (b.price !== undefined && b.price !== null && b.price !== "") {
    priceCents = parseBrlToCents(b.price);
    if (priceCents === null) errors["price"] = "Preço inválido: use BRL com até duas casas decimais (ex.: 1.234,56).";
  }

  let url: string | null = null;
  if (b.url !== undefined && b.url !== null && b.url !== "") {
    const t = normText(b.url);
    url = t && isValidPublicHttpUrlString(t) ? t : null;
    if (!url) errors["url"] = "URL inválida: use http/https, até 2.048 caracteres, sem credenciais.";
  }

  const features = stringList(b.features, "features", 20, 300, errors);
  const imageRefs = stringList(b.imageRefs, "imageRefs", 10, 2048, errors, (s) => s.length <= 2048 && isValidPublicHttpUrlString(s));
  const context = normalizeContext(b.context, errors);

  if (Object.keys(errors).length > 0) return { errors };
  return {
    input: { name, description, category, priceCents, features, imageRefs, notes, url, context },
  };
}

/** Hash canônico do payload normalizado (ordem de chaves fixa; listas preservam ordem). */
export function payloadHash(input: NormalizedProductInput): string {
  const c = input.context;
  const canonical = JSON.stringify([
    input.name,
    input.description,
    input.category,
    input.priceCents,
    input.features,
    input.imageRefs,
    input.notes,
    input.url,
    c ? [c.goal, c.audience, c.style, c.creatorPresence, c.experience, c.constraints, c.market, c.notes] : null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Validação da chave de idempotência: presença, charset seguro e 22–128 caracteres. */
export function validateIdempotencyKey(v: unknown): string | null {
  return typeof v === "string" && IDEMPOTENCY_KEY_RE.test(v) ? v : null;
}
