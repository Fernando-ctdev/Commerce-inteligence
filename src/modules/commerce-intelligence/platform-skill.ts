import { GenerationError } from "./errors";
export const TIKTOK_COMMERCE_SKILL = Object.freeze({
  id: "tiktok-commerce",
  version: "tiktok-commerce@1.0",
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
    soloCreatorProduction: true,
  },
});
export function loadPlatformSkill(version = TIKTOK_COMMERCE_SKILL.version) {
  if (version !== TIKTOK_COMMERCE_SKILL.version)
    throw new GenerationError("GEN-SKILL", "Skill indisponível");
  return TIKTOK_COMMERCE_SKILL;
}
