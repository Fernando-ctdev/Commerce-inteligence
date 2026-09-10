import { GenerationError } from "./errors";
import {
  assertProviderOutput,
  instructionHash,
  ROUTER_MAP,
  type IntelligenceTier,
  type LogicalTask,
  type ModelRouter,
  type ProviderCallMetrics,
} from "./model-router";
type ProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
  models?: Partial<Record<IntelligenceTier, string>>;
  timeoutMs: number;
};

// Roteamento por tier com as variáveis existentes: LOW→LLM_MODEL_FAST, MID→LLM_MODEL_BALANCED,
// HIGH→LLM_MODEL_QUALITY, com fallback apenas entre essas variáveis (nenhuma variável nova).
function configFromEnv(): ProviderConfig {
  const fast =
    process.env.LLM_MODEL_FAST ?? process.env.GENERATION_PROVIDER_MODEL;
  const balanced = process.env.LLM_MODEL_BALANCED ?? fast;
  const quality = process.env.LLM_MODEL_QUALITY ?? balanced;
  const models: Partial<Record<IntelligenceTier, string>> = {
    LOW: fast,
    MID: balanced,
    HIGH: quality,
  };
  return {
    baseUrl: process.env.LLM_BASE_URL ?? process.env.GENERATION_PROVIDER_URL,
    apiKey: process.env.LLM_API_KEY ?? process.env.GENERATION_PROVIDER_API_KEY,
    models,
    timeoutMs: Number(process.env.GENERATION_PROVIDER_TIMEOUT_MS ?? 180000),
  };
}
function modelForTier(config: ProviderConfig, task: LogicalTask): string {
  return config.models?.[ROUTER_MAP[task]] ?? "";
}
export function providerRuntimeConfig(config = configFromEnv()) {
  return {
    configured: Boolean(
      config.baseUrl &&
      config.apiKey &&
      modelForTier(config, "PRODUCT_UNDERSTANDING"),
    ),
    baseUrl: config.baseUrl ? new URL(config.baseUrl).origin : null,
    modelConfigured: Boolean(modelForTier(config, "PRODUCT_UNDERSTANDING")),
    timeoutMs: config.timeoutMs,
  };
}
const INSTRUCTION: Record<LogicalTask, string> = {
  PRODUCT_UNDERSTANDING:
    "Inclua productId e arrays não vazios coreUseCases, capabilities, functionalBenefits, emotionalBenefits, desiredOutcomes, purchaseTriggers, purchaseBarriers, communicationRisks, evidenceRefs. Não inclua status, tenantId, userId, quota, provider, model, tier ou comandos de workflow.",
  COMMERCIAL_OPPORTUNITY_MAPPING:
    "Objetivo único: mapear oportunidades comerciais. Retorne APENAS um envelope JSON com as chaves audiences, situations, pains, desires, objections (arrays de strings com pelo menos 1 item cada) e opportunities: array NÃO VAZIO com NO MÁXIMO maxOpportunities itens (valor recebido no contexto). Cada opportunity tem audience, situation, pain, desire, desiredOutcome, objection (quando houver evidência), relevantCapabilities, benefits, proofOptions, sellingArgument, confidence (0 a 1) e evidenceRefs (refs apenas do evidenceRefsCatalog). Sem texto fora do JSON, sem análise ou raciocínio no corpo; não inclua ids persistentes, ownership, status, quota, provider, model, tier ou comandos de workflow.",
  STRATEGY_SYNTHESIS:
    "Retorne um objeto JSON raiz com as chaves canônicas da Strategy: primaryPositioning (string não vazia), audiences, priorityBenefits, priorityObjections, priorityArguments, priorityAngles, communicationPrinciples e communicationRisks (cada uma um array de strings com pelo menos 1 item). Não inclua objective, positioning, audience ou contentPillars; não inclua status, tenantId, userId, quota, provider, model, tier ou comandos de workflow.",
  CONTENT_PLAN_GENERATION:
    "Retorne um objeto JSON raiz (NUNCA array) com as chaves platformId e opportunities: um array com quantidade EXATA de oportunidades de conteúdo igual ao targetContentCount recebido. Cada opportunity tem commercialObjective, angle, coreMessage, hookMechanism e noveltyTargets (array de strings com pelo menos 1 item; nunca vazio). Não coloque texto fora do JSON; não inclua ownership, status, quota, provider, model, tier ou comandos de workflow.",
  CONTENT_BRIEF_GENERATION:
    "Retorne um objeto JSON raiz com o campo items contendo EXATAMENTE a mesma quantidade de briefings que oportunidades recebidas na entrada, um briefing por oportunidade, na mesma ordem. Cada briefing tem angle, hook, script, scenes (array JSON com 2 a 6 strings não vazias; nunca string única, nunca array vazio, nunca fora dessa faixa) e cta. A quantidade de items deve ser exatamente igual à quantidade de oportunidades recebidas; nunca omita, adicione ou duplique. Não inclua contentId, briefVersionId, ownership, status, quota, provider, model, tier ou comandos de workflow.",
};
// ADR-017: correlação sanitizada — header precede; na ausência de header, apenas a chave
// raiz JSON `id` do corpo (nunca o corpo/mensagem). ASCII 1–200; inválido omite ambos.
const PROVIDER_REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;
type ProviderRequestCorrelation = {
  providerRequestId?: string;
  providerRequestIdSource?: "header" | "body.id";
};
const requestIdHeader = (headers: Headers): string | null =>
  ["x-request-id", "request-id"]
    .map((header) => headers.get(header))
    .find((value) => value != null) ?? null;
