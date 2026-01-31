/*
  Warnings:

  - You are about to drop the column `cardNumber` on the `primary_cards` table. All the data in the column will be lost.
  - You are about to drop the column `primaryExpansionId` on the `primary_cards` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name,skillsSignature]` on the table `primary_cards` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `primary_cards` table without a default value. This is not possible if the table is not empty.
  - Added the required column `skillsSignature` to the `primary_cards` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "primary_cards" DROP CONSTRAINT "primary_cards_primaryExpansionId_fkey";

-- DropIndex
DROP INDEX "primary_cards_cardNumber_idx";

-- DropIndex
DROP INDEX "primary_cards_primaryExpansionId_cardNumber_key";

-- AlterTable
ALTER TABLE "primary_cards" DROP COLUMN "cardNumber",
DROP COLUMN "primaryExpansionId",
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "skillsSignature" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "primary_cards_name_idx" ON "primary_cards"("name");

-- CreateIndex
CREATE UNIQUE INDEX "primary_cards_name_skillsSignature_key" ON "primary_cards"("name", "skillsSignature");
