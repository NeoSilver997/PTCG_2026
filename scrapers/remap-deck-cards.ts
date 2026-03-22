/**
 * Remap DeckCard entries to the correct card IDs using the stored deckData.
 *
 * Problem: When decks were seeded, if `jp{card_id}` wasn't yet in the DB the
 * script fell back to name-matching, which could link to the wrong Pokémon card
 * (e.g. ヨマワル from an older set instead of the correct set).
 *
 * Fix: Every deck has a `deckData` JSONB column with the original scraper
 * `card_id` numbers. This script re-resolves each `jp{card_id}` lookup, and
 * wherever a DeckCard currently points to a different card it replaces it with
 * the correct one.
 *
 * Non-Pokémon cards share a unique name so the name fallback is safe for them;
 * we still remap them if the primary `jp{card_id}` lookup now resolves.
 *
 * Usage:
 *   npx tsx scrapers/remap-deck-cards.ts [--dry-run] [--verbose] [--deck-id=UUID]
 */

import { PrismaClient } from "../packages/database/node_modules/.prisma/client";

const prisma = new PrismaClient();

interface DeckDataEntry {
  cardId: string;      // raw JP scraper card_id (numeric string, e.g. "12345")
  cardName: string;
  cardCode?: string;
  quantity: number;
  imageUrl?: string;
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    verbose: argv.includes("--verbose"),
    targetDeckId: argv.find((a) => a.startsWith("--deck-id="))?.split("=")[1],
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log("============================================================");
  console.log("PTCG_2026 - Remap Deck Card IDs");
  console.log(opts.dryRun ? "Mode: DRY RUN (no writes)" : "Mode: LIVE");
  console.log("============================================================");

  // ------------------------------------------------------------------
  // 1. Load all decks that have deckData stored
  // ------------------------------------------------------------------
  const deckRows = await prisma.$queryRaw<
    Array<{ id: string; name: string; deckCode: string | null; deckData: DeckDataEntry[] | null }>
  >`
    SELECT id, name, "deckCode", "deckData"
    FROM decks
    WHERE "deckData" IS NOT NULL
      AND "deckData" != 'null'::jsonb
      AND jsonb_array_length("deckData") > 0
  `;

  const decks = opts.targetDeckId
    ? deckRows.filter((d) => d.id === opts.targetDeckId)
    : deckRows;

  console.log(`Found ${decks.length} decks with deckData to check.\n`);

  // ------------------------------------------------------------------
  // 2. Pre-build a JP card_id → DB card UUID lookup from ALL jp* cards
  //    to avoid per-card round trips.
  // ------------------------------------------------------------------
  console.log("Building jp* card lookup table...");
  const jpCards = await prisma.card.findMany({
    where: { webCardId: { startsWith: "jp" } },
    select: { id: true, webCardId: true },
  });
  const jpMap = new Map<string, string>(); // "jp12345" -> card UUID
  for (const c of jpCards) {
    jpMap.set(c.webCardId, c.id);
  }
  console.log(`Loaded ${jpMap.size} jp* cards.\n`);

  // ------------------------------------------------------------------
  // 3. Process each deck – build full target map in memory, then batch
  // ------------------------------------------------------------------
  const BATCH_SIZE = 500;

  // toDelete[i] = { deckId, cardId } — wrong links to remove
  // toUpsert[i] = { deckId, cardId, quantity } — correct links to write
  const toDeleteAll: Array<{ deckId: string; cardId: string }> = [];
  const toUpsertAll: Array<{ deckId: string; cardId: string; quantity: number }> = [];

  let totalCardsAlreadyOk = 0;
  let totalCardsSkipped = 0;

  // Fetch current DeckCards for all affected decks in batches of 500 deck IDs
  const deckIdChunks: string[][] = [];
  for (let i = 0; i < decks.length; i += BATCH_SIZE) {
    deckIdChunks.push(decks.slice(i, i + BATCH_SIZE).map((d) => d.id));
  }

  const currentCardsMap = new Map<string, Map<string, number>>(); // deckId -> cardId -> qty
  for (const chunk of deckIdChunks) {
    const rows = await prisma.deckCard.findMany({
      where: { deckId: { in: chunk } },
      select: { deckId: true, cardId: true, quantity: true },
    });
    for (const row of rows) {
      if (!currentCardsMap.has(row.deckId)) currentCardsMap.set(row.deckId, new Map());
      currentCardsMap.get(row.deckId)!.set(row.cardId, row.quantity);
    }
  }