const providerCorrelationOf = (
  headers: Headers,
  bodyRootId: unknown,
): ProviderRequestCorrelation => {
  const headerValue = requestIdHeader(headers);
  if (headerValue !== null)
    return PROVIDER_REQUEST_ID_RE.test(headerValue)
      ? { providerRequestId: headerValue, providerRequestIdSource: "header" }
      : {};
  if (typeof bodyRootId === "string" && PROVIDER_REQUEST_ID_RE.test(bodyRootId))
    return {
      providerRequestId: bodyRootId,
      providerRequestIdSource: "body.id",
    };
  return {};
};
// Fallback em cadeia LOW→MID→HIGH (decisão do usuário; um passo por tier, uma vez por tier):
// apenas falhas de disponibilidade (timeout próprio, conexão, HTTP 408/429/502/503/504).
// Nunca schema/gates/factualidade (GEN-SCHEMA segue fail-closed), nunca abort externo
// (fencing/cancelamento) e nunca erro de configuração (4xx fora da lista).
const FALLBACK_STATUSES: ReadonlySet<number> = new Set([408, 429, 502, 503, 504]);
const TIER_CHAIN: readonly IntelligenceTier[] = ["LOW", "MID", "HIGH"];
type FallbackFailure = {
  kind: "timeout" | "connection" | "http_status";
  providerStatus: number | null;
  requestBytes: number;
  durationMs: number;
};

