import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const origin = process.env.BROWSER_SERVICE_ORIGIN ?? "http://127.0.0.1:8081";
const serviceToken = process.env.BROWSER_SERVICE_TOKEN;
const profileId = process.env.BROWSER_PROFILE_ID;
const productUrl = process.env.TIKTOK_PRODUCT_URL;

if (!serviceToken || !profileId || !productUrl) {
  throw new Error("BROWSER_SERVICE_TOKEN, BROWSER_PROFILE_ID and TIKTOK_PRODUCT_URL are required");
}

const headers = {
  authorization: `Bearer ${serviceToken}`,
  "content-type": "application/json",
};

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${response.status}`);
  }
  return { status: response.status, json };
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function waitForTerminal(sessionId: string) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = await request(`/v1/browser-sessions/${sessionId}`);
    assert(result.status === 200, `session status ${result.status}`);
    const state = result.json.state;
    if (!["OPENING", "EXTRACTING"].includes(state)) return result.json;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("session did not reach a terminal or human-interaction state");
}

function handoffToken(interactiveUrl: string): string {
  const parts = new URL(interactiveUrl).pathname.split("/").filter(Boolean);
  const marker = parts.indexOf("interactive");
  if (marker < 0 || !parts[marker + 1]) throw new Error("invalid interactive URL");
  return parts[marker + 1];
}

async function closeSession(sessionId: string | undefined) {
  if (!sessionId) return;
  await request(`/v1/browser-sessions/${sessionId}/close`, "POST");
}

const health = await fetch(`${origin}/health`);
assert(health.ok, "health endpoint responds");

for (const invalidUrl of [
  "file:///tmp/page",
  "chrome://settings",
  "http://localhost/",
  "https://127.0.0.1/",
  "https://example.com/product/123",
]) {
  const rejected = await request("/v1/browser-sessions", "POST", { profileId, url: invalidUrl });
  assert([400, 422].includes(rejected.status), `rejects ${invalidUrl}`);
}

let sessionId: string | undefined;
try {
  const started = await request("/v1/browser-sessions", "POST", { profileId, url: productUrl });
  assert(started.status === 200, `starts browser session (${started.status})`);
  sessionId = started.json.sessionId;
  assert(typeof sessionId === "string", "returns opaque session id");

  const conflict = await request("/v1/browser-sessions", "POST", { profileId, url: productUrl });
  assert(conflict.status === 409, "rejects concurrent browser for the same profile");

  let state = await waitForTerminal(sessionId);
  if (["LOGIN_REQUIRED", "CAPTCHA_REQUIRED", "2FA_REQUIRED", "USER_INTERACTION_REQUIRED"].includes(state.state)) {
    assert(typeof state.interactiveUrl === "string", "returns temporary interactive URL only when blocked");
    const staleInteractiveUrl = state.interactiveUrl;
    console.log(`Abra temporariamente noVNC: ${state.interactiveUrl}`);
    const readline = createInterface({ input, output });
    await readline.question("Resolva login/CAPTCHA/2FA manualmente e pressione ENTER: ");
    readline.close();
    const resumed = await request(`/v1/browser-sessions/${sessionId}/resume`, "POST", {
      handoff: handoffToken(state.interactiveUrl),
    });
    assert(resumed.status === 200, `resumes after human interaction (${resumed.status})`);
    const revoked = await fetch(staleInteractiveUrl);
    assert(revoked.status === 404, "revokes the temporary interactive URL after resume");
    state = await waitForTerminal(sessionId);
  }

  assert(state.state === "READY", `browser is ready for extraction (${state.state})`);
  const extracted = await request(`/v1/browser-sessions/${sessionId}/extract`, "POST", {});
  assert(extracted.status === 200, `extract request accepted (${extracted.status})`);
  state = await waitForTerminal(sessionId);
  assert(state.state === "EXTRACTED", `returns EXTRACTED (${state.state})`);
  const candidate = state.candidate;
  assert(typeof candidate?.sourceUrl === "string", "candidate preserves sourceUrl");
  assert(Array.isArray(candidate?.features), "candidate returns features array");
  assert(Boolean(candidate?.name || candidate?.description || candidate?.price), "candidate contains a discovered fact");
  console.log(JSON.stringify({ state: state.state, candidate }, null, 2));
} finally {
  await closeSession(sessionId);
}

let secondSessionId: string | undefined;
try {
  const reopened = await request("/v1/browser-sessions", "POST", { profileId, url: productUrl });
  assert(reopened.status === 200, `reopens the same profile (${reopened.status})`);
  secondSessionId = reopened.json.sessionId;
  const secondState = await waitForTerminal(secondSessionId);
  console.log(`Profile reuse state: ${secondState.state}`);
  assert(secondState.state === "READY", "reopened profile retains an authenticated session");
} finally {
  await closeSession(secondSessionId);
}

console.log("SMOKE: browser service profile flow completed");
