/**
 * Update PTCG products with product types
 *
 * Usage:
 *   npx tsx scrapers/import-products.ts
 */

import { PrismaClient } from '../../packages/database/node_modules/.prisma/client';
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

async function updateProductTypes() {
  console.log('Starting product type updates...\n');

  // Define mapping rules based on product name patterns
  const typeMappings = [
    // Expansion packs - Chinese
    {
      patterns: ['擴充包'],
      type: '拡張パック',
      description: 'Expansion packs (Chinese)'
    },
    // Expansion packs - English (most English products are expansion packs)
    {
      patterns: ['Scarlet & Violet', 'Sword & Shield', 'Sun & Moon', 'Mega Evolution'],
      excludePatterns: ['Basic Energy', 'Promo', '151', 'Celebrations', 'Pokémon GO'],
      type: '拡張パック',
      description: 'Expansion packs (English)'
    },
    // Enhanced expansion packs (premium/high-grade)
    {
      patterns: ['強化擴充包', '高級擴充包'],
      type: '強化拡張パック',
      description: 'Enhanced/Premium expansion packs'
    },
    // Starter decks
    {
      patterns: ['入門組合', 'Starter Deck', 'スタートデッキ'],
      type: 'スターターデッキ',
      description: 'Starter decks'
    },
    // Booster packs
    {
      patterns: ['ブースターパック', 'Booster Pack'],
      type: 'ブースターパック',
      description: 'Booster packs'
    },
    // Special collections
    {
      patterns: ['コレクション', 'Collection', '151', 'Celebrations'],
      type: 'スペシャルコレクション',
      description: 'Special collections'
    },
    // Energy cards
    {
      patterns: ['Basic Energy', 'エネルギーカード'],
      type: 'エネルギーカード',
      description: 'Energy cards'
    },
    // Promotional cards
    {
      patterns: ['Promo', 'プロモ', 'Pokémon GO'],
      type: 'プロモカード',
      description: 'Promotional cards'
    }
  ];

  let totalUpdated = 0;

  for (const mapping of typeMappings) {
    console.log(`Processing: ${mapping.description}`);

    // Build where clause
    const whereConditions = [];

    // Include patterns
    for (const pattern of mapping.patterns) {
      whereConditions.push({
        productName: {
          contains: pattern
        }
      });
    }

    // Exclude patterns
    if (mapping.excludePatterns) {
      for (const excludePattern of mapping.excludePatterns) {
        whereConditions.push({
          productName: {
            not: {
              contains: excludePattern
            }
          }
        });
      }
    }

    // Find products that match
    const products = await prisma.product.findMany({
      where: {
        AND: whereConditions
      },
      select: {
        id: true,
        productName: true,
        productTypeId: true
      }
    });

    if (products.length === 0) {
      console.log(`  No products found for this pattern\n`);
      continue;
    }

    console.log(`  Found ${products.length} products`);

    // Find the product type
    const productType = await prisma.productType.findFirst({
      where: {
        code: mapping.type
      }
    });

    if (!productType) {
      console.log(`  Warning: Product type '${mapping.type}' not found, skipping\n`);
      continue;
    }

    // Update the products
    const result = await prisma.product.updateMany({
      where: {
        AND: whereConditions
      },
      data: {
        productTypeId: productType.id
      }
    });

    console.log(`  Updated: ${result.count} products\n`);
    totalUpdated += result.count;
  }

  console.log(`Total products updated: ${totalUpdated}`);
}

async function main() {
  try {
    await updateProductTypes();
    console.log('✅ Update completed!');
  } catch (error) {
    console.error('❌ Update failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
