-- Slice 003 — Generation durável, intenção, quota mensal e resultado estruturado.
-- Sem backfill: não existem resultados de Generation anteriores neste repositório.

CREATE TABLE "generation_runs" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "productId"         TEXT NOT NULL,
  "operation"         TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'queued',
  "quantity"          INTEGER NOT NULL,
  "objective"         TEXT,
  "contractVersion"   TEXT NOT NULL DEFAULT '1',
  "inputSnapshot"     JSONB NOT NULL,
  "inputSnapshotHash" TEXT NOT NULL,
  "historySnapshot"   JSONB NOT NULL,
  "attemptCount"      INTEGER NOT NULL DEFAULT 0,
  "leaseToken"        TEXT,
  "leaseExpiresAt"    TIMESTAMP(3),
  "nextAttemptAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "queuedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"         TIMESTAMP(3),
  "finishedAt"        TIMESTAMP(3),
  "lastError"         TEXT,
  "previousRunId"     TEXT,
  "engineVersion"     TEXT,
  "provider"          TEXT,
  "model"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_runs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_runs_previousRunId_fkey" FOREIGN KEY ("previousRunId") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "generation_runs_status_nextAttemptAt_idx" ON "generation_runs"("status", "nextAttemptAt");
CREATE INDEX "generation_runs_status_leaseExpiresAt_idx" ON "generation_runs"("status", "leaseExpiresAt");
CREATE INDEX "generation_runs_tenantId_productId_idx" ON "generation_runs"("tenantId", "productId");
CREATE INDEX "generation_runs_tenantId_createdAt_idx" ON "generation_runs"("tenantId", "createdAt");

CREATE TABLE "generation_intents" (
  "id"                TEXT NOT NULL PRIMARY KEY,
  "tenantId"          TEXT NOT NULL,
  "idempotencyKey"    TEXT NOT NULL,
  "intentFingerprint" TEXT NOT NULL,
  "inputSnapshotHash" TEXT NOT NULL,
  "generationRunId"   TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generation_intents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_intents_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "generation_intents_tenantId_idempotencyKey_key" ON "generation_intents"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "generation_intents_generationRunId_key" ON "generation_intents"("generationRunId");
CREATE INDEX "generation_intents_expiresAt_idx" ON "generation_intents"("expiresAt");
CREATE INDEX "generation_intents_tenantId_idx" ON "generation_intents"("tenantId");

CREATE TABLE "generation_usage_reservations" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "generationRunId" TEXT NOT NULL,
  "periodStart"     TIMESTAMP(3) NOT NULL,
  "quantity"        INTEGER NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'reserved',
  "reason"          TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt"      TIMESTAMP(3),
  "confirmedAt"     TIMESTAMP(3),
  CONSTRAINT "generation_usage_reservations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "generation_usage_reservations_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "generation_usage_reservations_generationRunId_key" ON "generation_usage_reservations"("generationRunId");
CREATE INDEX "generation_usage_reservations_tenantId_periodStart_status_idx" ON "generation_usage_reservations"("tenantId", "periodStart", "status");

CREATE TABLE "strategies" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "productId"       TEXT NOT NULL,
  "generationRunId" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL DEFAULT '1',
  "payload"         JSONB NOT NULL,
  "provenance"      JSONB NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "strategies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "strategies_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "strategies_generationRunId_key" ON "strategies"("generationRunId");
CREATE INDEX "strategies_tenantId_productId_idx" ON "strategies"("tenantId", "productId");

CREATE TABLE "plans" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "productId"       TEXT NOT NULL,
  "generationRunId" TEXT NOT NULL,
  "strategyId"      TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL DEFAULT '1',
  "payload"         JSONB NOT NULL,
  "provenance"      JSONB NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plans_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plans_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plans_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "plans_generationRunId_key" ON "plans"("generationRunId");
CREATE UNIQUE INDEX "plans_strategyId_key" ON "plans"("strategyId");
CREATE INDEX "plans_tenantId_productId_idx" ON "plans"("tenantId", "productId");

CREATE TABLE "contents" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "productId"       TEXT NOT NULL,
  "generationRunId" TEXT NOT NULL,
  "strategyId"      TEXT NOT NULL,
  "planId"          TEXT NOT NULL,
  "position"        INTEGER NOT NULL,
  "audienceId"      TEXT NOT NULL,
  "painId"          TEXT NOT NULL,
  "desireId"        TEXT,
  "benefitId"       TEXT,
  "objectionId"     TEXT,
  "angleId"         TEXT NOT NULL,
  "hook"            TEXT NOT NULL,
  "normalizedHook"  TEXT NOT NULL,
  "structure"       TEXT NOT NULL,
  "script"          TEXT NOT NULL,
  "scenes"          JSONB NOT NULL,
  "cta"             TEXT NOT NULL,
  "explanation"     TEXT NOT NULL,
  "provenance"      JSONB NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contents_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contents_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contents_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contents_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "contents_desire_or_benefit_ck" CHECK ("desireId" IS NOT NULL OR "benefitId" IS NOT NULL)
);
CREATE UNIQUE INDEX "contents_generationRunId_position_key" ON "contents"("generationRunId", "position");
CREATE UNIQUE INDEX "contents_generationRunId_normalizedHook_key" ON "contents"("generationRunId", "normalizedHook");
CREATE INDEX "contents_tenantId_productId_idx" ON "contents"("tenantId", "productId");

