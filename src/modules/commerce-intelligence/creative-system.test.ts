// Fundação aditiva do Creative System (ADR-033): load → validate → freeze → expose,
// fail-closed com códigos estáveis GEN-CS-*. Não ativa nada no runtime ADR-029.
import test from "node:test";
import assert from "node:assert/strict";
import { GenerationError } from "./errors";
import {
  assertEligibleFormat,
  assertFreeCompositionCooccurrence,
  loadCreativeSystem,
  primitiveExists,
  recipeById,
  resolveBlueprint,
  validateCreativeSystem,
  type CreativeSystemErrorCode,
} from "./creative-system";

const errorCode = (error: unknown): string => (error instanceof GenerationError ? error.code : "");

test("creative system só carrega para versões de Skill que o declaram", () => {
  const cs = loadCreativeSystem("tiktok-commerce@1.3");
  assert.equal(cs.skillVersion, "tiktok-commerce@1.3");
  for (const version of ["tiktok-commerce@1.2", "tiktok-commerce@1.1", "desconhecida", ""]) {
    assert.throws(() => loadCreativeSystem(version), (error: unknown) => errorCode(error) === "GEN-CS-VERSION");
  }
  assert.equal(loadCreativeSystem("tiktok-commerce@1.3"), cs, "load é idempotente: mesma instância congelada");
});

test("taxonomia é enum fechado por dimensão e recipes referenciam apenas primitives existentes", () => {
  const cs = loadCreativeSystem("tiktok-commerce@1.3");
  assert.equal(cs.attentionMechanisms.length, 10);
  assert.equal(cs.psychologicalEffects.length, 10);
  assert.equal(cs.formats.length, 11);
  assert.equal(cs.narrativeMoves.length, 11);
  assert.equal(cs.productRoles.length, 15);
  assert.equal(cs.recipes.length, 12);
  assert.ok(cs.recipes.every(({ id, attentionMechanisms, psychologicalEffects, formats, narrativeMoves, productRoles }) => {
    const resolvable = (ids: readonly string[], dimension: Parameters<typeof primitiveExists>[1]) =>
      ids.length > 0 && ids.every((id) => primitiveExists(cs, dimension, id));
    return (
      id.trim() !== "" &&
      resolvable(attentionMechanisms, "attention") &&
      resolvable(psychologicalEffects, "psychologicalEffect") &&
      resolvable(formats, "format") &&
      resolvable(narrativeMoves, "narrativeMove") &&
      resolvable(productRoles, "productRole")
    );
  }));
});

test("IDs de primitive resolvem por dimensão; mesmo ID em dimensões distintas é válido", () => {
  const cs = loadCreativeSystem("tiktok-commerce@1.3");
  assert.equal(primitiveExists(cs, "attention", "curiosity"), true);
  assert.equal(primitiveExists(cs, "psychologicalEffect", "curiosity"), true);
  assert.equal(primitiveExists(cs, "attention", "inexistente"), false);
  assert.equal(primitiveExists(cs, "format", "pov"), true);
  assert.equal(primitiveExists(cs, "productRole", "solution"), true);
});

test("lookup de recipe por ID retorna a recipe ou undefined", () => {
  const cs = loadCreativeSystem("tiktok-commerce@1.3");
  const recipe = recipeById(cs, "failure-humor-resolution");
  assert.ok(recipe);
  assert.deepEqual(recipe!.narrativeMoves, ["setup", "failure", "reaction", "product_entry", "resolution", "payoff"]);
  assert.equal(recipeById(cs, "recipe-inexistente"), undefined);
});

test("sistema carregado é profundamente congelado", () => {
  const cs = loadCreativeSystem("tiktok-commerce@1.3");
  assert.ok(Object.isFrozen(cs));
  assert.ok(Object.isFrozen(cs.attentionMechanisms));
  assert.ok(Object.isFrozen(cs.recipes) && Object.isFrozen(cs.recipes[0]));
  assert.ok(Object.isFrozen(cs.recipes[0]!.narrativeMoves));
});

