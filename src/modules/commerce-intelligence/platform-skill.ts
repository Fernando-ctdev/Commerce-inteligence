import { GenerationError } from "./errors";
import catalogData from "../../../resources/system-knowledge/catalog/catalog.json";

type CreativePattern = {
  id: string;
  type: "hook" | "cta";
  category: string;
  categoryScope: string;
  source: string;
  text: string;
};
type CreativeCatalogInput = { version: string; items: CreativePattern[] };
type SkillSlice = "planner" | "brief";
type SkillSlicePath =
  | "principles"
  | "operationalRepertoire.executionRules"
  | "operationalRepertoire.narrativePatterns"
  | "operationalRepertoire.proofPatterns";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateCreativeCatalog(value: unknown): CreativeCatalogInput {
  if (!isRecord(value) || typeof value.version !== "string" || !value.version.trim() || !Array.isArray(value.items) || value.items.length === 0)
    throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Catalogo criativo invalido");
  const ids = new Set<string>();
  const items = value.items.map((item): CreativePattern => {
    if (!isRecord(item) || !["id", "category", "categoryScope", "source", "text"].every((key) => typeof item[key] === "string" && (item[key] as string).trim()) || (item.type !== "hook" && item.type !== "cta"))
      throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Catalogo criativo invalido");
    const pattern = item as CreativePattern;
    if (ids.has(pattern.id))
      throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Catalogo criativo invalido");
    ids.add(pattern.id);
    return { ...pattern };
  });
  return { version: value.version, items };
}

const catalog = validateCreativeCatalog(catalogData);
const catalogItems = catalog.items;
export const CREATIVE_CATALOG = deepFreeze({
  version: catalog.version,
  hooks: catalogItems.filter((item) => item.type === "hook"),
  ctas: catalogItems.filter((item) => item.type === "cta"),
});

const TIKTOK_COMMERCE_SKILL_V1_2 = deepFreeze({
  id: "tiktok-commerce",
  version: "tiktok-commerce@1.2",
  creativeCatalog: CREATIVE_CATALOG,
  principles: [
    "estratégia separada da fala",
    "cenas simples",
    "linguagem oral",
    "script não literal",
    "produção de creator solo",
  ],
  operationalRepertoire: {
    executionRules: [
      "comece com um hook claro e visual",
      "mostre o produto em uso quando isso sustentar a mensagem",
      "priorize fala natural e demonstração curta",
      "termine com CTA contextual e não coercitivo",
      "assuma creator sozinho: um celular ou câmera na mão ou no tripé, ambiente que ele já tem, cortes simples e edição básica",
      "prefira fala para câmera, POV, mãos + produto, câmera fixa e close simples feito com o próprio celular",
      "nunca exija operador de câmera, órbita ou 360 graus, travelling, montagem complexa, múltiplas locações, atores, animações, VFX ou motion graphics",
      "se um creator sozinho com celular e tripé não conseguir gravar a cena imediatamente, simplifique-a",
    ],
    hookMechanisms: [
      { id: "problem", guidance: "Abra com um problema concreto e reconhecível para a oportunidade, sem generalizar resultados." },
      { id: "discovery", guidance: "Abra com uma observação ou descoberta específica que possa ser sustentada pelo contexto." },
      { id: "demonstration", guidance: "Comece pela demonstração ou uso observável; não atribua ao produto algo que não esteja comprovado." },
      { id: "objection", guidance: "Apresente uma dúvida plausível e responda com evidência ou demonstração autorizada." },
    ],
    narrativePatterns: ["hook-problema-solução", "objeção-teste-prova", "descoberta-demonstração-resultado"],
    proofPatterns: ["demonstração observável", "antes e depois apenas quando resultado factual observavel", "uso cotidiano"],
    ctaStrategies: [
      { id: "details", guidance: "Convide a pessoa a abrir o produto e conferir os detalhes disponíveis." },
      { id: "current-conditions", guidance: "Convide a pessoa a verificar preço e condições atuais na própria conta; não afirme oferta, desconto ou frete." },
      { id: "options", guidance: "Convide a pessoa a comparar as opções disponíveis antes de decidir." },
    ],
  },
  allowlistedSlices: {
    planner: ["principles", "operationalRepertoire.executionRules", "operationalRepertoire.narrativePatterns", "operationalRepertoire.proofPatterns"],
    brief: ["principles", "operationalRepertoire.executionRules", "operationalRepertoire.narrativePatterns", "operationalRepertoire.proofPatterns"],
  } satisfies Record<SkillSlice, readonly SkillSlicePath[]>,
  validationRules: {
    separateStrategyAndSpeech: true,
    simpleScenes: true,
    oralLanguage: true,
    scriptNotLiteral: true,
    soloCreatorProduction: true,
  },
});

