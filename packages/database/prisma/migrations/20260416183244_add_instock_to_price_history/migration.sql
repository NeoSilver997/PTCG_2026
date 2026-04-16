-- CreateEnum
CREATE TYPE "DeckPokemonRole" AS ENUM ('POKEMON_MAIN', 'POKEMON_SUPPORT', 'POKEMON_EVOLUTION');

-- DropIndex
DROP INDEX "primary_cards_effectTags_idx";

-- AlterTable
ALTER TABLE "decks" ADD COLUMN     "deckCode" TEXT,
ADD COLUMN     "deckData" JSONB;

-- AlterTable
ALTER TABLE "price_history" ADD COLUMN     "inStock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "primary_cards" ADD COLUMN     "pokemonSpeciesId" TEXT,
ALTER COLUMN "effectTags" DROP DEFAULT,
ALTER COLUMN "specialEffectTags" DROP DEFAULT;

-- CreateTable
CREATE TABLE "pokemon_species" (
    "id" TEXT NOT NULL,
    "dexNumber" TEXT NOT NULL,
    "form" TEXT NOT NULL DEFAULT '',
    "nameZhHans" TEXT NOT NULL,
    "nameZhHant" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pokemon_species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_card_roles" (
    "id" TEXT NOT NULL,
    "deckCode" TEXT NOT NULL,
    "canonicalWebCardId" TEXT NOT NULL,
    "role" "DeckPokemonRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_card_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pokemon_species_nameJa_idx" ON "pokemon_species"("nameJa");

-- CreateIndex
CREATE INDEX "pokemon_species_nameZhHant_idx" ON "pokemon_species"("nameZhHant");

-- CreateIndex
CREATE INDEX "pokemon_species_nameEn_idx" ON "pokemon_species"("nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_species_dexNumber_form_key" ON "pokemon_species"("dexNumber", "form");

-- CreateIndex
CREATE INDEX "deck_card_roles_deckCode_idx" ON "deck_card_roles"("deckCode");

-- CreateIndex
CREATE UNIQUE INDEX "deck_card_roles_deckCode_canonicalWebCardId_key" ON "deck_card_roles"("deckCode", "canonicalWebCardId");

-- CreateIndex
CREATE INDEX "primary_cards_pokemonSpeciesId_idx" ON "primary_cards"("pokemonSpeciesId");

-- CreateIndex
CREATE INDEX "primary_cards_effectTags_idx" ON "primary_cards"("effectTags");

-- AddForeignKey
ALTER TABLE "primary_cards" ADD CONSTRAINT "primary_cards_pokemonSpeciesId_fkey" FOREIGN KEY ("pokemonSpeciesId") REFERENCES "pokemon_species"("id") ON DELETE SET NULL ON UPDATE CASCADE;