  for (const deck of decks) {
    if (!deck.deckData || deck.deckData.length === 0) continue;

    const currentMap = currentCardsMap.get(deck.id) ?? new Map<string, number>();

    // Build desired state from deckData
    const targetMap = new Map<string, number>();
    for (const entry of deck.deckData) {
      const cardUUID = jpMap.get(`jp${entry.cardId}`);
      if (!cardUUID) {
        totalCardsSkipped++;
        continue;
      }
      targetMap.set(cardUUID, (targetMap.get(cardUUID) ?? 0) + entry.quantity);
    }

    // Diff
    for (const [cardId, qty] of targetMap) {
      if (currentMap.get(cardId) === qty) {
        totalCardsAlreadyOk++;
      } else {
        toUpsertAll.push({ deckId: deck.id, cardId, quantity: qty });
      }
    }
    for (const [cardId] of currentMap) {
      if (!targetMap.has(cardId)) {
        toDeleteAll.push({ deckId: deck.id, cardId });
      }
    }
  }

  const decksAffected = new Set([
    ...toDeleteAll.map((r) => r.deckId),
    ...toUpsertAll.map((r) => r.deckId),
  ]).size;

  console.log(`\nDiff complete:`);
  console.log(`  Decks needing update : ${decksAffected}`);
  console.log(`  Card links to delete : ${toDeleteAll.length}`);
  console.log(`  Card links to upsert : ${toUpsertAll.length}`);
  console.log(`  Already correct      : ${totalCardsAlreadyOk}`);
  console.log(`  Skipped (not in DB)  : ${totalCardsSkipped}\n`);

  if (opts.dryRun) {
    console.log("============================================================");
    console.log("DRY RUN COMPLETE — no changes written");
    console.log("============================================================");
    return;
  }

  // ------------------------------------------------------------------
  // 4. Write changes in batches
  // ------------------------------------------------------------------
  const WRITE_BATCH = 1000;

  // Deletes: group by deckId for efficient deleteMany
  const deletesByDeck = new Map<string, string[]>();
  for (const { deckId, cardId } of toDeleteAll) {
    if (!deletesByDeck.has(deckId)) deletesByDeck.set(deckId, []);
    deletesByDeck.get(deckId)!.push(cardId);
  }

  let deletedCount = 0;
  const deckDeleteEntries = [...deletesByDeck.entries()];
  for (let i = 0; i < deckDeleteEntries.length; i += WRITE_BATCH) {
    const slice = deckDeleteEntries.slice(i, i + WRITE_BATCH);
    await prisma.$transaction(
      slice.map(([deckId, cardIds]) =>
        prisma.deckCard.deleteMany({ where: { deckId, cardId: { in: cardIds } } }),
      ),
    );
    deletedCount += slice.reduce((s, [, ids]) => s + ids.length, 0);
    process.stdout.write(`\rDeleting... ${deletedCount}/${toDeleteAll.length}`);
  }

  // Upserts in createMany batches (delete-then-create avoids unique conflicts)
  let upsertedCount = 0;
  for (let i = 0; i < toUpsertAll.length; i += WRITE_BATCH) {
    const slice = toUpsertAll.slice(i, i + WRITE_BATCH);
    // Delete then create to handle quantity changes cleanly
    await prisma.$transaction([
      prisma.deckCard.deleteMany({
        where: {
          OR: slice.map(({ deckId, cardId }) => ({ deckId, cardId })),
        },
      }),
      prisma.deckCard.createMany({ data: slice, skipDuplicates: true }),
    ]);
    upsertedCount += slice.length;
    process.stdout.write(`\rUpserting... ${upsertedCount}/${toUpsertAll.length}`);
  }

  console.log("\n");
  console.log("============================================================");
  console.log("REMAP COMPLETE");
  console.log(`Decks fixed      : ${decksAffected}`);
  console.log(`Links deleted    : ${toDeleteAll.length}`);
  console.log(`Links upserted   : ${toUpsertAll.length}`);
  console.log(`Already correct  : ${totalCardsAlreadyOk}`);
  console.log(`Skipped (no jp*) : ${totalCardsSkipped}`);
  console.log("============================================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
