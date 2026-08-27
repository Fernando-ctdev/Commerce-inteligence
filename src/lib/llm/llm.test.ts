import assert from "node:assert/strict";
import test from "node:test";

import {
  CandidateAssistProviderError,
  CandidateAssistValidationError,
  createCandidateAssistProvider,
  createConfiguredCandidateAssistProvider,
  validateCandidateAssistInput,
  validateCandidateAssistOutput,
} from "./candidate-assist";
import { LLMConfigurationError, readLLMConfig, type LLMConfig } from "./config";
import { createOpenAICompatibleProvider, LLMProviderError } from "./openai-compatible";
import type { CandidateAssistInputV1, LLMProvider } from "./types";

const env = {
  NODE_ENV: "test",
  LLM_PROVIDER: "openai-compatible",
  LLM_BASE_URL: "https://api.example.com/v1/",
  LLM_API_KEY: "test-secret",
  LLM_MODEL_FAST: "model-fast",
  LLM_MODEL_BALANCED: "model-balanced",
  LLM_MODEL_QUALITY: "model-quality",
};

const input: CandidateAssistInputV1 = {
  contract_version: "1",
  source_url: "https://shop.tiktok.com/view/product-1?tracking=secret#details",
  candidate_version: 3,
  facts: { name: "Produto", description: null },
  gaps: ["brand", "category"],
  evidence: [{ id: "evidence-1", kind: "browser-observation", excerpt: "Marca: Exemplo" }],
};

const output = {
  contract_version: "1" as const,
  suggestions: [{ field: "brand" as const, value: "Exemplo", operation: "complete" as const, evidence_ids: ["evidence-1"] }],
  unresolved: ["category" as const],
};

function validConfig(): LLMConfig {
  return {
    provider: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-secret",
    models: { fast: "fast", balanced: "balanced", quality: "quality" },
  };
}

function fakeProvider(response: unknown = output): LLMProvider {
  return {
    async complete() {
      return JSON.stringify(response);
    },
  };
}

test("readLLMConfig falha fechado para configuração incompleta, HTTP e destinos privados", () => {
  assert.equal(readLLMConfig({}), null);
  assert.throws(() => readLLMConfig({ LLM_PROVIDER: "openai-compatible" }), LLMConfigurationError);
  assert.throws(() => readLLMConfig({ ...env, LLM_MODEL_QUALITY: "" }), LLMConfigurationError);
  assert.throws(() => readLLMConfig({ ...env, LLM_PROVIDER: "other" }), LLMConfigurationError);
  for (const baseUrl of ["http://api.example.com/v1", "https://127.0.0.1/v1", "https://10.0.0.1/v1", "https://169.254.169.254/latest", "https://metadata.google.internal/v1", "https://[::1]/v1", "https://[::ffff:127.0.0.1]/v1", "https://[::ffff:7f00:1]/v1", "https://[::ffff:8.8.8.8]/v1", "https://api.example.com:8443/v1"]) {
    assert.throws(() => readLLMConfig({ ...env, LLM_BASE_URL: baseUrl }), LLMConfigurationError);
  }
});

test("readLLMConfig permite endpoint HTTP local somente com opt-in explícito de teste", () => {
  const config = readLLMConfig({ ...env, LLM_BASE_URL: "http://127.0.0.1:9999/v1/" }, { allowInsecureLocalhost: true });
  assert.equal(config?.baseUrl, "http://127.0.0.1:9999/v1");
  assert.throws(() => readLLMConfig({ ...env, LLM_BASE_URL: "http://127.0.0.1:9999/v1/" }), LLMConfigurationError);
});

