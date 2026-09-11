-- Slice 011 — recordingEquipment/recordingSupport viram arrays dos mesmos enums.
-- Backfill singleton direto: cada escalar persistido vira array de um elemento com o
-- MESMO valor (sem remapeamento); NULL permanece NULL. `none` de suporte fica exclusivo.
-- Os CHECKs escalares são removidos ANTES do ALTER TYPE: o PostgreSQL revalida constraints
-- existentes após a mudança de tipo, e a expressão antiga (text = text) falharia com
-- "operator does not exist: jsonb = text" sobre os novos valores.
ALTER TABLE "tenant_preferences" DROP CONSTRAINT "tenant_preferences_recording_equipment_check";
ALTER TABLE "tenant_preferences" DROP CONSTRAINT "tenant_preferences_recording_support_check";

ALTER TABLE "tenant_preferences"
  ALTER COLUMN "recordingEquipment" TYPE JSONB
    USING CASE WHEN "recordingEquipment" IS NULL THEN NULL::jsonb ELSE JSONB_BUILD_ARRAY("recordingEquipment") END,
  ALTER COLUMN "recordingSupport" TYPE JSONB
    USING CASE WHEN "recordingSupport" IS NULL THEN NULL::jsonb ELSE JSONB_BUILD_ARRAY("recordingSupport") END;

-- Elementos restritos à allowlist; dedupe é responsabilidade da aplicação (o CHECK limita
-- a cardinalidade pelo tamanho da allowlist). `none` só pode aparecer sozinho.
ALTER TABLE "tenant_preferences"
  ADD CONSTRAINT "tenant_preferences_recording_equipment_check"
  CHECK ("recordingEquipment" IS NULL OR (
    JSONB_TYPEOF("recordingEquipment") = 'array'
    AND "recordingEquipment" <@ '["phone","camera","other"]'::jsonb
    AND JSONB_ARRAY_LENGTH("recordingEquipment") <= 3));

ALTER TABLE "tenant_preferences"
  ADD CONSTRAINT "tenant_preferences_recording_support_check"
  CHECK ("recordingSupport" IS NULL OR (
    JSONB_TYPEOF("recordingSupport") = 'array'
    AND "recordingSupport" <@ '["tripod","handheld","none","other"]'::jsonb
    AND JSONB_ARRAY_LENGTH("recordingSupport") <= 4
    AND NOT ("recordingSupport" @> '["none"]'::jsonb AND JSONB_ARRAY_LENGTH("recordingSupport") > 1)));
