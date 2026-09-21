-- Retirada de comissão/características do contrato ativo (ADR-030): migração
-- aditiva, sem destruição de histórico. Colunas commissionType/commissionValue
-- permanecem inalteradas (nullable); features recebe default [] para permitir
-- criação sem escrita pelo service. Nenhum dado é removido ou alterado.
ALTER TABLE "products" ALTER COLUMN "features" SET DEFAULT '[]'::jsonb;
