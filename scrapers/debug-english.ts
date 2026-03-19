import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function debugEnglish() {
  // Check English products with NULL type
  const englishNull = await prisma.product.findMany({
    where: {
      country: 'Hong Kong (EN)',
      productType: null,
      productName: { contains: 'Scarlet & Violet' }
    },
    select: { productName: true }
  });

  console.log('English NULL products with "Scarlet & Violet":', englishNull.length);
  englishNull.slice(0, 3).forEach(p => console.log('  ' + p.productName));

  // Check all English products
  const allEnglish = await prisma.product.count({
    where: { country: 'Hong Kong (EN)' }
  });

  const nullEnglish = await prisma.product.count({
    where: {
      country: 'Hong Kong (EN)',
      productType: null
    }
  });

  console.log(`\nAll English products: ${allEnglish}`);
  console.log(`English products with NULL type: ${nullEnglish}`);

  await prisma.$disconnect();
}

debugEnglish();