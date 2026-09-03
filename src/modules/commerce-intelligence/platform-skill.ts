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
