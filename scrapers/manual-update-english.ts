import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function manualUpdateEnglish() {
  console.log('Manually updating English products...\n');

  // Update English expansion packs (exclude special ones)
  const result1 = await prisma.product.updateMany({
    where: {
      country: 'Hong Kong (EN)',
      OR: [
        { productType: null },
        { productType: '' }
      ],
      AND: [
        {
          OR: [
            { productName: { contains: 'Scarlet & Violet' } },
            { productName: { contains: 'Sword & Shield' } },
            { productName: { contains: 'Sun & Moon' } },
            { productName: { contains: 'Mega Evolution' } }
          ]
        },
        {
          NOT: {
            OR: [
              { productName: { contains: 'Basic Energy' } },
              { productName: { contains: 'Promo' } },
              { productName: { contains: '151' } },
              { productName: { contains: 'Celebrations' } },
              { productName: { contains: 'Pokémon GO' } }
            ]
          }
        }
      ]
    },
    data: { productType: '拡張パック' }
  });

  console.log(`Updated ${result1.count} English expansion packs`);

  // Update Basic Energy products
  const result2 = await prisma.product.updateMany({
    where: {
      country: 'Hong Kong (EN)',
      OR: [
        { productType: null },
        { productType: '' }
      ],
      productName: { contains: 'Basic Energy' }
    },
    data: { productType: '周辺グッズ' }
  });

  console.log(`Updated ${result2.count} Basic Energy products`);

  // Update Promo/special products
  const result3 = await prisma.product.updateMany({
    where: {
      country: 'Hong Kong (EN)',
      OR: [
        { productType: null },
        { productType: '' }
      ],
      OR: [
        { productName: { contains: 'Promo' } },
        { productName: { contains: '151' } },
        { productName: { contains: 'Celebrations' } },
        { productName: { contains: 'Pokémon GO' } }
      ]
    },
    data: { productType: 'その他の商品' }
  });

  console.log(`Updated ${result3.count} special products`);

  console.log(`\nTotal updated: ${result1.count + result2.count + result3.count}`);

  await prisma.$disconnect();
}

manualUpdateEnglish();