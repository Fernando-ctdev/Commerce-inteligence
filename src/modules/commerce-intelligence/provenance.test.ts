// Proveniência do gate arquitetural (P1-1): colunas da migration aditiva, integridade e reversibilidade.
// Skip automático se DATABASE_URL estiver inacessível, como nos demais testes de integração.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let dbUp = false;

test("setup: banco acessível", async (t) => {
  try { await prisma.$queryRaw`select 1`; dbUp = true; } catch { t.skip("DATABASE_URL inacessível"); }
});

test("brief_validation_reports ganhou claimType/evidenceRefs nullable sem backfill", async (t) => {
  if (!dbUp) return t.skip();
  const cols = await prisma.$queryRaw<Array<{ column: string; nullable: string }>>`
    SELECT column_name AS column, is_nullable AS nullable FROM information_schema.columns
    WHERE table_name = 'brief_validation_reports' AND column_name IN ('claimType','evidenceRefs')`;
  assert.equal(cols.length, 2, "migration aditiva aplicou as duas colunas");
  assert.ok(cols.every((col) => col.nullable === "YES"), "nullable: rollback por DROP COLUMN sem perda");
  // Invariante da migration aditiva: relatórios ANTERIORES à migration permanecem NULL (nenhum backfill inventado).
  // Relatórios posteriores são populados pelo worker com proveniência real do gate; contar a tabela inteira
  // incluiria esses registros legítimos (causa da falha 17 !== 0 no gate do Review).
  const mig = await prisma.$queryRaw<Array<{ at: Date | null }>>`
    SELECT finished_at AS at FROM _prisma_migrations
    WHERE migration_name = '20260903120000_slice003_gate_provenance'`;
  assert.equal(mig.length, 1, "migration do gate registrada em _prisma_migrations");
  assert.ok(mig[0].at instanceof Date, "migration concluída (finished_at presente)");
  const appliedAt = mig[0].at as Date;
  const legacy = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM brief_validation_reports
    WHERE "createdAt" < ${appliedAt} AND ("claimType" IS NOT NULL OR "evidenceRefs" IS NOT NULL)`;
  assert.equal(Number(legacy[0].n), 0, "nenhum valor inventado por backfill em relatórios anteriores à migration");
});

test("contents.opportunityId mantém FK composta tenant-scoped íntegra", async (t) => {
  if (!dbUp) return t.skip();
  const fk = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT conname AS name FROM pg_constraint WHERE conrelid = 'contents'::regclass AND conname = 'contents_tenant_opportunity_fkey'`;
  assert.equal(fk.length, 1, "FK tenant+opportunityId presente (sem vínculo órfão possível)");
});

test.after(() => prisma.$disconnect());
