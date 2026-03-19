import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function verifyProducts() {
  // Total count
  const total = await prisma.product.count();
  console.log(`\nTotal products: ${total}\n`);
  
  // Count by country
  const byCountry = await prisma.product.groupBy({
    by: ['country'],
    _count: true,
  });
  
  console.log('Products by country:');
  byCountry.forEach(item => {
    console.log(`  ${item.country}: ${item._count}`);
  });
  
  // Sample products
  const samples = await prisma.product.findMany({
    take: 5,
    select: {
      country: true,
      productName: true,
      releaseDate: true,
      price: true,
      productType: true,
    },
  });
  
  console.log('\nSample products:');
  samples.forEach(p => {
    console.log(`  ${p.country} - ${p.productName} (${p.releaseDate || 'N/A'}) - ${p.price || 'N/A'}`);
  });
  
  await prisma.$disconnect();
}

verifyProducts();
