-- ADR-019: gate versionada + ContentSceneSet.
-- gateVersion NULL em rows existentes = pré-versionamento (evidência histórica);
-- nenhuma retro-validação de jobs antigos.
ALTER TABLE "brief_validation_reports" ADD COLUMN "gateVersion" INTEGER;

-- Cenas como contrato canônico próprio (1 row por tenant+briefVersionId).
-- Sem dados a migrar: cenas jamais existiram em content_brief_versions (foram
-- removidas pela 20260912010000) e sets novos nascem com os próximos jobs.
CREATE TABLE "content_scene_sets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "briefVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "gatePolicyVersion" INTEGER NOT NULL,
    "backfilled" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_scene_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_scene_sets_tenantId_briefVersionId_key" ON "content_scene_sets"("tenantId", "briefVersionId");

-- CreateIndex
CREATE INDEX "content_scene_sets_tenantId_productId_idx" ON "content_scene_sets"("tenantId", "productId");

-- AddForeignKey
ALTER TABLE "content_scene_sets" ADD CONSTRAINT "content_scene_sets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_scene_sets" ADD CONSTRAINT "content_scene_sets_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "products"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_scene_sets" ADD CONSTRAINT "content_scene_sets_tenantId_jobId_fkey" FOREIGN KEY ("tenantId", "jobId") REFERENCES "commerce_intelligence_jobs"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_scene_sets" ADD CONSTRAINT "content_scene_sets_tenantId_contentId_fkey" FOREIGN KEY ("tenantId", "contentId") REFERENCES "contents"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_scene_sets" ADD CONSTRAINT "content_scene_sets_tenantId_briefVersionId_fkey" FOREIGN KEY ("tenantId", "briefVersionId") REFERENCES "content_brief_versions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
