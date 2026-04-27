/**
 * Adds two new effectTags to relevant PrimaryCards:
 *
 *  放置基礎寶可夢  — cards that search / place Basic Pokémon from the deck
 *                    (好友寶芬, 太晶珠, …)
 *
 *  附上搜索能量    — cards that attach or search Energy from the deck / discard
 *                    (捕蟲組合, 赤松, 火伊布ex, 燃燒充能, 能量輸送, …)
 *
 * Usage:
 *   npx tsx scrapers/tag-basic-pokemon-energy-cards.ts
 *   npx tsx scrapers/tag-basic-pokemon-energy-cards.ts --dry-run
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

// ── Card lists ──────────────────────────────────────────────────────────────

/**
 * Cards that search the deck for / put Basic Pokémon onto the Bench.
 * Add more Chinese names as needed.
 */
const BASIC_POKEMON_SEARCHER_NAMES: string[] = [
  '好友寶芬',       // Buddy-Buddy Poffin — places 2 Basic from deck
  '太晶珠',         // Tera Orb — searches for Tera Pokémon (Basic Tera)
  '精靈球',         // Poké Ball
  '超級球',         // Ultra Ball (searches any Basic)
  '高級球',         // Premium Ball
  '巢穴球',         // Nest Ball
  '急救急救包',     // Emergency Poké Ball / Fast Ball variants
  '頸圈球',         // Collar Ball
  '快速球',         // Quick Ball
  '研究所雷達',     // Research Radar
  '蘑菇化石',       // fossil / basic search variants
  '古代化石',
];

/**
 * Cards that attach Energy cards or search the deck for Energy.
 * Includes Items, Supporters, Pokémon abilities/attacks that do energy attachment.
 */
const ENERGY_ATTACH_SEARCH_NAMES: string[] = [
  '捕蟲組合',       // Bug Catching Set — attaches Bug Energy
  '赤松',           // Akamine (Supporter) — attaches Fire Energy
  '火伊布ex',       // Flareon ex — ability attaches Fire Energy
  '燃燒充能',       // Burning Charge (attack/ability)
  '能量輸送',       // Energy Transfer — moves Energy
  '能量回收',       // Energy Retrieval — gets Energy from discard
  '超級能量回收',   // Super Energy Retrieval
  '能量搜尋',       // Energy Search
  '能量附上',       // Energy Attach (generic)
  '特殊充能',       // Special Charge
  '磁石充能',       // Electromagnetic Charge
  '火焰輸送',       // Inferno Power (Pokémon ability)
  '草能量充能',     // Leaf Charge
];

// ── Helper ──────────────────────────────────────────────────────────────────

async function addTagToCards(names: string[], newTag: string) {
  console.log(`\n──────────────────────────────────────`);
  console.log(`Tag: "${newTag}"`);
  console.log(`Cards (${names.length}): ${names.join(', ')}`);

  // Find PrimaryCards whose cards have a matching name
  const primaryCards = await prisma.primaryCard.findMany({
    where: {
      cards: {
        some: {
          name: { in: names },
        },
      },
    },
    select: {
      id: true,
      effectTags: true,
      cards: {
        select: { name: true },
        take: 1,
      },
    },
  });

  if (primaryCards.length === 0) {
    console.log('  ⚠  No matching PrimaryCards found.');
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const pc of primaryCards) {
    const displayName = pc.cards[0]?.name ?? pc.id;
    if (pc.effectTags.includes(newTag)) {
      console.log(`  ↩  Already tagged: ${displayName} (${pc.id})`);
      skipped++;
      continue;
    }
    if (!isDryRun) {
      await prisma.primaryCard.update({
        where: { id: pc.id },
        data: { effectTags: { push: newTag } },
      });
    }
    console.log(`  ✔  ${isDryRun ? '[dry] ' : ''}Tagged: ${displayName} (${pc.id})`);
    updated++;
  }

  console.log(`  → Updated: ${updated}  |  Already had tag: ${skipped}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`PTCG Effect-Tag Backfill${isDryRun ? ' [DRY RUN]' : ''}`);
  console.log('='.repeat(50));

  await addTagToCards(BASIC_POKEMON_SEARCHER_NAMES, '放置基礎寶可夢');
  await addTagToCards(ENERGY_ATTACH_SEARCH_NAMES,   '附上搜索能量');

  console.log(`\n${'='.repeat(50)}`);
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
