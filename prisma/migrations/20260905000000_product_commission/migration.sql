-- Comissão opcional do Product: percentual ou valor financeiro direto.
ALTER TABLE "products"
  ADD COLUMN "commissionType" TEXT,
  ADD COLUMN "commissionValue" DECIMAL(65,30);

ALTER TABLE "products"
  ADD CONSTRAINT "products_commission_type_check"
  CHECK ("commissionType" IS NULL OR "commissionType" IN ('PERCENT', 'AMOUNT'));

ALTER TABLE "products"
  ADD CONSTRAINT "products_commission_value_check"
  CHECK ("commissionValue" IS NULL OR "commissionValue" >= 0);

ALTER TABLE "products"
  ADD CONSTRAINT "products_commission_pair_check"
  CHECK (("commissionType" IS NULL) = ("commissionValue" IS NULL));

ALTER TABLE "products"
  ADD CONSTRAINT "products_commission_percent_check"
  CHECK ("commissionType" <> 'PERCENT' OR "commissionValue" <= 100);
