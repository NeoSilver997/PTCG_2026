import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

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
      patterns: ['初階牌組', '挑戰牌組', 'スターター', 'スタートデッキ', '起始組合', 'V起始牌組', 'G超起始牌組'],
      type: 'スターターセット',
      description: 'Starter decks and challenge decks'
    },
    // Constructed decks
    {
      patterns: ['構築デッキ', 'デッキ', '牌組構築BOX', '戰術牌組', 'VSTAR&VMAX 高級牌組'],
      type: '構築デッキ',
      description: 'Constructed decks'
    },
    // Accessories (deck cases, sleeves, etc.) - including Basic Energy
    {
      patterns: ['周辺グッズ', 'デッキケース', 'デッキシールド', 'カードボックス', 'Basic Energy'],
      type: '周辺グッズ',
      description: 'Accessories (deck cases, sleeves, boxes, basic energy)'
    },
    // Special card sets
    {
      patterns: ['スペシャルカード', 'その他の商品', '特別組合', '特典', 'Trianers Camp', '特別牌組組合', '頂級訓練家收藏箱', 'V-UNION', '寶可夢卡牌家庭組合', 'Promo', '151', 'Celebrations', 'Pokémon GO'],
      type: 'その他の商品',
      description: 'Special card sets and other products'
    }
  ];

  let totalUpdated = 0;

  // Process each mapping rule
  for (const mapping of typeMappings) {
    console.log(`\nProcessing: ${mapping.description}`);

    // Build WHERE clause for multiple patterns
    const includeConditions = mapping.patterns.map(pattern => ({
      productType: null,
      productName: {
        contains: pattern,
        mode: 'insensitive' as const
      }
    }));

    console.log(`Include patterns: ${mapping.patterns.join(', ')}`);

    // Build exclude conditions if specified
    let whereClause: any = {
      OR: includeConditions
    };

    if (mapping.excludePatterns) {
      console.log(`Exclude patterns: ${mapping.excludePatterns.join(', ')}`);
      const excludeConditions = mapping.excludePatterns.map(pattern => ({
        productName: {
          contains: pattern,
          mode: 'insensitive' as const
        }
      }));

      whereClause = {
        AND: [
          { OR: includeConditions },
          {
            NOT: {
              OR: excludeConditions
            }
          }
        ]
      };
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      select: { id: true, productName: true }
    });

    console.log(`Found ${products.length} products matching criteria`);

    if (products.length > 0) {
      console.log(`${mapping.description}: ${products.length} products`);
      products.slice(0, 3).forEach(p => console.log(`  - ${p.productName}`));

      // Update the products
      const result = await prisma.product.updateMany({
        where: whereClause,
        data: {
          productType: mapping.type
        }
      });

      console.log(`  Updated: ${result.count} products\n`);
      totalUpdated += result.count;
    }
  }

  // Check for any remaining NULL types
  const remainingNull = await prisma.product.count({
    where: { productType: null }
  });

  console.log(`\nSummary:`);
  console.log(`Total products updated: ${totalUpdated}`);
  console.log(`Products still with NULL type: ${remainingNull}`);

  if (remainingNull > 0) {
    console.log('\nRemaining products with NULL type:');
    const remaining = await prisma.product.findMany({
      where: { productType: null },
      select: { productName: true },
      take: 10
    });
    remaining.forEach(p => console.log(`  - ${p.productName}`));
  }

  // Show final counts by type
  const finalCounts = await prisma.product.groupBy({
    by: ['productType'],
    _count: true,
  });

  console.log('\nFinal product type counts:');
  finalCounts.forEach(t => {
    console.log(`  ${t.productType || 'NULL'}: ${t._count}`);
  });

  await prisma.$disconnect();
}

updateProductTypes();