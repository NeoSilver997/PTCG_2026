-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "price" TEXT,
    "releaseDate" TEXT,
    "code" TEXT,
    "link" TEXT,
    "imageUrl" TEXT,
    "include" TEXT,
    "cardOnly" TEXT,
    "productType" TEXT,
    "beginnerFlag" INTEGER NOT NULL DEFAULT 0,
    "storesAvailable" TEXT,
    "linkCardList" TEXT,
    "linkPokemonCenter" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_country_idx" ON "products"("country");

-- CreateIndex
CREATE INDEX "products_releaseDate_idx" ON "products"("releaseDate");

-- CreateIndex
CREATE INDEX "products_code_idx" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_productType_idx" ON "products"("productType");

-- CreateIndex
CREATE UNIQUE INDEX "products_country_code_productName_releaseDate_key" ON "products"("country", "code", "productName", "releaseDate");