test("CandidateAssist normaliza source_url e retorna metadados derivados sem enviar tentativa", async () => {
  let prompt = "";
  let systemPrompt = "";
  const provider: LLMProvider = {
    async complete(request) {
      prompt = request.user_prompt;
      systemPrompt = request.system_prompt;
      return JSON.stringify(output);
    },
  };
  const assist = createCandidateAssistProvider(provider, { fast: "fast", balanced: "balanced", quality: "quality" });
  const result = await assist.assist({ input, tier: "quality", attempt_id: "attempt-1", now: new Date("2026-08-26T12:00:00.000Z") });
  assert.deepEqual(result.output, output);
  assert.deepEqual(result.metadata, {
    provider: "openai-compatible",
    model: "quality",
    requested_at: "2026-08-26T12:00:00.000Z",
    attempt_id: "attempt-1",
    input_hash: result.metadata.input_hash,
    status: "succeeded",
  });
  assert.match(result.metadata.input_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(prompt, /tracking=secret|#details/);
  assert.equal((JSON.parse(prompt) as CandidateAssistInputV1).source_url, "https://shop.tiktok.com/view/product-1");
  assert.match(systemPrompt, /operation complete/);
  assert.match(systemPrompt, /contract_version, suggestions e unresolved/);
  assert.match(systemPrompt, /field, value, operation e evidence_ids/);
  assert.match(systemPrompt, /Título, headline, h1 e nome do produto/);
  assert.match(systemPrompt, /label\/value explícito no DOM/);
  assert.match(systemPrompt, /literal do tipo do campo/);
  assert.match(systemPrompt, /objeto exato \{amount:number,currency:string\}/);
});

test("CandidateAssist faz uma retry controlada quando a saída não cobre os gaps", async () => {
  let calls = 0;
  const prompts: string[] = [];
  const assist = createCandidateAssistProvider({
    async complete(request) {
      calls += 1;
      prompts.push(request.user_prompt);
      return JSON.stringify(calls === 1 ? { contract_version: "1", suggestions: [], unresolved: [] } : output);
    },
  }, { fast: "fast", balanced: "balanced", quality: "quality" });
  const result = await assist.assist({ input, tier: "balanced", attempt_id: "attempt-retry" });
  assert.deepEqual(result.output, output);
  assert.equal(calls, 2);
  assert.match(prompts[1] ?? "", /A resposta anterior foi rejeitada/);
});

test("CandidateAssist revisa uma saída vazia quando o DOM sustenta uma sugestão", async () => {
  let calls = 0;
  let reviewPrompt = "";
  const directInput: CandidateAssistInputV1 = {
    ...input,
    facts: { name: "Fone Bluetooth", brand: null },
    gaps: ["brand"],
    evidence: [
      { id: "dom-title", kind: "browser-observation", excerpt: "<h1>ACME Fone Bluetooth</h1>" },
      { id: "dom-brand", kind: "browser-observation", excerpt: "Marca: ACME" },
    ],
  };
  const directOutput = {
    contract_version: "1" as const,
    suggestions: [{ field: "brand" as const, value: "ACME", operation: "complete" as const, evidence_ids: ["dom-brand"] }],
    unresolved: [],
  };
  const assist = createCandidateAssistProvider({
    async complete(request) {
      calls += 1;
      reviewPrompt = request.user_prompt;
      return JSON.stringify(calls === 1
        ? { contract_version: "1", suggestions: [], unresolved: ["brand"] }
        : directOutput);
    },
  }, { fast: "fast", balanced: "balanced", quality: "quality" });

  const result = await assist.assist({ input: directInput, tier: "balanced", attempt_id: "attempt-evidence-review" });

  assert.deepEqual(result.output, directOutput);
  assert.equal(calls, 2);
  assert.match(reviewPrompt, /Revise a resposta anterior uma vez/);
  assert.match(reviewPrompt, /evidências sanitizadas/);
  assert.match(reviewPrompt, /"suggestions":\[\]/);
  assert.match(reviewPrompt, /"unresolved":\["brand"\]/);
});

test("CandidateAssist remove segredos de imagens e evidências antes do provider", async () => {
  let prompt = "";
  const redactedOutput = {
    ...output,
    suggestions: [{ ...output.suggestions[0], operation: "normalize" as const }],
    unresolved: [],
  };
  const assist = createCandidateAssistProvider({
    async complete(request) {
      prompt = request.user_prompt;
      return JSON.stringify(redactedOutput);
    },
  }, { fast: "fast", balanced: "balanced", quality: "quality" });
  await assist.assist({
    input: {
      ...input,
      facts: {
        name: "Produto token=name-secret",
        description: "Descrição Bearer description-secret https://shop.example/description?sig=signed",
        category: "Categoria api_key=category-secret",
        brand: "Marca token=brand-secret",
        seller: "Vendedor secret=seller-secret",
        features: ["Feature token=feature-secret"],
        variants: ["Variant access_token=variant-secret"],
        images: ["https://cdn.example/image.jpg?X-Amz-Signature=secret#fragment"],
      },
      gaps: [],
      evidence: [{ id: "evidence-1", kind: "browser-observation", excerpt: "Bearer secret-token token=abc123 https://cdn.example/evidence.jpg?sig=signed#fragment." }],
    },
    attempt_id: "attempt-redaction",
  });
  const sent = JSON.parse(prompt) as CandidateAssistInputV1;
  assert.deepEqual(sent.facts, {
    name: "Produto token=[REDACTED]",
    description: "Descrição Bearer [REDACTED] https://shop.example/description",
    category: "Categoria api_key=[REDACTED]",
    brand: "Marca token=[REDACTED]",
    seller: "Vendedor secret=[REDACTED]",
    features: ["Feature token=[REDACTED]"],
    variants: ["Variant access_token=[REDACTED]"],
    images: ["https://cdn.example/image.jpg"],
  });
  assert.equal(sent.evidence[0]?.excerpt, "Bearer [REDACTED] token=[REDACTED] https://cdn.example/evidence.jpg");
  assert.doesNotMatch(prompt, /secret-token|abc123|X-Amz-Signature|sig=signed|#fragment/);
});

test("CandidateAssist valida schema por campo e cobre todos os gaps", () => {
  assert.deepEqual(validateCandidateAssistInput({ ...input, facts: { name: "Produto", price: { amount: 12.5, currency: "BRL" }, features: ["Compacto"] } }).facts, { name: "Produto", price: { amount: 12.5, currency: "BRL" }, features: ["Compacto"] });
  assert.deepEqual(validateCandidateAssistInput({ ...input, facts: { name: "Produto", price: { amount: 12.34, currency: "BRL" } } }).facts, { name: "Produto", price: { amount: 12.34, currency: "BRL" } });
  assert.throws(() => validateCandidateAssistInput({ ...input, facts: { name: "Produto", price: { amount: 12.345, currency: "BRL" } } }), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistInput({ ...input, source_url: "https://127.0.0.1/product" }), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistInput({ ...input, facts: { name: "Produto", images: ["https://127.0.0.1/image.jpg"] } }), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistInput({ ...input, facts: { ...(input.facts as Record<string, unknown>), price: { amount: 12.5, currency: "BRL", secret: "no" } } }), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistInput({ ...input, facts: { ...(input.facts as Record<string, unknown>), brand: { value: "Exemplo" } } }), CandidateAssistValidationError);
  let deep: Record<string, unknown> = { value: "too-deep" };
  for (let level = 0; level < 9; level += 1) deep = { nested: deep };
  assert.throws(() => validateCandidateAssistInput({ ...input, facts: { name: "Produto", description: deep } }), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistOutput({ ...output, suggestions: [{ ...output.suggestions[0], value: { arbitrary: true } }] }, input), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistOutput({ ...output, suggestions: [...output.suggestions, { field: "price", value: { amount: 12.345, currency: "BRL" }, operation: "normalize", evidence_ids: ["evidence-1"] }] }, input), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistOutput({ ...output, suggestions: [], unresolved: ["brand"] }, input), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistOutput({ ...output, suggestions: [{ ...output.suggestions[0], operation: "normalize" }] }, input), CandidateAssistValidationError);
  assert.throws(() => validateCandidateAssistOutput({ ...output, tenantId: "tenant-1" }, input), CandidateAssistValidationError);

  const noBrandGapInput = validateCandidateAssistInput({ ...input, facts: { name: "Produto", category: null }, gaps: ["category"] });
  assert.throws(() => validateCandidateAssistOutput({ ...output, suggestions: [{ ...output.suggestions[0], operation: "normalize" }] }, noBrandGapInput), CandidateAssistValidationError);
  const presentBrandInput = validateCandidateAssistInput({ ...input, facts: { name: "Produto", brand: "Exemplo" }, gaps: ["category"] });
  assert.throws(() => validateCandidateAssistOutput(output, presentBrandInput), CandidateAssistValidationError);
  assert.deepEqual(validateCandidateAssistOutput({ ...output, suggestions: [{ ...output.suggestions[0], operation: "normalize" }] }, presentBrandInput).suggestions[0]?.operation, "normalize");
});

test("falhas de provider expõem apenas metadados sanitizados e status failed", async () => {
  const assist = createCandidateAssistProvider({ complete: async () => { throw new Error("provider-key=test-secret prompt=private"); } }, { fast: "fast", balanced: "balanced", quality: "quality" });
  await assert.rejects(() => assist.assist({ input, attempt_id: "attempt-2" }), (error: unknown) => {
    assert.ok(error instanceof CandidateAssistProviderError);
    assert.equal(error.metadata.status, "failed");
    assert.equal(error.metadata.attempt_id, "attempt-2");
    assert.match(error.metadata.input_hash, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(error.message, /test-secret|private/);
    return true;
  });
});

test("adapter OpenAI-compatible usa fetch fake e nunca carrega resposta acima do limite", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const fetchFake: typeof fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { headers: { "content-type": "application/json" } });
  };
  const publicResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];
  const provider = createOpenAICompatibleProvider(validConfig(), fetchFake, publicResolver);
  const content = await provider.complete({ model: "balanced", system_prompt: "system", user_prompt: "user" });
  assert.equal(content, JSON.stringify(output));
  assert.equal(request?.url, "https://api.example.com/v1/chat/completions");
  assert.equal(request?.init?.method, "POST");
  assert.equal(request?.init?.redirect, "error");
  assert.equal(new Headers(request?.init?.headers).get("authorization"), "Bearer test-secret");
  const requestBody = JSON.parse(String(request?.init?.body)) as { model: string; temperature: number };
  assert.equal(requestBody.model, "balanced");
  assert.equal(requestBody.temperature, 0);

  const oversized = createOpenAICompatibleProvider(validConfig(), async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(32_000)));
      controller.enqueue(new TextEncoder().encode("x".repeat(33_000)));
      controller.close();
    },
  })), publicResolver);
  await assert.rejects(() => oversized.complete({ model: "balanced", system_prompt: "system", user_prompt: "user" }), (error: unknown) => error instanceof LLMProviderError && error.code === "LLM_PROVIDER_RESPONSE_TOO_LARGE");

  const failed = createOpenAICompatibleProvider(validConfig(), async () => new Response("provider-key=test-secret prompt=user", { status: 502 }), publicResolver);
  await assert.rejects(() => failed.complete({ model: "balanced", system_prompt: "system", user_prompt: "user" }), (error: unknown) => {
    assert.ok(error instanceof LLMProviderError);
    assert.doesNotMatch((error as Error).message, /test-secret|prompt=user/);
    return true;
  });
});

