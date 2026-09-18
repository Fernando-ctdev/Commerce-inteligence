-- Preço versionado e imutável (append-only) por provider/model/moeda/vigência.
-- Rates exatos em unidades monetárias menores por milhão de tokens; sem totais em Job/Content.
CREATE TABLE "provider_model_prices" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "inputPerMillionMinor" DECIMAL(20,6),
    "outputPerMillionMinor" DECIMAL(20,6),
    "reasoningPerMillionMinor" DECIMAL(20,6),
    "cachedPerMillionMinor" DECIMAL(20,6),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_model_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_model_prices_provider_model_currency_version_key" ON "provider_model_prices"("provider", "model", "currency", "version");
CREATE INDEX "provider_model_prices_provider_model_currency_effectiveFrom_effectiveTo_idx" ON "provider_model_prices"("provider", "model", "currency", "effectiveFrom", "effectiveTo");
