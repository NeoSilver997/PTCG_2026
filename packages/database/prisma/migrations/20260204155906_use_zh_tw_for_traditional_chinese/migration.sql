/*
  Warnings:

  - The values [ZH_HK] on the enum `LanguageCode` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LanguageCode_new" AS ENUM ('JA_JP', 'ZH_TW', 'EN_US');
ALTER TABLE "cards" ALTER COLUMN "language" TYPE "LanguageCode_new" USING ("language"::text::"LanguageCode_new");
ALTER TYPE "LanguageCode" RENAME TO "LanguageCode_old";
ALTER TYPE "LanguageCode_new" RENAME TO "LanguageCode";
DROP TYPE "LanguageCode_old";
COMMIT;
