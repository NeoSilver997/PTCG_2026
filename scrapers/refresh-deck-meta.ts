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
const limit         = limitArg ? parseInt(limitArg.split('=')[1], 10) : 999999;

// ── Draw-engine Pokémon (mirrors DRAW_ENGINE_JP_EFFECT on the client) ─────────
const DRAW_ENGINE_JP = [
  'リーリエのピッピex',
  'ノコッチex',
  'ゲノセクトex',
  'フーディン',
];

// ── Section-key types & helpers (mirrors deck-view.tsx getSectionKey) ─────────
type SectionKey =
  | 'pokemon-main'
  | 'pokemon-secondary'
  | 'pokemon-support'
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
}

function isMainPokemon(card: CardRow): boolean {
  return card.quantity >= 3 || (card.hp ?? 0) >= 200;
}

function getSectionKey(card: CardRow): SectionKey {
  const { supertype, subtypes = [], rarity } = card;
  if (supertype === 'POKEMON') {
    if (isMainPokemon(card)) return 'pokemon-main';
    if (card.hasAbilities) return 'pokemon-support';
    return 'pokemon-secondary';
  }
  if (supertype === 'ENERGY') {
    return subtypes.includes('BASIC_ENERGY') ? 'basic-energy' : 'special-energy';
  }
  // TRAINER
  if (rarity === 'ACE_SPEC_RARE' || rarity === 'ACE_SPEC') return 'ace';
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
  hp: number | null;  evolvesTo: string | null;  hasAbilities: boolean;
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
  const rowLimit = isFinite(limit) ? limit : 999999;

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
      (c.abilities IS NOT NULL AND c.abilities != 'null'::jsonb) AS "hasAbilities"
    FROM decks d
    JOIN deck_cards dc ON dc."deckId" = d.id
    JOIN cards c       ON c.id = dc."cardId"
    LEFT JOIN cards zh
      ON zh."primaryCardId" = c."primaryCardId"
      AND zh.language = 'ZH_TW'
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
    // Classify cards into sections
const sections = new Map<SectionKey, Array<{ name: string | null; zhName: string | null; quantity: number; hp: number | null; evolvesTo: string | null }>>([
      ['pokemon-main', []],
      ['pokemon-support', []],
      ['ace', []],
    ]);

    for (const card of cards) {
      const key = getSectionKey(card);
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key)!.push({ 
        name: card.cardName, 
        zhName: card.zhName, 
        quantity: card.quantity, 
        hp: card.hp,
        evolvesTo: card.evolvesTo
      });
    }

    // Sort pokemon-main section to match frontend logic: quantity desc, then HP desc
    const mainSection = sections.get('pokemon-main') ?? [];
    mainSection.sort((a, b) => {
      // Primary sort: quantity descending
      const qDiff = b.quantity - a.quantity;
      if (qDiff !== 0) return qDiff;
      // Secondary sort: HP descending (EX Pokemon first)
      return (b.hp ?? 0) - (a.hp ?? 0);
    });

    // Filter out Pokémon that have evolutions present in the deck (prefer highest evolution stage)
    const mainPokemonNames = new Set(mainSection.map(e => e.name));
    const mainSectionFiltered = mainSection.filter(entry => {
      // Check if this Pokémon has any evolution in the deck
      let currentEvolution = entry.evolvesTo;
      while (currentEvolution) {
        if (mainPokemonNames.has(currentEvolution)) {
          return false; // Exclude this Pokémon since a higher evolution is present
        }
        // Find the card for this evolution to continue the chain
        const evolutionCard = mainSection.find(e => e.name === currentEvolution);
        currentEvolution = evolutionCard?.evolvesTo;
      }
      return true; // Include this Pokémon (no higher evolution in deck)
    });

    // Top-2 unique main Pokémon ZH names (now properly sorted and filtered)
    const mainNames = mainSectionFiltered
      .map((e) => e.zhName ?? e.name)
      .filter((n): n is string => !!n)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 2);

    // Draw-engine support Pokémon (e.g. Lilly's Cleffa ex)
    const drawEngineNames = (sections.get('pokemon-support') ?? [])
      .filter((e) => DRAW_ENGINE_JP.some((f) => (e.name ?? '').includes(f)))
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
