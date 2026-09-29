import test from "node:test";
import assert from "node:assert/strict";
import { GenerationError } from "./errors";
import { loadCreativeSystem } from "./creative-system";
import { loadPlatformSkill, PLATFORM_SKILLS, projectPlatformSkillSlice } from "./platform-skill";

test("single runtime Skill @1.3 loads the platform skill without the literal corpus", () => {
  const skill = loadPlatformSkill();
  assert.equal(skill.version, "tiktok-commerce@1.3");
  assert.equal(loadPlatformSkill("tiktok-commerce@1.3"), skill);
  assert.equal(PLATFORM_SKILLS["tiktok-commerce@1.3"], skill);
  assert.deepEqual(Object.keys(PLATFORM_SKILLS), ["tiktok-commerce@1.3"], "Skill única do runtime (ADR-033 §7)");
  assert.ok(!("creativeCatalog" in skill), "PlatformSkill não expõe o catálogo literal (ADR-033 §7)");
  assert.ok(skill.operationalRepertoire.proofPatterns.includes("antes e depois apenas quando resultado factual observavel"));
  // Clean cut: nenhuma Skill @1.2/@1.1 é carregável no runtime.
  for (const legacy of ["tiktok-commerce@1.2", "tiktok-commerce@1.1"])
    assert.throws(() => loadPlatformSkill(legacy), (error: unknown) => (error as { code?: string }).code === "GEN-SKILL");
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

test("Skill única @1.3 carrega o Creative System; @1.2 não existe como loader, alias ou fallback (ADR-033 §7)", () => {
  const skill = loadPlatformSkill();
  assert.equal(skill.version, "tiktok-commerce@1.3");
  // Acesso direto prova o tipo: a Skill runtime expõe creativeSystem tipado.
  assert.deepEqual(skill.creativeSystem, loadCreativeSystem("tiktok-commerce@1.3"));
  assert.ok(Object.isFrozen(skill.creativeSystem));
  for (const name of ["planner", "brief"] as const) {
    const slice = projectPlatformSkillSlice(skill, name);
    assert.deepEqual(Object.keys(slice).sort(), ["executionRules", "narrativePatterns", "principles", "proofPatterns"]);
  }
  // Creative System permanece indisponível para versões que não o declaram.
  assert.throws(() => loadCreativeSystem("tiktok-commerce@1.2"), (error: unknown) => (error instanceof GenerationError ? error.code : "") === "GEN-CS-VERSION");
  assert.equal(PLATFORM_SKILLS["tiktok-commerce@1.2" as keyof typeof PLATFORM_SKILLS], undefined);
});