export function createHttpProvider(config = configFromEnv()): ModelRouter {
  const instruction = (task: LogicalTask): string =>
    INSTRUCTION[task] ??
    "Retorne JSON compatível com o contrato solicitado; não inclua ownership, status ou comandos de workflow.";
  const modelFor = (task: LogicalTask): string => modelForTier(config, task);
  const guard = (task: LogicalTask): void => {
    if (!modelFor(task))
      throw new GenerationError(
        "GEN-PROVIDER",
        "Modelo não configurado para a tarefa",
        true,
        { task },
      );
  };
  const hash = (task: LogicalTask) => instructionHash(INSTRUCTION[task] ?? "");
  const describe = () => ({
    provider: "openai-compatible",
    model: modelFor("PRODUCT_UNDERSTANDING") || "unset",
    instructionVersion: "slice-003",
  });
  // Uma tentativa do provider com o modelo dado. Quando `failure` é fornecido, falhas
  // elegíveis a fallback são classificadas nele antes do throw; todo o restante permanece
  // fail-closed exatamente como antes (GEN-SCHEMA, 4xx fora da lista, abort externo).
  const completeOnce = async (
    task: LogicalTask,
    input: { trustedContext: unknown; externalData?: unknown },
    signal: AbortSignal | undefined,
    onMetrics: ((metrics: ProviderCallMetrics) => void) | undefined,
    model: string,
    endpoint: string,
    failure?: Partial<FallbackFailure>,
  ): Promise<unknown> => {
    const endpointOrigin = new URL(endpoint).origin;
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener("abort", forwardAbort, { once: true });
    let providerStatus: number | null = null;
    let providerCorrelation: ProviderRequestCorrelation = {};
    let responseBytes: number | null = null;
    let requestBytes = 0;
    let trustedContextBytes = 0;
    let externalBytes = 0;
    const report = () =>
      onMetrics?.({
        model,
        reasoning: "low",
        providerStatus,
        requestBytes,
        trustedContextBytes,
        externalBytes,
        responseBytes,
        durationMs: Date.now() - startedAt,
        ...providerCorrelation,
      });
    try {
      trustedContextBytes = Buffer.byteLength(
        JSON.stringify(input.trustedContext),
        "utf8",
      );
      externalBytes = Buffer.byteLength(
        JSON.stringify(input.externalData ?? {}),
        "utf8",
      );
      const promptInstruction = instruction(task);
      const body = JSON.stringify({
        model,
        temperature: 0.2,
        reasoning: { effort: "low" },
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Retorne somente JSON compatível com o contrato solicitado. ${promptInstruction}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              task,
              trustedContext: input.trustedContext,
              externalData: input.externalData ?? {},
            }),
          },
        ],
      });
      requestBytes = Buffer.byteLength(body, "utf8");
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body,
      });
      providerStatus = response.status;
      if (!response.ok) {
        // ADR-017: extrai somente a chave raiz `id` do corpo de erro (nunca o corpo/mensagem).
        let errorBodyRootId: unknown;
        try {
          errorBodyRootId = (
            JSON.parse(await response.text()) as Record<string, unknown>
          )?.id;
        } catch {
          errorBodyRootId = undefined;
        }
        providerCorrelation = providerCorrelationOf(
          response.headers,
          requestIdHeader(response.headers) === null
            ? errorBodyRootId
            : undefined,
        );
        const rate: Record<string, string> = {};
        for (const header of [
          "retry-after",
          "x-ratelimit-reset",
          "x-ratelimit-remaining",
          "x-ratelimit-limit",
        ]) {
          const value = response.headers.get(header);
          if (value) rate[header] = value;
        }
        // Classificação para fallback ANTES do throw (mesmo erro/telemetria de sempre).
        if (failure && !signal?.aborted && FALLBACK_STATUSES.has(providerStatus))
          Object.assign(failure, {
            kind: "http_status",
            providerStatus,
            requestBytes,
            durationMs: Date.now() - startedAt,
          } satisfies FallbackFailure);
        console.info("[generation-provider] metrics", {
          task,
          tier: ROUTER_MAP[task],
          model,
          endpoint: endpointOrigin,
          durationMs: Date.now() - startedAt,
          providerStatus,
          errorKind: "http_status",
          rate,
          timeoutMs: config.timeoutMs,
          ok: false,
          errorName: "http_status",
          ...providerCorrelation,
        });
        throw new GenerationError(
          "GEN-PROVIDER",
          "Provider indisponível",
          true,
          {
            task,
            providerStatus,
            errorKind: "http_status",
            model,
            endpoint: endpointOrigin,
            ...providerCorrelation,
            ...(Object.keys(rate).length > 0 ? { rate } : {}),
          },
        );
      }
      const text = await response.text();
      responseBytes = Buffer.byteLength(text, "utf8");
      let envelope: {
        choices?: Array<{ message?: { content?: string } }>;
        id?: unknown;
      } | null = null;
      let content: unknown;
      try {
        envelope = JSON.parse(text) as {
          choices?: Array<{ message?: { content?: string } }>;
          id?: unknown;
        };
        content = envelope?.choices?.[0]?.message?.content;
      } catch {
        throw new GenerationError(
          "GEN-SCHEMA",
          "Resposta JSON do provider inválida",
        );
      }
      if (typeof content !== "string")
        throw new GenerationError(
          "GEN-SCHEMA",
          "Resposta do provider sem conteúdo",
        );
      providerCorrelation = providerCorrelationOf(
        response.headers,
        requestIdHeader(response.headers) === null ? envelope?.id : undefined,
      );
      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(content);
      } catch {
        throw new GenerationError(
          "GEN-SCHEMA",
          "Conteúdo do provider sem contrato JSON",
        );
      }
      // Guard de tipo raiz ANTES da métrica: array/não-objeto é GEN-SCHEMA tipado com
      // detail, não GEN-PROVIDER genérico pós-métrica (regressão do job count16).
      if (
        !parsedContent ||
        typeof parsedContent !== "object" ||
        Array.isArray(parsedContent)
      ) {
        console.info("[generation-provider] metrics", {
          task,
          tier: ROUTER_MAP[task],
          model,
          endpoint: endpointOrigin,
          instructionHash: instructionHash(promptInstruction),
          durationMs: Date.now() - startedAt,
          providerStatus,
          responseBytes,
          timeoutMs: config.timeoutMs,
          ok: false,
          errorName: "GEN-SCHEMA-root-shape",
          ...providerCorrelation,
        });
        throw new GenerationError(
          "GEN-SCHEMA",
          "Resposta do provider deve ser um objeto JSON",
          true,
          {
            task,
            providerStatus,
            rootShape: Array.isArray(parsedContent)
              ? "array"
              : typeof parsedContent,
            model,
            endpoint: endpointOrigin,
            ...providerCorrelation,
          },
        );
      }
      const checked = assertProviderOutput(parsedContent);
      console.info("[generation-provider] metrics", {
        task,
        tier: ROUTER_MAP[task],
        model,
        endpoint: endpointOrigin,
        reasoning: "low",
        instructionHash: instructionHash(promptInstruction),
        durationMs: Date.now() - startedAt,
        requestBytes,
        trustedContextBytes,
        externalBytes,
        responseBytes,
        providerStatus,
        timeoutMs: config.timeoutMs,
        ok: true,
        ...providerCorrelation,
      });
      return checked;
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      const name =
        error instanceof Error
          ? error.name
          : typeof error === "string"
            ? error
            : "unknown error";
      const message = error instanceof Error ? error.message : String(error);
      // Timeout próprio (timer) ou falha de conexão são elegíveis; abort externo
      // (fencing/cancelamento) nunca cai em fallback.
      if (failure && !signal?.aborted)
        Object.assign(failure, {
          kind: timedOut ? "timeout" : "connection",
          providerStatus,
          requestBytes,
          durationMs: Date.now() - startedAt,
        } satisfies FallbackFailure);
      console.info("[generation-provider] metrics", {
        task,
        tier: ROUTER_MAP[task],
        model,
        endpoint: endpointOrigin,
        instructionHash: instructionHash(INSTRUCTION[task] ?? ""),
        durationMs: Date.now() - startedAt,
        providerStatus,
        responseBytes,
        timeoutMs: config.timeoutMs,
        ok: false,
        errorName: name,
        ...providerCorrelation,
      });
      throw new GenerationError(
        "GEN-PROVIDER",
        "Provider indisponível",
        true,
        {
          task,
          providerStatus,
          model,
          endpoint: endpointOrigin,
          ...providerCorrelation,
          error: { name, message },
        },
      );
    } finally {
      report();
      clearTimeout(timer);
      signal?.removeEventListener("abort", forwardAbort);
    }
  };
  return {
    async complete(
      task: LogicalTask,
      input: { trustedContext: unknown; externalData?: unknown },
      signal?: AbortSignal,
      onMetrics?: (metrics: ProviderCallMetrics) => void,
    ): Promise<unknown> {
      const base = config.baseUrl;
      if (
        !base ||
        !config.apiKey ||
        !config.models ||
        !Number.isFinite(config.timeoutMs) ||
        config.timeoutMs <= 0
      )
        throw new GenerationError("GEN-PROVIDER", "Provider não configurado");
      // Gate interno: evidência de modelo/endpoint efetivos em toda falha persistida.
      guard(task);
      const endpoint = base.replace(/\/$/, "").endsWith("/chat/completions")
        ? base
        : `${base.replace(/\/$/, "")}/chat/completions`;
      // Cadeia de fallback do tier base para cima, apenas com modelos efetivamente
      // distintos do modelo corrente (modelo repetido não re-solicita).
      const baseModel = modelFor(task);
      const chain: string[] = [];
      let current = baseModel;
      for (
        const tier of TIER_CHAIN.slice(TIER_CHAIN.indexOf(ROUTER_MAP[task]) + 1)
      ) {
        const candidate = config.models?.[tier];
        if (candidate && candidate !== current) {
          chain.push(candidate);
          current = candidate;
        }
      }
      const attempts: Array<{
        model: string;
        failure?: Partial<FallbackFailure>;
      }> = [
        { model: baseModel, failure: chain.length > 0 ? {} : undefined },
        ...chain.map((model) => ({ model })),
      ];
      let lastFailure: FallbackFailure | undefined;
      let lastFailedModel = "";
      let retryCount = 0;
      for (const attempt of attempts) {
        // Registro de retry/custo: as métricas da tentativa corrente carregam a tentativa
        // sacrifada anterior (retry=N e custo da última falha) para o registro de capability;
        // job.attempt não muda.
        const metrics = lastFailure
          ? (attemptMetrics: ProviderCallMetrics) =>
              onMetrics?.({
                ...attemptMetrics,
                retry: retryCount,
                fallback: {
                  from: lastFailedModel,
                  reason: lastFailure!.kind,
                  providerStatus: lastFailure!.providerStatus,
                  requestBytes: lastFailure!.requestBytes,
                  durationMs: lastFailure!.durationMs,
                },
              })
          : onMetrics;
        try {
          return await completeOnce(
            task,
            input,
            signal,
            metrics,
            attempt.model,
            endpoint,
            attempt.failure,
          );
        } catch (error) {
          if (!attempt.failure?.kind) throw error;
          lastFailure = attempt.failure as FallbackFailure;
          lastFailedModel = attempt.model;
          retryCount += 1;
          console.info("[generation-provider] fallback", {
            task,
            tier: ROUTER_MAP[task],
            from: attempt.model,
            reason: lastFailure.kind,
            providerStatus: lastFailure.providerStatus,
            requestBytes: lastFailure.requestBytes,
            durationMs: lastFailure.durationMs,
          });
        }
      }
      // Inalcançável: a última tentativa da cadeia não tem `failure` e sempre re-propaga.
      throw new GenerationError("GEN-PROVIDER", "Provider indisponível");
    },
    describe,
    hash,
    modelFor,
  };
}
