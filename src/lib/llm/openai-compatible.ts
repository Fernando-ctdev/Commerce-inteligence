import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import "./server-only";
import { isLocalHost, isPrivateHost, type LLMConfig } from "./config";
import type { LLMCompletionRequest, LLMProvider } from "./types";

const COMPLETIONS_PATH = "/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PROMPT_LENGTH = 48_000;
const MAX_RESPONSE_LENGTH = 64_000;

type ResolvedAddress = { address: string; family: 4 | 6 };
export type LLMHostResolver = (hostname: string) => Promise<ReadonlyArray<ResolvedAddress>>;

const resolveHost: LLMHostResolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));

export type LLMProviderErrorCode =
  | "LLM_PROVIDER_REQUEST_INVALID"
  | "LLM_PROVIDER_REQUEST_FAILED"
  | "LLM_PROVIDER_HTTP_ERROR"
  | "LLM_PROVIDER_RESPONSE_INVALID"
  | "LLM_PROVIDER_RESPONSE_TOO_LARGE";

export class LLMProviderError extends Error {
  constructor(readonly code: LLMProviderErrorCode) {
    super(code);
    this.name = "LLMProviderError";
  }
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function completionUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${COMPLETIONS_PATH}`;
}

function contentFromPayload(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { choices?: unknown }).choices)) return null;
  const choice = (payload as { choices: unknown[] }).choices[0];
  if (typeof choice !== "object" || choice === null) return null;
  const message = (choice as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.length <= MAX_RESPONSE_LENGTH ? content : null;
}

async function readLimitedResponseText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_LENGTH) {
        try {
          await reader.cancel();
        } catch {
          // The response is already being rejected; cancellation failure is not actionable.
        }
        throw new LLMProviderError("LLM_PROVIDER_RESPONSE_TOO_LARGE");
      }
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

async function assertSafeEgress(config: LLMConfig, resolver: LLMHostResolver): Promise<void> {
  const url = new URL(config.baseUrl);
  const localTestEndpoint = config.allowInsecureLocalhost === true && isLocalHost(url.hostname);
  if (url.protocol !== "https:" && !(localTestEndpoint && url.protocol === "http:")) throw new Error("invalid endpoint");
  if (url.username || url.password || url.search || url.hash) throw new Error("invalid endpoint");
  if (!localTestEndpoint && (isPrivateHost(url.hostname) || (url.port !== "" && url.port !== "443"))) throw new Error("invalid endpoint");
  if (localTestEndpoint) return;

  const addresses = await resolver(url.hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isIP(address) === 0 || isPrivateHost(address))) throw new Error("unsafe endpoint");
}

/** OpenAI-compatible wire adapter. It returns content only; provider payloads never cross this boundary. */
export function createOpenAICompatibleProvider(config: LLMConfig, fetchImpl: typeof fetch = fetch, resolver: LLMHostResolver = resolveHost): LLMProvider {
  return {
    async complete(request: LLMCompletionRequest): Promise<string> {
      if (!validText(request.model, 200) || !validText(request.system_prompt, MAX_PROMPT_LENGTH) || !validText(request.user_prompt, MAX_PROMPT_LENGTH)) {
        throw new LLMProviderError("LLM_PROVIDER_REQUEST_INVALID");
      }

      let response: Response;
      try {
        await assertSafeEgress(config, resolver);
        response = await fetchImpl(completionUrl(config.baseUrl), {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            messages: [
              { role: "system", content: request.system_prompt },
              { role: "user", content: request.user_prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0,
          }),
          redirect: "error",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch {
        throw new LLMProviderError("LLM_PROVIDER_REQUEST_FAILED");
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_LENGTH) {
        throw new LLMProviderError("LLM_PROVIDER_RESPONSE_TOO_LARGE");
      }

      let raw: string;
      try {
        raw = await readLimitedResponseText(response);
      } catch (error) {
        if (error instanceof LLMProviderError) throw error;
        throw new LLMProviderError("LLM_PROVIDER_RESPONSE_INVALID");
      }
      if (raw.length > MAX_RESPONSE_LENGTH) throw new LLMProviderError("LLM_PROVIDER_RESPONSE_TOO_LARGE");
      if (!response.ok) throw new LLMProviderError("LLM_PROVIDER_HTTP_ERROR");

      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new LLMProviderError("LLM_PROVIDER_RESPONSE_INVALID");
      }
      const content = contentFromPayload(payload);
      if (content === null) throw new LLMProviderError("LLM_PROVIDER_RESPONSE_INVALID");
      return content;
    },
  };
}
