/**
 * Adds / maintains two effectTags on relevant PrimaryCards:
 *
 *  放置基礎寶可夢  — cards that search the deck for / place Basic Pokémon onto Bench
 *                    (好友寶芬, 戰鬥鑼, 貴重手推車, 太晶珠, 小剛的發掘, 火狐狸 …)
 *
 *  附上搜索能量    — cards that attach or search Energy from the deck / discard
 *                    (戰鬥鑼, 捕蟲組合, 赤松, 火伊布ex, 能量輸送 …)
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
  // ── Items ────────────────────────────────────────────────
  '好友寶芬',       // Buddy-Buddy Poffin — places 2 Basic from deck
  '太晶珠',         // Tera Orb — searches for Tera (Basic) Pokémon
  '戰鬥鑼',         // Battle VIP Pass — places 2 Basic onto Bench (first turn)
  '貴重手推車',     // Luxury Cart — searches for Basic + Energy
  '精靈球',         // Poké Ball
  '超級球',         // Ultra Ball
  '高級球',         // Premium Ball
  '巢穴球',         // Nest Ball
  '急救急救包',     // Fast Ball / Emergency Ball variants
  '頸圈球',         // Collar Ball
  '快速球',         // Quick Ball
  '研究所雷達',     // Research Radar
  '蘑菇化石',       // Fossil searchers
  '古代化石',
  // ── Supporters ───────────────────────────────────────────
  '小剛的發掘',     // Brock's Excavation — places Basic Pokémon from deck
  // ── Pokémon abilities (name = Pokémon card name) ─────────
  '火狐狸',         // Fennekin — 呼朋引伴 ability: place a Basic from deck onto Bench
];

/**
 * Cards that attach Energy cards or search the deck / discard for Energy.
 * Includes Items, Supporters, Pokémon abilities/attacks that do energy attachment.
 */
const ENERGY_ATTACH_SEARCH_NAMES: string[] = [
  // ── Items ────────────────────────────────────────────────
  '戰鬥鑼',         // Battle VIP Pass — also searches / attaches Energy
  '捕蟲組合',       // Bug Catching Set — attaches Bug Energy
  '能量輸送',       // Energy Transfer — moves Energy between Pokémon
  '能量回收',       // Energy Retrieval — retrieves Energy from discard
  '超級能量回收',   // Super Energy Retrieval
  '能量搜尋',       // Energy Search
  '能量附上',       // Energy Attach (generic)
  '特殊充能',       // Special Charge
  '磁石充能',       // Electromagnetic Charge
  // ── Supporters ───────────────────────────────────────────
  '赤松',           // Akamine — attaches Fire Energy from deck
  // ── Pokémon (ability / attack name = Pokémon card name) ──
  '火伊布ex',       // Flareon ex — ability attaches Fire Energy
  '燃燒充能',       // Burning Charge (Pokémon attack/ability)
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
