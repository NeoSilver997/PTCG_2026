/**
 * Import BeehiveTCG market price data into PTCG_2026 PostgreSQL database.
 *
 * Usage: npx tsx scrapers/import-market-prices.ts [--data-dir=PATH] [--dry-run] [--verbose]
 *
 * Reads all market-prices-*.json files from PTCG_CardDB/data/, looks up HK cards
 * by expansion code + card number, and upserts CardPrice records.
 * Files are processed oldest→newest so the latest price wins.
 */
import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

const DEFAULT_DATA_DIR_CANDIDATES = [
  "C:/AI_Server/Coding/PTCG_CardDB/data",
  path.resolve(process.cwd(), "../PTCG_CardDB/data"),
];

interface PriceEntry {
  price: number;
  currency?: string;
  source?: string;
  condition?: string;
  date?: string;
  metadata?: {
    cardName?: string;
    rarity?: string;
    stockQuantity?: number;
    isSoldOut?: boolean;
    productUrl?: string;
  };
}

interface MarketPriceFile {
  [collectorNumber: string]: PriceEntry[];
}

function resolveDataDir(override?: string): string {
  const candidates = override
    ? [override, ...DEFAULT_DATA_DIR_CANDIDATES]
    : DEFAULT_DATA_DIR_CANDIDATES;
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) {
    throw new Error(
      `Market data directory not found. Checked: ${candidates.join(", ")}`,
    );
  }
  return found;
}

/**
 * Parse filename to extract date and canonical expansion code.
 * e.g., "market-prices-20251213-SV9f.json"  → { date: "20251213", code: "SV9" }
 *       "market-prices-20251213-s10bf-pokemon-go.json" → { date: "20251213", code: "S10B" }
 *       "market-prices-20251213-SVC.json"   → { date: "20251213", code: "SVC" }
 */
function parseFilename(filename: string): { date: string; code: string } | null {
  const m = filename.match(/^market-prices-(\d{8})-(.+)\.json$/i);
  if (!m) return null;
  const date = m[1];
  const raw = m[2];
  // Take only leading ASCII alphanumeric segment (stop at hyphen, space, or non-ASCII)
  const match = raw.match(/^([A-Za-z0-9]+)/);
  if (!match) return null;
  let code = match[1];
  // Strip trailing 'f' — the HK market files use "{EXPANSION_CODE}f" naming
  if (code.length > 1 && code.toLowerCase().endsWith("f")) {
    code = code.slice(0, -1);
  }
  return { date, code: code.toUpperCase() };
}

// Cache card DB lookups to avoid redundant queries across multiple date files
const cardLookupCache = new Map<string, string | null>();

