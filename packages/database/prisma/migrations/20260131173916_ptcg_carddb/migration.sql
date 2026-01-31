-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('GUEST', 'USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "LanguageCode" AS ENUM ('JA_JP', 'ZH_HK', 'EN_US');

-- CreateEnum
CREATE TYPE "Supertype" AS ENUM ('POKEMON', 'TRAINER', 'ENERGY');

-- CreateEnum
CREATE TYPE "PokemonType" AS ENUM ('COLORLESS', 'DARKNESS', 'DRAGON', 'FAIRY', 'FIGHTING', 'FIRE', 'GRASS', 'LIGHTNING', 'METAL', 'PSYCHIC', 'WATER');

-- CreateEnum
CREATE TYPE "Subtype" AS ENUM ('BASIC', 'STAGE_1', 'STAGE_2', 'ITEM', 'SUPPORTER', 'STADIUM', 'TOOL', 'BASIC_ENERGY', 'SPECIAL_ENERGY');

-- CreateEnum
CREATE TYPE "RuleBox" AS ENUM ('EX', 'GX', 'V', 'VMAX', 'VSTAR', 'RADIANT');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'DOUBLE_RARE', 'ULTRA_RARE', 'ILLUSTRATION_RARE', 'SPECIAL_ILLUSTRATION_RARE', 'HYPER_RARE', 'PROMO', 'AMAZING_RARE', 'SHINY_RARE', 'ACE_SPEC');

-- CreateEnum
CREATE TYPE "VariantType" AS ENUM ('NORMAL', 'REVERSE_HOLO', 'HOLO', 'FULL_ART', 'SECRET_RARE', 'PROMO', 'AR', 'SAR', 'SSR', 'SR', 'UR', 'MUR', 'MA', 'CHR', 'U', 'BWR', 'ACE', 'R', 'C');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('HK', 'JP', 'EN');

-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('CHAMPIONSHIP', 'REGIONAL', 'SPECIAL_EVENT', 'STORE_TOURNAMENT', 'ONLINE_EVENT');

