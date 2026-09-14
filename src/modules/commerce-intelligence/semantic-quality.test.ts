import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { parseQualityAudit, QUALITY_PARTS, type QualityPart } from "./semantic-quality";
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
      if (task === "CONTENT_QUALITY_JUDGE") return overrides.judge?.(context ?? {}, ++judges) ?? judgePass();
      if (task === "CONTENT_PART_REPAIR") return overrides.repair?.(String(context?.part) as QualityPart, ++repairs) ?? { content: "Veja o tecido respiravel" };
      throw new Error(`task inesperada: ${task}`);
    },
  };
  return { router, counts: () => ({ judges, repairs }) };
}

function run(router: ReturnType<typeof routerFor>["router"]) {
  return runFirstGeneration({ productId: "p", jobId: "quality", name: "Produto", description: "tecido respiravel", facts: { features: ["tecido respiravel"] }, targetContentCount: 1, router });
}

test("judge exige exatamente as cinco partes, uma vez cada, com critério e motivo allowlisted", () => {
  const audit = parseQualityAudit({ parts }, "content-1", 0);
  assert.deepEqual(audit.parts.map(({ part }) => part), [...QUALITY_PARTS]);
  assert.throws(() => parseQualityAudit({ parts: parts.slice(1) }, "content-1", 0), /contrato inválido/);
  assert.throws(() => parseQualityAudit({ parts: [...parts, parts[0]] }, "content-1", 0), /contrato inválido/);
});

test("generation audits all five parts and repairs only the rejected part", async () => {
  const seen: string[][] = [];
  const repairedParts: string[] = [];
  const mock = routerFor({
    judge: (context, call) => {
      seen.push((context.parts as Array<{ part: string }>).map(({ part }) => part));
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
