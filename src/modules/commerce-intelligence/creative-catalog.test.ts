// Catálogo literal criativo — corpus para testes/eval e benchmark (ADR-033 §7).
// NÃO integra a PlatformSkill do runtime nem governa gates default; o runtime
// ativo é a Skill única @1.3 com Creative System. Fluxo
// load → validate → freeze → expose, fail-closed com GEN-SKILL.
import test from "node:test";
import assert from "node:assert/strict";
import { CREATIVE_CATALOG, validateCreativeCatalog } from "./creative-catalog";

test("loads all catalog hooks and CTAs immutably from the corpus", () => {
  assert.equal(CREATIVE_CATALOG.version, "1.1.0");
  assert.equal(CREATIVE_CATALOG.hooks.length, 200);
  assert.equal(CREATIVE_CATALOG.ctas.length, 100);
  assert.equal(CREATIVE_CATALOG.hooks.filter(({ category }) => category === "general").length, 100);
  assert.equal(CREATIVE_CATALOG.hooks.filter(({ category }) => category === "apparel").length, 100);
  assert.ok(CREATIVE_CATALOG.hooks.every(({ type, category, source, text }) => type === "hook" && category && source && text));
  assert.ok(CREATIVE_CATALOG.ctas.every(({ type, category, source, text }) => type === "cta" && category && source && text));
  assert.ok(CREATIVE_CATALOG.hooks.every(({ category, categoryScope }) => categoryScope === (category === "general" ? "global" : "apparel")));
  assert.ok(CREATIVE_CATALOG.ctas.every(({ categoryScope }) => categoryScope === "global"));
  assert.ok(Object.isFrozen(CREATIVE_CATALOG) && Object.isFrozen(CREATIVE_CATALOG.hooks) && Object.isFrozen(CREATIVE_CATALOG.hooks[0]));
  assert.equal(JSON.stringify(Object.keys(CREATIVE_CATALOG).sort()), '["ctas","hooks","version"]');
});

test("catalog boundary rejects invalid shape, empty fields, duplicate IDs and empty items", () => {
  const pattern = { id: "h1", type: "hook", category: "general", categoryScope: "global", source: "source.pdf", text: "A short hook" };
  assert.equal(validateCreativeCatalog({ version: "1", items: [pattern] }).items.length, 1);
  for (const invalid of [
    {},
    { version: " ", items: [pattern] },
    { version: "1", items: [] },
    { version: "1", items: [{ ...pattern, type: "scene" }] },
    { version: "1", items: [{ ...pattern, text: " " }] },
    { version: "1", items: [pattern, pattern] },
  ]) assert.throws(() => validateCreativeCatalog(invalid), (error: unknown) => (error as { code?: string }).code === "GEN-SKILL");
});
