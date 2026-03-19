/**
 * Remove Duplicate Cards Script
 * 
 * Finds and removes duplicate webCardId entries in the database.
 * Keeps the most recently updated entry for each webCardId.
 * 
 * Usage:
 *   npx tsx scrapers/remove-duplicates.ts [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

async function removeDuplicates(dryRun: boolean = false) {
  const prisma = new PrismaClient();
  
  console.log('\n🔍 Finding duplicate webCardId entries...\n');
  
  // Find all webCardIds that have duplicates
  const duplicates = await prisma.$queryRaw<Array<{webCardId: string, count: bigint}>>`
    SELECT "webCardId", COUNT(*) as count
    FROM "cards"
    GROUP BY "webCardId"
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `;
  
  if (duplicates.length === 0) {
    console.log('✓ No duplicates found!\n');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`Found ${duplicates.length} duplicate webCardIds:\n`);
  
  let totalDeleted = 0;
  
  for (const dup of duplicates) {
    const count = Number(dup.count);
    console.log(`  ${dup.webCardId}: ${count} copies`);
    
    // Get all cards with this webCardId, ordered by updatedAt (newest first)
    const cards = await prisma.card.findMany({
      where: { webCardId: dup.webCardId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        webCardId: true,
        name: true,
        language: true,
        updatedAt: true,
      }
    });
    
    // Keep the first one (most recent), delete the rest
    const toKeep = cards[0];
    const toDelete = cards.slice(1);
    
    console.log(`    → Keeping: ${toKeep.name} (${toKeep.language}) - Updated: ${toKeep.updatedAt}`);
    
    for (const card of toDelete) {
      console.log(`    → ${dryRun ? 'Would delete' : 'Deleting'}: ${card.name} (${card.language}) - Updated: ${card.updatedAt}`);
      
      if (!dryRun) {
        await prisma.card.delete({
          where: { id: card.id }
        });
        totalDeleted++;
      }
    }
    console.log('');
  }
  
  console.log(`${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Duplicate webCardIds found: ${duplicates.length}`);
  console.log(`Cards ${dryRun ? 'that would be' : ''} deleted: ${dryRun ? duplicates.reduce((sum, d) => sum + Number(d.count) - 1, 0) : totalDeleted}`);
  console.log(`${'='.repeat(60)}\n`);
  
  await prisma.$disconnect();
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (dryRun) {
  console.log('🔄 DRY RUN MODE - No changes will be made\n');
}

removeDuplicates(dryRun).catch(console.error);
