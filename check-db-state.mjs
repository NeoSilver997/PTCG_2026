import { PrismaClient } from './packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function checkDatabase() {
  const cardCount = await prisma.card.count();
  console.log(`Total cards in database: ${cardCount}`);
  
  if (cardCount > 0) {
    const sample = await prisma.card.findMany({ take: 3 });
    console.log('\nSample cards:');
    console.log(JSON.stringify(sample, null, 2));
  }
  
  await prisma.$disconnect();
}

checkDatabase().catch(console.error);
