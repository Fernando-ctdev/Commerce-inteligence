-- Slice 002 — arquivar Product: coluna de lifecycle aditiva, sem apagar dados
-- (PRD: ACTIVE/ARCHIVED). Linhas existentes nascem ACTIVE; arquivar é idempotente.
ALTER TABLE "products" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'ACTIVE';