export const PLATFORM_SKILLS = deepFreeze({
  "tiktok-commerce@1.2": TIKTOK_COMMERCE_SKILL_V1_2,
});
export const TIKTOK_COMMERCE_SKILL = PLATFORM_SKILLS["tiktok-commerce@1.2"];
export type PlatformSkill = typeof TIKTOK_COMMERCE_SKILL;

export function projectPlatformSkillSlice(skill: PlatformSkill, slice: SkillSlice): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  const repertoire = skill.operationalRepertoire as Record<string, unknown>;
  for (const path of skill.allowlistedSlices[slice]) {
    if (path === "principles") projected.principles = skill.principles;
    else projected[path.slice("operationalRepertoire.".length)] = repertoire[path.slice("operationalRepertoire.".length)];
  }
  return projected;
}

export function loadPlatformSkill(version: string = TIKTOK_COMMERCE_SKILL.version): PlatformSkill {
  const skill = PLATFORM_SKILLS[version as keyof typeof PLATFORM_SKILLS];
  if (!skill) throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Skill indisponivel");
  return skill;
}

// ─── Classificação determinística de buckets (ADR-019) ────────────────────────
// Espaço comum para variedade: mecanismos de hook do plano e textos do catálogo
// são classificados nos MESMOS buckets por regex fechada (sem embeddings/LLM,
// ADR-004). Usado pela regra ceil(N/M) do plano, pela seleção estratificada de
// padrões e pelo gate de variedade funcional de CTA.

export type HookMechanismBucket = "problem" | "discovery" | "demonstration" | "objection" | "price-value" | "other";
const HOOK_BUCKET_RULES: ReadonlyArray<readonly [HookMechanismBucket, RegExp]> = [
  ["problem", /problem|dor|cansad|sofr|difici|frustra|chatead|evitar/],
  ["discovery", /descobr|achei|achad|nao sabia|curios|surpres|viraliz|entendi/],
  ["demonstration", /demonstr|prova|teste|testar|antes e depois|resultad|funciona|mostr/],
  ["objection", /objec|duvid|receio|achava|milagre|modinha|cetic|sera que/],
  ["price-value", /prec|barat|caro|valor|custa|dinheiro|gast|pagar/],
];

export function classifyHookMechanism(text: string): HookMechanismBucket {
  const folded = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [bucket, pattern] of HOOK_BUCKET_RULES) if (pattern.test(folded)) return bucket;
  return "other";
}

export type CtaFunction = "promo" | "checkout" | "price" | "interaction" | "recommendation" | "discovery";
// Função assumida quando nenhuma regra casa com o texto: ausência de função
// identificada, não uma função real — concentração funcional exige evidência.
export const UNCLASSIFIED_CTA_FUNCTION: CtaFunction = "discovery";
const CTA_FUNCTION_RULES: ReadonlyArray<readonly [CtaFunction, RegExp]> = [
  ["promo", /descont|frete|oferta|cupom|promoc/],
  ["checkout", /carrinh|compr|garant|pedid|shop|link|coloc/],
  ["price", /prec|valor|quanto|barat|caro|dinheiro|gast|pagar/],
  ["interaction", /coment|me conta|me fala|pergunta|respond|fala se|quer que eu|deixa um/],
  ["recommendation", /vale|recomend|faz sentido|pena|considera/],
];

export function classifyCtaFunction(text: string): CtaFunction {
  const folded = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [fn, pattern] of CTA_FUNCTION_RULES) if (pattern.test(folded)) return fn;
  return UNCLASSIFIED_CTA_FUNCTION;
}

// K do teto ceil(N/K) do gate de CTA: buckets realmente presentes no catálogo.
export const CTA_FUNCTION_BUCKET_COUNT = new Set(
  CREATIVE_CATALOG.ctas.map(({ text }) => classifyCtaFunction(text)),
).size;

// M do teto ceil(N/M) do plano: buckets do espaço comum de mecanismos.
export const HOOK_BUCKET_COUNT = HOOK_BUCKET_RULES.length + 1;
