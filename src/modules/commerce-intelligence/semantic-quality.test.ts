import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { parseQualityAuditBatch, parseQualityRepairBatch, applyQualityRepair, qualityPartsToRepair, projectQualityFailures, QUALITY_PARTS, type QualityAudit, type QualityPart } from "./semantic-quality";
import { internalFailureMetadata } from "./worker";

const parts = QUALITY_PARTS.map((part) => ({
  part,
  status: "PASS",
  criterion: ({ hook: "hook_clarity", development: "development_coherence", script: "script_naturalness", cta: "cta_clarity", scenes: "scenes_actionable" } as const)[part],
  reason: "meets_criteria",
}));
const judgePass = () => ({ parts });
const describe = () => ({ provider: "test", model: "test", instructionVersion: "test" });

function routerFor(overrides: Partial<{ judge: (context: Record<string, unknown>, call: number) => unknown; repair: (part: QualityPart, call: number) => unknown; scenes: () => unknown }> = {}) {
  let judges = 0;
  let repairs = 0;
  const router = {
    describe,
    complete: async (task: string, input?: { trustedContext?: unknown }) => {
      const context = input?.trustedContext as Record<string, unknown> | undefined;
      if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["respiravel"], functionalBenefits: ["conforto"], emotionalBenefits: ["confianca"], desiredOutcomes: ["uso"], purchaseTriggers: ["uso"], purchaseBarriers: ["preco"], evidenceRefs: ["product:description"] };
      if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["creator"], situations: ["uso"], pains: ["calor"], desires: ["conforto"], objections: ["preco"], opportunities: Array.from({ length: 3 }, () => ({ relevantCapabilities: ["respiravel"], benefits: ["conforto"], proofOptions: ["respiravel"], sellingArgument: "uso confortavel", confidence: 0.9, evidenceRefs: ["product:description"] })) };
      if (task === "STRATEGY_SYNTHESIS") return { primaryPositioning: "uso", audiences: ["creator"], priorityBenefits: ["conforto"], priorityObjections: ["preco"], priorityArguments: ["uso"], priorityAngles: ["demonstracao"], communicationPrinciples: ["natural"] };
      if (task === "CONTENT_PLAN_GENERATION") return { opportunities: [{ commercialObjective: "demonstrar", angle: "demonstracao", coreMessage: "tecido respiravel", hookMechanism: "demonstracao", noveltyTargets: ["demonstracao"] }] };
      if (task === "CONTENT_BRIEF_GENERATION") return { items: [{ angle: "demonstracao", hook: "Hook original", development: ["Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso"], script: "Demonstre o tecido respiravel no produto", cta: "Confira o produto" }] };
      if (task === "CONTENT_SCENE_IDEAS") return overrides.scenes?.() ?? { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
      if (task === "CONTENT_QUALITY_JUDGE") {
        // ADR-025: judge em lote — a resposta ecoa o conjunto exato de contentIds.
        const items = (Array.isArray(context?.items) ? context.items : []) as Array<{ contentId: string }>;
        const override = overrides.judge?.(context ?? {}, ++judges) as { parts: typeof parts } | undefined;
        return { audits: items.map(({ contentId }) => ({ contentId, parts: (override ?? judgePass()).parts })) };
      }
      if (task === "CONTENT_PART_REPAIR") {
        // ADR-025: repair em lote — envelope {items:[{contentId, content}]}.
        const part = String(context?.part) as QualityPart;
        const batchItems = (Array.isArray(context?.items) ? context.items : []) as Array<{ contentId: string }>;
        const override = overrides.repair?.(part, ++repairs) as { content: unknown } | undefined;
        return { items: batchItems.map(({ contentId }) => ({ contentId, content: (override ?? { content: "Veja o tecido respiravel" }).content })) };
      }
      throw new Error(`task inesperada: ${task}`);
    },
  };
  return { router, counts: () => ({ judges, repairs }) };
}

function run(router: ReturnType<typeof routerFor>["router"]) {
  return runFirstGeneration({ productId: "p", jobId: "quality", name: "Produto", description: "tecido respiravel", facts: { features: ["tecido respiravel"] }, targetContentCount: 1, router });
}

