/**
 * Refresh Deck Meta Script
 *
 * Batch-computes cachedArchetypeName / cachedAceName for event decks
 * that have linked DeckCards. Mirrors the client-side logic in
 * deck-builder/event/[deckCode]/page.tsx so the names are consistent.
 *
 * Usage:
 *   npx tsx scrapers/refresh-deck-meta.ts                   # only decks missing archetype name
 *   npx tsx scrapers/refresh-deck-meta.ts --all             # refresh all event decks
 *   npx tsx scrapers/refresh-deck-meta.ts --limit=200       # cap number of decks
 *   npx tsx scrapers/refresh-deck-meta.ts --dry-run         # preview without saving
 *   npx tsx scrapers/refresh-deck-meta.ts --refresh-prices  # also update price cache
 */

import { PrismaClient, Prisma } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun        = args.includes('--dry-run');
const refreshAll    = args.includes('--all');
const refreshPrices = args.includes('--refresh-prices');
const limitArg      = args.find((a) => a.startsWith('--limit='));
const limit         = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ── Draw-engine detection via effect tags (mirrors deck-format-logic.md) ────────
// Cards tagged with either of these are treated as notable support that belongs
// in the archetype name (e.g. 「ノコッチex + 戰鬥鑼」= 放置基礎寶可夢).
const DRAW_ENGINE_TAGS = ['放置基礎寶可夢', '附上搜索能量'];

// Evolution stage ordering — used to filter lower stages when higher evo is in the deck
const STAGE_ORDER: Record<string, number> = { BASIC: 0, STAGE_1: 1, STAGE_2: 2 };

// DB role enum → section key (mirrors DeckPokemonRole in deck-view.tsx)
const DB_ROLE_TO_SECTION: Partial<Record<string, SectionKey>> = {
  POKEMON_MAIN:      'pokemon-main',
  POKEMON_SECONDARY: 'pokemon-secondary',
  POKEMON_SUPPORT:   'pokemon-support',
  POKEMON_EVOLUTION: 'pokemon-evolution',
};

// ── Section-key types & helpers (mirrors deck-view.tsx getSectionKey) ─────────
type SectionKey =
  | 'pokemon-main'
  | 'pokemon-secondary'
  | 'pokemon-support'
  | 'pokemon-evolution'
  | 'ace'
  | 'supporter'
  | 'item'
  | 'tool'
  | 'stadium'
  | 'basic-energy'
  | 'special-energy';

interface CardRow {
  supertype: string | null;
  subtypes: string[];
  rarity: string | null;
  hp: number | null;
  hasAbilities: boolean;
  quantity: number;
  evolutionStage?: string | null;
  dexNumber?: string | null;
}

function isMainPokemon(card: CardRow): boolean {
  // STAGE_2 → always main (represents a committed 3-card evolution line)
  if (card.evolutionStage === 'STAGE_2') return true;
  if ((card.hp ?? 0) >= 200) return true;
  // qty >= 3 → main regardless of ability (bench supports are rarely run at ×3)
  // e.g. イイネイヌ ×3 (Ting-Lu ability-attacker), マシマシラ ×3 (Grafaiai)
  if (card.quantity >= 3) return true;
  // Evolved (STAGE_1+) at qty >= 2 → committed attacker line, e.g. イワパレス ×2 (Crustle)
  if (card.quantity >= 2 && (card.evolutionStage ?? 'BASIC') !== 'BASIC') return true;
  // Remaining: BASIC with ability at 1–2 copies → bench support / draw engine
  // e.g. スボミー (hp:30), コダック (hp:70), ルナトーン (hp:110 ×2)
  return false;
}

function getSectionKey(card: CardRow): SectionKey {
  const { supertype, subtypes = [], rarity } = card;
  // ACE_SPEC check first — applies to both TRAINER and ENERGY cards (e.g. ネオアッパーエネルギー)
  if (rarity === 'ACE_SPEC_RARE' || rarity === 'ACE_SPEC') return 'ace';
  if (supertype === 'POKEMON') {
    if (isMainPokemon(card)) return 'pokemon-main';
    if (card.hasAbilities) return 'pokemon-support';
    return 'pokemon-secondary';
  }
  if (supertype === 'ENERGY') {
    return subtypes.includes('BASIC_ENERGY') ? 'basic-energy' : 'special-energy';
  }
  // TRAINER
  if (subtypes.includes('SUPPORTER')) return 'supporter';
  if (subtypes.includes('ITEM')) return 'item';
  if (subtypes.includes('TOOL')) return 'tool';
  if (subtypes.includes('STADIUM')) return 'stadium';
  return 'item';
}

