export const GENERATION_STAGES = ["UNDERSTANDING_PRODUCT","MAPPING_COMMERCIAL_OPPORTUNITIES","BUILDING_STRATEGY","BUILDING_CONTENT_PLAN","GENERATING_BRIEFS","FINALIZING"] as const;
export type GenerationStage = typeof GENERATION_STAGES[number];
export const STAGE_MESSAGES: Record<GenerationStage, string> = {
  UNDERSTANDING_PRODUCT: "Entendendo o produto...",
  MAPPING_COMMERCIAL_OPPORTUNITIES: "Mapeando oportunidades comerciais...",
  BUILDING_STRATEGY: "Definindo a melhor estratégia para este produto...",
  BUILDING_CONTENT_PLAN: "Organizando as oportunidades de conteúdo...",
  GENERATING_BRIEFS: "Preparando os Briefings do Conteúdo...",
  FINALIZING: "Finalizando...",
};