import { GenerationError } from "./errors";
export const TIKTOK_COMMERCE_SKILL = Object.freeze({
  id: "tiktok-commerce",
  version: "tiktok-commerce@1.0",
  principles: [
    "estratégia separada da fala",
    "cenas simples",
    "linguagem oral",
    "script não literal",
  ],
  operationalRepertoire: {
    executionRules: [
      "comece com um hook claro e visual",
      "mostre o produto em uso quando isso sustentar a mensagem",
      "priorize fala natural e demonstração curta",
      "termine com CTA contextual e não coercitivo",
    ],
    hookPatterns: ["problema imediato", "descoberta", "demonstração", "objeção"],
    narrativePatterns: ["hook-problema-solução", "objeção-teste-prova", "descoberta-demonstração-resultado"],
    proofPatterns: ["demonstração observável", "antes e depois", "uso cotidiano"],
    ctaPatterns: ["confira no carrinho", "veja os detalhes", "saiba mais"],
  },
  allowlistedSlices: {
    planner: ["principles", "executionRules", "hookPatterns", "narrativePatterns", "proofPatterns", "ctaPatterns"],
    brief: ["principles", "executionRules", "narrativePatterns", "proofPatterns", "ctaPatterns"],
  },
  validationRules: {
    separateStrategyAndSpeech: true,
    simpleScenes: true,
    oralLanguage: true,
    scriptNotLiteral: true,
  },
});
export function loadPlatformSkill(version = TIKTOK_COMMERCE_SKILL.version) {
  if (version !== TIKTOK_COMMERCE_SKILL.version)
    throw new GenerationError("GEN-SKILL", "Skill indisponível");
  return TIKTOK_COMMERCE_SKILL;
}
