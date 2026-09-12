-- Remove historical occurrences from JSON payloads. New payloads no longer contain this field.
UPDATE "product_understandings"
SET "payload" = "payload" - 'communicationRisks'
WHERE "payload" ? 'communicationRisks';

UPDATE "product_strategies"
SET "payload" = "payload" - 'communicationRisks'
WHERE "payload" ? 'communicationRisks';

UPDATE "content_plans"
SET "payload" = jsonb_set(
  "payload",
  '{strategySlice}',
  ("payload" -> 'strategySlice') - 'communicationRisks'
)
WHERE ("payload" -> 'strategySlice') ? 'communicationRisks';