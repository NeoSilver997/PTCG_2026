/**
 * Import Chinese products from JSON file
 *
 * Usage:
 *   npx tsx scrapers/import-chinese-products.ts
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';

interface ChineseProductData {
  country: string;
  product_name: string;
  price?: string;
  release_date?: string;
  code?: string;
  link?: string;
  image_url?: string;
  include?: string;
  card_only?: string;
}

const prisma = new PrismaClient();

async function importChineseProducts() {
  console.log('Starting Chinese products import...\n');

  const filePath = path.join(__dirname, '../data/chinese_products.json');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Chinese products file not found: ${filePath}`);
    return;
  }

  try {
    const products: ChineseProductData[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    console.log(`Found ${products.length} Chinese products to import\n`);

    let successCount = 0;
    let skipCount = 0;

    for (const product of products) {
      try {
        // Check if product already exists
        const existing = await prisma.product.findFirst({
          where: {
            country: product.country,
            productName: product.product_name,
            code: product.code || undefined,
          },
        });

        if (existing) {
          console.log(`  ⏭️  Skipping existing product: ${product.product_name}`);
          skipCount++;
          continue;
        }

        // Create the product
        await prisma.product.create({
          data: {
            country: product.country,
            productName: product.product_name,
            price: product.price || null,
            releaseDate: product.release_date || null,
            code: product.code || null,
            link: product.link || null,
            imageUrl: product.image_url || null,
            include: product.include || null,
            cardOnly: product.card_only || null,
          },
        });

        console.log(`  ✓ Imported: ${product.product_name}`);
        successCount++;
      } catch (error) {
        console.error(`  ❌ Failed to import ${product.product_name}:`, error.message);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('CHINESE PRODUCTS IMPORT SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`Successfully imported: ${successCount}`);
    console.log(`Skipped (existing): ${skipCount}`);
    console.log(`Total processed: ${products.length}`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  }
}

async function main() {
  try {
    await importChineseProducts();
    console.log('✅ Chinese products import completed!');
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();