// ── DB row type ───────────────────────────────────────────────────────────────
interface DeckCardRow {
  deckId: string;
  deckCode: string;
  quantity: number;
  cardName: string | null;
  zhName: string | null;
  supertype: string | null;
  subtypes: string[];
  rarity: string | null;
  hp: number | null;
  evolvesTo: string | null;
  evolutionStage: string | null;
  hasAbilities: boolean;
  /** effectTags from primary_cards — used to detect draw-engine / bench-setup Pokémon */
  effectTags: string[];
  /** National Pokédex number from pokemon_species (4-digit string, e.g. "0887") */
  dexNumber: string | null;
  /** Saved role from deck_card_roles (via JA_JP canonical webCardId) — overrides heuristic */
  savedRole: string | null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('================================================================');
  console.log('Deck Meta Refresh');
  console.log('================================================================');
  console.log(`Mode: ${refreshAll ? 'ALL event decks' : 'missing archetype names only'}`);
  console.log(`Dry run:        ${dryRun}`);
  console.log(`Limit:          ${isFinite(limit) ? limit : '∞'}`);
  console.log(`Refresh prices: ${refreshPrices}`);
  console.log('');

  // Only target decks that have at least one DeckCard row
  const missingFilter = refreshAll
    ? Prisma.empty
    : Prisma.sql`AND d."cachedArchetypeName" IS NULL`;
  const rowLimit = isFinite(limit) ? limit * 100 : 5000000;

  const rows = await prisma.$queryRaw<DeckCardRow[]>`
    SELECT
      d.id              AS "deckId",
      d."deckCode"      AS "deckCode",
      dc.quantity       AS "quantity",
      c.name            AS "cardName",
      zh.name           AS "zhName",
      c.supertype       AS "supertype",
      c.subtypes        AS "subtypes",
      c.rarity          AS "rarity",
      c.hp              AS "hp",
      c."evolvesTo"     AS "evolvesTo",
      c."evolutionStage" AS "evolutionStage",
      (c.abilities IS NOT NULL AND c.abilities != 'null'::jsonb) AS "hasAbilities",
      COALESCE(pc."effectTags", '{}')  AS "effectTags",
      ps."dexNumber"                   AS "dexNumber",
      dcr.role::text                   AS "savedRole"
    FROM decks d
    JOIN deck_cards dc ON dc."deckId" = d.id
    JOIN cards c       ON c.id = dc."cardId"
    LEFT JOIN (
      SELECT DISTINCT ON ("primaryCardId") "primaryCardId", name
      FROM cards
      WHERE language = 'ZH_TW'
      ORDER BY "primaryCardId", "createdAt" ASC
    ) zh ON zh."primaryCardId" = c."primaryCardId"
    LEFT JOIN primary_cards pc ON pc.id = c."primaryCardId"
    LEFT JOIN pokemon_species ps ON ps.id = pc."pokemonSpeciesId"
    -- Resolve canonical (JA_JP) webCardId per primaryCard for role lookup
    LEFT JOIN (
      SELECT DISTINCT ON ("primaryCardId") "primaryCardId", "webCardId"
      FROM cards
      WHERE language = 'JA_JP'
      ORDER BY "primaryCardId", "createdAt" ASC
    ) ja ON ja."primaryCardId" = c."primaryCardId"
    -- Apply saved role overrides from deck_card_roles
    LEFT JOIN deck_card_roles dcr
      ON dcr."deckCode" = d."deckCode"
      AND dcr."canonicalWebCardId" = ja."webCardId"
    WHERE EXISTS (SELECT 1 FROM deck_cards dc2 WHERE dc2."deckId" = d.id)
    ${missingFilter}
    ORDER BY d."createdAt" DESC
    LIMIT ${rowLimit}
  `;

  // Group rows by deckId
  const deckMap = new Map<string, { deckCode: string; cards: DeckCardRow[] }>();
  for (const row of rows) {
    if (!deckMap.has(row.deckId)) {
      deckMap.set(row.deckId, { deckCode: row.deckCode, cards: [] });
    }
    deckMap.get(row.deckId)!.cards.push(row);
  }

  const total = deckMap.size;
  console.log(`Decks to process: ${total}`);

