-- AlterTable
ALTER TABLE "decks" ADD COLUMN     "cachedAceName" TEXT,
ADD COLUMN     "cachedArchetypeName" TEXT,
ADD COLUMN     "cachedNameAt" TIMESTAMP(3);