-- CreateEnum
CREATE TYPE "DeckArchetype" AS ENUM ('AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'TOOLBOX', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('YUYU_TEI', 'HARERUYA', 'CARDMARKET', 'TCGPLAYER', 'OTHER');

-- CreateEnum
CREATE TYPE "ScraperStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "primary_expansions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "primary_expansions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regional_expansions" (
    "id" TEXT NOT NULL,
    "primaryExpansionId" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regional_expansions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "primary_cards" (
    "id" TEXT NOT NULL,
    "primaryExpansionId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "primary_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "primaryCardId" TEXT NOT NULL,
    "webCardId" TEXT NOT NULL,
    "language" "LanguageCode" NOT NULL,
    "variantType" "VariantType" NOT NULL DEFAULT 'NORMAL',
    "name" TEXT NOT NULL,
    "supertype" "Supertype",
    "subtypes" "Subtype"[],
    "hp" INTEGER,
    "types" "PokemonType"[],
    "ruleBox" "RuleBox",
    "abilities" JSONB,
    "attacks" JSONB,
    "rules" TEXT[],
    "flavorText" TEXT,
    "artist" TEXT,
    "rarity" "Rarity",
    "regulationMark" TEXT,
    "imageUrl" TEXT,
    "imageUrlHiRes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Collection',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TournamentType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "region" "Region" NOT NULL,
    "playerCount" INTEGER,
    "ageGroup" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_results" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "deckName" TEXT,
    "deckArchetype" "DeckArchetype",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deckId" TEXT,

    CONSTRAINT "tournament_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decks" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "archetype" "DeckArchetype",
    "format" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tournamentResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_cards" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_prices" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "condition" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_jobs" (
    "id" TEXT NOT NULL,
    "source" "Region" NOT NULL,
    "status" "ScraperStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scraper_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "primary_expansions_code_key" ON "primary_expansions"("code");

-- CreateIndex
CREATE INDEX "primary_expansions_code_idx" ON "primary_expansions"("code");

-- CreateIndex
CREATE INDEX "regional_expansions_region_code_idx" ON "regional_expansions"("region", "code");

-- CreateIndex
CREATE UNIQUE INDEX "regional_expansions_primaryExpansionId_region_key" ON "regional_expansions"("primaryExpansionId", "region");

-- CreateIndex
CREATE INDEX "primary_cards_cardNumber_idx" ON "primary_cards"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "primary_cards_primaryExpansionId_cardNumber_key" ON "primary_cards"("primaryExpansionId", "cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "cards_webCardId_key" ON "cards"("webCardId");

-- CreateIndex
CREATE INDEX "cards_language_idx" ON "cards"("language");

-- CreateIndex
CREATE INDEX "cards_name_idx" ON "cards"("name");

-- CreateIndex
CREATE INDEX "cards_supertype_idx" ON "cards"("supertype");

-- CreateIndex
CREATE UNIQUE INDEX "cards_primaryCardId_language_variantType_key" ON "cards"("primaryCardId", "language", "variantType");

-- CreateIndex
CREATE INDEX "collections_userId_idx" ON "collections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "collections_userId_name_key" ON "collections"("userId", "name");

-- CreateIndex
CREATE INDEX "collection_items_collectionId_idx" ON "collection_items"("collectionId");

-- CreateIndex
CREATE INDEX "collection_items_cardId_idx" ON "collection_items"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collectionId_cardId_key" ON "collection_items"("collectionId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_eventId_key" ON "tournaments"("eventId");

-- CreateIndex
CREATE INDEX "tournaments_date_idx" ON "tournaments"("date");

-- CreateIndex
CREATE INDEX "tournaments_region_type_idx" ON "tournaments"("region", "type");

-- CreateIndex
CREATE INDEX "tournaments_eventId_idx" ON "tournaments"("eventId");

-- CreateIndex
CREATE INDEX "tournament_results_tournamentId_idx" ON "tournament_results"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_results_playerName_idx" ON "tournament_results"("playerName");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_results_tournamentId_placement_key" ON "tournament_results"("tournamentId", "placement");

-- CreateIndex
CREATE INDEX "decks_userId_idx" ON "decks"("userId");

-- CreateIndex
CREATE INDEX "decks_archetype_idx" ON "decks"("archetype");

-- CreateIndex
CREATE INDEX "decks_isPublic_idx" ON "decks"("isPublic");

-- CreateIndex
CREATE INDEX "deck_cards_deckId_idx" ON "deck_cards"("deckId");

-- CreateIndex
CREATE INDEX "deck_cards_cardId_idx" ON "deck_cards"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "deck_cards_deckId_cardId_key" ON "deck_cards"("deckId", "cardId");

-- CreateIndex
CREATE INDEX "card_prices_cardId_source_idx" ON "card_prices"("cardId", "source");

-- CreateIndex
CREATE INDEX "card_prices_fetchedAt_idx" ON "card_prices"("fetchedAt");

-- CreateIndex
CREATE INDEX "price_history_cardId_source_date_idx" ON "price_history"("cardId", "source", "date");

-- CreateIndex
CREATE INDEX "scraper_jobs_source_status_idx" ON "scraper_jobs"("source", "status");

-- CreateIndex
CREATE INDEX "scraper_jobs_createdAt_idx" ON "scraper_jobs"("createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regional_expansions" ADD CONSTRAINT "regional_expansions_primaryExpansionId_fkey" FOREIGN KEY ("primaryExpansionId") REFERENCES "primary_expansions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primary_cards" ADD CONSTRAINT "primary_cards_primaryExpansionId_fkey" FOREIGN KEY ("primaryExpansionId") REFERENCES "primary_expansions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_primaryCardId_fkey" FOREIGN KEY ("primaryCardId") REFERENCES "primary_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_results" ADD CONSTRAINT "tournament_results_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_results" ADD CONSTRAINT "tournament_results_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_prices" ADD CONSTRAINT "card_prices_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