test("judge exige exatamente as cinco partes, uma vez cada, com status PASS|REVIEW e motivo allowlisted", () => {
  const [audit] = parseQualityAuditBatch({ audits: [{ contentId: "content-1", parts }] }, ["content-1"], 0);
  assert.deepEqual(audit.parts.map(({ part }) => part), [...QUALITY_PARTS]);
  const [reviewAudit] = parseQualityAuditBatch(
    { audits: [{ contentId: "content-1", parts: parts.map((item) => item.part === "hook" ? { ...item, status: "REVIEW", reason: "unclear" } : item) }] },
    ["content-1"],
    0,
  );
  assert.equal(reviewAudit.parts[0].status, "REVIEW");
  assert.throws(() => parseQualityAuditBatch({ audits: [{ contentId: "content-1", parts: parts.slice(1) }] }, ["content-1"], 0), /contrato inválido/);
  assert.throws(() => parseQualityAuditBatch({ audits: [{ contentId: "content-1", parts: [...parts, parts[0]] }] }, ["content-1"], 0), /contrato inválido/);
  assert.throws(
    () => parseQualityAuditBatch({ audits: [{ contentId: "content-1", parts: parts.map((item) => item.part === "hook" ? { ...item, status: "REJECT", reason: "unclear" } : item) }] }, ["content-1"], 0),
    /contrato inválido/,
    "REJECT não é mais um status válido",
  );
  assert.throws(
    () => parseQualityAuditBatch({ audits: [{ contentId: "content-1", parts: parts.map((item) => item.part === "hook" ? { ...item, status: "REVIEW", reason: "unsupported_persuasion" } : item) }] }, ["content-1"], 0),
    /contrato inválido/,
    "unsupported_persuasion não é mais um motivo válido",
  );
  assert.throws(
    () => parseQualityAuditBatch({ audits: [{ contentId: "content-1", parts: parts.map((item) => item.part === "hook" ? { ...item, status: "REVIEW", reason: "meets_criteria" } : item) }] }, ["content-1"], 0),
    /contrato inválido/,
    "meets_criteria só vale para PASS",
  );
});

test("ADR-025: parseQualityAuditBatch exige conjunto exato de contentIds e normaliza a ordem", () => {
  const auditFor = (contentId: string) => ({ contentId, parts });
  const expected = ["content-1", "content-2", "content-3"];
  // Identidade é o contentId, nunca a posição: saída na ordem esperada.
  const shuffled = { audits: [auditFor("content-3"), auditFor("content-1"), auditFor("content-2")] };
  assert.deepEqual(parseQualityAuditBatch(shuffled, expected, 1).map(({ contentId, round }) => ({ contentId, round })), expected.map((contentId) => ({ contentId, round: 1 })));
  assert.throws(() => parseQualityAuditBatch({ audits: [auditFor("content-1"), auditFor("content-2")] }, expected, 0), /contrato inválido/, "faltante");
  assert.throws(() => parseQualityAuditBatch({ audits: [auditFor("content-1"), auditFor("content-1"), auditFor("content-2")] }, expected, 0), /contrato inválido/, "duplicado");
  assert.throws(() => parseQualityAuditBatch({ audits: [auditFor("content-1"), auditFor("content-2"), auditFor("content-x")] }, expected, 0), /contrato inválido/, "id fora do conjunto");
});

test("ADR-025: parseQualityRepairBatch valida o envelope de IDs, não o conteúdo", () => {
  const expected = ["content-1", "content-2"];
  const ok = { items: [{ contentId: "content-2", content: 42 }, { contentId: "content-1", content: null }] };
  assert.deepEqual(parseQualityRepairBatch(ok, expected, "hook"), [
    { contentId: "content-1", content: null },
    { contentId: "content-2", content: 42 },
  ]);
  assert.throws(() => parseQualityRepairBatch({ items: [{ contentId: "content-1", content: "x" }] }, expected, "hook"), /contrato inválido/, "faltante");
  assert.throws(() => parseQualityRepairBatch({ items: [{ contentId: "content-1", content: "x" }, { contentId: "content-1", content: "y" }] }, expected, "hook"), /contrato inválido/, "duplicado");
  assert.throws(() => parseQualityRepairBatch({ items: [{ contentId: "content-9", content: "x" }, { contentId: "content-1", content: "y" }] }, expected, "hook"), /contrato inválido/, "id fora do conjunto");
});

