/**
 * Market Price Import Script — Beehive TCG (HK)
 *
 * Supports two JSON formats from PTCG_CardDB:
 *
 * Format A (combined): { "summary": {...}, "cards": [{ matched, csvData.id, price, ... }] }
 *   Match: csvData.id (numeric) → webCardId = "hk" + num
 *
 * Format B (per-expansion): { "093/066": [{ cardId, price, metadata }], ... }
 *   Match: filename expansion code (strip trailing 'f', lowercase) + card number (part before '/')
 *   via RegionalExpansion.code + PrimaryCard.cardNumber
 *
 * Usage:
 *   npx tsx scrapers/import-market-prices.ts
 *   npx tsx scrapers/import-market-prices.ts --dry-run
 *   npx tsx scrapers/import-market-prices.ts --verbose
 *   npx tsx scrapers/import-market-prices.ts --file="C:/path/to/market-prices.json"
 *   npx tsx scrapers/import-market-prices.ts --dir="C:/AI_Server/Coding/PTCG_CardDB/data"
 */
import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ── Default directory candidates (checked before single-file fallback) ──────────
const DEFAULT_DIR_CANDIDATES = [
  "C:/AI_Server/Coding/PTCG_CardDB/data",
  path.resolve(process.cwd(), "../PTCG_CardDB/data"),
  path.resolve(__dirname, "../../PTCG_CardDB/data"),
];

// ── Default single-file candidates (legacy fallback) ─────────────────────────
const DEFAULT_FILE_CANDIDATES = [
  path.resolve(__dirname, "../../PTCG_CardDB_Tc/market-prices.json"),
  path.resolve(process.cwd(), "../PTCG_CardDB_Tc/market-prices.json"),
  "C:/AI_Server/Coding/PTCG_CardDB_Tc/market-prices.json",
];

// ── Expand a directory into sorted market-prices-*.json file list ─────────────
function resolveFilesFromDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const all = fs.readdirSync(dir).filter((f: string) => /^market-prices.*\.json$/i.test(f));
  all.sort();
  return all.map((f: string) => path.join(dir, f));
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface MarketEntry {
  name: string;
  matched: boolean;
  csvData?: { id?: string; name?: string; expansion?: string; rarity?: string };
  listPrice?: number;
  listStock?: number;
  price?: number;
  currency?: string;
  stock?: number;
  priceUpdated?: string;
  lastSeen?: string;
}

