import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function analyzeProductTypes() {
  // Count by product type
  const types = await prisma.product.groupBy({
    by: ['productType'],
    _count: true,
  });

  console.log('Current product types:');
  types.forEach(t => {
    console.log(`  ${t.productType || 'NULL'}: ${t._count}`);
  });

  // Get samples of products with NULL type
  const nullTypeProducts = await prisma.product.findMany({
    take: 20,
    select: { productName: true, productType: true },
    where: { productType: null }
  });

  console.log('\nProducts with NULL type:');
  nullTypeProducts.forEach(p => {
    console.log(`  ${p.productName}`);
  });

  // Get some examples of each type
  const typeExamples = await prisma.product.findMany({
    where: { productType: { not: null } },
    select: { productName: true, productType: true },
    take: 50
  });

  console.log('\nExamples of each type:');
  const examplesByType: { [key: string]: string[] } = {};
  typeExamples.forEach(p => {
    if (p.productType) {
      if (!examplesByType[p.productType]) {
        examplesByType[p.productType] = [];
      }
      if (examplesByType[p.productType].length < 3) {
        examplesByType[p.productType].push(p.productName);
      }
    }
  });

  Object.entries(examplesByType).forEach(([type, names]) => {
    console.log(`\n${type}:`);
    names.forEach(name => console.log(`  ${name}`));
  });

  await prisma.$disconnect();
}

analyzeProductTypes();