test("adapter OpenAI-compatible rejeita qualquer endereço inseguro retornado pelo DNS antes do fetch", async () => {
  let fetchCalled = false;
  const fetchFake: typeof fetch = async () => {
    fetchCalled = true;
    return new Response();
  };
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "::ffff:8.8.8.8"]) {
    const provider = createOpenAICompatibleProvider(validConfig(), fetchFake, async () => [{ address, family: address.includes(":") ? 6 : 4 } as const]);
    await assert.rejects(() => provider.complete({ model: "balanced", system_prompt: "system", user_prompt: "user" }), (error: unknown) => error instanceof LLMProviderError && error.code === "LLM_PROVIDER_REQUEST_FAILED");
  }
  assert.equal(fetchCalled, false);
});

test("factory configurada usa env completo e chama endpoint OpenAI-compatible simulado", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const provider = createConfiguredCandidateAssistProvider(env, async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { headers: { "content-type": "application/json" } });
  }, async () => [{ address: "93.184.216.34", family: 4 as const }]);
  assert.ok(provider);
  const result = await provider.assist({ input, tier: "balanced", attempt_id: "attempt-configured" });
  assert.deepEqual(result.output, output);
  assert.equal(request?.url, "https://api.example.com/v1/chat/completions");
  assert.equal(new Headers(request?.init?.headers).get("accept"), "application/json");
  assert.equal(new Headers(request?.init?.headers).get("content-type"), "application/json");
  assert.equal((JSON.parse(String(request?.init?.body)) as { model: string }).model, "model-balanced");
});

test("configuração ausente desabilita assistência sem fazer chamada", () => {
  assert.equal(createConfiguredCandidateAssistProvider({}), null);
});
