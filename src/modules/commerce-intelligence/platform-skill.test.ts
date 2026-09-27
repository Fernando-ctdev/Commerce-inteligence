import test from "node:test";
import assert from "node:assert/strict";
import { GenerationError } from "./errors";
import { loadCreativeSystem } from "./creative-system";
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

test("creative system entra como versão aditiva @1.3 sem alterar @1.2 nem as projeções", () => {
  const v12 = loadPlatformSkill("tiktok-commerce@1.2");
  assert.ok(!("creativeSystem" in v12), "@1.2 histórico não carrega Creative System");
  const v13 = loadPlatformSkill("tiktok-commerce@1.3");
  if (!("creativeSystem" in v13)) throw new Error("@1.3 deve carregar o Creative System");
  assert.equal(v13.version, "tiktok-commerce@1.3");
  assert.deepEqual(v13.creativeSystem, loadCreativeSystem("tiktok-commerce@1.3"));
  assert.ok(Object.isFrozen(v13.creativeSystem));
  assert.deepEqual(v13.creativeCatalog, v12.creativeCatalog, "catálogo literal permanece preservado");
  assert.deepEqual(v13.allowlistedSlices, v12.allowlistedSlices);
  for (const name of ["planner", "brief"] as const)
    assert.deepEqual(projectPlatformSkillSlice(v13, name), projectPlatformSkillSlice(v12, name), "projeção idêntica: nada novo entra no contexto do provider");
  // Versões sem Creative System (inclusive o default @1.2 do runtime ADR-029) falham GEN-CS-VERSION.
  for (const version of ["tiktok-commerce@1.2", "tiktok-commerce@1.1"]) {
    assert.throws(() => loadCreativeSystem(version), (error: unknown) => (error instanceof GenerationError ? error.code : "") === "GEN-CS-VERSION");
  }
  assert.equal(loadPlatformSkill().version, "tiktok-commerce@1.2", "default do runtime permanece @1.2");
});
