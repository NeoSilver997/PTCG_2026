import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function checkSpecificProduct() {
  const product = await prisma.product.findFirst({
    where: { productName: { contains: 'Black Bolt' } },
    select: { productName: true, productType: true, country: true }
  });

  console.log('Specific product check:');
  console.log(JSON.stringify(product, null, 2));

  await prisma.$disconnect();
}

checkSpecificProduct();