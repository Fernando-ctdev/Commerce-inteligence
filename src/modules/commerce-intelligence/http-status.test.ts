import test from "node:test";
import assert from "node:assert/strict";
import { currentGenerationFilter, projectBriefPayload } from "./http-status";
test("current generation filter binds tenant user and product", () => { const where = currentGenerationFilter("tenant-a", "user-a", "product-a"); assert.equal(where.tenantId, "tenant-a"); assert.equal(where.userId, "user-a"); assert.equal(where.productId, "product-a"); });
test("API brief payload omits legacy scenes and retains development as a separate array", () => { assert.deepEqual(projectBriefPayload({ hook: "Hook", development: ["bullet"], script: "Oral", cta: "CTA", scenes: ["legado"] }), { hook: "Hook", development: ["bullet"], script: "Oral", cta: "CTA" }); });
test("API rejects invalid development shape instead of normalizing it to an empty array", () => {
  for (const development of [undefined, [], "bullet", ["bullet", 1], ["1", "2", "3", "4", "5"]]) {
    assert.throws(() => projectBriefPayload({ hook: "Hook", development, script: "Oral", cta: "CTA" }), /development/i);
  }
});
