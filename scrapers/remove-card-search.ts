/**
 * Remove "カード検索" (Card Search) placeholder cards from database
 * 
 * These are placeholder cards that should not be in the database.
 * 
 * Usage:
 *   npx tsx scrapers/remove-card-search.ts
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Finding "カード検索" cards...');
  
  // Find all cards with name "カード検索"
  const cardsToDelete = await prisma.card.findMany({
    where: {
      name: 'カード検索',
    },
    select: {
      id: true,
      webCardId: true,
      name: true,
    },
  });
  
  console.log(`Found ${cardsToDelete.length} "カード検索" cards\n`);
  
  if (cardsToDelete.length === 0) {
    console.log('No cards to delete.');
    return;
  }
  
  // Delete all found cards
  const result = await prisma.card.deleteMany({
    where: {
      name: 'カード検索',
    },
  });
  
  console.log(`✓ Deleted ${result.count} "カード検索" cards from database`);
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