  if (total === 0) {
    console.log('Nothing to update.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let skipped = 0;
  const updatedDeckIds: string[] = [];

  for (const [deckId, { deckCode, cards }] of deckMap) {
    // Build dexNumber → max evolutionStage map for ALL pokémon in this deck.
    // Used by the evolution-family filter below to reliably exclude lower-stage
    // stepping-stone pokémon even when evolvesTo data is in a different language or missing.
    const deckDexStages = new Map<string, number>();
    for (const card of cards) {
      if (card.supertype !== 'POKEMON' || !card.dexNumber) continue;
      const stage = STAGE_ORDER[card.evolutionStage ?? 'BASIC'] ?? 0;
      const current = deckDexStages.get(card.dexNumber) ?? -1;
      if (stage > current) deckDexStages.set(card.dexNumber, stage);
    }

    // Classify cards into sections
const sections = new Map<SectionKey, Array<{ name: string | null; zhName: string | null; quantity: number; hp: number | null; evolvesTo: string | null; evolutionStage: string | null; effectTags: string[]; dexNumber: string | null }>>([
      ['pokemon-main', []],
      ['pokemon-support', []],
      ['ace', []],
    ]);

    for (const card of cards) {
      // Saved role overrides heuristic (mirrors client-side priority order)
      const key = card.savedRole
        ? (DB_ROLE_TO_SECTION[card.savedRole] ?? getSectionKey(card))
        : getSectionKey(card);
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key)!.push({ 
        name: card.cardName, 
        zhName: card.zhName, 
        quantity: card.quantity, 
        hp: card.hp,
        evolvesTo: card.evolvesTo,
        evolutionStage: card.evolutionStage ?? null,
        effectTags: card.effectTags ?? [],
        dexNumber: card.dexNumber ?? null,
      });
    }

    // Sort pokemon-main section:
    // 1. Evolution stage descending (STAGE_2 before STAGE_1 before BASIC)
    //    — STAGE_2 cards represent committed 3-card lines and should lead archetype naming
    // 2. Quantity descending
    // 3. HP descending
    const mainSection = sections.get('pokemon-main') ?? [];
    mainSection.sort((a, b) => {
      const stageDiff = (STAGE_ORDER[b.evolutionStage ?? 'BASIC'] ?? 0)
                      - (STAGE_ORDER[a.evolutionStage ?? 'BASIC'] ?? 0);
      if (stageDiff !== 0) return stageDiff;
      const qDiff = b.quantity - a.quantity;
      if (qDiff !== 0) return qDiff;
      return (b.hp ?? 0) - (a.hp ?? 0);
    });

    // Filter out lower-stage evolution stepping stones using National Pokédex number proximity.
    // For each entry in mainSection, check if ANY card in the deck (deckDexStages)
    // with a consecutive dexNumber (+1, +2, +3) has a higher evolutionStage.
    // This handles cross-language evolvesTo mismatches and missing evolvesTo data.
    // e.g. ドラメシヤ(0885) gets filtered when ドロンチ(0886, STAGE_1) is in the deck,
    //      even if evolvesTo is in Japanese but card names are in Traditional Chinese.
    const mainSectionFiltered = mainSection.filter(entry => {
      if (!entry.dexNumber) return true; // No dex info → keep (can use savedRole to override)
      const myStage = STAGE_ORDER[entry.evolutionStage ?? 'BASIC'] ?? 0;
      const myDex = parseInt(entry.dexNumber, 10);
      for (let delta = 1; delta <= 3; delta++) {
        const neighborDex = String(myDex + delta).padStart(4, '0');
        const neighborStage = deckDexStages.get(neighborDex);
        if (neighborStage !== undefined && neighborStage > myStage) return false;
      }
      return true;
    });

    // Top-2 unique main Pokémon ZH names (now properly sorted and filtered)
    const primaryNames = mainSectionFiltered
      .map((e) => e.zhName ?? e.name)
      .filter((n): n is string => !!n)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 2);

    // Fallback for spread / toolbox decks where no pokemon passes isMainPokemon
    // (e.g. all attackers at ×1 copies): pick top-2 by HP desc → quantity desc
    // from all non-evolution-stepping-stone pokemon.
    const mainNames = primaryNames.length > 0
      ? primaryNames
      : [
          ...(sections.get('pokemon-secondary') ?? []),
          ...(sections.get('pokemon-support') ?? []),
        ]
          .sort((a, b) => (b.hp ?? 0) - (a.hp ?? 0) || b.quantity - a.quantity)
          .map((e) => e.zhName ?? e.name)
          .filter((n): n is string => !!n)
          .filter((n, i, arr) => arr.indexOf(n) === i)
          .slice(0, 2);

    // Draw-engine support Pokémon — detected by effect tags, not hardcoded names
    const drawEngineNames = (sections.get('pokemon-support') ?? [])
      .filter((e) => DRAW_ENGINE_TAGS.some(tag => (e.effectTags ?? []).includes(tag)))
      .map((e) => e.zhName ?? e.name)
      .filter((n): n is string => !!n)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 1);