test("applyQualityRepair valida o formato da parte substituída e preserva as demais", () => {
  const brief = { hook: "Hook original", development: ["d1"], script: "Script original", cta: "CTA original" };
  const scenes = [{ description: "cena" }];
  assert.deepEqual(applyQualityRepair(brief, scenes, "hook", "Novo hook").brief, { ...brief, hook: "Novo hook" });
  assert.deepEqual(applyQualityRepair(brief, scenes, "development", ["novo"]).brief.development, ["novo"]);
  assert.deepEqual(applyQualityRepair(brief, scenes, "scenes", [{ description: "nova" }]).scenes, [{ description: "nova" }]);
  assert.throws(() => applyQualityRepair(brief, scenes, "scenes", "não é lista"), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "scenes", 42), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "scenes", { description: "cena solta" }), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "scenes", [{ description: "ok" }, 42]), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "scenes", [{ description: 42 }]), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "scenes", [{ demais: "sem description" }]), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "scenes", [null]), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "hook", 42), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "development", "não é lista"), /conteúdo inválido/);
  assert.throws(() => applyQualityRepair(brief, scenes, "development", [42]), /conteúdo inválido/);
  const repaired = applyQualityRepair(brief, scenes, "hook", "Novo hook");
  assert.equal(repaired.scenes, scenes);
});

