import assert from "node:assert/strict";
import test from "node:test";

import { handleGetGeneration, handleStartGeneration } from "./http.js";

test("mutations exigem Origin antes da geração e leituras não enumeram sessão ausente", async () => {
  const start = await handleStartGeneration(new Request("http://localhost/api/generations", { method: "POST", body: "{}" }));
  assert.equal(start.status, 403);
  const get = await handleGetGeneration(new Request("http://localhost/api/generations/run-1"), { params: Promise.resolve({ id: "run-1" }) });
  assert.equal(get.status, 401);
});
