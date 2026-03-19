import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function checkEnglishProducts() {
  // Get English products
  const englishProducts = await prisma.product.findMany({
    where: { country: 'Hong Kong (EN)' },
    select: { productName: true, productType: true },
    take: 20
  });

  console.log('English products:');
  englishProducts.forEach(p => {
    console.log(`  ${p.productName} -> ${p.productType || 'NULL'}`);
  });

  // Get type counts for English products
  const typeCounts = await prisma.product.groupBy({
    by: ['country', 'productType'],
    _count: true,
    where: { country: 'Hong Kong (EN)' }
  });

  console.log('\nEnglish product types:');
  typeCounts.forEach(t => {
    console.log(`  ${t.productType || 'NULL'}: ${t._count}`);
  });

  // Check if English products contain Chinese characters that might trigger wrong classification
  const expansionPackProducts = await prisma.product.findMany({
    where: {
      country: 'Hong Kong (EN)',
      productType: '拡張パック'
    },
    select: { productName: true },
    take: 10
  });

  console.log('\nEnglish products classified as 拡張パック:');
  expansionPackProducts.forEach(p => {
    console.log(`  ${p.productName}`);
  });

  await prisma.$disconnect();
}

checkEnglishProducts();