async function findHkCardId(
  expCode: string,
  cardNum: string,
): Promise<string | null> {
  const cacheKey = `${expCode}:${cardNum}`;
  if (cardLookupCache.has(cacheKey)) {
    return cardLookupCache.get(cacheKey) ?? null;
  }

  // Try both unpadded ("124") and zero-padded ("001") card numbers
  const paddedNum = cardNum.padStart(3, "0");

  const results = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c.id
    FROM cards c
    JOIN primary_cards pc ON c."primaryCardId" = pc.id
    JOIN primary_expansions pe ON pc."primaryExpansionId" = pe.id
    WHERE UPPER(pe.code) = ${expCode}
      AND (pc."cardNumber" = ${cardNum} OR pc."cardNumber" = ${paddedNum})
      AND c."webCardId" LIKE 'hk%'
    LIMIT 1
  `;

  const id = results.length > 0 ? results[0].id : null;
  cardLookupCache.set(cacheKey, id);
  return id;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");
  const dataDirArg = args.find((a) => a.startsWith("--data-dir="))?.split("=")[1];
  const dataDir = resolveDataDir(dataDirArg);

  console.log("=".repeat(60));
  console.log("PTCG_2026 - Market Price Import (BeehiveTCG → HK cards)");
  console.log(`Source: ${dataDir}`);
  if (dryRun) console.log("Mode: dry-run (no writes)");
  console.log("=".repeat(60));

  // Collect all valid market-price files, sorted oldest→newest (newest wins)
  const allFiles = fs
    .readdirSync(dataDir)
    .filter((f) => f.startsWith("market-prices-") && f.endsWith(".json"))
    .map((f) => ({ name: f, parsed: parseFilename(f) }))
    .filter((f): f is { name: string; parsed: { date: string; code: string } } =>
      f.parsed !== null,
    )
    .sort((a, b) => a.parsed.date.localeCompare(b.parsed.date)); // oldest first

  console.log(`Found ${allFiles.length} market price files\n`);

  // Accumulate latest price per card (cardId → price data)
  // Processing oldest→newest means the last write per cardId is the freshest price.
  const priceMap = new Map<
    string,
    {
      price: number;
      currency: string;
      condition: string | null;
      inStock: boolean;
      fetchedAt: Date;
    }
  >();

  let filesProcessed = 0;
  let totalResolved = 0;
  let totalNotFound = 0;
  const notFoundExpansions = new Set<string>();

  for (const file of allFiles) {
    const { code: expCode } = file.parsed;
    const filePath = path.join(dataDir, file.name);

    let marketData: MarketPriceFile;
    try {
      marketData = JSON.parse(fs.readFileSync(filePath, "utf-8")) as MarketPriceFile;
    } catch {
      console.warn(`  ⚠ Failed to parse ${file.name}, skipping`);
      continue;
    }

    let fileResolved = 0;
    let fileNotFound = 0;

    for (const [collectorNumber, entries] of Object.entries(marketData)) {
      if (!Array.isArray(entries) || entries.length === 0) continue;
      const entry = entries[0]; // first entry is most recent
      if (entry.price == null) continue;

      // Extract numeric card number from "124/100" → "124"
      const rawNum = collectorNumber.split("/")[0].trim();
      if (!rawNum || !/^\d+$/.test(rawNum)) continue;

      const cardId = await findHkCardId(expCode, rawNum);
      if (!cardId) {
        fileNotFound++;
        notFoundExpansions.add(expCode);
        continue;
      }

      priceMap.set(cardId, {
        price: entry.price,
        currency: entry.currency ?? "HKD",
        condition: entry.condition ?? null,
        inStock: !(entry.metadata?.isSoldOut ?? false),
        fetchedAt: entry.date ? new Date(entry.date) : new Date(),
      });

      fileResolved++;
    }

    totalResolved += fileResolved;
    totalNotFound += fileNotFound;
    filesProcessed++;

    if (verbose) {
      console.log(
        `  ✓ ${file.name} [${expCode}]: ${fileResolved} resolved, ${fileNotFound} not found`,
      );
    } else {
      process.stdout.write(`${expCode} `);
    }
  }

  console.log(`\n\nFiles processed  : ${filesProcessed}`);
  console.log(`Cards resolved   : ${totalResolved} entries across all files`);
  console.log(`Cards not found  : ${totalNotFound}`);
  console.log(`Unique card prices: ${priceMap.size}`);
  if (notFoundExpansions.size > 0) {
    console.log(
      `Expansions with unmatched cards (may not be in DB): ${Array.from(notFoundExpansions).join(", ")}`,
    );
  }

  if (dryRun || priceMap.size === 0) {
    console.log(
      dryRun
        ? "\nDry run complete — no data written."
        : "\nNo matchable prices found. Check that HK card data is imported first.",
    );
    return;
  }

  // Replace all existing OTHER-source prices and insert fresh batch
  console.log("\nClearing existing market prices (source: OTHER)...");
  const { count: deleted } = await prisma.cardPrice.deleteMany({
    where: { source: "OTHER" },
  });
  console.log(`Deleted ${deleted} existing price records.`);

  console.log("Inserting new prices...");
  const priceData = Array.from(priceMap.entries()).map(([cardId, p]) => ({
    cardId,
    source: "OTHER" as const,
    price: p.price,
    currency: p.currency,
    condition: p.condition,
    inStock: p.inStock,
    fetchedAt: p.fetchedAt,
  }));

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < priceData.length; i += CHUNK) {
    const chunk = priceData.slice(i, i + CHUNK);
    await prisma.cardPrice.createMany({ data: chunk });
    inserted += chunk.length;
    process.stdout.write(".");
  }

  const finalCount = await prisma.cardPrice.count();
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("IMPORT COMPLETE");
  console.log(`Inserted: ${inserted} CardPrice records`);
  console.log(`Total CardPrice count in DB: ${finalCount}`);
  console.log("=".repeat(60));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