    const archetypeName = [...mainNames, ...drawEngineNames].join(' + ') || null;

    const aceEntry = (sections.get('ace') ?? [])[0];
    const aceName = aceEntry ? (aceEntry.zhName ?? aceEntry.name ?? null) : null;

    if (!archetypeName && !aceName) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[DRY RUN] ${deckCode} → archetype="${archetypeName ?? '—'}"  ace="${aceName ?? '—'}"`);
      updated++;
      updatedDeckIds.push(deckId);
      continue;
    }

    await prisma.$executeRaw`
      UPDATE decks
      SET "cachedArchetypeName" = ${archetypeName},
          "cachedAceName"       = ${aceName},
          "cachedNameAt"        = NOW()
      WHERE id = ${deckId}
    `;
    console.log(`  ✓ ${deckCode} → "${archetypeName ?? '—'}" / ACE: "${aceName ?? '—'}"`);
    updated++;
    updatedDeckIds.push(deckId);
  }

  console.log('');
  console.log('================================================================');
  console.log(`Updated: ${updated}  |  Skipped (no names resolved): ${skipped}  |  Total: ${total}`);

  // ── Optional: refresh price cache for updated decks ────────────────────────
  if (refreshPrices && updatedDeckIds.length > 0 && !dryRun) {
    console.log('');
    console.log('Refreshing price cache for updated decks...');
    await refreshDeckPrices(updatedDeckIds);
  }

  console.log('================================================================');
  await prisma.$disconnect();
}

// ── Inline price cache refresh (mirrors DeckPriceCacheService) ────────────────
async function refreshDeckPrices(deckIds: string[]) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const BATCH_SIZE = 20;
  let priceUpdated = 0;
  let priceSkipped = 0;

  for (let i = 0; i < deckIds.length; i += BATCH_SIZE) {
    const batch = deckIds.slice(i, i + BATCH_SIZE);

    const rows = await prisma.$queryRaw<Array<{
      deckId: string;
      quantity: number;
      cheapestPrice: number | null;
      priciest: number | null;
    }>>`
      WITH latest_prices AS (
        SELECT DISTINCT ON ("cardId")
          "cardId", price
        FROM card_prices
        WHERE price > 0 AND "fetchedAt" >= ${ninetyDaysAgo}
        ORDER BY "cardId", "fetchedAt" DESC
      ),
      variant_prices AS (
        SELECT
          jp_c.id       AS "jpCardId",
          MIN(lp.price) AS "cheapestPrice",
          MAX(lp.price) AS "priciest"
        FROM cards jp_c
        JOIN cards zh_c
          ON zh_c."primaryCardId" = jp_c."primaryCardId"
          AND zh_c.language = 'ZH_TW'
        JOIN latest_prices lp ON lp."cardId" = zh_c.id
        GROUP BY jp_c.id
      )
      SELECT
        dc."deckId"        AS "deckId",
        dc.quantity        AS "quantity",
        vp."cheapestPrice" AS "cheapestPrice",
        vp."priciest"      AS "priciest"
      FROM deck_cards dc
      LEFT JOIN variant_prices vp ON vp."jpCardId" = dc."cardId"
      WHERE dc."deckId" = ANY(${batch})
    `;

    const deckPrices = new Map<string, { min: number; max: number; hasPrices: boolean }>();
    for (const row of rows) {
      if (!deckPrices.has(row.deckId)) {
        deckPrices.set(row.deckId, { min: 0, max: 0, hasPrices: false });
      }
      const entry = deckPrices.get(row.deckId)!;
      const qty   = Number(row.quantity) || 1;
      const cheap = row.cheapestPrice !== null ? Number(row.cheapestPrice) : null;
      const pricey = row.priciest !== null ? Number(row.priciest) : null;
      if (cheap !== null) {
        entry.min += cheap * qty;
        entry.max += (pricey ?? cheap) * qty;
        entry.hasPrices = true;
      }
    }

    for (const [deckId, prices] of deckPrices) {
      if (!prices.hasPrices) { priceSkipped++; continue; }
      await prisma.$executeRaw`
        UPDATE decks
        SET "cachedBudgetMin" = ${prices.min},
            "cachedBudgetMax" = ${prices.max},
            "priceUpdatedAt"  = NOW()
        WHERE id = ${deckId}
      `;
      priceUpdated++;
    }
  }

  console.log(`  Price cache: updated=${priceUpdated}, skipped (no prices)=${priceSkipped}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