test("validateCreativeSystem rejeita forma inválida com GEN-CS-SCHEMA", () => {
  const valid = {
    attentionMechanisms: ["failure"],
    psychologicalEffects: ["humor"],
    formats: ["pov"],
    narrativeMoves: ["setup"],
    productRoles: ["solution"],
    recipes: [],
    compatibility: { formatsByProductRole: { solution: ["pov"] } },
  };
  assert.equal(validateCreativeSystem(valid).recipes.length, 0);
  for (const invalid of [
    null,
    {},
    { ...valid, attentionMechanisms: [] },
    { ...valid, attentionMechanisms: [""] },
    { ...valid, attentionMechanisms: ["failure", "failure"] },
    { ...valid, attentionMechanisms: "failure" },
    { ...valid, formats: ["pov", "pov"] },
    { ...valid, recipes: [{ id: "", attentionMechanisms: ["failure"], psychologicalEffects: ["humor"], formats: ["pov"], narrativeMoves: ["setup"], productRoles: ["solution"] }] },
    { ...valid, recipes: [{ id: "r", attentionMechanisms: [], psychologicalEffects: ["humor"], formats: ["pov"], narrativeMoves: ["setup"], productRoles: ["solution"] }] },
    { ...valid, recipes: [{ id: "r", attentionMechanisms: ["failure", "failure"], psychologicalEffects: ["humor"], formats: ["pov"], narrativeMoves: ["setup"], productRoles: ["solution"] }] },
  ]) {
    assert.throws(() => validateCreativeSystem(invalid), (error: unknown) => errorCode(error) === "GEN-CS-SCHEMA", JSON.stringify(invalid));
  }
});

test("validateCreativeSystem rejeita referência irresolvível com GEN-CS-REF", () => {
  const base = {
    attentionMechanisms: ["failure"],
    psychologicalEffects: ["humor"],
    formats: ["pov"],
    narrativeMoves: ["setup"],
    productRoles: ["solution"],
    compatibility: { formatsByProductRole: { solution: ["pov"] } },
  };
  for (const invalid of [
    { ...base, recipes: [{ id: "r", attentionMechanisms: ["inexistente"], psychologicalEffects: ["humor"], formats: ["pov"], narrativeMoves: ["setup"], productRoles: ["solution"] }] },
    { ...base, recipes: [{ id: "r", attentionMechanisms: ["failure"], psychologicalEffects: ["humor"], formats: ["pov"], narrativeMoves: ["setup"], productRoles: ["role-fantasma"] }] },
  ]) {
    assert.throws(() => validateCreativeSystem(invalid), (error: unknown) => errorCode(error) === "GEN-CS-REF");
  }
});

test("compatibilidade é dado versionado: declarada, congelada e referenciável", () => {
  const cs = loadCreativeSystem("tiktok-commerce@1.3");
  assert.ok(Object.isFrozen(cs.compatibility) && Object.isFrozen(cs.compatibility.formatsByProductRole));
  assert.ok(Object.isFrozen(cs.compatibility.formatsByProductRole.proof));
  assert.ok(cs.compatibility.formatsByProductRole.proof!.includes("demonstration"));
  assert.ok(!cs.compatibility.formatsByProductRole.proof!.includes("unboxing"), "par existente mas incompatível não pode estar declarado");
  for (const [role, formats] of Object.entries(cs.compatibility.formatsByProductRole)) {
    assert.ok(primitiveExists(cs, "productRole", role), `papel ${role} deve existir na taxonomia`);
    assert.ok(formats.every((format) => primitiveExists(cs, "format", format)), `formato de ${role} deve existir na taxonomia`);
  }
});

test("validateCreativeSystem rejeita compatibilidade inválida", () => {
  const base = {
    attentionMechanisms: ["failure"],
    psychologicalEffects: ["humor"],
    formats: ["pov", "unboxing"],
    narrativeMoves: ["setup"],
    productRoles: ["solution", "proof"],
    recipes: [],
  };
  for (const invalid of [
    { ...base, compatibility: null },
    { ...base, compatibility: {} },
    { ...base, compatibility: { formatsByProductRole: [] } },
    { ...base, compatibility: { formatsByProductRole: { solution: [] } } },
    { ...base, compatibility: { formatsByProductRole: { solution: "pov" } } },
    { ...base, compatibility: { formatsByProductRole: { role_fantasma: ["pov"] } } },
    { ...base, compatibility: { formatsByProductRole: { solution: ["formato_fantasma"] } } },
  ]) {
    const expected = JSON.stringify(invalid).includes("fantasma") ? "GEN-CS-REF" : "GEN-CS-SCHEMA";
    assert.throws(() => validateCreativeSystem(invalid), (error: unknown) => errorCode(error) === expected, expected);
  }
});

