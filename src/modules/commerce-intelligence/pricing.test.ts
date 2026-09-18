import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";

import { calculateCost, resolveProviderModelPrice, PriceCatalogError, type PriceBook, type PriceReader, type TokenUsage } from "./pricing";

type Row = {
  id: string;
  version: number;
  currency: string;
  inputPerMillionMinor: string | null;
  outputPerMillionMinor: string | null;
  reasoningPerMillionMinor: string | null;
  cachedPerMillionMinor: string | null;
};

function reader(rows: Row[]): PriceReader {
  return { providerModelPrice: { findMany: async () => rows } } as unknown as PriceReader;
}

function row(overrides: Partial<Row>): Row {
  return {
    id: "price-1",
    version: 1,
    currency: "BRL",
    inputPerMillionMinor: null,
    outputPerMillionMinor: null,
    reasoningPerMillionMinor: null,
    cachedPerMillionMinor: null,
    ...overrides,
  };
}

const usage = (overrides: Partial<TokenUsage>): TokenUsage => ({ inputTokens: null, outputTokens: null, reasoningTokens: null, cachedTokens: null, ...overrides });

const brlPrice: PriceBook = {
  currency: "BRL",
  inputPerMillionMinor: "1000000",
  outputPerMillionMinor: "2000000",
  reasoningPerMillionMinor: null,
  cachedPerMillionMinor: "500000",
};

test("selects the price version active at call time", async () => {
  const v1 = row({ id: "price-1", version: 1 });
  const v2 = row({ id: "price-2", version: 2 });
  const first = await resolveProviderModelPrice(reader([v1]), "openai-compatible", "model-a", new Date("2026-09-18T12:00:00Z"), "BRL");
  const second = await resolveProviderModelPrice(reader([v2]), "openai-compatible", "model-a", new Date("2026-09-18T12:00:00Z"), "BRL");
  assert.equal(first?.version, 1);
  assert.equal(second?.version, 2);
});

test("returns null when no row is active", async () => {
  const price = await resolveProviderModelPrice(reader([]), "openai-compatible", "model-a", new Date("2026-09-18T12:00:00Z"), "BRL");
  assert.equal(price, null);
});

test("normalizes preferred currency", async () => {
  const price = await resolveProviderModelPrice(reader([row({ currency: "BRL" })]), "p", "m", new Date(), "brl");
  assert.equal(price?.currency, "BRL");
});

test("rejects overlapping active versions in the same currency", async () => {
  await assert.rejects(
    resolveProviderModelPrice(reader([row({ id: "a" }), row({ id: "b" })]), "p", "m", new Date(), "BRL"),
    PriceCatalogError,
  );
});

test("rejects ambiguous active currencies without preferred currency", async () => {
  await assert.rejects(
    resolveProviderModelPrice(reader([row({ currency: "BRL" }), row({ id: "x", currency: "USD" })]), "p", "m", new Date()),
    PriceCatalogError,
  );
});

test("resolves when exactly one active currency exists without preferred currency", async () => {
  const price = await resolveProviderModelPrice(reader([row({})]), "p", "m", new Date());
  assert.equal(price?.currency, "BRL");
});

test("calculates non-overlapping buckets exactly (cached input, reasoning inside output)", () => {
  const result = calculateCost(
    usage({ inputTokens: 1_000, outputTokens: 400, reasoningTokens: 100, cachedTokens: 250 }),
    brlPrice,
  );
  assert.equal(result.completeness, "COMPLETE");
  assert.equal(result.amountMinor, "1675");
  assert.equal(result.currency, "BRL");
});

test("zero reported usage prices to zero COMPLETE", () => {
  const result = calculateCost(usage({ inputTokens: 0, outputTokens: 0 }), brlPrice);
  assert.equal(result.completeness, "COMPLETE");
  assert.equal(result.amountMinor, "0");
});

test("output-only usage with priced output is COMPLETE (absent input is not a gap)", () => {
  const result = calculateCost(usage({ outputTokens: 400 }), brlPrice);
  assert.equal(result.completeness, "COMPLETE");
  assert.equal(result.amountMinor, "800");
});

test("missing price is UNAVAILABLE", () => {
  const result = calculateCost(usage({ inputTokens: 100 }), null);
  assert.equal(result.completeness, "UNAVAILABLE");
  assert.equal(result.amountMinor, null);
});

test("entirely missing usage is UNAVAILABLE", () => {
  const result = calculateCost(usage({}), brlPrice);
  assert.equal(result.completeness, "UNAVAILABLE");
  assert.equal(result.amountMinor, null);
});

