/**
 * update-promo-rarity.ts
 *
 * Two operations:
 *   1. Set rarity=PROMO on all cards whose RegionalExpansion code matches
 *      a product with productType.code = 'promo' (e.g. SVP, SW-P, MEP, etc.)
 *   2. Fix specific cards that are incorrectly labelled PROMO (e.g. sv4a Shiny Rare cards)
 *
 * Usage:
 *   npx tsx scrapers/update-promo-rarity.ts              # dry-run
 *   npx tsx scrapers/update-promo-rarity.ts --apply      # apply changes
 */

import { PrismaClient, Rarity } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

// Cards that have wrong rarity and should NOT be PROMO
// Format: { webCardId, correctRarity }
const RARITY_OVERRIDES: { webCardId: string; correctRarity: Rarity; reason: string }[] = [
  { webCardId: 'jp45101', correctRarity: 'SHINY_RARE' as Rarity, reason: 'sv4a Shiny Treasure card, not a promo' },
];

async function main() {
  console.log('='.repeat(60));
  console.log(`Promo Rarity Update${APPLY ? ' [APPLY MODE]' : ' [DRY RUN]'}`);
  console.log('='.repeat(60));

  // ── 1. Get all promo products' expansion codes ──
  const promoProducts = await prisma.product.findMany({
    where: { productType: { code: 'promo' } },
    select: { productName: true, code: true },
  });

  // Only codes that look like expansion codes (not archive paths)
  const promoCodes = promoProducts
    .map(p => p.code?.trim().toLowerCase())
    .filter((c): c is string => !!c && !c.includes('/'));

  console.log(`\nPromo products with expansion codes (${promoCodes.length}):`);
  promoCodes.forEach(c => console.log(`  - ${c}`));

  // ── 2. Find cards in those expansions ──
  const promoExpansions = await prisma.regionalExpansion.findMany({
    where: { code: { in: promoCodes, mode: 'insensitive' } },
    select: { id: true, code: true },
  });

  console.log(`\nMatched regional expansions (${promoExpansions.length}):`);
  promoExpansions.forEach(e => console.log(`  - ${e.code}`));

  const expansionIds = promoExpansions.map(e => e.id);

  // Find cards in promo expansions that don't already have PROMO rarity
  const cardsToMarkPromo = await prisma.card.findMany({
    where: {
      regionalExpansionId: { in: expansionIds },
      rarity: { not: 'PROMO' },
    },
    select: { id: true, webCardId: true, rarity: true, name: true,
      regionalExpansion: { select: { code: true } } },
  });

  console.log(`\nCards to mark as PROMO: ${cardsToMarkPromo.length}`);
  cardsToMarkPromo.slice(0, 10).forEach(c =>
    console.log(`  ${c.webCardId} [${c.regionalExpansion?.code}] ${c.name}: ${c.rarity} → PROMO`)
  );
  if (cardsToMarkPromo.length > 10) console.log(`  ... and ${cardsToMarkPromo.length - 10} more`);

  // ── 3. Find promo-expansion cards with "ex" in their name → DOUBLE_RARE ──
  const exCards = await prisma.card.findMany({
    where: {
      regionalExpansionId: { in: expansionIds },
      name: { contains: 'ex', mode: 'insensitive' },
      rarity: { not: 'DOUBLE_RARE' },
    },
    select: { id: true, webCardId: true, rarity: true, name: true,
      regionalExpansion: { select: { code: true } } },
  });

  console.log(`\nPromo "ex" cards to set as DOUBLE_RARE: ${exCards.length}`);
  exCards.slice(0, 10).forEach(c =>
    console.log(`  ${c.webCardId} [${c.regionalExpansion?.code}] ${c.name}: ${c.rarity} → DOUBLE_RARE`)
  );
  if (exCards.length > 10) console.log(`  ... and ${exCards.length - 10} more`);

  // ── 4. Check wrong-rarity cards (incorrectly set to PROMO) ──
  console.log(`\nRarity corrections (non-promo cards with wrong PROMO rarity):`);
  const overrideChecks = await Promise.all(
    RARITY_OVERRIDES.map(async (o) => {
      const card = await prisma.card.findUnique({
        where: { webCardId: o.webCardId },
        select: { id: true, webCardId: true, rarity: true, name: true,
          regionalExpansion: { select: { code: true } } },
      });
      return { ...o, card };
    })
  );

  const overridesToApply = overrideChecks.filter(o => o.card && o.card.rarity !== o.correctRarity);
  overridesToApply.forEach(o =>
    console.log(`  ${o.webCardId} [${o.card?.regionalExpansion?.code}] ${o.card?.name}: ${o.card?.rarity} → ${o.correctRarity} (${o.reason})`)
  );
  if (overridesToApply.length === 0) console.log(`  (none needed)`);

  if (!APPLY) {
    console.log('\n[DRY RUN] No changes made. Run with --apply to apply.');
    await prisma.$disconnect();
    return;
  }

  // ── Apply changes ──
  console.log('\nApplying...');

  if (cardsToMarkPromo.length > 0) {
    // Exclude ex cards from the PROMO batch (they will be DOUBLE_RARE)
    const exIds = new Set(exCards.map(c => c.id));
    const promoOnlyIds = cardsToMarkPromo.map(c => c.id).filter(id => !exIds.has(id));
    if (promoOnlyIds.length > 0) {
      const result = await prisma.card.updateMany({
        where: { id: { in: promoOnlyIds } },
        data: { rarity: 'PROMO' },
      });
      console.log(`✅ Set PROMO rarity on ${result.count} cards`);
    }
  }

  if (exCards.length > 0) {
    const result = await prisma.card.updateMany({
      where: { id: { in: exCards.map(c => c.id) } },
      data: { rarity: 'DOUBLE_RARE' },
    });
    console.log(`✅ Set DOUBLE_RARE (RR) on ${result.count} promo ex cards`);
  }

  for (const o of overridesToApply) {
    if (!o.card) continue;
    await prisma.card.update({
      where: { id: o.card.id },
      data: { rarity: o.correctRarity },
    });
    console.log(`✅ Fixed ${o.webCardId}: ${o.card.rarity} → ${o.correctRarity}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
