-- Slice 002 — Product/contexto, idempotência de criação e entitlement default (manual; aplicar com psql/prisma migrate).
-- O limite `active_products` não é coluna: é resolvido em uso de configuração server-side (fail-closed), conforme PLAN/SPEC 002.

-- Up
CREATE TABLE "products" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "tenantId"         TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "description"      TEXT NOT NULL,
  "category"         TEXT,
  "priceCents"       BIGINT,
  "features"         JSONB,
  "imageRefs"        JSONB,
  "notes"            TEXT,
  "url"              TEXT,
  "locale"           TEXT NOT NULL DEFAULT 'pt-BR',
  "active"           BOOLEAN NOT NULL DEFAULT true,
  "version"          INTEGER NOT NULL DEFAULT 1,
  "enrichmentStatus" TEXT NOT NULL DEFAULT 'none',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

CREATE TABLE "product_contexts" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "productId"       TEXT NOT NULL,
  "goal"            TEXT,
  "audience"        TEXT,
  "style"           TEXT,
  "creatorPresence" TEXT,
  "experience"      TEXT,
  "constraints"     TEXT,
  "market"          TEXT,
  "notes"           TEXT,
  "locale"          TEXT NOT NULL DEFAULT 'pt-BR',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_contexts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "product_contexts_productId_key" ON "product_contexts"("productId");

CREATE TABLE "idempotency_records" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "tenantId"       TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash"    TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "idempotency_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "idempotency_records_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "idempotency_records_tenantId_idempotencyKey_key" ON "idempotency_records"("tenantId", "idempotencyKey");
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

CREATE TABLE "entitlements" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "tenantId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "entitlements_tenantId_key" ON "entitlements"("tenantId");

-- Backfill: entitlement default para Tenants do Slice 001 já existentes (idempotente).
INSERT INTO "entitlements" ("id", "tenantId")
SELECT gen_random_uuid(), t."id" FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "entitlements" e WHERE e."tenantId" = t."id");

-- Down (reversível; em cópia remove apenas objetos criados aqui, sem tocar Identity/Tenant)
-- DROP TABLE "idempotency_records";
-- DROP TABLE "product_contexts";
-- DROP TABLE "products";
-- DROP TABLE "entitlements";