test("cached tokens without cached price mark PARTIAL and exclude the cached bucket", () => {
  const result = calculateCost(
    usage({ inputTokens: 1_000, cachedTokens: 250 }),
    { currency: "BRL", inputPerMillionMinor: "1000000", outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: null },
  );
  // apenas input não-cached (750) é precificado; cached sem preço não sofre fallback silencioso
  assert.equal(result.completeness, "PARTIAL");
  assert.equal(result.amountMinor, "750");
});

test("cached tokens without input base mark PARTIAL and bill cached alone", () => {
  const result = calculateCost(
    usage({ cachedTokens: 250 }),
    { currency: "BRL", inputPerMillionMinor: "1000000", outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: "500000" },
  );
  assert.equal(result.completeness, "PARTIAL");
  assert.equal(result.amountMinor, "125");
});

test("reasoning with own rate but without outputTokens marks PARTIAL (subset base unknown)", () => {
  const result = calculateCost(
    usage({ reasoningTokens: 100 }),
    { currency: "BRL", inputPerMillionMinor: null, outputPerMillionMinor: "2000000", reasoningPerMillionMinor: "1000000", cachedPerMillionMinor: null },
  );
  assert.equal(result.completeness, "PARTIAL");
  assert.equal(result.amountMinor, "100");
});

test("reasoning without own rate rides priced output (documented subset, COMPLETE)", () => {
  const result = calculateCost(usage({ outputTokens: 400, reasoningTokens: 100 }), brlPrice);
  assert.equal(result.completeness, "COMPLETE");
  assert.equal(result.amountMinor, "800");
});

test("reasoning without own rate and without priced output base marks PARTIAL", () => {
  const result = calculateCost(
    usage({ inputTokens: 100, outputTokens: 400, reasoningTokens: 100 }),
    { currency: "BRL", inputPerMillionMinor: "1000000", outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: null },
  );
  assert.equal(result.completeness, "PARTIAL");
  // só input é computável
  assert.equal(result.amountMinor, "100");
});

test("reasoning with own rate carves out of output without double counting", () => {
  const result = calculateCost(
    usage({ outputTokens: 400, reasoningTokens: 100 }),
    { currency: "BRL", inputPerMillionMinor: null, outputPerMillionMinor: "2000000", reasoningPerMillionMinor: "1000000", cachedPerMillionMinor: null },
  );
  assert.equal(result.completeness, "COMPLETE");
  // 300 output @ 2 + 100 reasoning @ 1 = 700
  assert.equal(result.amountMinor, "700");
});

test("unpriced input marks PARTIAL with remaining known buckets", () => {
  const result = calculateCost(
    usage({ inputTokens: 100, outputTokens: 400 }),
    { currency: "BRL", inputPerMillionMinor: null, outputPerMillionMinor: "2000000", reasoningPerMillionMinor: null, cachedPerMillionMinor: null },
  );
  assert.equal(result.completeness, "PARTIAL");
  assert.equal(result.amountMinor, "800");
});

test("reported usage with no priced dimension at all is UNAVAILABLE", () => {
  const result = calculateCost(
    usage({ inputTokens: 100 }),
    { currency: "BRL", inputPerMillionMinor: null, outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: null },
  );
  assert.equal(result.completeness, "UNAVAILABLE");
  assert.equal(result.amountMinor, null);
});

test("rounds once half-up at closure", () => {
  // 500_000 tokens @ 3 minor/M = 1.5 minor exato → 2
  const result = calculateCost(usage({ inputTokens: 500_000 }), { currency: "USD", inputPerMillionMinor: "3", outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: null });
  assert.equal(result.amountMinor, "2");
  // sub-minor: 333 tokens @ 1.5 minor/M = 0.4995 minor → 0
  const down = calculateCost(usage({ inputTokens: 333 }), { currency: "USD", inputPerMillionMinor: "1.5", outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: null });
  assert.equal(down.amountMinor, "0");
});

test("invalid rate strings are treated as unpriced (no float parsing)", () => {
  const result = calculateCost(
    usage({ inputTokens: 100 }),
    { currency: "BRL", inputPerMillionMinor: "1.5e3", outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: null },
  );
  assert.equal(result.completeness, "UNAVAILABLE");
});

test("invalid usage values become unknown dimensions, never inferred zeros", () => {
  assert.equal(calculateCost(usage({ inputTokens: -5, outputTokens: 1.5 }), brlPrice).completeness, "UNAVAILABLE");
});

test("cached larger than input is inconsistency, not negative cost", () => {
  const result = calculateCost(
    usage({ inputTokens: 100, cachedTokens: 250 }),
    { currency: "BRL", inputPerMillionMinor: "1000000", outputPerMillionMinor: null, reasoningPerMillionMinor: null, cachedPerMillionMinor: "500000" },
  );
  assert.equal(result.completeness, "PARTIAL");
  // input inteiro inconsistente (não billable); cached sozinho = 125
  assert.equal(result.amountMinor, "125");
});
