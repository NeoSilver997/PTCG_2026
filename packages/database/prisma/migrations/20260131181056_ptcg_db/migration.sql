-- DropIndex
DROP INDEX "cards_primaryCardId_language_variantType_key";

-- CreateIndex
CREATE INDEX "cards_primaryCardId_language_variantType_idx" ON "cards"("primaryCardId", "language", "variantType");
