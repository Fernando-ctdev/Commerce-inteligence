-- Slice 003: durable generation, usage reservation, strategy and brief persistence.
CREATE TYPE "CommerceIntelligenceJobStatus" AS ENUM ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED');
CREATE TYPE "CommerceIntelligenceStage" AS ENUM ('UNDERSTANDING_PRODUCT','IDENTIFYING_AUDIENCES','ANALYZING_PAINS_AND_DESIRES','ANALYZING_OBJECTIONS','BUILDING_STRATEGY','BUILDING_CONTENT_PLAN','GENERATING_BRIEFS','FINALIZING');
CREATE TYPE "GenerationReservationStatus" AS ENUM ('RESERVED','CONFIRMED','RELEASED');

CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_id" ON "products"("tenantId","id");
CREATE TABLE "commerce_intelligence_jobs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "targetContentCount" INTEGER NOT NULL CHECK ("targetContentCount" BETWEEN 1 AND 30),
  "generatedContentsMonth" TEXT NOT NULL,
  "status" "CommerceIntelligenceJobStatus" NOT NULL DEFAULT 'QUEUED',
  "stage" "CommerceIntelligenceStage" NOT NULL DEFAULT 'UNDERSTANDING_PRODUCT',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "leaseOwnerId" TEXT,
  "leaseDeadlineAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
  "publicErrorMessage" TEXT, "internalErrorCode" TEXT,
  "inputSnapshot" JSONB, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commerce_intelligence_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commerce_intelligence_jobs_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "commerce_intelligence_jobs_tenant_id" ON "commerce_intelligence_jobs"("tenantId","id");
CREATE UNIQUE INDEX "commerce_intelligence_jobs_tenant_key" ON "commerce_intelligence_jobs"("tenantId","idempotencyKey");
CREATE UNIQUE INDEX "commerce_intelligence_jobs_active_user" ON "commerce_intelligence_jobs"("userId") WHERE "status" IN ('QUEUED','RUNNING');
CREATE INDEX "commerce_intelligence_jobs_status_next" ON "commerce_intelligence_jobs"("status","nextAttemptAt","leaseDeadlineAt");
CREATE INDEX "commerce_intelligence_jobs_tenant_status" ON "commerce_intelligence_jobs"("tenantId","status");

CREATE TABLE "generation_usage_reservations" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "jobId" TEXT NOT NULL,
  "generatedContentsMonth" TEXT NOT NULL, "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "status" "GenerationReservationStatus" NOT NULL DEFAULT 'RESERVED', "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "generation_usage_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "generation_usage_reservations_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id")
);
CREATE UNIQUE INDEX "generation_usage_reservations_job" ON "generation_usage_reservations"("jobId");
CREATE INDEX "generation_usage_reservations_lookup" ON "generation_usage_reservations"("tenantId","generatedContentsMonth","status");

CREATE TABLE "intelligence_runs" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"productId" TEXT NOT NULL,"engineVersion" TEXT NOT NULL,"platformSkillVersion" TEXT NOT NULL,"metadata" JSONB,"inputMemorySnapshot" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "intelligence_runs_pkey" PRIMARY KEY ("id"),CONSTRAINT "intelligence_runs_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id"));
CREATE UNIQUE INDEX "intelligence_runs_job" ON "intelligence_runs"("jobId");
CREATE TABLE "product_understandings" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"productId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"payload" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "product_understandings_pkey" PRIMARY KEY ("id"),CONSTRAINT "product_understandings_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id"));
CREATE UNIQUE INDEX "product_understandings_job" ON "product_understandings"("tenantId","jobId");

