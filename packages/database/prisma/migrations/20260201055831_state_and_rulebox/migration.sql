/*
  Warnings:

  - The values [BASIC,STAGE_1,STAGE_2] on the enum `Subtype` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "EvolutionStage" AS ENUM ('BASIC', 'STAGE_1', 'STAGE_2');

-- AlterEnum
ALTER TYPE "RuleBox" ADD VALUE 'MEGA';

-- AlterEnum
BEGIN;
CREATE TYPE "Subtype_new" AS ENUM ('ITEM', 'SUPPORTER', 'STADIUM', 'TOOL', 'BASIC_ENERGY', 'SPECIAL_ENERGY');
ALTER TABLE "cards" ALTER COLUMN "subtypes" TYPE "Subtype_new"[] USING ("subtypes"::text::"Subtype_new"[]);
ALTER TYPE "Subtype" RENAME TO "Subtype_old";
ALTER TYPE "Subtype_new" RENAME TO "Subtype";
DROP TYPE "Subtype_old";
COMMIT;

-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "evolutionStage" "EvolutionStage";
