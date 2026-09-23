-- Slice 011 (ADR-018) — contexto de execução de gravação do creator. Migration aditiva;
-- language/market permanecem na mesma tabela (AccountContext) e registros antigos ficam nulos.
ALTER TABLE "tenant_preferences"
  ADD COLUMN "recordingEquipment" TEXT,
  ADD COLUMN "recordingSupport" TEXT,
  ADD COLUMN "recordsAlone" BOOLEAN;

ALTER TABLE "tenant_preferences"
  ADD CONSTRAINT "tenant_preferences_recording_equipment_check"
  CHECK ("recordingEquipment" IS NULL OR "recordingEquipment" IN ('phone', 'camera', 'other'));

ALTER TABLE "tenant_preferences"
  ADD CONSTRAINT "tenant_preferences_recording_support_check"
  CHECK ("recordingSupport" IS NULL OR "recordingSupport" IN ('tripod', 'handheld', 'none', 'other'));
