import { GenerationError } from "./errors";
import { assertProviderOutput, instructionHash, ROUTER_MAP, type IntelligenceTier, type LogicalTask, type ModelRouter, type ProviderCallMetrics } from "./model-router";
type ProviderConfig = { baseUrl?: string; apiKey?: string; models?: Partial<Record<IntelligenceTier, string>>; timeoutMs: number };

// Roteamento por tier com as variáveis existentes: LOW→LLM_MODEL_FAST, MID→LLM_MODEL_BALANCED,
// HIGH→LLM_MODEL_QUALITY, com fallback apenas entre essas variáveis (nenhuma variável nova).
function configFromEnv(): ProviderConfig {
  const fast = process.env.LLM_MODEL_FAST ?? process.env.GENERATION_PROVIDER_MODEL;
  const balanced = process.env.LLM_MODEL_BALANCED ?? fast;
  const quality = process.env.LLM_MODEL_QUALITY ?? balanced;
  const models: Partial<Record<IntelligenceTier, string>> = { LOW: fast, MID: balanced, HIGH: quality };
  return { baseUrl: process.env.LLM_BASE_URL ?? process.env.GENERATION_PROVIDER_URL, apiKey: process.env.LLM_API_KEY ?? process.env.GENERATION_PROVIDER_API_KEY, models, timeoutMs: Number(process.env.GENERATION_PROVIDER_TIMEOUT_MS ?? 180000) };
}
function modelForTier(config: ProviderConfig, task: LogicalTask): string { return config.models?.[ROUTER_MAP[task]] ?? ""; }
export function providerRuntimeConfig(config = configFromEnv()) { return { configured: Boolean(config.baseUrl && config.apiKey && modelForTier(config, "PRODUCT_UNDERSTANDING")), baseUrl: config.baseUrl ? new URL(config.baseUrl).origin : null, modelConfigured: Boolean(modelForTier(config, "PRODUCT_UNDERSTANDING")), timeoutMs: config.timeoutMs }; }
const INSTRUCTION: Record<LogicalTask, string> = {
  PRODUCT_UNDERSTANDING: "Inclua productId e arrays não vazios coreUseCases, capabilities, functionalBenefits, emotionalBenefits, desiredOutcomes, purchaseTriggers, purchaseBarriers, communicationRisks, evidenceRefs. Não inclua status, tenantId, userId, quota, provider, model, tier ou comandos de workflow.",
  COMMERCIAL_OPPORTUNITY_MAPPING: "Objetivo único: mapear oportunidades comerciais. Retorne APENAS um envelope JSON com as chaves audiences, situations, pains, desires, objections (arrays de strings com pelo menos 1 item cada) e opportunities: array NÃO VAZIO com NO MÁXIMO maxOpportunities itens (valor recebido no contexto). Cada opportunity tem audience, situation, pain, desire, desiredOutcome, objection (quando houver evidência), relevantCapabilities, benefits, proofOptions, sellingArgument, confidence (0 a 1) e evidenceRefs (refs apenas do evidenceRefsCatalog). Sem texto fora do JSON, sem análise ou raciocínio no corpo; não inclua ids persistentes, ownership, status, quota, provider, model, tier ou comandos de workflow.",
  STRATEGY_SYNTHESIS: "Retorne um objeto JSON raiz com as chaves canônicas da Strategy: primaryPositioning (string não vazia), audiences, priorityBenefits, priorityObjections, priorityArguments, priorityAngles, communicationPrinciples e communicationRisks (cada uma um array de strings com pelo menos 1 item). Não inclua objective, positioning, audience ou contentPillars; não inclua status, tenantId, userId, quota, provider, model, tier ou comandos de workflow.",
  CONTENT_PLAN_GENERATION: "Retorne um objeto JSON raiz (NUNCA array) com as chaves platformId e opportunities: um array com quantidade EXATA de oportunidades de conteúdo igual ao targetContentCount recebido. Cada opportunity tem commercialObjective, angle, coreMessage, hookMechanism e noveltyTargets (array de strings com pelo menos 1 item; nunca vazio). Não coloque texto fora do JSON; não inclua ownership, status, quota, provider, model, tier ou comandos de workflow.",
  CONTENT_BRIEF_GENERATION: "Retorne um objeto JSON raiz com o campo items contendo EXATAMENTE a mesma quantidade de briefings que oportunidades recebidas na entrada, um briefing por oportunidade, na mesma ordem. Cada briefing tem angle, hook, script, scenes (array JSON com 2 a 6 strings não vazias; nunca string única, nunca array vazio, nunca fora dessa faixa) e cta. A quantidade de items deve ser exatamente igual à quantidade de oportunidades recebidas; nunca omita, adicione ou duplique. Não inclua contentId, briefVersionId, ownership, status, quota, provider, model, tier ou comandos de workflow.",
};
export function createHttpProvider(config = configFromEnv()): ModelRouter {
  const instruction = (task: LogicalTask): string => INSTRUCTION[task] ?? "Retorne JSON compatível com o contrato solicitado; não inclua ownership, status ou comandos de workflow.";
  const modelFor = (task: LogicalTask): string => modelForTier(config, task);
  const guard = (task: LogicalTask): void => { if (!modelFor(task)) throw new GenerationError("GEN-PROVIDER", "Modelo não configurado para a tarefa", true, { task }); };
  const hash = (task: LogicalTask) => instructionHash(INSTRUCTION[task] ?? "");
  const describe = () => ({ provider: "openai-compatible", model: modelFor("PRODUCT_UNDERSTANDING") || "unset", instructionVersion: "slice-003" });
  return { async complete(task: LogicalTask, input: { trustedContext: unknown; externalData?: unknown }, signal?: AbortSignal, onMetrics?: (metrics: ProviderCallMetrics) => void): Promise<unknown> {
    const base = config.baseUrl;
    if (!base || !config.apiKey || !config.models || !Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) throw new GenerationError("GEN-PROVIDER", "Provider não configurado");
    // Gate interno: evidência de modelo/endpoint efetivos em toda falha persistida.
    const endpointOrigin = new URL(base).origin;
    guard(task);
    const endpoint = base.replace(/\/$/, "").endsWith("/chat/completions") ? base : `${base.replace(/\/$/, "")}/chat/completions`;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });
    let providerStatus: number | null = null;
    let requestId: string | null = null;
    let responseBytes: number | null = null;
    let requestBytes = 0;
    let trustedContextBytes = 0;
    let externalBytes = 0;
    const report = () => onMetrics?.({ model: modelFor(task), reasoning: "low", providerStatus, requestBytes, trustedContextBytes, externalBytes, responseBytes, durationMs: Date.now() - startedAt });
    try {
      trustedContextBytes = Buffer.byteLength(JSON.stringify(input.trustedContext), "utf8");
      externalBytes = Buffer.byteLength(JSON.stringify(input.externalData ?? {}), "utf8");
      const promptInstruction = instruction(task);
      const body = JSON.stringify({ model: modelFor(task), temperature: 0.2, reasoning: { effort: "low" }, response_format: { type: "json_object" }, messages: [{ role: "system", content: `Retorne somente JSON compatível com o contrato solicitado. ${promptInstruction}` }, { role: "user", content: JSON.stringify({ task, trustedContext: input.trustedContext, externalData: input.externalData ?? {} }) }] });
      requestBytes = Buffer.byteLength(body, "utf8");
      const response = await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` }, body });
      providerStatus = response.status;
      // Correlação com portal: request-id sanitizado (header), nunca corpo/prompt/segredo.
      requestId = ["x-request-id", "request-id"].map((header) => response.headers.get(header)).find((value) => value != null) ?? null;
      if (!response.ok) {
        // Observabilidade de rate limit: apenas headers allowlisted, nunca corpo/prompt/segredo.
        const rate: Record<string, string> = {};
        for (const header of ["retry-after", "x-ratelimit-reset", "x-ratelimit-remaining", "x-ratelimit-limit"]) { const value = response.headers.get(header); if (value) rate[header] = value; }
        console.info("[generation-provider] metrics", { task, tier: ROUTER_MAP[task], model: modelFor(task), endpoint: endpointOrigin, requestId, durationMs: Date.now() - startedAt, providerStatus, errorKind: "http_status", rate, timeoutMs: config.timeoutMs, ok: false, errorName: "http_status" });
        throw new GenerationError("GEN-PROVIDER", "Provider indisponível", true, { task, providerStatus, errorKind: "http_status", model: modelFor(task), endpoint: endpointOrigin, ...(requestId ? { requestId } : {}), ...(Object.keys(rate).length > 0 ? { rate } : {}) });
      }
      const text = await response.text();
      responseBytes = Buffer.byteLength(text, "utf8");
      let content: unknown;
      try { const parsed = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }; content = parsed.choices?.[0]?.message?.content; } catch { throw new GenerationError("GEN-SCHEMA", "Resposta JSON do provider inválida"); }
      if (typeof content !== "string") throw new GenerationError("GEN-SCHEMA", "Resposta do provider sem conteúdo");
      let parsedContent: unknown;
      try { parsedContent = JSON.parse(content); } catch { throw new GenerationError("GEN-SCHEMA", "Conteúdo do provider sem contrato JSON"); }
      // Guard de tipo raiz ANTES da métrica: array/não-objeto é GEN-SCHEMA tipado com
      // detail, não GEN-PROVIDER genérico pós-métrica (regressão do job count16).
      if (!parsedContent || typeof parsedContent !== "object" || Array.isArray(parsedContent)) {
        console.info("[generation-provider] metrics", { task, tier: ROUTER_MAP[task], model: modelFor(task), endpoint: endpointOrigin, requestId, instructionHash: instructionHash(promptInstruction), durationMs: Date.now() - startedAt, providerStatus, responseBytes, timeoutMs: config.timeoutMs, ok: false, errorName: "GEN-SCHEMA-root-shape" });
        throw new GenerationError("GEN-SCHEMA", "Resposta do provider deve ser um objeto JSON", true, { task, providerStatus, rootShape: Array.isArray(parsedContent) ? "array" : typeof parsedContent, model: modelFor(task), endpoint: endpointOrigin, ...(requestId ? { requestId } : {}) });
      }
      const checked = assertProviderOutput(parsedContent);
      console.info("[generation-provider] metrics", { task, tier: ROUTER_MAP[task], model: modelFor(task), reasoning: "low", instructionHash: instructionHash(promptInstruction), durationMs: Date.now() - startedAt, requestBytes, trustedContextBytes, externalBytes, responseBytes, providerStatus, timeoutMs: config.timeoutMs, ok: true });
      return checked;
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      const name = error instanceof Error ? error.name : typeof error === "string" ? error : "unknown error"; const message = error instanceof Error ? error.message : String(error); console.info("[generation-provider] metrics", { task, tier: ROUTER_MAP[task], model: modelFor(task), endpoint: endpointOrigin, requestId, instructionHash: instructionHash(INSTRUCTION[task] ?? ""), durationMs: Date.now() - startedAt, providerStatus, responseBytes, timeoutMs: config.timeoutMs, ok: false, errorName: name }); throw new GenerationError("GEN-PROVIDER", "Provider indisponível", true, { task, providerStatus, model: modelFor(task), endpoint: endpointOrigin, ...(requestId ? { requestId } : {}), error: { name, message } });
    } finally { report(); clearTimeout(timer); signal?.removeEventListener("abort", forwardAbort); }
  }, describe, hash, modelFor };
}