CREATE TABLE "product_strategies" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"productId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"status" TEXT NOT NULL DEFAULT 'ACTIVE',"platformId" TEXT NOT NULL,"platformSkillVersion" TEXT NOT NULL,"payload" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "product_strategies_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "product_strategies_tenant_id" ON "product_strategies"("tenantId","id");
CREATE UNIQUE INDEX "product_strategies_active_product" ON "product_strategies"("tenantId","productId") WHERE "status"='ACTIVE';
CREATE TABLE "content_plans" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"productId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"strategyId" TEXT NOT NULL,"strategyVersion" INTEGER NOT NULL,"targetContentCount" INTEGER NOT NULL CHECK ("targetContentCount" BETWEEN 1 AND 30),"platformId" TEXT NOT NULL,"platformSkillVersion" TEXT NOT NULL,"payload" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "content_plans_pkey" PRIMARY KEY ("id"),CONSTRAINT "content_plans_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id"),CONSTRAINT "content_plans_strategy_fkey" FOREIGN KEY ("tenantId","strategyId") REFERENCES "product_strategies"("tenantId","id"));
CREATE UNIQUE INDEX "content_plans_tenant_id" ON "content_plans"("tenantId","id");
CREATE UNIQUE INDEX "content_plans_job" ON "content_plans"("tenantId","jobId");
CREATE TABLE "content_opportunities" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"productId" TEXT NOT NULL,"planId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"position" INTEGER NOT NULL,"commercialObjective" TEXT NOT NULL,"angle" TEXT NOT NULL,"coreMessage" TEXT NOT NULL,"hookMechanism" TEXT NOT NULL,"noveltyTargets" JSONB NOT NULL,"payload" JSONB NOT NULL,CONSTRAINT "content_opportunities_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "content_opportunities_tenant_id" ON "content_opportunities"("tenantId","id");
CREATE UNIQUE INDEX "content_opportunities_plan_position" ON "content_opportunities"("tenantId","planId","position");
CREATE TABLE "contents" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"productId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"planId" TEXT NOT NULL,"opportunityId" TEXT,"position" INTEGER NOT NULL,"status" TEXT NOT NULL DEFAULT 'DRAFT',"currentBriefVersionId" TEXT,"approvedBriefVersionId" TEXT,"payload" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "contents_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "contents_tenant_id" ON "contents"("tenantId","id");
CREATE UNIQUE INDEX "contents_job_position" ON "contents"("tenantId","jobId","position");
CREATE TABLE "content_brief_versions" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"productId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"contentId" TEXT NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"payload" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "content_brief_versions_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "content_brief_versions_tenant_id" ON "content_brief_versions"("tenantId","id");
CREATE UNIQUE INDEX "content_brief_versions_content_version" ON "content_brief_versions"("tenantId","contentId","version");
CREATE TABLE "brief_validation_reports" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"productId" TEXT NOT NULL,"contentId" TEXT NOT NULL,"briefVersionId" TEXT NOT NULL,"briefId" TEXT NOT NULL,"factualStatus" TEXT NOT NULL,"structuralStatus" TEXT NOT NULL,"platformStatus" TEXT NOT NULL,"varietyStatus" TEXT NOT NULL,"decision" TEXT NOT NULL,"issues" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "brief_validation_reports_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "brief_validation_reports_brief" ON "brief_validation_reports"("briefId");
CREATE TABLE "product_memory_snapshots" ("id" TEXT NOT NULL,"tenantId" TEXT NOT NULL,"productId" TEXT NOT NULL,"sourceJobId" TEXT NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"signals" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "product_memory_snapshots_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "product_memory_snapshots_source" ON "product_memory_snapshots"("tenantId","sourceJobId");
CREATE UNIQUE INDEX IF NOT EXISTS "product_strategies_tenant_id" ON "product_strategies"("tenantId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "content_plans_tenant_id" ON "content_plans"("tenantId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "content_opportunities_tenant_id" ON "content_opportunities"("tenantId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "contents_tenant_id" ON "contents"("tenantId","id");
CREATE UNIQUE INDEX IF NOT EXISTS "content_brief_versions_tenant_id" ON "content_brief_versions"("tenantId","id");
ALTER TABLE "intelligence_runs" ADD CONSTRAINT "intelligence_runs_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "product_understandings" ADD CONSTRAINT "product_understandings_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "product_strategies" ADD CONSTRAINT "product_strategies_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "product_strategies" ADD CONSTRAINT "product_strategies_tenant_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id");
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_tenant_plan_fkey" FOREIGN KEY ("tenantId","planId") REFERENCES "content_plans"("tenantId","id");
ALTER TABLE "contents" ADD CONSTRAINT "contents_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "contents" ADD CONSTRAINT "contents_tenant_plan_fkey" FOREIGN KEY ("tenantId","planId") REFERENCES "content_plans"("tenantId","id");
ALTER TABLE "content_brief_versions" ADD CONSTRAINT "content_brief_versions_tenant_content_fkey" FOREIGN KEY ("tenantId","contentId") REFERENCES "contents"("tenantId","id");
ALTER TABLE "brief_validation_reports" ADD CONSTRAINT "brief_validation_reports_tenant_content_fkey" FOREIGN KEY ("tenantId","contentId") REFERENCES "contents"("tenantId","id");
ALTER TABLE "brief_validation_reports" ADD CONSTRAINT "brief_validation_reports_tenant_brief_fkey" FOREIGN KEY ("tenantId","briefVersionId") REFERENCES "content_brief_versions"("tenantId","id");
ALTER TABLE "product_memory_snapshots" ADD CONSTRAINT "product_memory_snapshots_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "product_memory_snapshots" ADD CONSTRAINT "product_memory_snapshots_tenant_job_fkey" FOREIGN KEY ("tenantId","sourceJobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id");
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "content_opportunities" ADD CONSTRAINT "content_opportunities_tenant_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id");
ALTER TABLE "contents" ADD CONSTRAINT "contents_tenant_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id");
ALTER TABLE "contents" ADD CONSTRAINT "contents_tenant_opportunity_fkey" FOREIGN KEY ("tenantId","opportunityId") REFERENCES "content_opportunities"("tenantId","id");
ALTER TABLE "content_brief_versions" ADD CONSTRAINT "content_brief_versions_tenant_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id");
ALTER TABLE "brief_validation_reports" ADD CONSTRAINT "brief_validation_reports_tenant_job_fkey" FOREIGN KEY ("tenantId","jobId") REFERENCES "commerce_intelligence_jobs"("tenantId","id");
ALTER TABLE "contents" ADD CONSTRAINT "contents_current_brief_fkey" FOREIGN KEY ("tenantId","currentBriefVersionId") REFERENCES "content_brief_versions"("tenantId","id");
ALTER TABLE "content_brief_versions" ADD CONSTRAINT "content_brief_versions_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
ALTER TABLE "brief_validation_reports" ADD CONSTRAINT "brief_validation_reports_tenant_product_fkey" FOREIGN KEY ("tenantId","productId") REFERENCES "products"("tenantId","id");