-- Heartbeat do worker persistido: processo separado do HTTP, memória de módulo não é observável.
CREATE TABLE "generation_worker_state" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);

-- No máximo uma run ativa (queued/running) por Product, garantida pelo banco sob chaves concorrentes.
-- Compatível com retry do creator: run terminal sai do índice parcial e a nova run pode nascer.
CREATE UNIQUE INDEX "generation_runs_product_active_key" ON "generation_runs"("productId") WHERE "status" IN ('queued', 'running');

-- Integridade Tenant/Product/Run/Strategy/Plan/Content: FKs compostas garantem que o par
-- (entidade, tenantId) referencie sempre a entidade do mesmo Tenant (não expressável no Prisma).
CREATE UNIQUE INDEX "products_id_tenantId_key" ON "products"("id", "tenantId");
CREATE UNIQUE INDEX "generation_runs_id_tenantId_key" ON "generation_runs"("id", "tenantId");
CREATE UNIQUE INDEX "strategies_id_tenantId_key" ON "strategies"("id", "tenantId");
CREATE UNIQUE INDEX "plans_id_tenantId_key" ON "plans"("id", "tenantId");
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_product_tenant_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "products"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_intents" ADD CONSTRAINT "generation_intents_run_tenant_fkey" FOREIGN KEY ("generationRunId", "tenantId") REFERENCES "generation_runs"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_usage_reservations" ADD CONSTRAINT "generation_usage_reservations_run_tenant_fkey" FOREIGN KEY ("generationRunId", "tenantId") REFERENCES "generation_runs"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_run_tenant_fkey" FOREIGN KEY ("generationRunId", "tenantId") REFERENCES "generation_runs"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_product_tenant_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "products"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plans" ADD CONSTRAINT "plans_run_tenant_fkey" FOREIGN KEY ("generationRunId", "tenantId") REFERENCES "generation_runs"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plans" ADD CONSTRAINT "plans_strategy_tenant_fkey" FOREIGN KEY ("strategyId", "tenantId") REFERENCES "strategies"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plans" ADD CONSTRAINT "plans_product_tenant_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "products"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_run_tenant_fkey" FOREIGN KEY ("generationRunId", "tenantId") REFERENCES "generation_runs"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_strategy_tenant_fkey" FOREIGN KEY ("strategyId", "tenantId") REFERENCES "strategies"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_plan_tenant_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "plans"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_product_tenant_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "products"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Down (reversível em cópia; não remover objetos dos Slices 001/002):
-- ALTER TABLE "contents" DROP CONSTRAINT IF EXISTS "contents_product_tenant_fkey"; (idem demais FKs compostas)
-- DROP INDEX IF EXISTS "plans_id_tenantId_key"; (idem demais índices compostos e "generation_runs_product_active_key")
-- DROP TABLE "generation_worker_state";
-- DROP TABLE "contents";
-- DROP TABLE "plans";
-- DROP TABLE "strategies";
-- DROP TABLE "generation_usage_reservations";
-- DROP TABLE "generation_intents";
-- DROP TABLE "generation_runs";
