-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "resistances" JSONB,
ADD COLUMN     "retreatCost" INTEGER,
ADD COLUMN     "weaknesses" JSONB;