interface MarketPriceFile {
  summary?: Record<string, unknown>;
  cards: MarketEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildWebCardId(entry: MarketEntry): string | null {
  const rawId = entry.csvData?.id;
  if (!rawId || !/^\d+$/.test(rawId.trim())) return null;
  // DB stores webCardId as "hk<number>" with no zero-padding (e.g. "hk14477")
  const num = parseInt(rawId.trim(), 10);
  if (isNaN(num)) return null;
  return `hk${num}`;
}

function resolvePrice(e: MarketEntry): number {
  return e.price ?? e.listPrice ?? 0;
}

function resolveInStock(e: MarketEntry): boolean {
  const s = e.stock ?? e.listStock ?? 0;
  return s > 0;
}

function resolveFetchedAt(e: MarketEntry): Date {
  if (e.priceUpdated) return new Date(e.priceUpdated);
  if (e.lastSeen) return new Date(e.lastSeen);
  return new Date();
}

const CHUNK = 200;

interface ImportResult { matched: number; created: number; updated: number; histAdded: number; }

// ── Shared upsert helper ───────────────────────────────────────────────────────
async function upsertPrices(
  entries: Array<{ cardId: string; price: number; currency: string; inStock: boolean; fetchedAt: Date }>,
  db: typeof prisma,
  verbose: boolean,
  label: (id: string) => string,
): Promise<{ created: number; updated: number; histAdded: number }> {
  if (entries.length === 0) return { created: 0, updated: 0, histAdded: 0 };

  const allCardIds = entries.map((e) => e.cardId);
  const existingPrices = new Map<string, { id: string; price: number }>();
  for (let i = 0; i < allCardIds.length; i += CHUNK) {
    const rows = await db.cardPrice.findMany({
      where: { cardId: { in: allCardIds.slice(i, i + CHUNK) }, source: "OTHER" },
      select: { id: true, cardId: true, price: true },
    });
    for (const r of rows) existingPrices.set(r.cardId, { id: r.id, price: r.price });
  }

  const toCreate: Array<{ cardId: string; source: "OTHER"; price: number; currency: string; inStock: boolean; fetchedAt: Date }> = [];
  const toUpdate: Array<{ id: string; price: number; currency: string; inStock: boolean; fetchedAt: Date }> = [];
  const historyRows: Array<{ cardId: string; source: "OTHER"; price: number; currency: string; date: Date }> = [];

  for (const e of entries) {
    const existing = existingPrices.get(e.cardId);
    if (existing) {
      toUpdate.push({ id: existing.id, price: e.price, currency: e.currency, inStock: e.inStock, fetchedAt: e.fetchedAt });
      if (Math.abs(e.price - existing.price) > 0.01)
        historyRows.push({ cardId: e.cardId, source: "OTHER", price: e.price, currency: e.currency, date: e.fetchedAt });
    } else {
      toCreate.push({ cardId: e.cardId, source: "OTHER", price: e.price, currency: e.currency, inStock: e.inStock, fetchedAt: e.fetchedAt });
      historyRows.push({ cardId: e.cardId, source: "OTHER", price: e.price, currency: e.currency, date: e.fetchedAt });
    }
    if (verbose) console.log(`  [${existing ? "UPDATE" : "CREATE"}] ${label(e.cardId)} → HK$${e.price}`);
  }

  for (let i = 0; i < toCreate.length; i += CHUNK)
    await db.cardPrice.createMany({ data: toCreate.slice(i, i + CHUNK), skipDuplicates: true });
  for (const u of toUpdate)
    await db.cardPrice.update({ where: { id: u.id }, data: { price: u.price, currency: u.currency, inStock: u.inStock, fetchedAt: u.fetchedAt } });
  let histAdded = 0;
  for (let i = 0; i < historyRows.length; i += CHUNK) {
    await db.priceHistory.createMany({ data: historyRows.slice(i, i + CHUNK) });
    histAdded += historyRows.slice(i, i + CHUNK).length;
  }
  return { created: toCreate.length, updated: toUpdate.length, histAdded };
}

// ── Format A: combined { cards: [] } ─────────────────────────────────────────
async function importCombinedFile(
  raw: MarketPriceFile,
  dryRun: boolean,
  verbose: boolean,
  db: typeof prisma,
): Promise<ImportResult> {
  const idMap = new Map<string, MarketEntry>();
  for (const entry of raw.cards) {
    if (!entry.matched) continue;
    const wid = buildWebCardId(entry);
    if (!wid) continue;
    const price = resolvePrice(entry);
    if (price <= 0) continue;
    idMap.set(wid, entry);
  }
  const webCardIds = Array.from(idMap.keys());
  if (webCardIds.length === 0) return { matched: 0, created: 0, updated: 0, histAdded: 0 };

  const cardDbMap = new Map<string, string>();
  for (let i = 0; i < webCardIds.length; i += CHUNK) {
    const found = await db.card.findMany({ where: { webCardId: { in: webCardIds.slice(i, i + CHUNK) } }, select: { id: true, webCardId: true } });
    for (const c of found) cardDbMap.set(c.webCardId, c.id);
  }
  if (dryRun || cardDbMap.size === 0) return { matched: cardDbMap.size, created: 0, updated: 0, histAdded: 0 };

  const upserts = Array.from(cardDbMap).map(([wid, cardId]) => {
    const entry = idMap.get(wid)!;
    return { cardId, price: resolvePrice(entry), currency: entry.currency ?? "HKD", inStock: resolveInStock(entry), fetchedAt: resolveFetchedAt(entry) };
  });
  const r = await upsertPrices(upserts, db, verbose, (id) => id);
  return { matched: cardDbMap.size, ...r };
}

// ── Format B: per-expansion { "093/066": [{ cardId, price, metadata }] } ─────
/** Extract the DB expansion code from a per-expansion filename.
 *  "market-prices-20260326-SV4Kf.json" → "sv4k"
 *  "market-prices-20260322-s6af-伊布英雄.json" → "s6a"
 */
function expansionCodeFromFilename(filePath: string): string | null {
  const base = path.basename(filePath, ".json");
  const m = base.match(/^market-prices-\d{8}-([^-\u4e00-\u9fff]+)/i);
  if (!m) return null;
  let code = m[1].trim();
  // Strip trailing 'f' (means "final/complete" price scrape suffix)
  if (/f$/i.test(code) && code.length > 1) code = code.slice(0, -1);
  return code.toLowerCase();
}

interface ExpansionEntry { price: number; currency: string; inStock: boolean; date: string }

async function importExpansionFile(
  raw: Record<string, ExpansionEntry[]>,
  filePath: string,
  dryRun: boolean,
  verbose: boolean,
  db: typeof prisma,
): Promise<ImportResult> {
  const expCode = expansionCodeFromFilename(filePath);
  if (!expCode) return { matched: 0, created: 0, updated: 0, histAdded: 0 };

  // Find matching HK RegionalExpansion
  const re = await db.regionalExpansion.findFirst({
    where: { code: expCode, region: "HK" },
    select: { id: true },
  });
  if (!re) return { matched: 0, created: 0, updated: 0, histAdded: 0 };

  // Load all cards for this expansion, keyed by cardNumber
  const dbCards = await db.card.findMany({
    where: { regionalExpansionId: re.id },
    select: { id: true, primaryCard: { select: { cardNumber: true } } },
  });
  const cardNumMap = new Map<string, string>(); // cardNumber → card.id
  for (const c of dbCards) {
    if (c.primaryCard.cardNumber) cardNumMap.set(c.primaryCard.cardNumber, c.id);
  }
  if (cardNumMap.size === 0) return { matched: 0, created: 0, updated: 0, histAdded: 0 };

  // Match file entries
  const upserts: Array<{ cardId: string; price: number; currency: string; inStock: boolean; fetchedAt: Date }> = [];
  for (const [rawCardId, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    // cardId format "093/066" — DB uses just the number part (e.g. "093")
    const cardNum = rawCardId.split("/")[0];
    const dbId = cardNumMap.get(cardNum);
    if (!dbId) continue;
    const first = entries[0];
    const price = typeof first.price === "number" ? first.price : 0;
    if (price <= 0) continue;
    const currency = first.currency ?? "HKD";
    const inStock = !(first as any).metadata?.isSoldOut;
    const fetchedAt = first.date ? new Date(first.date) : new Date();
    upserts.push({ cardId: dbId, price, currency, inStock, fetchedAt });
  }

  if (dryRun || upserts.length === 0) return { matched: upserts.length, created: 0, updated: 0, histAdded: 0 };

  const r = await upsertPrices(upserts, db, verbose, () => expCode);
  return { matched: upserts.length, ...r };
}

// ── Auto-detect format and dispatch ───────────────────────────────────────────
async function importFile(
  filePath: string,
  dryRun: boolean,
  verbose: boolean,
  db: typeof prisma,
): Promise<ImportResult> {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  // Format A: has a top-level "cards" array
  if (raw && typeof raw === "object" && "cards" in raw && Array.isArray((raw as any).cards)) {
    return importCombinedFile(raw as MarketPriceFile, dryRun, verbose, db);
  }
  // Format B: per-expansion object keyed by card number
  return importExpansionFile(raw as Record<string, ExpansionEntry[]>, filePath, dryRun, verbose, db);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");
  const fileArgRaw = args.find((a: string) => a.startsWith("--file="));
  const fileArg = fileArgRaw ? fileArgRaw.substring(7) : undefined;
  const dirArgRaw = args.find((a: string) => a.startsWith("--dir="));
  let dirArg = dirArgRaw ? dirArgRaw.substring(6) : undefined;

  // ── Auto-detect: if no --dir= and no --file= given, try default directories ─
  if (!dirArg && !fileArg) {
    dirArg = DEFAULT_DIR_CANDIDATES.find((d) => fs.existsSync(d) && resolveFilesFromDir(d).length > 0);
  }

  // ── Directory mode: process all market-prices-*.json files in a folder ──────
  if (dirArg) {
    const dirPath = path.resolve(dirArg);
    const allFiles = resolveFilesFromDir(dirPath);
    if (allFiles.length === 0) {
      console.error(`❌ No market-prices*.json files found in: ${dirPath}`);
      process.exit(1);
    }

    const files = allFiles; // process all files to build full price history

    console.log("=".repeat(60));
    console.log("PTCG_2026 \u2014 Market Price Bulk Import (Beehive TCG HK)");
    console.log(`Directory  : ${dirPath}`);
    console.log(`Total files: ${files.length}`);
    if (dryRun) console.log("Mode       : dry-run (no writes)");
    console.log("=".repeat(60));

    let grandMatched = 0, grandCreated = 0, grandUpdated = 0, grandHistory = 0, failed = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      console.log(`\n[${i + 1}/${files.length}] ${path.basename(f)}`);
      try {
        const result = await importFile(f, dryRun, verbose, prisma);
        grandMatched  += result.matched;
        grandCreated  += result.created;
        grandUpdated  += result.updated;
        grandHistory  += result.histAdded;
        console.log(`  matched=${result.matched} created=${result.created} updated=${result.updated} history=${result.histAdded}`);
      } catch (err: any) {
        failed++;
        console.error(`  \u274c FAILED: ${err.message}`);
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("BULK IMPORT COMPLETE");
    console.log("=".repeat(60));
    console.log(`Files processed : ${files.length - failed}/${files.length} (failed: ${failed})`);
    console.log(`Matched in DB   : ${grandMatched}`);
    console.log(`Created         : ${grandCreated}`);
    console.log(`Updated         : ${grandUpdated}`);
    console.log(`History added   : ${grandHistory}`);
    console.log("=".repeat(60));
    console.log("\n\u2705 Done!");
    await prisma.$disconnect();
    return;
  }

  // ── Single-file mode ─────────────────────────────────────────────────────────
  const candidates = fileArg
    ? [path.resolve(fileArg), ...DEFAULT_FILE_CANDIDATES]
    : DEFAULT_FILE_CANDIDATES;
  const filePath = candidates.find((c) => fs.existsSync(c));
  if (!filePath) {
    console.error("\u274c No market price source found. Checked directories:");
    DEFAULT_DIR_CANDIDATES.forEach((d) => console.error("   dir: ", d));
    console.error("  files:");
    candidates.forEach((c) => console.error("   ", c));
    console.error("\n   Provide --file=<path> or --dir=<directory> to specify source.");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("PTCG_2026 — Market Price Import (Beehive TCG HK)");
  console.log(`Source : ${filePath}`);
  if (dryRun) console.log("Mode   : dry-run (no writes)");
  console.log("=".repeat(60));

  // Print summary header from JSON
  const rawPeek: MarketPriceFile = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`\n📊 File stats:`);
  console.log(`   Total entries     : ${rawPeek.cards.length}`);
  if (rawPeek.summary) {
    const s = rawPeek.summary as Record<string, unknown>;
    console.log(`   Matched entries   : ${s.matchedCards ?? "?"}`);
    console.log(`   Last update       : ${s.lastUpdate ?? "?"}`);
  }

  // Dry-run: do the lookup without writing
  if (dryRun) {
    const result = await importFile(filePath, true, verbose, prisma);
    console.log(`\n🔑 Eligible entries  : (see above)`);
    console.log(`   Found in DB       : ${result.matched}`);
    console.log("\nDry run complete — no data written.");
    return;
  }

  console.log("\n💾 Importing…");
  const result = await importFile(filePath, false, verbose, prisma);

  console.log(`\n\n${"=".repeat(60)}`);
  console.log("IMPORT COMPLETE");
  console.log("=".repeat(60));
  console.log(`Cards matched in DB    : ${result.matched}`);
  console.log(`Prices created         : ${result.created}`);
  console.log(`Prices updated         : ${result.updated}`);
  console.log(`Total upserted         : ${result.created + result.updated}`);
  console.log(`History entries added  : ${result.histAdded}`);
  console.log(`Source                 : OTHER (Beehive TCG HK)`);
  console.log(`Currency               : HKD`);
  console.log("=".repeat(60));
  console.log("\n✅ Done!");
}

main()
  .catch((e) => {
    console.error("\n❌ Import failed:", e.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

