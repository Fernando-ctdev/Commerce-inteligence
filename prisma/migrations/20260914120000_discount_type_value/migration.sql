-- Desconto tipado (decisão Arquiteto): PERCENTAGE|FIXED + valor; nullable = compat
-- com o legado discountPercentage, que permanece lido quando estes estão ausentes.
ALTER TABLE "products" ADD COLUMN "discountType" TEXT;
ALTER TABLE "products" ADD COLUMN "discountValue" TEXT;
