import { GenerationError } from "./errors";
import catalogData from "../../../resources/system-knowledge/catalog/catalog.json";

type CreativePattern = { id: string; type: "hook" | "cta"; category: string; categoryScope: string; source: string; text: string };
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
const catalogItems = (catalogData as { version: string; items: CreativePattern[] }).items;
export const CREATIVE_CATALOG = deepFreeze({
  version: (catalogData as { version: string }).version,
  hooks: catalogItems.filter((item) => item.type === "hook"),
  ctas: catalogItems.filter((item) => item.type === "cta"),
});

export const TIKTOK_COMMERCE_SKILL = deepFreeze({
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
      // Modelo de produção padrão (nota "da-uma-olhada-nesse-briefing-d"):
      // 1 creator + 1 celular/câmera (mão ou tripé) + ambiente cotidiano + cortes simples.
      "assuma creator sozinho: um celular ou câmera na mão ou no tripé, ambiente que ele já tem, cortes simples e edição básica",
      "prefira fala para câmera, POV, mãos + produto, câmera fixa e close simples feito com o próprio celular",
      "nunca exija operador de câmera, órbita ou 360 graus, travelling, montagem complexa, múltiplas locações, atores, animações, VFX ou motion graphics",
      "se um creator sozinho com celular e tripé não conseguir gravar a cena imediatamente, simplifique-a",
    ],
    hookPatterns: [
      { id: "problem", guidance: "Abra com um problema concreto e reconhecível para a oportunidade, sem generalizar resultados." },
      { id: "discovery", guidance: "Abra com uma observação ou descoberta específica que possa ser sustentada pelo contexto." },
      { id: "demonstration", guidance: "Comece pela demonstração ou uso observável; não atribua ao produto algo que não esteja comprovado." },
      { id: "objection", guidance: "Apresente uma dúvida plausível e responda com evidência ou demonstração autorizada." },
    ],
    narrativePatterns: ["hook-problema-solução", "objeção-teste-prova", "descoberta-demonstração-resultado"],
    proofPatterns: ["demonstração observável", "antes e depois", "uso cotidiano"],
    ctaPatterns: [
      { id: "details", guidance: "Convide a pessoa a abrir o produto e conferir os detalhes disponíveis." },
      { id: "current-conditions", guidance: "Convide a pessoa a verificar preço e condições atuais na própria conta; não afirme oferta, desconto ou frete." },
      { id: "options", guidance: "Convide a pessoa a comparar as opções disponíveis antes de decidir." },
    ],
  },
  allowlistedSlices: {
    planner: ["principles", "executionRules", "narrativePatterns", "proofPatterns"],
    brief: ["principles", "executionRules", "narrativePatterns", "proofPatterns"],
  },
  validationRules: {
    separateStrategyAndSpeech: true,
    simpleScenes: true,
    oralLanguage: true,
    scriptNotLiteral: true,
    soloCreatorProduction: true,
  },
});
export function loadPlatformSkill(version = TIKTOK_COMMERCE_SKILL.version) {
  if (version !== TIKTOK_COMMERCE_SKILL.version)
    throw new GenerationError("GEN-SKILL", "Skill indisponível");
  return TIKTOK_COMMERCE_SKILL;
}
