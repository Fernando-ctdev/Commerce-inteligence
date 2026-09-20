// ADR-025 §Avaliação — caso de avaliação pequeno e versionado da rodada real
// 0e94549e-1391-47b5-82a1-51bbb2890aff (Product 170c01ff…): 5 conteúdos, 37
// chamadas, 13 judges individuais, 10 Content Part Repairs, 14 partes REPAIR,
// zero REJECT, 2 rounds globais, 3/5 entregues (SUCCEEDED_PARTIAL), cenas
// disponíveis e vazamento editorial de instrução de cena no script do Content 02.
// Contexto autorizado MINIMIZADO: produto genérico de tecido (mesma família
// factual já usada na suíte), sem dados reais do usuário. Configuração: Judge e
// repair HIGH, reasoning low (padrão B-003-05), skill tiktok-commerce@1.2.
// Expectativas sob o contrato vigente (judge único PASS|REVIEW, no máximo um
// repair por parte marcada, sem re-Judge — judge-semantico-contrato-a):
//   - nenhum metacomentário/instrução de cena no script entregue (e o vazamento
//     do Content 02 vira repair objetivo via detector determinístico);
//   - hard gate, Judge único em lote, exact-N/parcial declarado e cenas preservados;
//   - chamadas de Judge/repair EM LOTE menores que a rodada individual (13/10).
import test from "node:test";
import assert from "node:assert/strict";
import { runFirstGeneration } from "./engine";
import { scriptSceneMetacomment } from "./gates";

const describe = () => ({ provider: "test", model: "test-model", instructionVersion: "slice-003" });
function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
const judgeItems = (input?: { trustedContext?: unknown }): Array<Record<string, unknown>> => {
  const items = recordOf(input?.trustedContext)?.items;
  return Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
};
const qualityPass = { parts: [
  { part: "hook", status: "PASS", criterion: "hook_clarity", reason: "meets_criteria" },
  { part: "development", status: "PASS", criterion: "development_coherence", reason: "meets_criteria" },
  { part: "script", status: "PASS", criterion: "script_naturalness", reason: "meets_criteria" },
  { part: "cta", status: "PASS", criterion: "cta_clarity", reason: "meets_criteria" },
  { part: "scenes", status: "PASS", criterion: "scenes_actionable", reason: "meets_criteria" },
] };
const developmentOk = [{ text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para explicar como o tecido respiravel afeta o uso" }, { text: "Destaque o tecido respiravel para explicar como o tecido respiravel afeta o uso", action: "Destaque", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para explicar como o tecido respiravel afeta o uso" }];

