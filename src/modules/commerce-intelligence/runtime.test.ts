import test from "node:test";
import assert from "node:assert/strict";
import { generationHealth, heartbeat, resetHeartbeatForTests } from "./runtime";
test("liveness is unavailable before heartbeat and ok after heartbeat", () => { resetHeartbeatForTests(); try { assert.equal(generationHealth().status, "unavailable"); heartbeat(); assert.equal(generationHealth().status, "ok"); } finally { resetHeartbeatForTests(); } });
