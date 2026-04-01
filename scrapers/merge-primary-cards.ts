/**
 * Merge multiple PrimaryCards into one canonical record.
 * Usage: npx tsx scrapers/merge-primary-cards.ts en24871 hk15263 jp50006
 *   All cards linked to those webCardIds' PrimaryCards are re-pointed to a
 *   single PrimaryCard, then orphaned PrimaryCards are deleted.
 *   The canonical PrimaryCard is chosen interactively or by --keep=<webCardId>.
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const keepArg = args.find((a) => a.startsWith('--keep='));
  const webCardIds = args.filter((a) => !a.startsWith('--'));

  if (webCardIds.length < 2) {
    console.error('Usage: npx tsx scrapers/merge-primary-cards.ts <webCardId1> <webCardId2> ... [--keep=<webCardId>]');
    process.exit(1);
  }

  // 1. Resolve cards → distinct PrimaryCard IDs
  const cards = await prisma.card.findMany({
    where: { webCardId: { in: webCardIds } },
    select: {
      webCardId: true, name: true, language: true, variantType: true,
      primaryCardId: true,
      primaryCard: { select: { id: true, cardNumber: true, primaryExpansion: { select: { code: true, nameEn: true } } } },
    },
  });

  const missing = webCardIds.filter((id) => !cards.find((c) => c.webCardId === id));
  if (missing.length > 0) {
    console.error(`Cards not found in DB: ${missing.join(', ')}`);
    process.exit(1);
  }

  const uniquePrimaryIds = [...new Set(cards.map((c) => c.primaryCardId))];
  if (uniquePrimaryIds.length === 1) {
    console.log('✓ All cards already share the same PrimaryCard:', uniquePrimaryIds[0]);
    return;
  }

  // 2. Load all cards under each PrimaryCard (not just the queried ones)
  const allLinked = await prisma.card.findMany({
    where: { primaryCardId: { in: uniquePrimaryIds } },
    select: { webCardId: true, name: true, language: true, variantType: true, primaryCardId: true },
  });

  console.log('\nCurrent PrimaryCard groups:\n');
  const primaryMap = new Map<string, typeof cards[0]['primaryCard']>();
  for (const c of cards) primaryMap.set(c.primaryCardId, c.primaryCard);

  const groups = uniquePrimaryIds.map((pid) => ({
    pid,
    pc: primaryMap.get(pid)!,
    linkedCards: allLinked.filter((c) => c.primaryCardId === pid),
    refCard: cards.find((c) => c.primaryCardId === pid)!,
  }));

  groups.forEach((g, i) => {
    console.log(`  [${i + 1}] PrimaryCard ${g.pid}`);
    console.log(`      Expansion: ${g.pc.primaryExpansion.code} (${g.pc.primaryExpansion.nameEn})`);
    console.log(`      CardNumber: ${g.pc.cardNumber}`);
    console.log(`      Linked cards: ${g.linkedCards.map((c) => `${c.webCardId}(${c.language}/${c.variantType})`).join(', ')}`);
  });

  // 3. Choose canonical PrimaryCard
  let keepGroup = groups[0];

  if (keepArg) {
    const keepId = keepArg.replace('--keep=', '');
    const match = groups.find((g) => g.linkedCards.some((c) => c.webCardId === keepId));
    if (!match) { console.error(`--keep=${keepId} not found in any group`); process.exit(1); }
    keepGroup = match;
  } else {
    // Prompt user
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const choice = await new Promise<string>((res) => {
      rl.question(`\nWhich PrimaryCard to keep as canonical? [1-${groups.length}]: `, (ans) => { rl.close(); res(ans.trim()); });
    });
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= groups.length) { console.error('Invalid choice'); process.exit(1); }
    keepGroup = groups[idx];
  }

  console.log(`\n✓ Keeping PrimaryCard: ${keepGroup.pid} (${keepGroup.pc.primaryExpansion.code}/${keepGroup.pc.cardNumber})`);

  const toMerge = groups.filter((g) => g.pid !== keepGroup.pid);

  // 4. Check for language/variantType conflicts
  const keepLangs = new Set(keepGroup.linkedCards.map((c) => `${c.language}/${c.variantType}`));
  const conflicts: string[] = [];
  for (const g of toMerge) {
    for (const c of g.linkedCards) {
      const key = `${c.language}/${c.variantType}`;
      if (keepLangs.has(key)) {
        conflicts.push(`${c.webCardId} (${key}) conflicts with an existing card on PrimaryCard ${keepGroup.pid}`);
      }
    }
  }
  if (conflicts.length > 0) {
    console.error('\n❌ Cannot merge — unique constraint would be violated:');
    conflicts.forEach((c) => console.error('   ', c));
    process.exit(1);
  }

  // 5. Re-point cards + delete orphaned PrimaryCards
  const movedCards: string[] = [];
  for (const g of toMerge) {
    for (const c of g.linkedCards) {
      await prisma.card.update({ where: { webCardId: c.webCardId }, data: { primaryCardId: keepGroup.pid } });
      movedCards.push(c.webCardId);
      console.log(`  Moved ${c.webCardId} (${c.language}/${c.variantType}) → ${keepGroup.pid}`);
    }
    await prisma.primaryCard.delete({ where: { id: g.pid } });
    console.log(`  Deleted orphaned PrimaryCard ${g.pid}`);
  }

  console.log(`\n✓ Done. ${movedCards.length} card(s) re-linked to PrimaryCard ${keepGroup.pid}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
