-- AddColumn effectTags, specialEffectTags, effectScore, cardTier to primary_cards
-- Effect tags are stored on PrimaryCard (canonical identity) because all language
-- variants of the same card share identical game effects.

ALTER TABLE "primary_cards" ADD COLUMN "effectTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "primary_cards" ADD COLUMN "specialEffectTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "primary_cards" ADD COLUMN "effectScore" DOUBLE PRECISION;
ALTER TABLE "primary_cards" ADD COLUMN "cardTier" TEXT;

-- Index for filtering cards by effect tag
CREATE INDEX "primary_cards_effectTags_idx" ON "primary_cards" USING GIN ("effectTags");

-- Index for tier-based sorting/filtering
CREATE INDEX "primary_cards_cardTier_idx" ON "primary_cards"("cardTier");
