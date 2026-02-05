/**
 * Import PTCG products from JSON to PostgreSQL database
 * 
 * Usage:
 *   npx tsx scrapers/import-products.ts
 *   npx tsx scrapers/import-products.ts "../path/to/products.json"
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';

interface ProductData {
  country: string;
  product_name: string;
  price?: string;
  release_date?: string;
  code?: string;
  link?: string;
  image_url?: string;
  include?: string;
  card_only?: string;
  product_type?: string;
  beginner_flag?: number;
  stores_available?: string;
  link_card_list?: string;
  link_pokemon_center?: string;
}

const prisma = new PrismaClient();

// Map old product type strings to new ProductType codes
const productTypeMapping: Record<string, string> = {
  '拡張パック': 'expansion_pack',
  '強化拡張パック': 'enhanced_expansion',
  '入門セット': 'starter_set',
  '構築デッキ': 'constructed_deck',
  '周辺グッズ': 'accessories',
  'その他の商品': 'special_products',
  'デッキ': 'deck',
  // English mappings
  'Expansion Pack': 'expansion_pack',
  'Enhanced Expansion Pack': 'enhanced_expansion',
  'Starter Set': 'starter_set',
  'Constructed Deck': 'constructed_deck',
  'Accessories': 'accessories',
  'Special Products': 'special_products',
  'Deck': 'deck'
};

async function importProducts(jsonFilePath: string) {
  console.log('\n🔍 Reading products from JSON...\n');
  
  const jsonData = fs.readFileSync(jsonFilePath, 'utf-8');
  const products: ProductData[] = JSON.parse(jsonData);
  
  console.log(`Found ${products.length} products in JSON\n`);
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const product of products) {
    try {
      // Find the ProductType ID based on the product_type string
      let productTypeId: string | null = null;
      if (product.product_type) {
        const typeCode = productTypeMapping[product.product_type];
        if (typeCode) {
          const productType = await prisma.productType.findUnique({
            where: { code: typeCode }
          });
          productTypeId = productType?.id || null;
        }
      } else {
        // For Chinese products without product_type, infer from product name
        const name = product.product_name.toLowerCase();
        let inferredTypeCode: string | null = null;
        
        if (name.includes('擴充包')) {
          inferredTypeCode = 'expansion_pack';
        } else if (name.includes('高級擴充包') || name.includes('強化擴充包')) {
          inferredTypeCode = 'enhanced_expansion';
        } else if (name.includes('初階牌組') || name.includes('入門套組') || name.includes('starter')) {
          inferredTypeCode = 'starter_set';
        } else if (name.includes('構築牌組') || name.includes('牌組')) {
          inferredTypeCode = 'constructed_deck';
        } else if (name.includes('周邊') || name.includes('accessories') || name.includes('デッキシールド')) {
          inferredTypeCode = 'accessories';
        } else {
          inferredTypeCode = 'special_products'; // Default fallback
        }
        
        if (inferredTypeCode) {
          const productType = await prisma.productType.findUnique({
            where: { code: inferredTypeCode }
          });
          productTypeId = productType?.id || null;
        }
      }

      // Use upsert to handle duplicates
      await prisma.product.upsert({
        where: {
          country_code_productName_releaseDate: {
            country: product.country,
            code: product.code || '',
            productName: product.product_name,
            releaseDate: product.release_date || ''
          }
        },
        update: {
          price: product.price,
          link: product.link,
          imageUrl: product.image_url,
          include: product.include,
          cardOnly: product.card_only,
          productTypeId: productTypeId,
          beginnerFlag: product.beginner_flag || 0,
          storesAvailable: product.stores_available,
          linkCardList: product.link_card_list,
          linkPokemonCenter: product.link_pokemon_center,
        },
        create: {
          country: product.country,
          productName: product.product_name,
          price: product.price,
          releaseDate: product.release_date,
          code: product.code,
          link: product.link,
          imageUrl: product.image_url,
          include: product.include,
          cardOnly: product.card_only,
          productTypeId: productTypeId,
          beginnerFlag: product.beginner_flag || 0,
          storesAvailable: product.stores_available,
          linkCardList: product.link_card_list,
          linkPokemonCenter: product.link_pokemon_center,
        }
      });
      
      imported++;
      
      if (imported % 100 === 0) {
        console.log(`  ✓ Imported ${imported}/${products.length} products...`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        skipped++;
      } else {
        console.error(`  ✗ Error importing ${product.product_name}:`, error);
        errors++;
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total products: ${products.length}`);
  console.log(`Successfully imported: ${imported}`);
  console.log(`Skipped (duplicates): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log('='.repeat(60) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  const jsonFilePath = args[0] || path.join(process.cwd(), 'ptcg_products.json');
  
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`Error: File not found: ${jsonFilePath}`);
    process.exit(1);
  }
  
  try {
    await importProducts(jsonFilePath);
    console.log('✅ Import completed!');
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