test("load exige produto cartesiano formats×productRoles de cada recipe no mapa", () => {
  const cs = loadCreativeSystem("tiktok-commerce@1.3");
  // Seed coerente: todo cruzamento de toda recipe está declarado no mapa.
  for (const recipe of cs.recipes)
    for (const format of recipe.formats)
      for (const role of recipe.productRoles)
        assert.ok(cs.compatibility.formatsByProductRole[role]!.includes(format), `${format}×${role} ausente do mapa`);
  // Recipe com cruzamento fora do mapa falha o load com GEN-CS-COMPAT.
  const base = {
    attentionMechanisms: ["failure"],
    psychologicalEffects: ["humor"],
    formats: ["pov", "demonstration"],
    narrativeMoves: ["setup"],
    productRoles: ["solution", "proof"],
    compatibility: {
      formatsByProductRole: {
        solution: ["pov", "demonstration"],
        proof: ["demonstration"],
      },
    },
    recipes: [{
      id: "r",
      attentionMechanisms: ["failure"],
      psychologicalEffects: ["humor"],
      formats: ["pov", "demonstration"],
      narrativeMoves: ["setup"],
      productRoles: ["solution", "proof"],
    }],
  };
  assert.throws(() => validateCreativeSystem(base), (error: unknown) => errorCode(error) === "GEN-CS-COMPAT");
  // Par declarado no mapa: load passa sem alterar a recipe.
  const coherent = validateCreativeSystem({
    ...base,
    compatibility: { formatsByProductRole: { solution: ["pov", "demonstration"], proof: ["pov", "demonstration"] } },
  });
  assert.equal(coherent.recipes[0]!.id, "r");
});

const cs = () => loadCreativeSystem("tiktok-commerce@1.3");

const validRecipeBacked = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  recipeId: "failure-humor-resolution",
  attentionMechanisms: ["failure", "pattern_interrupt"],
  psychologicalEffects: ["humor", "curiosity"],
  format: "sketch",
  narrativeMoves: ["setup", "failure", "reaction", "product_entry", "resolution", "payoff"],
  productRole: "solution",
  ...over,
});

test("resolveBlueprint aceita recipe-backed coerente com a recipe", () => {
  const bp = resolveBlueprint(cs(), validRecipeBacked());
  assert.equal(bp.recipeId, "failure-humor-resolution");
  assert.deepEqual(bp.narrativeMoves, ["setup", "failure", "reaction", "product_entry", "resolution", "payoff"]);
});

test("resolveBlueprint aceita composição livre sem recipeId com primitives válidas", () => {
  const bp = resolveBlueprint(cs(), {
    attentionMechanisms: ["visual_hook"],
    psychologicalEffects: ["aspiration"],
    format: "showcase",
    narrativeMoves: ["setup", "reveal", "payoff"],
    productRole: "aspirational_object",
  });
  assert.equal(bp.recipeId, undefined);
  assert.deepEqual(bp.attentionMechanisms, ["visual_hook"]);
});

test("coocorrência pairwise: todo par entre dimensões coocorrendo em recipe é admitido (ADR-033 §4)", () => {
  // Constraint set da recipe pov-identification-payoff sem recipeId: todos os
  // pares entre dimensões coocorrem nela, então a composição é válida.
  const bp: import("./creative-system").CreativeBlueprint = {
    attentionMechanisms: ["curiosity"],
    psychologicalEffects: ["identification", "desire"],
    format: "pov",
    narrativeMoves: ["setup", "product_entry", "payoff"],
    productRole: "solution",
  };
  assert.doesNotThrow(() => assertFreeCompositionCooccurrence(cs(), bp));
});

