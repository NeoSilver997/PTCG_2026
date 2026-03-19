import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function checkEnglishCurrent() {
  const englishProducts = await prisma.product.findMany({
    where: { country: 'Hong Kong (EN)' },
    select: { productName: true, productType: true },
    take: 10
  });

  console.log('English products current state:');
  englishProducts.forEach(p => {
    console.log(`  ${p.productName} -> ${p.productType || 'NULL'}`);
  });

  // Check type distribution for English products
  const typeCounts = await prisma.product.groupBy({
    by: ['productType'],
    _count: true,
    where: { country: 'Hong Kong (EN)' }
  });

  console.log('\nEnglish product type distribution:');
  typeCounts.forEach(t => {
    console.log(`  ${t.productType || 'NULL'}: ${t._count}`);
  });

  await prisma.$disconnect();
}

checkEnglishCurrent();