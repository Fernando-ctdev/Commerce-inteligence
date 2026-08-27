-- Slice 002 — Importação de Product via Browser (ADR-011): BrowserProfile, ProductImportAttempt,
-- ProductCandidate, fatos/origem/proveniência de Product e identidade de duplicação canônica.
--
-- Nota de drift: gerada com `prisma migrate diff` do banco VIVO para o schema canônico commitado
-- (sem reset). O banco local foi migrado a partir de uma versão pré-commit de
-- 20260825100000_generation_first_slice que continha FKs compostas (id,tenantId), índices únicos
-- (id,tenantId) e defaults de updatedAt não presentes no arquivo commitado; os DROPs abaixo apenas
-- normalizam esses metadados ao schema canônico — nenhum dado é removido além de
-- products.enrichmentStatus (estado transitório do contrato antigo, fora do contrato novo).
-- Aplicar com `prisma db execute` e registrar com `prisma migrate resolve --applied`.

-- Up
-- DropForeignKey
ALTER TABLE "contents" DROP CONSTRAINT "contents_plan_tenant_fkey";

-- DropForeignKey
ALTER TABLE "contents" DROP CONSTRAINT "contents_product_tenant_fkey";

-- DropForeignKey
ALTER TABLE "contents" DROP CONSTRAINT "contents_run_tenant_fkey";

-- DropForeignKey
ALTER TABLE "contents" DROP CONSTRAINT "contents_strategy_tenant_fkey";

-- DropForeignKey
ALTER TABLE "generation_intents" DROP CONSTRAINT "generation_intents_run_tenant_fkey";

-- DropForeignKey
ALTER TABLE "generation_runs" DROP CONSTRAINT "generation_runs_previousRunId_fkey";

-- DropForeignKey
ALTER TABLE "generation_runs" DROP CONSTRAINT "generation_runs_product_tenant_fkey";

-- DropForeignKey
ALTER TABLE "generation_usage_reservations" DROP CONSTRAINT "generation_usage_reservations_run_tenant_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_product_tenant_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_run_tenant_fkey";

-- DropForeignKey
ALTER TABLE "plans" DROP CONSTRAINT "plans_strategy_tenant_fkey";

-- DropForeignKey
ALTER TABLE "strategies" DROP CONSTRAINT "strategies_product_tenant_fkey";

-- DropForeignKey
ALTER TABLE "strategies" DROP CONSTRAINT "strategies_run_tenant_fkey";

-- DropIndex
DROP INDEX "generation_runs_id_tenantId_key";

-- DropIndex
DROP INDEX "plans_id_tenantId_key";

-- DropIndex
DROP INDEX "products_id_tenantId_key";

-- DropIndex
DROP INDEX "strategies_id_tenantId_key";

-- AlterTable
ALTER TABLE "entitlements" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "generation_runs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "generation_usage_reservations" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "product_contexts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "enrichmentStatus",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "factProvenance" JSONB,
ADD COLUMN     "factsVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "priceCurrency" TEXT,
ADD COLUMN     "seller" TEXT,
ADD COLUMN     "sourceKind" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "variants" JSONB,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "browser_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "browser_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_import_attempts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "browserProfileId" TEXT,
    "status" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sessionId" TEXT,
    "pauseReason" TEXT,
    "interactiveUrl" TEXT,
    "errorCode" TEXT,
    "candidateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "product_import_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_candidates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "payload" JSONB NOT NULL,
    "gaps" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedProductId" TEXT,

    CONSTRAINT "product_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "browser_profiles_tenantId_key" ON "browser_profiles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_import_attempts_candidateId_key" ON "product_import_attempts"("candidateId");

-- CreateIndex
CREATE INDEX "product_import_attempts_tenantId_status_idx" ON "product_import_attempts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "product_import_attempts_expiresAt_idx" ON "product_import_attempts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_import_attempts_tenantId_idempotencyKey_key" ON "product_import_attempts"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "product_candidates_attemptId_key" ON "product_candidates"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "product_candidates_confirmedProductId_key" ON "product_candidates"("confirmedProductId");

-- CreateIndex
CREATE INDEX "product_candidates_tenantId_idx" ON "product_candidates"("tenantId");

-- CreateIndex
CREATE INDEX "product_candidates_expiresAt_idx" ON "product_candidates"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_canonicalUrl_key" ON "products"("tenantId", "canonicalUrl");

-- AddForeignKey
ALTER TABLE "browser_profiles" ADD CONSTRAINT "browser_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_import_attempts" ADD CONSTRAINT "product_import_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "product_import_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_candidates" ADD CONSTRAINT "product_candidates_confirmedProductId_fkey" FOREIGN KEY ("confirmedProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_previousRunId_fkey" FOREIGN KEY ("previousRunId") REFERENCES "generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Down (reversível em cópia; restaura apenas objetos criados/alterados aqui)
-- ALTER TABLE "product_candidates" DROP CONSTRAINT "product_candidates_confirmedProductId_fkey";
-- ALTER TABLE "product_candidates" DROP CONSTRAINT "product_candidates_attemptId_fkey";
-- ALTER TABLE "product_candidates" DROP CONSTRAINT "product_candidates_tenantId_fkey";
-- ALTER TABLE "product_import_attempts" DROP CONSTRAINT "product_import_attempts_tenantId_fkey";
-- ALTER TABLE "browser_profiles" DROP CONSTRAINT "browser_profiles_tenantId_fkey";
-- DROP INDEX "products_tenantId_canonicalUrl_key";
-- DROP INDEX "product_candidates_expiresAt_idx";
-- DROP INDEX "product_candidates_tenantId_idx";
-- DROP INDEX "product_candidates_confirmedProductId_key";
-- DROP INDEX "product_candidates_attemptId_key";
-- DROP INDEX "product_import_attempts_tenantId_idempotencyKey_key";
-- DROP INDEX "product_import_attempts_expiresAt_idx";
-- DROP INDEX "product_import_attempts_tenantId_status_idx";
-- DROP INDEX "product_import_attempts_candidateId_key";
-- DROP INDEX "browser_profiles_tenantId_key";
-- DROP TABLE "product_candidates";
-- DROP TABLE "product_import_attempts";
-- DROP TABLE "browser_profiles";
-- ALTER TABLE "products" ADD COLUMN "enrichmentStatus" TEXT NOT NULL DEFAULT 'none',
--   DROP COLUMN "variants", DROP COLUMN "seller", DROP COLUMN "sourceKind", DROP COLUMN "priceCurrency",
--   DROP COLUMN "factsVersion", DROP COLUMN "factProvenance", DROP COLUMN "confirmedAt",
--   DROP COLUMN "canonicalUrl", DROP COLUMN "brand";
