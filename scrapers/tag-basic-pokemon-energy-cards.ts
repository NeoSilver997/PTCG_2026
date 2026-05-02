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
  '好友寶芬',       // Buddy-Buddy Poffin — places 2 Basic from deck onto Bench
  '太晶珠',         // Tera Orb — searches for a Tera Basic Pokémon from deck
  '戰鬥鑼',         // 從自己的牌庫選擇1張【鬥】屬性的【基礎】寶可夢卡或者「基本【鬥】能量」卡，在給對手看過後加入手牌。並且重洗牌庫。
  '貴重手推車',     // 從自己的牌庫選擇任意數量的【基礎】寶可夢卡，放置於備戰區。並且重洗牌庫。
  '巢穴球',         // Nest Ball — places a Basic directly onto Bench
  '寶可平板',       // Pokémon Reversal — places a Basic from deck onto Bench
  // ── Supporters ───────────────────────────────────────────
  '小剛的發掘',     // Brock's Excavation — places Basic Pokémon from deck
  '火箭隊的蘭斯',   // Rocket's Lance — places Basic Pokémon from deck
  '青木的手法',     // Aoki's Tricks — places Basic Pokémon from deck
  // ── Pokémon abilities (name = Pokémon card name) ─────────
  // NOTE: for archetype naming these must have hasAbilities=true in DB;
  //       abilities=false entries still receive the tag as metadata but
  //       won't appear in cachedArchetypeName (classified to pokemon-secondary, not pokemon-support).
  '火狐狸',         // Fennekin — 呼朋引伴: place a Basic from deck onto Bench  (abilities=false in DB — data gap)
  '呱頭蛙',         // Froakie — bench-call ability                             (abilities=false in DB — data gap)
  '小箭雀',         // Fletchling — bench-call ability                          (abilities=false in DB — data gap)
  '幾何雪花',       // Cryogonal — bench-setup ability                          (abilities=false in DB — data gap)
  '奇魯莉安',       // Kirlia — 呼喚信號: place 2 Basics onto Bench             (abilities=true ✓ → affects archetype names)
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
  // NOTE: 阿響的冒險 (Arven) searches for 1 Item + 1 Tool — does NOT place Pokémon or attach Energy
];

/**
 * Cards that search the deck / discard for a specific *typed* basic energy
 * (「基本【X】能量」 pattern). These are reliably auto-detected by keyword in
 * populate-effect-tags.ts, but listed here as a fallback / documentation.
 */
const TYPED_ENERGY_SEARCHER_NAMES: string[] = [
  // ── Items ────────────────────────────────────────────────
  '電氣發生器',     // Electric Generator — deck top 5 → up to 2 「基本【雷】能量」, attach to bench 【雷】
  '戰鬥鑼',         // Battle Drum — deck → 1 【鬥】Basic Pokémon OR 「基本【鬥】能量」 to hand
  '捕蟲組合',       // Bug Catching Set — deck top 7 → 【草】Pokémon + 「基本【草】能量」 to hand
  // ── Supporters ───────────────────────────────────────────
  '吹火人',         // 吹火人 — deck → up to 7 「基本【火】能量」 to hand
  '阿響的冒險',     // Arven (ZH variant) — deck → Arven's Pokémon + 「基本【火】能量」 (≤3) to hand
  '塔拉剛',         // 塔拉剛 — discard → 【鬥】Pokémon + 「基本【鬥】能量」 (≤4) to hand
  // ── Pokémon abilities ────────────────────────────────────
  '吉普索',         // 吉普索 — discard → up to 2 「基本【鋼】能量」, attach to 【鋼】Pokémon
  '梅洛可',         // 梅洛可 — discard → 1 「基本【火】能量」, attach, then draw to 6
  // ── Pokémon abilities ────────────────────────────────────
  '阿杏的秘招',     // Caitlin's Trick — deck → up to 2 「基本【惡】能量」 attach to 【惡】Pokémon
                    // NOTE: stored text has space artifact 「基 本【惡】能量」 — keyword won't catch without fix
  '奇跡修正檔',     // Miracle Patch — discard → 「基本【超】能量」 attach to bench 【超】Pokémon
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
  await addTagToCards(TYPED_ENERGY_SEARCHER_NAMES,  '搜索指定能量');

  console.log(`\n${'='.repeat(50)}`);
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
