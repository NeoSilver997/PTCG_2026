import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function checkNullProducts() {
  const nullProducts = await prisma.product.findMany({
    where: { productType: null },
    select: { productName: true, country: true },
    take: 10
  });

  console.log('NULL products:');
  nullProducts.forEach(p => {
    console.log(`  ${p.country}: ${p.productName}`);
  });

  const count = await prisma.product.count({ where: { productType: null } });
  console.log(`Total NULL products: ${count}`);

  await prisma.$disconnect();
}

checkNullProducts();