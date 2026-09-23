-- Slice 011 — CreatorPreferences (ADR-018): campos de estilo no registro one-to-one
-- existente. Migration aditiva; registros antigos mantêm targetContentCount e language default.
ALTER TABLE "tenant_preferences"
  ADD COLUMN "language" TEXT NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN "market" TEXT,
  ADD COLUMN "appearsOnCamera" BOOLEAN,
  ADD COLUMN "prefersVoiceOver" BOOLEAN,
  ADD COLUMN "preferredDurationSeconds" INTEGER,
  ADD COLUMN "tone" TEXT,
  ADD COLUMN "executionStyle" TEXT,
  ADD COLUMN "restrictions" JSONB,
  ADD COLUMN "notes" JSONB;

ALTER TABLE "tenant_preferences"
  ADD CONSTRAINT "tenant_preferences_duration_check"
  CHECK ("preferredDurationSeconds" IS NULL OR ("preferredDurationSeconds" >= 15 AND "preferredDurationSeconds" <= 600));
