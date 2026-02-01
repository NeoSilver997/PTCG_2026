-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "regionalExpansionId" TEXT;

-- AlterTable
ALTER TABLE "primary_cards" ADD COLUMN     "cardNumber" TEXT,
ADD COLUMN     "primaryExpansionId" TEXT;

-- CreateIndex
CREATE INDEX "cards_regionalExpansionId_idx" ON "cards"("regionalExpansionId");

-- CreateIndex
CREATE INDEX "primary_cards_primaryExpansionId_idx" ON "primary_cards"("primaryExpansionId");

-- AddForeignKey
ALTER TABLE "primary_cards" ADD CONSTRAINT "primary_cards_primaryExpansionId_fkey" FOREIGN KEY ("primaryExpansionId") REFERENCES "primary_expansions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_regionalExpansionId_fkey" FOREIGN KEY ("regionalExpansionId") REFERENCES "regional_expansions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
