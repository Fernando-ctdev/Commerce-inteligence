import test from "node:test";
import assert from "node:assert/strict";
import { currentGenerationFilter } from "./http-status";
test("current generation filter binds tenant user and product", () => { const where = currentGenerationFilter("tenant-a", "user-a", "product-a"); assert.equal(where.tenantId, "tenant-a"); assert.equal(where.userId, "user-a"); assert.equal(where.productId, "product-a"); });
