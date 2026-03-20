/**
 * Resync Deck Cards Script
 *
 * After importing new cards, re-resolves all existing deck→card linkages
 * using the stored deckData JSON. Generates a missing card report.
 *
 * Usage:
 *   npx tsx scrapers/resync-deck-cards.ts
 *   npx tsx scrapers/resync-deck-cards.ts --dry-run          # preview without DB changes
 *   npx tsx scrapers/resync-deck-cards.ts --report-file=missing_cards.json
 *   npx tsx scrapers/resync-deck-cards.ts --limit=500        # process first N decks
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface StoredDeckCard {
  cardId: string;    // original scraped card_id (numeric string)
  cardName: string;
  cardCode?: string;
  quantity: number;
  imageUrl?: string;
}

interface MissingCardEntry {
  deckCode: string | null;
  deckDbId: string;
  originalCardId: string;
  cardName: string;
  imageUrl?: string;
}

interface ResyncStats {
  totalDecks: number;
  decksWithData: number;
  decksResynced: number;
  decksFailed: number;
  deckCardsBefore: number;
  deckCardsAfter: number;
  missingCards: MissingCardEntry[];
}

// Card lookup cache: key → card DB id or null
const cardIdCache = new Map<string, string | null>();

async function resolveCardId(entry: StoredDeckCard): Promise<string | null> {
  const cacheKey = `${entry.cardId}|${entry.cardName}|${entry.imageUrl ?? ''}`;
  if (cardIdCache.has(cacheKey)) {
    return cardIdCache.get(cacheKey) ?? null;
  }

  const match = await prisma.card.findFirst({
    where: {
      OR: [
        { webCardId: `jp${entry.cardId}` },
        ...(entry.imageUrl ? [{ imageUrl: entry.imageUrl }] : []),
        {
          AND: [
            { name: entry.cardName },
            { language: 'JA_JP' as any },
          ],
        },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  const resolved = match?.id ?? null;
  cardIdCache.set(cacheKey, resolved);
  return resolved;
}

async function resyncDeck(
  deck: { id: string; deckCode: string | null; deckData: any },
  dryRun: boolean,
): Promise<{ resynced: number; missing: MissingCardEntry[] }> {
  // deckData may be null (decks without stored card data)
  if (!deck.deckData) {
    return { resynced: 0, missing: [] };
  }

  let cards: StoredDeckCard[];
  try {
    cards = typeof deck.deckData === 'string'
      ? JSON.parse(deck.deckData)
      : deck.deckData;
  } catch {
    return { resynced: 0, missing: [] };
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    return { resynced: 0, missing: [] };
  }

  const aggregated = new Map<string, number>();
  const missing: MissingCardEntry[] = [];

  for (const entry of cards) {
    const cardDbId = await resolveCardId(entry);
    if (!cardDbId) {
      missing.push({
        deckCode: deck.deckCode,
        deckDbId: deck.id,
        originalCardId: entry.cardId,
        cardName: entry.cardName,
        imageUrl: entry.imageUrl,
      });
      continue;
    }
    aggregated.set(cardDbId, (aggregated.get(cardDbId) ?? 0) + entry.quantity);
  }

  if (!dryRun && aggregated.size > 0) {
    await prisma.$transaction([
      prisma.deckCard.deleteMany({ where: { deckId: deck.id } }),
      prisma.deckCard.createMany({
        data: Array.from(aggregated.entries()).map(([cardId, quantity]) => ({
          deckId: deck.id,
          cardId,
          quantity,
        })),
      }),
    ]);
  }

  return { resynced: aggregated.size, missing };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const reportFileArg = args.find(a => a.startsWith('--report-file='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Number.POSITIVE_INFINITY;
  const reportFile = reportFileArg ? reportFileArg.split('=')[1] : null;

  console.log('='.repeat(60));
  console.log('PTCG_2026 — Deck Card Resync');
  console.log(dryRun ? 'Mode: DRY RUN (no DB changes)' : 'Mode: LIVE');
  if (isFinite(limit)) console.log(`Limit: ${limit} decks`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  // Count total deck_cards before
  const beforeCount = dryRun ? 0 : await prisma.deckCard.count();

  // Fetch all decks that have stored deckData
  const allDecks = await prisma.$queryRaw<Array<{
    id: string;
    deckCode: string | null;
    deckData: any;
  }>>`
    SELECT id, "deckCode", "deckData"
    FROM decks
    WHERE "deckData" IS NOT NULL
    ORDER BY "updatedAt" ASC
    LIMIT ${isFinite(limit) ? limit : 999999}
  `;

  const stats: ResyncStats = {
    totalDecks: await prisma.deck.count(),
    decksWithData: allDecks.length,
    decksResynced: 0,
    decksFailed: 0,
    deckCardsBefore: beforeCount,
    deckCardsAfter: 0,
    missingCards: [],
  };

  console.log(`\nTotal decks in DB: ${stats.totalDecks}`);
  console.log(`Decks with stored card data: ${stats.decksWithData}`);
  console.log(`\nProcessing...\n`);

  let processed = 0;

  for (const deck of allDecks) {
    try {
      const result = await resyncDeck(deck, dryRun);
      stats.missingCards.push(...result.missing);
      if (result.resynced > 0 || result.missing.length > 0) {
        stats.decksResynced++;
      }
    } catch (err: any) {
      stats.decksFailed++;
      console.error(`  ✗ deckId=${deck.id}: ${err.message}`);
    }

    processed++;
    if (processed % 500 === 0) {
      console.log(`  Progress: ${processed}/${allDecks.length} (${cardIdCache.size} cards cached)`);
    }
  }

  stats.deckCardsAfter = dryRun ? 0 : await prisma.deckCard.count();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // --- Summary ---
  console.log('\n' + '='.repeat(60));
  console.log('RESYNC COMPLETE');
  console.log('='.repeat(60));
  console.log(`Decks processed:      ${stats.decksWithData}`);
  console.log(`Decks resynced:       ${stats.decksResynced}`);
  console.log(`Decks failed:         ${stats.decksFailed}`);
  if (!dryRun) {
    console.log(`Deck cards before:    ${stats.deckCardsBefore.toLocaleString()}`);
    console.log(`Deck cards after:     ${stats.deckCardsAfter.toLocaleString()}`);
    const diff = stats.deckCardsAfter - stats.deckCardsBefore;
    console.log(`Net change:           ${diff >= 0 ? '+' : ''}${diff.toLocaleString()}`);
  }
  console.log(`Elapsed:              ${elapsed}s`);

  // --- Missing card summary ---
  const uniqueMissing = new Map<string, { cardName: string; count: number; imageUrl?: string }>();
  for (const m of stats.missingCards) {
    const key = `${m.originalCardId}|${m.cardName}`;
    const existing = uniqueMissing.get(key);
    if (existing) {
      existing.count++;
    } else {
      uniqueMissing.set(key, { cardName: m.cardName, count: 1, imageUrl: m.imageUrl });
    }
  }

  console.log(`\nTotal unresolved card refs:  ${stats.missingCards.length}`);
  console.log(`Unique missing card IDs:      ${uniqueMissing.size}`);

  if (uniqueMissing.size > 0) {
    console.log('\n--- Top 30 Missing Cards (by deck count) ---');
    const sorted = Array.from(uniqueMissing.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30);

    sorted.forEach(([key, info], i) => {
      const [cardId] = key.split('|');
      console.log(`  ${String(i + 1).padStart(2)}. jp${cardId.padEnd(8)} "${info.cardName}"  (${info.count} deck${info.count !== 1 ? 's' : ''})`);
    });

    if (uniqueMissing.size > 30) {
      console.log(`  ... and ${uniqueMissing.size - 30} more`);
    }
  }

  // --- Write report file ---
  if (reportFile && uniqueMissing.size > 0) {
    const report = {
      generatedAt: new Date().toISOString(),
      totalUnresolvedRefs: stats.missingCards.length,
      uniqueMissingCards: uniqueMissing.size,
      byDeck: stats.missingCards,
      uniqueSummary: Array.from(uniqueMissing.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .map(([key, info]) => {
          const [cardId] = key.split('|');
          return {
            originalCardId: `jp${cardId}`,
            cardName: info.cardName,
            deckCount: info.count,
            imageUrl: info.imageUrl,
          };
        }),
    };
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n📄 Full report written to: ${reportFile}`);
  }

  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
