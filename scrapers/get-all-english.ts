import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function getAllEnglishProducts() {
  const englishProducts = await prisma.product.findMany({
    where: { country: 'Hong Kong (EN)' },
    select: { productName: true, productType: true }
  });

  console.log('All English products:');
  englishProducts.forEach(p => {
    console.log(`  ${p.productName} -> ${p.productType || 'NULL'}`);
  });

  await prisma.$disconnect();
}

getAllEnglishProducts();