-- Slice 003 (gate arquitetural P1-1): proveniência determinística do Fact Gate.
-- Aditiva e reversível (DROP COLUMN); colunas nullable, sem backfill de dados inventados.
-- opportunityId de contents já existia na migração inicial do slice (FK composta tenant-scoped).

ALTER TABLE "brief_validation_reports" ADD COLUMN "claimType" TEXT;
ALTER TABLE "brief_validation_reports" ADD COLUMN "evidenceRefs" JSONB;
