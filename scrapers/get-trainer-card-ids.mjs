#!/usr/bin/env node
/**
 * Extract Trainer card IDs from database for re-scraping
 */
import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching Trainer card IDs from database...');
  
  const cards = await prisma.card.findMany({
    where: { 
      supertype: 'TRAINER',
      language: 'JA_JP'
    },
    select: { webCardId: true },
    orderBy: { webCardId: 'asc' }
  });

  // Extract numeric IDs
  const ids = cards
    .map(c => parseInt(c.webCardId.replace(/^jp/, '')))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  console.log(`Found ${ids.length} Trainer cards`);
  console.log(`ID Range: ${ids[0]} - ${ids[ids.length - 1]}`);
  
  // Output as comma-separated list
  console.log('\nCard IDs (for --ids parameter):');
  console.log(ids.join(','));
  
  await prisma.$disconnect();
}

main().catch(console.error);
