-- Desconto factual opcional do Product, em percentual. Null = sem desconto
-- (compatível com produtos existentes; a geração nunca inventa o fato).
ALTER TABLE "products"
  ADD COLUMN "discountPercentage" DECIMAL(65,30);

ALTER TABLE "products"
  ADD CONSTRAINT "products_discount_percentage_check"
  CHECK ("discountPercentage" IS NULL OR ("discountPercentage" >= 0 AND "discountPercentage" <= 100));
