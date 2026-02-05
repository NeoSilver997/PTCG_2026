/*
  Warnings:

  - You are about to drop the column `productType` on the `products` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "products_productType_idx";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "productType",
ADD COLUMN     "productTypeId" TEXT;

-- CreateTable
CREATE TABLE "product_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_types_code_key" ON "product_types"("code");

-- CreateIndex
CREATE INDEX "products_productTypeId_idx" ON "products"("productTypeId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_productTypeId_fkey" FOREIGN KEY ("productTypeId") REFERENCES "product_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
