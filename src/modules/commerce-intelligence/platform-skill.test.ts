import test from "node:test";
import assert from "node:assert/strict";
import { CREATIVE_CATALOG, loadPlatformSkill, PLATFORM_SKILLS, projectPlatformSkillSlice, validateCreativeCatalog } from "./platform-skill";

test("loads all catalog hooks and CTAs immutably and by skill version", () => {
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
  const skill = loadPlatformSkill();
  assert.deepEqual(skill.creativeCatalog, CREATIVE_CATALOG);
  assert.equal(skill.version, "tiktok-commerce@1.2");
  assert.equal(loadPlatformSkill("tiktok-commerce@1.2"), skill);
  assert.equal(PLATFORM_SKILLS["tiktok-commerce@1.2"], skill);
  assert.ok(skill.operationalRepertoire.proofPatterns.includes("antes e depois apenas quando resultado factual observavel"));
  assert.throws(() => loadPlatformSkill("tiktok-commerce@1.1"), (error: unknown) => (error as { code?: string }).code === "GEN-SKILL");
  assert.equal(JSON.stringify(Object.keys(skill.creativeCatalog).sort()), '["ctas","hooks","version"]');
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

test("skill slices resolve only explicit operational repertoire paths", () => {
  const skill = loadPlatformSkill();
  for (const name of ["planner", "brief"] as const) {
    const slice = projectPlatformSkillSlice(skill, name);
    assert.deepEqual(Object.keys(slice).sort(), ["executionRules", "narrativePatterns", "principles", "proofPatterns"]);
    assert.ok(!("hookMechanisms" in slice) && !("ctaStrategies" in slice));
  }
  assert.deepEqual(skill.allowlistedSlices.brief, ["principles", "operationalRepertoire.executionRules", "operationalRepertoire.narrativePatterns", "operationalRepertoire.proofPatterns"]);
});