test("qualityPartsToRepair e projectQualityFailures consideram somente REVIEW", () => {
  const audit: QualityAudit = { contentId: "content-1", round: 1, parts: [
    { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
    { part: "script", status: "REVIEW", criterion: "script_naturalness", reason: "unclear" },
    { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
    { part: "scenes", status: "REVIEW", criterion: "scenes_actionable", reason: "not_actionable" },
  ] };
  assert.deepEqual(qualityPartsToRepair(audit).map(({ part }) => part), ["script", "scenes"]);
  assert.deepEqual(projectQualityFailures([audit]), [
    { contentId: "content-1", part: "script", round: 1, status: "REVIEW", criterion: "script_naturalness", reason: "unclear" },
    { contentId: "content-1", part: "scenes", round: 1, status: "REVIEW", criterion: "scenes_actionable", reason: "not_actionable" },
  ]);
  assert.deepEqual(qualityPartsToRepair({ contentId: "content-1", round: 0, parts: [] }), []);
  assert.deepEqual(projectQualityFailures([]), []);
});

test("generation audits all five parts and repairs only the rejected part", async () => {
  const seen: string[][] = [];
  const repairedParts: string[] = [];
  const mock = routerFor({
    judge: (context, call) => {
      seen.push((((context.items as Array<{ parts: Array<{ part: string }> }>)[0]).parts).map(({ part }) => part));
      if (call === 1) return { parts: parts.map((item) => item.part === "hook" ? { ...item, status: "REPAIR", reason: "unclear" } : item) };
      return judgePass();
    },
    repair: (part) => { repairedParts.push(part); return { content: part === "hook" ? "Veja o tecido respiravel" : "UNEXPECTED" }; },
  });
  const result = await run(mock.router);
  assert.deepEqual(repairedParts, ["hook"]);
  assert.ok(seen.length >= 2 && seen.every((evaluated) => assert.deepEqual(evaluated, [...QUALITY_PARTS]) === undefined));
  assert.equal(result.briefs[0].hook, "Veja o tecido respiravel");
  assert.equal(result.briefs[0].script, "Demonstre o tecido respiravel no produto");
  assert.equal(result.qualityRepairs.length, 1);
  assert.equal(result.qualityRepairs[0].part, "hook");
});

test("semantic repair stops after two global rounds", async () => {
  const mock = routerFor({
    judge: () => ({ parts: parts.map((item) => item.part === "hook" ? { ...item, status: "REPAIR", reason: "unclear" } : item) }),
    repair: (_part, call) => ({ content: `Veja o tecido respiravel ${call}` }),
  });
  await assert.rejects(() => run(mock.router), (error: unknown) => {
    const failure = error as { code?: string; detail?: Record<string, unknown> };
    assert.equal(failure.code, "GEN-REPAIR-EXHAUSTED");
    assert.deepEqual(failure.detail?.rejected, [{ contentId: "quality-content-1", part: "hook", round: 2, status: "REPAIR", criterion: "hook_clarity", reason: "unclear" }]);
    assert.deepEqual(Object.keys((failure.detail?.rejected as Array<Record<string, unknown>>)[0]).sort(), ["contentId", "criterion", "part", "reason", "round", "status"]);
    return true;
  });
  assert.equal(mock.counts().repairs, 2);
});

test("REJECT is terminal, does not call part repair, and preserves its diagnostic", async () => {
  const mock = routerFor({
    judge: () => ({ parts: parts.map((item) => item.part === "script"
      ? { ...item, status: "REJECT", criterion: "script_shop_compliance", reason: "unsupported_persuasion" }
      : item) }),
  });
  await assert.rejects(() => run(mock.router), (error: unknown) => {
    const failure = error as { code?: string; detail?: Record<string, unknown> };
    assert.equal(failure.code, "GEN-REPAIR-EXHAUSTED");
    assert.deepEqual(failure.detail?.rejected, [{
      contentId: "quality-content-1", part: "script", round: 0, status: "REJECT",
      criterion: "script_shop_compliance", reason: "unsupported_persuasion",
    }]);
    return true;
  });
  assert.deepEqual(mock.counts(), { judges: 1, repairs: 0 });
});

test("composition violating the deterministic factual gate cannot succeed", async () => {
  const mock = routerFor({
    judge: (context, call) => call === 1
      ? { parts: parts.map((item) => item.part === "script" ? { ...item, status: "REPAIR", reason: "weak_commercial_value" } : item) }
      : judgePass(),
    repair: () => ({ content: "Garantia de 999 kg de resistencia" }),
  });
  await assert.rejects(() => run(mock.router), (error: unknown) => {
    const failure = error as { code?: string; detail?: Record<string, unknown> };
    assert.equal(failure.code, "GEN-REPAIR-EXHAUSTED");
    const metadata = internalFailureMetadata(failure.code, "GENERATING_BRIEFS", failure.detail);
    const reports = metadata.gateReports as Array<Record<string, unknown>> | undefined;
    assert.ok(reports?.some((report) => report.decision !== "PASS" && (report.issues as string[]).length > 0));
    assert.equal("qualityFailures" in metadata, false);
    assert.ok(!JSON.stringify(metadata).includes("999 kg"), "metadata excludes the rejected payload text");
    return true;
  });
});

test("scene failure without a gate report keeps a safe terminal cause in internal error metadata", async () => {
  const mock = routerFor({
    judge: (context, call) => call === 1
      ? { parts: parts.map((item) => item.part === "script" ? { ...item, status: "REPAIR", reason: "weak_commercial_value" } : item) }
      : judgePass(),
    repair: () => ({ content: "Demonstre o tecido respiravel no produto" }),
    scenes: () => ({ scenes: [{ description: "Cena sem verbo compatível com a ação" }, { description: "Texto visual sem ação ou conexão com o produto" }] }),
  });
  await assert.rejects(() => run(mock.router), (error: unknown) => {
    const failure = error as { code?: string; detail?: Record<string, unknown> };
    assert.equal(failure.code, "GEN-REPAIR-EXHAUSTED");
    const metadata = internalFailureMetadata(failure.code, "GENERATING_BRIEFS", failure.detail);
    const reports = metadata.gateReports as Array<Record<string, unknown>> | undefined;
    assert.ok(reports?.some((report) => (report.issues as string[]).includes("scene_set_invalid")));
    assert.ok(!JSON.stringify(metadata).includes("Cena sem verbo"));
    return true;
  });
});
