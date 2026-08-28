-- Slice 002 — ProductImportAttempt, Product, TenantEntitlement, TenantPreference (PLAN §2.5).
-- Cutover da arquitetura removida (ADR-016 / SPEC §Cutover): tabelas do Browser Service,
-- portal e engine antiga saem do schema. users/tenants/sessions (Slice 001) intocados.
-- Backfill idempotente: todo tenant existente recebe entitlement default;
-- activeProductsLimit fica NULL quando a config server-side ainda não está resolvida (fail-closed na ativação).

DROP TABLE IF EXISTS "contents" CASCADE;
DROP TABLE IF EXISTS "generation_usage_reservations" CASCADE;
DROP TABLE IF EXISTS "generation_runs" CASCADE;
DROP TABLE IF EXISTS "generation_intents" CASCADE;
DROP TABLE IF EXISTS "generation_worker_state" CASCADE;
DROP TABLE IF EXISTS "idempotency_records" CASCADE;
DROP TABLE IF EXISTS "product_candidates" CASCADE;
DROP TABLE IF EXISTS "product_contexts" CASCADE;
DROP TABLE IF EXISTS "browser_profiles" CASCADE;
DROP TABLE IF EXISTS "product_import_attempts" CASCADE;
DROP TABLE IF EXISTS "products" CASCADE;
DROP TABLE IF EXISTS "entitlements" CASCADE;
DROP TABLE IF EXISTS "strategies" CASCADE;
DROP TABLE IF EXISTS "plans" CASCADE;

CREATE TABLE "product_import_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "submittedUrl" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "redirectChain" JSONB,
    "candidate" JSONB,
    "gaps" JSONB,
    "publicErrorCode" TEXT,
    "internalCauseCode" TEXT,
    "candidateReadyAt" TIMESTAMP(3),
    "leaseOwnerId" TEXT,
    "leaseDeadlineAt" TIMESTAMP(3),
    "runSteps" INTEGER NOT NULL DEFAULT 0,
    "runTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_import_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "priceAmount" DECIMAL(65,30),
    "priceCurrency" TEXT,
    "features" JSONB NOT NULL,
    "variants" JSONB,
    "images" JSONB NOT NULL,
    "seller" TEXT,
    "submittedUrl" TEXT,
    "sourceUrl" TEXT,
    "provenance" JSONB NOT NULL,
    "targetContentCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_entitlements" (
    "tenantId" TEXT NOT NULL,
    "activeProductsLimit" INTEGER,
    "activeProductsUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tenant_entitlements_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "tenant_preferences" (
    "tenantId" TEXT NOT NULL,
    "targetContentCount" INTEGER NOT NULL,

    CONSTRAINT "tenant_preferences_pkey" PRIMARY KEY ("tenantId")
);

CREATE INDEX "product_import_attempts_tenantId_status_idx" ON "product_import_attempts"("tenantId", "status");
CREATE INDEX "product_import_attempts_status_leaseDeadlineAt_idx" ON "product_import_attempts"("status", "leaseDeadlineAt");
CREATE INDEX "product_import_attempts_updatedAt_idx" ON "product_import_attempts"("updatedAt");
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

ALTER TABLE "product_import_attempts" ADD CONSTRAINT "product_import_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_preferences" ADD CONSTRAINT "tenant_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill do entitlement default (idempotente): 1 linha por tenant; limite NULL = config não resolvida.
INSERT INTO "tenant_entitlements" ("tenantId", "activeProductsLimit", "activeProductsUsed")
SELECT "id", NULL, 0 FROM "tenants"
ON CONFLICT ("tenantId") DO NOTHING;