test("coocorrência pairwise: par entre dimensões sem coocorrência em recipe falha GEN-CS-COMPAT (ADR-033 §4)", () => {
  // format×papel (storytelling×solution) está no mapa explícito e os demais
  // pares coocorrem — exceto failure×storytelling (att×fmt), que não ocorre
  // conjuntamente em nenhuma recipe desta versão. Par sem coocorrência falha
  // GEN-CS-COMPAT, mesmo com formato×papel válido.
  assert.throws(
    () => assertFreeCompositionCooccurrence(cs(), {
      attentionMechanisms: ["failure"],
      psychologicalEffects: ["identification"],
      format: "storytelling",
      narrativeMoves: ["setup"],
      productRole: "solution",
    }),
    (error: unknown) => errorCode(error) === "GEN-CS-COMPAT",
  );
  // Variante com pares falhos envolvendo narrativeMove: identification×reveal
  // (psy×mov) e pov×reveal (fmt×mov) nunca coocorrem em recipe.
  assert.throws(
    () => assertFreeCompositionCooccurrence(cs(), {
      attentionMechanisms: ["curiosity"],
      psychologicalEffects: ["identification"],
      format: "pov",
      narrativeMoves: ["reveal"],
      productRole: "solution",
    }),
    (error: unknown) => errorCode(error) === "GEN-CS-COMPAT",
  );
});

test("composição livre exige par formato×papel declarado na compatibilidade versionada", () => {
  // Todos os IDs existem na taxonomia; o par (unboxing, proof) não é declarado —
  // enum válido não é compatibilidade. Falha estável, sem substituição.
  assert.throws(
    () => resolveBlueprint(cs(), {
      attentionMechanisms: ["curiosity"],
      psychologicalEffects: ["trust"],
      format: "unboxing",
      narrativeMoves: ["reveal", "product_entry", "resolution"],
      productRole: "proof",
    }),
    (error: unknown) => errorCode(error) === "GEN-CS-COMPAT",
  );
  // Papel sem entrada declarada na compatibilidade: fail-closed.
  const minimal = validateCreativeSystem({
    attentionMechanisms: ["curiosity"],
    psychologicalEffects: ["trust"],
    formats: ["unboxing", "pov"],
    narrativeMoves: ["reveal"],
    productRoles: ["discovery_object", "solution"],
    recipes: [],
    compatibility: { formatsByProductRole: { solution: ["pov"] } },
  });
  assert.throws(
    () => resolveBlueprint({ ...minimal, skillVersion: "tiktok-commerce@1.3" }, {
      attentionMechanisms: ["curiosity"],
      psychologicalEffects: ["trust"],
      format: "unboxing",
      narrativeMoves: ["reveal"],
      productRole: "discovery_object",
    }),
    (error: unknown) => errorCode(error) === "GEN-CS-COMPAT",
  );
});

test("dedup é estável preservando a primeira ocorrência", () => {
  const bp = resolveBlueprint(cs(), validRecipeBacked({ attentionMechanisms: ["pattern_interrupt", "failure", "pattern_interrupt"] }));
  assert.deepEqual(bp.attentionMechanisms, ["pattern_interrupt", "failure"]);
});

test("resolveBlueprint falha fechado com códigos estáveis", () => {
  const cases: Array<[unknown, CreativeSystemErrorCode]> = [
    [null, "GEN-CS-SCHEMA"],
    [{}, "GEN-CS-SCHEMA"],
    [validRecipeBacked({ attentionMechanisms: [] }), "GEN-CS-SCHEMA"],
    [validRecipeBacked({ format: "" }), "GEN-CS-SCHEMA"],
    [validRecipeBacked({ attentionMechanisms: "failure" }), "GEN-CS-SCHEMA"],
    [validRecipeBacked({ recipeId: 7 }), "GEN-CS-SCHEMA"],
    [validRecipeBacked({ recipeId: "recipe-inexistente" }), "GEN-CS-REF"],
    [validRecipeBacked({ attentionMechanisms: ["failure", "fantasma"] }), "GEN-CS-REF"],
    [validRecipeBacked({ format: "formato-fantasma" }), "GEN-CS-REF"],
    [validRecipeBacked({ productRole: "role-fantasma" }), "GEN-CS-REF"],
    // recipe-backed: campos fora do constraint set da recipe são GEN-CS-COMPAT
    [validRecipeBacked({ attentionMechanisms: ["visual_hook"] }), "GEN-CS-COMPAT"],
    [validRecipeBacked({ psychologicalEffects: ["humor", "aspiration"] }), "GEN-CS-COMPAT"],
    [validRecipeBacked({ format: "demonstration" }), "GEN-CS-COMPAT"],
    [validRecipeBacked({ productRole: "proof" }), "GEN-CS-COMPAT"],
    // código jamais reordena a espinha narrativa da recipe
    [validRecipeBacked({ narrativeMoves: ["setup", "reaction", "failure", "product_entry", "resolution", "payoff"] }), "GEN-CS-COMPAT"],
    [validRecipeBacked({ narrativeMoves: ["setup", "failure", "reaction", "product_entry", "resolution"] }), "GEN-CS-COMPAT"],
  ];
  for (const [input, expected] of cases) {
    assert.throws(() => resolveBlueprint(cs(), input), (error: unknown) => errorCode(error) === expected, `${expected} <- ${JSON.stringify(input)}`);
  }
});

