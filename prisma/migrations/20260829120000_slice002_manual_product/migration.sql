-- Slice 002 — cadastro manual de Product (PLAN §3.2): alteração aditiva, sem apagar dados.
-- generationConstraints guarda apenas {creatorPresence, constraints?} da primeira geração;
-- version torna a resposta de criação/replay determinística; createIdempotencyKey associa a
-- submissão ao Tenant (índice único composto permite múltiplas linhas com chave NULL —
-- registros legados do caminho importado permanecem sem colisão).
ALTER TABLE "products" ADD COLUMN "generationConstraints" JSONB;
ALTER TABLE "products" ADD COLUMN "createIdempotencyKey" TEXT;
ALTER TABLE "products" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Prisma @@unique([tenantId, createIdempotencyKey])
CREATE UNIQUE INDEX "products_tenantId_createIdempotencyKey_key" ON "products"("tenantId", "createIdempotencyKey");
