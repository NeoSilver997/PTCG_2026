-- CreateTable: card_relations
-- Bidirectional card relation linking two PrimaryCards with a relation type

CREATE TABLE "card_relations" (
    "id" TEXT NOT NULL,
    "fromCardId" TEXT NOT NULL,
    "toCardId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'SYNERGY',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_relations_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "card_relations_fromCardId_toCardId_key" ON "card_relations"("fromCardId", "toCardId");

-- CreateIndex
CREATE INDEX "card_relations_fromCardId_idx" ON "card_relations"("fromCardId");

-- CreateIndex
CREATE INDEX "card_relations_toCardId_idx" ON "card_relations"("toCardId");

-- AddForeignKey
ALTER TABLE "card_relations" ADD CONSTRAINT "card_relations_fromCardId_fkey" FOREIGN KEY ("fromCardId") REFERENCES "primary_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_relations" ADD CONSTRAINT "card_relations_toCardId_fkey" FOREIGN KEY ("toCardId") REFERENCES "primary_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
