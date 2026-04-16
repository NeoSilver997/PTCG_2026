-- Add price cache columns to decks table for sorting by budget price
ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "cachedBudgetMin" DOUBLE PRECISION;
ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "cachedBudgetMax" DOUBLE PRECISION;
ALTER TABLE "decks" ADD COLUMN IF NOT EXISTS "priceUpdatedAt" TIMESTAMP(3);

-- Index for sort-by-price queries
CREATE INDEX IF NOT EXISTS "decks_cachedBudgetMin_idx" ON "decks"("cachedBudgetMin");
