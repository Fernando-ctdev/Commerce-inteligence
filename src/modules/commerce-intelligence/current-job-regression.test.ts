import test from "node:test";
import assert from "node:assert/strict";
import { activeJobWhere } from "./service";
import { currentGenerationFilter } from "./http-status";
test("POST blocker and current lookup share tenant/user/status scope", () => { const active = activeJobWhere("tenant-a", "user-a"); const current = currentGenerationFilter("tenant-a", "user-a"); assert.equal(active.tenantId, current.tenantId); assert.equal(active.userId, current.userId); assert.deepEqual(active.status.in.every((status) => current.status.in.includes(status)), true); });
