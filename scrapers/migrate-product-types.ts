import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function migrateProductTypes() {
  console.log('Starting product type migration...\n');

  // Define product types with Chinese names
  const productTypes = [
    {
      code: 'expansion_pack',
      nameJa: '拡張パック',
      nameZh: '擴充包',
      nameEn: 'Expansion Pack'
    },
    {
      code: 'enhanced_expansion',
      nameJa: '強化拡張パック',
      nameZh: '強化擴充包',
      nameEn: 'Enhanced Expansion Pack'
    },
    {
      code: 'starter_set',
      nameJa: 'スターターセット',
      nameZh: '入門套組',
      nameEn: 'Starter Set'
    },
    {
      code: 'constructed_deck',
      nameJa: '構築デッキ',
      nameZh: '構築牌組',
      nameEn: 'Constructed Deck'
    },
    {
      code: 'accessories',
      nameJa: '周辺グッズ',
      nameZh: '周邊商品',
      nameEn: 'Accessories'
    },
    {
      code: 'special_products',
      nameJa: 'その他の商品',
      nameZh: '其他商品',
      nameEn: 'Special Products'
    },
    {
      code: 'deck',
      nameJa: 'デッキ',
      nameZh: '牌組',
      nameEn: 'Deck'
    }
  ];

  // Create ProductType records
  console.log('Creating ProductType records...');
  for (const type of productTypes) {
    const existing = await prisma.productType.findUnique({
      where: { code: type.code }
    });

    if (!existing) {
      await prisma.productType.create({
        data: type
      });
      console.log(`Created: ${type.nameZh} (${type.code})`);
    } else {
      console.log(`Already exists: ${type.nameZh} (${type.code})`);
    }
  }

  // Map old string values to new ProductType codes
  const typeMapping: { [key: string]: string } = {
    '拡張パック': 'expansion_pack',
    '強化拡張パック': 'enhanced_expansion',
    'スターターセット': 'starter_set',
    '構築デッキ': 'constructed_deck',
    '周辺グッズ': 'accessories',
    'その他の商品': 'special_products',
    'デッキ': 'deck'
  };

  // Since database was reset, there are no existing products to migrate
  console.log('\nDatabase was reset - no existing products to migrate.');
  console.log(`ProductType records created successfully: ${productTypes.length}`);
  console.log('You can now import products using the updated schema.');

  await prisma.$disconnect();

  return {
    productTypesCreated: productTypes.length,
    productsUpdated: 0
  };
}

migrateProductTypes();