test("elegibilidade de formato respeita allowlist e falha GEN-CS-ELIGIBILITY", () => {
  const bp = resolveBlueprint(cs(), validRecipeBacked());
  assertEligibleFormat(cs(), bp, new Set(["sketch", "pov"]));
  assert.throws(() => assertEligibleFormat(cs(), bp, new Set(["pov"])), (error: unknown) => errorCode(error) === "GEN-CS-ELIGIBILITY");
});

test("chave própria desconhecida no sistema falha GEN-CS-SCHEMA (fail-closed, ADR-033 decisão 9)", () => {
  const fields = () => ({
    attentionMechanisms: ["curiosity"],
    psychologicalEffects: ["trust"],
    formats: ["unboxing", "pov"],
    narrativeMoves: ["reveal"],
    productRoles: ["discovery_object", "solution"],
    recipes: [],
    compatibility: { formatsByProductRole: { solution: ["pov"] } },
  });
  assert.throws(
    () => validateCreativeSystem({ ...fields(), unknownTopLevel: "x" }),
    (error: unknown) => errorCode(error) === "GEN-CS-SCHEMA",
  );
});

test("chave própria desconhecida em recipe falha GEN-CS-SCHEMA", () => {
  const fields = () => ({
    attentionMechanisms: ["curiosity"],
    psychologicalEffects: ["trust"],
    formats: ["unboxing", "pov"],
    narrativeMoves: ["reveal"],
    productRoles: ["discovery_object", "solution"],
    recipes: [{
      id: "r1",
      attentionMechanisms: ["curiosity"],
      psychologicalEffects: ["trust"],
      formats: ["pov"],
      narrativeMoves: ["reveal"],
      productRoles: ["solution"],
      unknownRecipeKey: true,
    }],
    compatibility: { formatsByProductRole: { solution: ["pov"] } },
  });
  assert.throws(
    () => validateCreativeSystem(fields()),
    (error: unknown) => errorCode(error) === "GEN-CS-SCHEMA",
  );
});

test("chave própria desconhecida no objeto de compatibilidade falha GEN-CS-SCHEMA", () => {
  assert.throws(
    () => validateCreativeSystem({
      attentionMechanisms: ["curiosity"],
      psychologicalEffects: ["trust"],
      formats: ["unboxing", "pov"],
      narrativeMoves: ["reveal"],
      productRoles: ["discovery_object", "solution"],
      recipes: [],
      compatibility: { formatsByProductRole: { solution: ["pov"] }, unknownCompatKey: "x" },
    }),
    (error: unknown) => errorCode(error) === "GEN-CS-SCHEMA",
  );
});

test("chave própria desconhecida na entrada do resolveBlueprint falha GEN-CS-SCHEMA", () => {
  assert.throws(
    () => resolveBlueprint(cs(), {
      attentionMechanisms: ["curiosity"],
      psychologicalEffects: ["identification", "desire"],
      format: "pov",
      narrativeMoves: ["setup", "product_entry", "payoff"],
      productRole: "solution",
      unknownBlueprintKey: 1,
    }),
    (error: unknown) => errorCode(error) === "GEN-CS-SCHEMA",
  );
});
