/**
 * Seed tournament data from saved event_data directories into the PTCG_2026 database.
 * Usage: npx tsx scrapers/seed-tournaments.ts [--limit=N] [--all] [--event-id=952769] [--refresh-existing] [--source-root=PATH] [--dry-run] [--verbose]
 */
import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const DEFAULT_LIMIT = 50;
const DEFAULT_EVENT_ROOT_CANDIDATES = [
  "C:/AI_Server/Coding/PTCG_CardDB/event_data",
  "C:/AI_Server/Coding/PTCG_CardDB/1_Webscraper/event_data",
  path.resolve(process.cwd(), "../PTCG_CardDB/event_data"),
  path.resolve(process.cwd(), "../PTCG_CardDB/1_Webscraper/event_data"),
];

interface EventResult {
  rank: string;
  points?: string;
  player_name: string;
  player_id?: string;
  player_area?: string;
  deck_id?: string;
  deck_url?: string;
}

interface EventInfo {
  event_url: string;
  event_id: string;
  event_title: string;
  event_date: string;
  event_host?: string;
  event_address?: string;
  event_location?: string;
  event_capacity?: string;
  results: EventResult[];
}

interface DeckCard {
  card_id: string;
  card_name: string;
  card_code: string;
  quantity: number;
  image_url: string;
}

interface DeckJson {
  deck_id: string;
  deck_code?: string;
  cards: DeckCard[];
}

interface CliOptions {
  all: boolean;
  dryRun: boolean;
  limit: number;
  refreshExisting: boolean;
  sourceRoot?: string;
  targetEventId?: string;
  verbose: boolean;
}

interface EventSeedReport {
  decksLinked: number;
  missingDeckFiles: string[];
  missingCards: Array<{ deckCode: string; cardId: string; cardName: string }>;
  resultsCreated: number;
}

const cardIdCache = new Map<string, string | null>();

function parseArgs(args: string[]): CliOptions {
  const all = args.includes("--all");
  const dryRun = args.includes("--dry-run");
  const refreshExisting = args.includes("--refresh-existing");
  const verbose = args.includes("--verbose");
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  const eventIdArg = args.find((arg) => arg.startsWith("--event-id="));
  const sourceRootArg = args.find((arg) => arg.startsWith("--source-root="));
  const parsedLimit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : DEFAULT_LIMIT;

  return {
    all,
    dryRun,
    limit: all ? Number.POSITIVE_INFINITY : Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT,
    refreshExisting,
    sourceRoot: sourceRootArg?.split("=")[1],
    targetEventId: eventIdArg?.split("=")[1],
    verbose,
  };
}

function resolveEventDataRoot(sourceRoot?: string): string {
  const candidates = sourceRoot ? [sourceRoot, ...DEFAULT_EVENT_ROOT_CANDIDATES] : DEFAULT_EVENT_ROOT_CANDIDATES;
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));

  if (!resolved) {
    throw new Error(
      `Event data root not found. Checked: ${candidates.join(", ")}`,
    );
  }

  return resolved;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