test("ADR-025 avaliação (rodada 0e94549e): batching reduz chamadas, parcial 3/5 só por falha objetiva e script sem metainstrução de cena", async () => {
  const judgeCallSizes: number[] = [];
  const repairCallSizes: number[] = [];
  const briefRepairContexts: Array<Record<string, unknown>> = [];
  let briefCalls = 0;
  const router = { describe, complete: async (task: string, input?: { trustedContext?: unknown }) => {
    if (task === "PRODUCT_UNDERSTANDING") return { productId: "p", coreUseCases: ["uso"], capabilities: ["cap"], functionalBenefits: ["benefício"], emotionalBenefits: ["confiança"], desiredOutcomes: ["resultado"], purchaseTriggers: ["necessidade"], purchaseBarriers: ["barreira"], evidenceRefs: ["product:name"] };
    if (task === "COMMERCIAL_OPPORTUNITY_MAPPING") return { audiences: ["a"], situations: ["s"], pains: ["p"], desires: ["d"], objections: ["o"], opportunities: Array.from({ length: 5 }, () => ({ relevantCapabilities: ["cap"], benefits: ["b"], proofOptions: ["product:name"], sellingArgument: "s", confidence: 0.9, evidenceRefs: ["product:name"] })) };
    if (task === "STRATEGY_SYNTHESIS") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", primaryPositioning: "p", audiences: ["a"], priorityBenefits: ["b"], priorityObjections: ["o"], priorityArguments: ["a"], priorityAngles: ["an"], communicationPrinciples: ["cp"] };
    if (task === "CONTENT_PLAN_GENERATION") return { platformId: "tiktok-commerce", platformSkillVersion: "tiktok-commerce@1.2", targetContentCount: 5, opportunities: Array.from({ length: 5 }, (_, i) => ({ commercialObjective: "c", angle: `a${i + 1}`, coreMessage: "m", hookMechanism: ["demonstration", "problem", "discovery", "price-value", "other"][i], noveltyTargets: ["n"] })) };
    if (task === "CONTENT_BRIEF_GENERATION") {
      briefCalls += 1;
      const size = [4, 1][briefCalls - 1];
      return { items: Array.from({ length: size }, (_, offset) => {
        const position = (briefCalls - 1) * 4 + offset + 1;
        return {
          angle: `a${position}`,
          hook: `Gancho ${position}`,
          development: developmentOk.map((b) => ({ text: b.text, action: b.action, factRefs: b.factRefs, cta: b.cta, rationale: b.rationale })),
          // Vazamento registrado na rodada real: instrução de objeto destinada a
          // cenas no script do Content 02 — hoje detectada pelo hard gate (§5).
          script: position === 2 ? "[mostra a etiqueta por dentro] Tecido respiravel" : "Tecido respiravel",
          cta: `cta ${position}`,
        };
      }) };
    }
    if (task === "CONTENT_BRIEF_REPAIR") {
      briefRepairContexts.push(recordOf(input?.trustedContext) ?? {});
      // Contrato do repair (adendo 2): development estruturado {text, action, factRef, rationale}.
      return { angle: "a2", hook: "Gancho 2", development: [{ text: developmentOk[0].text, action: "Destaque", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para explicar como o tecido respiravel afeta o uso no dia a dia" }, { text: developmentOk[0].text, action: "Destaque", factRefs: ["product:description"], cta: "Confira o produto na página.", rationale: "para explicar como o tecido respiravel afeta o uso no dia a dia" }], script: "Tecido respiravel", cta: "cta 2" };
    }
    if (task === "CONTENT_SCENE_IDEAS") return { scenes: [{ description: "Mostre o tecido respiravel em uso" }, { description: "Pegue o tecido respiravel e aproxime para demonstrar" }] };
    if (task === "CONTENT_QUALITY_JUDGE") {
      const items = judgeItems(input);
      judgeCallSizes.push(items.length);
      // Contents 4-5: hook REVIEW com repair que falha no gate objetivo
      // (parcial nasce de falha objetiva, nunca semântica); 1-3: PASS.
      return { audits: items.map(({ contentId }) => ({
        contentId,
        parts: Number(String(contentId).slice(-1)) >= 4
          ? qualityPass.parts.map((part) => part.part === "hook" ? { ...part, status: "REVIEW", reason: "unclear" } : part)
          : qualityPass.parts,
      })) };
    }
    if (task === "CONTENT_PART_REPAIR") {
      const context = recordOf(input?.trustedContext);
      const items = Array.isArray(context?.items) ? context.items as Array<Record<string, unknown>> : [];
      repairCallSizes.push(items.length);
      assert.equal(String(context?.part), "hook", "repair agrupa somente a mesma parte");
      // Repair devolve hook com claim objetivo sem evidência: a composição do
      // hard gate rejeita (composition_rejected) — fallback não autoriza claim.
      return { items: items.map(({ contentId }) => ({ contentId, content: "Suporta 999 kg" })) };
    }
    return {};
  } };
  const result = await runFirstGeneration({ productId: "p", jobId: "j", name: "Produto", description: "Tecido respirável", targetContentCount: 5, router });
  // Judge em passada única: chunks 3+2 — 2 chamadas < 13 da rodada individual;
  // o deepEqual prova que não existe re-Judge.
  assert.deepEqual(judgeCallSizes, [3, 2]);
  assert.ok(judgeCallSizes.length < 13, "redução de chamadas de judge vs. rodada individual");
  // Repair em lote da mesma parte: uma única tentativa (hook 4+5 em 1 chamada)
  // < 10 da rodada individual.
  assert.deepEqual(repairCallSizes, [2]);
  assert.ok(repairCallSizes.length < 10, "redução de chamadas de repair vs. rodada individual");
  // Fronteira script×cenas (§5): o vazamento vira causa de repair e nenhum
  // script entregue contém metainstrução de cena.
  assert.ok(briefRepairContexts.length === 1, "apenas o Content 02 vai a repair de briefing");
  assert.ok(JSON.stringify(briefRepairContexts[0]).includes("script contém metainstrução de cena"));
  for (const brief of result.briefs) assert.equal(scriptSceneMetacomment(String(brief.script)), null, "script entregue sem metainstrução de cena");
  // Parcial declarado 3/5 (ADR-021/025) — somente por falha objetiva: os hooks
  // reparados caem na composição do hard gate (nunca por REVIEW semântico).
  assert.equal(result.partial?.expectedCount, 5);
  assert.equal(result.partial?.deliveredCount, 3);
  assert.deepEqual(result.partial?.failedItems.map(({ contentId }) => contentId), ["j-content-4", "j-content-5"]);
  assert.deepEqual(result.partial?.failedItems.map(({ reason }) => reason), ["HARD_GATE", "HARD_GATE"]);
  assert.deepEqual(result.partial?.failedItems.flatMap(({ issues }) => issues), ["composition_rejected", "composition_rejected"]);
  // Auditoria semântica só PASS|REVIEW; cenas disponíveis para os entregues.
  assert.ok(result.qualityAudits.every((audit) => audit.parts.every(({ status }) => status === "PASS" || status === "REVIEW")));
  assert.ok(result.sceneSets.every((set) => set.status === "AVAILABLE" && set.scenes.length >= 2));
});
