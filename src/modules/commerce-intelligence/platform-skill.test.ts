import test from "node:test";
import assert from "node:assert/strict";
import { CREATIVE_CATALOG, loadPlatformSkill } from "./platform-skill";

test("loads the complete immutable hooks and CTAs catalog in separate groups", () => {
  assert.equal(CREATIVE_CATALOG.version, "1.0.0");
  assert.equal(CREATIVE_CATALOG.hooks.length, 100);
  assert.equal(CREATIVE_CATALOG.ctas.length, 100);
  assert.ok(CREATIVE_CATALOG.hooks.every(({ type, category, source, text }) => type === "hook" && category && source && text));
  assert.ok(CREATIVE_CATALOG.ctas.every(({ type, category, source, text }) => type === "cta" && category && source && text));
  assert.ok(CREATIVE_CATALOG.hooks.every(({ category, categoryScope, source }) => category === (source.toLowerCase().includes("viral") ? "general" : "apparel") && categoryScope === (category === "general" ? "global" : "apparel")));
  assert.ok(CREATIVE_CATALOG.ctas.every(({ categoryScope }) => categoryScope === "global"));
  assert.ok(Object.isFrozen(CREATIVE_CATALOG) && Object.isFrozen(CREATIVE_CATALOG.hooks) && Object.isFrozen(CREATIVE_CATALOG.hooks[0]));
  const skill = loadPlatformSkill();
  assert.deepEqual(skill.creativeCatalog, CREATIVE_CATALOG);
  assert.ok(!("captions" in skill.creativeCatalog) && !("scenes" in skill.creativeCatalog));
});
