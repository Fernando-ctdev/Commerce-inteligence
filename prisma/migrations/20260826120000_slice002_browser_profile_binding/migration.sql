-- Slice 002 — bind attempts to their Tenant-owned BrowserProfile.
-- Additive only: preserves the already-applied 20260826000000 migration checksum.

CREATE INDEX "product_import_attempts_browserProfileId_idx"
  ON "product_import_attempts"("browserProfileId");

ALTER TABLE "product_import_attempts"
  ADD CONSTRAINT "product_import_attempts_browserProfileId_fkey"
  FOREIGN KEY ("browserProfileId") REFERENCES "browser_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