async function findDeckByCode(deckCode: string): Promise<{ id: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM decks WHERE "deckCode" = ${deckCode} LIMIT 1
  `;

  return rows.length > 0 ? rows[0] : null;
}

function inferType(title: string): string {
  if (title.includes("シティリーグ")) return "STORE_TOURNAMENT";
  if (title.includes("チャンピオンズ") || title.includes("Championship")) return "CHAMPIONSHIP";
  if (title.includes("リージョナル") || title.includes("Regional")) return "REGIONAL";
  return "STORE_TOURNAMENT";
}

function findDeckPath(dir: string, deckId: string): string | null {
  const exactPath = path.join(dir, `deck_${deckId}.json`);
  if (fs.existsSync(exactPath)) return exactPath;

  const files: string[] = fs.readdirSync(dir);
  const fallback = files.find((fileName: string) => fileName.startsWith("deck_") && fileName.endsWith(`_${deckId}.json`));
  return fallback ? path.join(dir, fallback) : null;
}

async function resolveImportedCardId(card: DeckCard): Promise<string | null> {
  const cacheKey = `${card.card_id}|${card.card_name}|${card.image_url}`;
  if (cardIdCache.has(cacheKey)) {
    return cardIdCache.get(cacheKey) ?? null;
  }

  // Priority 1: exact webCardId match (most precise — correct print)
  const byWebId = await prisma.card.findFirst({
    where: { webCardId: `jp${card.card_id}` },
    select: { id: true },
  });
  if (byWebId) {
    cardIdCache.set(cacheKey, byWebId.id);
    return byWebId.id;
  }

  // Priority 2: exact imageUrl match
  if (card.image_url) {
    const byImage = await prisma.card.findFirst({
      where: { imageUrl: card.image_url },
      select: { id: true },
    });
    if (byImage) {
      cardIdCache.set(cacheKey, byImage.id);
      return byImage.id;
    }
  }

  // Priority 3: name + language fallback (may match wrong print — use only as last resort)
  const byName = await prisma.card.findFirst({
    where: {
      name: card.card_name,
      language: "JA_JP" as any,
    },
    orderBy: { webCardId: "asc" }, // deterministic ordering; lowest webCardId = oldest/base print
    select: { id: true },
  });

  const resolvedId = byName?.id ?? null;
  cardIdCache.set(cacheKey, resolvedId);
  return resolvedId;
}

async function syncDeckCards(deckId: string, deckJson: DeckJson, verbose: boolean): Promise<Array<{ deckCode: string; cardId: string; cardName: string }>> {
  const missingCards: Array<{ deckCode: string; cardId: string; cardName: string }> = [];
  const aggregatedRows = new Map<string, number>();

  await prisma.deckCard.deleteMany({ where: { deckId } });

  for (const card of deckJson.cards) {
    const cardRecordId = await resolveImportedCardId(card);
    if (!cardRecordId) {
      missingCards.push({
        deckCode: deckJson.deck_code ?? deckJson.deck_id,
        cardId: card.card_id,
        cardName: card.card_name,
      });
      continue;
    }

    const currentQuantity = aggregatedRows.get(cardRecordId) ?? 0;
    aggregatedRows.set(cardRecordId, currentQuantity + card.quantity);
  }

  if (aggregatedRows.size > 0) {
    await prisma.deckCard.createMany({
      data: Array.from(aggregatedRows.entries()).map(([cardId, quantity]) => ({
        deckId,
        cardId,
        quantity,
      })),
    });
  }

  if (verbose && missingCards.length > 0) {
    console.warn(
      `Missing ${missingCards.length} card mappings for deck ${deckJson.deck_code ?? deckJson.deck_id}`,
    );
  }

  return missingCards;
}

async function upsertDeckForResult(result: EventResult, eventDir: string, verbose: boolean): Promise<{ deckId: string | null; missingCards: Array<{ deckCode: string; cardId: string; cardName: string }>; missingDeckFile?: string }> {
  if (!result.deck_id) {
    return { deckId: null, missingCards: [] };
  }

  const deckPath = findDeckPath(eventDir, result.deck_id);
  if (!deckPath) {
    return {
      deckId: null,
      missingCards: [],
      missingDeckFile: result.deck_id,
    };
  }

  const deckJson = readJsonFile<DeckJson>(deckPath);
  const deckData = deckJson.cards.map((card) => ({
    cardId: card.card_id,
    cardName: card.card_name,
    cardCode: card.card_code,
    quantity: card.quantity,
    imageUrl: card.image_url,
  }));

  const existingDeck = await findDeckByCode(result.deck_id);
  const deck = existingDeck ?? await prisma.deck.create({
    data: {
      name: `${result.player_name} - ${result.rank}`,
      format: "Standard",
      isPublic: true,
    },
    select: { id: true },
  });

  await prisma.$executeRaw`
    UPDATE decks
    SET name = ${`${result.player_name} - ${result.rank}`},
        format = ${"Standard"},
        "isPublic" = true,
        "deckCode" = ${result.deck_id},
        "deckData" = ${JSON.stringify(deckData)}::jsonb,
        "updatedAt" = NOW()
    WHERE id = ${deck.id}
  `;

  const missingCards = await syncDeckCards(deck.id, deckJson, verbose);

  return {
    deckId: deck.id,
    missingCards,
  };
}

async function seedEvent(eventDir: string, options: CliOptions): Promise<{ imported: boolean; report?: EventSeedReport }> {
  const infoPath = path.join(eventDir, "event_info.json");
  if (!fs.existsSync(infoPath)) {
    return { imported: false };
  }

  const event = readJsonFile<EventInfo>(infoPath);
  if (!event.event_id) {
    return { imported: false };
  }
  // Fall back to host name when title is empty (common in JP data)
  if (!event.event_title) {
    event.event_title = event.event_host ?? `Event ${event.event_id}`;
  }

  const existingTournament = await prisma.tournament.findUnique({ where: { eventId: event.event_id } });
  if (existingTournament && !options.refreshExisting) {
    process.stdout.write("s");
    return { imported: false };
  }

  if (options.dryRun) {
    process.stdout.write("d");
    return {
      imported: true,
      report: {
        decksLinked: event.results.filter((result) => !!result.deck_id).length,
        missingDeckFiles: [],
        missingCards: [],
        resultsCreated: event.results.length,
      },
    };
  }

  const locationParts = [event.event_host, event.event_location, event.event_address]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);

  const tournament = existingTournament
    ? await prisma.tournament.update({
        where: { id: existingTournament.id },
        data: {
          name: event.event_title,
          type: inferType(event.event_title) as any,
          date: new Date(event.event_date),
          location: locationParts.join(", ") || undefined,
          region: "JP" as any,
          playerCount: event.results.length,
          sourceUrl: event.event_url,
        },
      })
    : await prisma.tournament.create({
        data: {
          eventId: event.event_id,
          name: event.event_title,
          type: inferType(event.event_title) as any,
          date: new Date(event.event_date),
          location: locationParts.join(", ") || undefined,
          region: "JP" as any,
          playerCount: event.results.length,
          sourceUrl: event.event_url,
        },
      });

  if (existingTournament) {
    await prisma.tournamentResult.deleteMany({ where: { tournamentId: tournament.id } });
  }

  const report: EventSeedReport = {
    decksLinked: 0,
    missingDeckFiles: [],
    missingCards: [],
    resultsCreated: 0,
  };

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const deckImport = await upsertDeckForResult(result, eventDir, options.verbose);
    if (deckImport.deckId) {
      report.decksLinked += 1;
    }
    if (deckImport.missingDeckFile) {
      report.missingDeckFiles.push(deckImport.missingDeckFile);
    }
    report.missingCards.push(...deckImport.missingCards);

    await prisma.tournamentResult.create({
      data: {
        tournamentId: tournament.id,
        placement: index + 1,
        playerName: result.player_name,
        deckName: result.rank,
        deckId: deckImport.deckId ?? undefined,
      },
    });

    report.resultsCreated += 1;
  }

  process.stdout.write(".");
  return { imported: true, report };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const eventDataRoot = resolveEventDataRoot(options.sourceRoot);

  console.log("=".repeat(60));
  console.log("PTCG_2026 - Tournament Bulk Seed");
  console.log(`Source: ${eventDataRoot}`);
  console.log(`Limit : ${options.limit === Number.POSITIVE_INFINITY ? "ALL" : options.limit} new events`);
  if (options.targetEventId) {
    console.log(`Target eventId: ${options.targetEventId}`);
  }
  if (options.refreshExisting) {
    console.log("Mode: refresh existing tournaments");
  }
  if (options.dryRun) {
    console.log("Mode: dry-run");
  }
  console.log("=".repeat(60));

  const allDirs = fs.readdirSync(eventDataRoot, { withFileTypes: true })
    .filter((entry: fs.Dirent) => entry.isDirectory() && entry.name.startsWith("event_"))
    .map((entry: fs.Dirent) => path.join(eventDataRoot, entry.name))
    .sort();

  const dirs = options.targetEventId
    ? allDirs.filter((dir: string) => {
        const infoPath = path.join(dir, "event_info.json");
        if (!fs.existsSync(infoPath)) {
          return false;
        }

        try {
          const info = readJsonFile<EventInfo>(infoPath);
          return info.event_id === options.targetEventId;
        } catch {
          return false;
        }
      })
    : allDirs;

  console.log(`Found ${dirs.length} event directories\n`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const missingDeckFiles = new Set<string>();
  const missingCards: Array<{ deckCode: string; cardId: string; cardName: string }> = [];
  let resultsCreated = 0;
  let decksLinked = 0;

  for (const dir of dirs) {
    if (imported >= options.limit) {
      break;
    }

    try {
      const result = await seedEvent(dir, options);
      if (!result.imported) {
        skipped += 1;
        continue;
      }

      imported += 1;
      if (result.report) {
        resultsCreated += result.report.resultsCreated;
        decksLinked += result.report.decksLinked;
        result.report.missingDeckFiles.forEach((deckCode) => missingDeckFiles.add(deckCode));
        missingCards.push(...result.report.missingCards);
      }
    } catch (error) {
      process.stdout.write("E");
      failed += 1;
      console.error(`\nFailed to import ${dir}:`, error);
    }
  }

  const [tournamentCount, resultCount, deckCount] = options.dryRun
    ? [0, 0, 0]
    : await Promise.all([
        prisma.tournament.count(),
        prisma.tournamentResult.count(),
        prisma.deck.count(),
      ]);

  console.log("\n\n" + "=".repeat(60));
  console.log(options.dryRun ? "DRY RUN COMPLETE" : "SEED COMPLETE");
  console.log(`Imported: ${imported} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Results created: ${resultsCreated} | Decks linked: ${decksLinked}`);
  if (!options.dryRun) {
    console.log(`Tournaments: ${tournamentCount} | Results: ${resultCount} | Decks: ${deckCount}`);
  }
  if (missingDeckFiles.size > 0) {
    console.log(`Missing deck files: ${Array.from(missingDeckFiles).join(", ")}`);
  }
  if (missingCards.length > 0) {
    console.log(`Missing card matches: ${missingCards.length}`);
    const preview = missingCards.slice(0, 10);
    for (const missingCard of preview) {
      console.log(`  - ${missingCard.deckCode}: ${missingCard.cardName} (${missingCard.cardId})`);
    }
    if (missingCards.length > preview.length) {
      console.log(`  ... ${missingCards.length - preview.length} more`);
    }
  }
  console.log("=".repeat(60));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());