-- Slice 003 (revisado): attemptDeadlineAt no job e stages públicos revisados.
-- Aditiva e preserva dados. A mudança de enum move linhas existentes via CAST por texto.

-- 1) Deadline global da tentativa (fencing/heartbeat): coluna aditiva.
ALTER TABLE "commerce_intelligence_jobs" ADD COLUMN IF NOT EXISTS "attemptDeadlineAt" TIMESTAMP(3);

-- 2) Stages públicos revisados: remover stages internos antigos, adicionar MAPPING.
-- Postgres não remove valores de enum sem recriar o tipo. Estratégia preservativa:
--   a) cria o novo tipo; b) migra a coluna por texto, mapeando stages antigos 1:1 quando
--      existem e agrupando os internos removidos no estágio fundacional mais próximo;
--   c) dropa o tipo antigo.
CREATE TYPE "CommerceIntelligenceStage_new" AS ENUM (
  'UNDERSTANDING_PRODUCT','MAPPING_COMMERCIAL_OPPORTUNITIES','BUILDING_STRATEGY',
  'BUILDING_CONTENT_PLAN','GENERATING_BRIEFS','FINALIZING'
);

ALTER TABLE "commerce_intelligence_jobs"
  ALTER COLUMN "stage" DROP DEFAULT,
  ALTER COLUMN "stage" TYPE TEXT;
UPDATE "commerce_intelligence_jobs" SET "stage" = CASE "stage"
  WHEN 'IDENTIFYING_AUDIENCES' THEN 'UNDERSTANDING_PRODUCT'
  WHEN 'ANALYZING_PAINS_AND_DESIRES' THEN 'MAPPING_COMMERCIAL_OPPORTUNITIES'
  WHEN 'ANALYZING_OBJECTIONS' THEN 'MAPPING_COMMERCIAL_OPPORTUNITIES'
  ELSE "stage"
END;
ALTER TABLE "commerce_intelligence_jobs"
  ALTER COLUMN "stage" TYPE "CommerceIntelligenceStage_new" USING ("stage"::"CommerceIntelligenceStage_new"),
  ALTER COLUMN "stage" SET DEFAULT 'UNDERSTANDING_PRODUCT';
DROP TYPE "CommerceIntelligenceStage";
ALTER TYPE "CommerceIntelligenceStage_new" RENAME TO "CommerceIntelligenceStage";