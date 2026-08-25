import assert from "node:assert/strict";
import test from "node:test";

import {
  GeneratedContentsLimitReachedError,
  monthlyPeriodStart,
  resolveGeneratedContentsMonthlyLimit,
} from "./generation.js";
import { CapacityUnavailableError } from "./service.js";

test("limite mensal de Contents é server-side e o período usa UTC", () => {
  const saved = process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
  try {
    process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = "30";
    assert.equal(resolveGeneratedContentsMonthlyLimit(), 30);
    assert.equal(monthlyPeriodStart(new Date("2026-03-31T23:59:59.000Z")).toISOString(), "2026-03-01T00:00:00.000Z");
    assert.equal(monthlyPeriodStart(new Date("2026-04-01T00:00:00.000Z")).toISOString(), "2026-04-01T00:00:00.000Z");
    delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
    assert.throws(() => resolveGeneratedContentsMonthlyLimit(), CapacityUnavailableError);
  } finally {
    if (saved === undefined) delete process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH;
    else process.env.ENTITLEMENT_GENERATED_CONTENTS_MONTH = saved;
  }
  assert.equal(GeneratedContentsLimitReachedError.name, "GeneratedContentsLimitReachedError");
});
