import { GenerationError } from "./errors";
import { CREATIVE_SYSTEM_SKILL_VERSION, loadCreativeSystem } from "./creative-system";

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

// ADR-033 §7 (clean cut): Skill única do runtime — @1.3 com Creative System.
// Sem @1.2 como loader, alias ou fallback; @1.2 existe somente como baseline
// ADR-029 fixada por commit/fixture do runner E6 isolado.
const TIKTOK_COMMERCE_SKILL = deepFreeze({
  id: "tiktok-commerce",
  version: CREATIVE_SYSTEM_SKILL_VERSION,
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
  creativeSystem: loadCreativeSystem(CREATIVE_SYSTEM_SKILL_VERSION),
});

export const PLATFORM_SKILLS = deepFreeze({
  [CREATIVE_SYSTEM_SKILL_VERSION]: TIKTOK_COMMERCE_SKILL,
});
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

export function loadPlatformSkill(version: string = CREATIVE_SYSTEM_SKILL_VERSION): PlatformSkill {
  const skill = PLATFORM_SKILLS[version as keyof typeof PLATFORM_SKILLS];
  if (!skill) throw new GenerationError<"GEN-SKILL">("GEN-SKILL", "Skill indisponivel");
  return skill;
}

// ─── Classificação determinística de buckets (ADR-019) ────────────────────────
// Variedade por classificação regex fechada do próprio texto (sem embeddings/
// LLM, ADR-004), sobre o que a pipeline produz — o catálogo literal está em
// creative-catalog.ts (corpus de testes/eval) e não participa do runtime.
// classifyHookMechanism: buckets de mecanismos de hook para o teto ceil(N/M)
// do plano; classifyCtaFunction: regras de função de CTA para o gate de
// variedade funcional (ceil(N/K) sobre o domínio do classificador).

export type HookMechanismBucket = "problem" | "discovery" | "demonstration" | "objection" | "price-value" | "other";
const HOOK_BUCKET_RULES: ReadonlyArray<readonly [HookMechanismBucket, RegExp]> = [
  ["problem", /problem|dor|cansad|sofr|difici|frustra|chatead|evitar/],
  ["discovery", /descobr|achei|achad|nao sabia|curios|surpres|viraliz|entendi/],
  ["demonstration", /demonstr|prova|teste|testar|antes e depois|resultad|funciona|mostr/],
  ["objection", /objec|duvid|receio|achava|milagre|modinha|cetic|sera que/],
  ["price-value", /prec|barat|caro|valor|custa|dinheiro|gast|pagar/],
];

export function classifyHookMechanism(text: string): HookMechanismBucket {
  if (text === "problem" || text === "discovery" || text === "demonstration" || text === "price-value" || text === "other") return text;
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

// K do teto ceil(N/K) do gate de CTA: domínio do classificador
// determinístico/versionado (regras identificáveis; discovery/unclassified não
// conta). Independente do corpus — o catálogo não governa gates (ADR-033 §7).
export const CTA_FUNCTION_BUCKET_COUNT = CTA_FUNCTION_RULES.length;

// M do teto ceil(N/M) do plano: buckets do espaço comum de mecanismos.
export const HOOK_BUCKET_COUNT = HOOK_BUCKET_RULES.length + 1;
