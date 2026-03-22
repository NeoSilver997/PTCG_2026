/**
 * Market Price Import Script — Beehive TCG (HK)
 *
 * Reads market-prices.json from PTCG_CardDB_Tc and upserts CardPrice + PriceHistory
 * records into the PTCG_2026 PostgreSQL database via Prisma.
 *
 * Match strategy:
 *   Each entry has csvData.id (8-digit numeric string).
 *   HK card webCardId = "hk" + csvData.id  (e.g., "00014477" → "hk00014477")
 *
 * Usage:
 *   npx tsx scrapers/import-market-prices.ts
 *   npx tsx scrapers/import-market-prices.ts --dry-run
 *   npx tsx scrapers/import-market-prices.ts --verbose
 *   npx tsx scrapers/import-market-prices.ts --file="C:/path/to/market-prices.json"
 */
import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ── Default file candidates ────────────────────────────────────────────────────
const DEFAULT_FILE_CANDIDATES = [
  path.resolve(__dirname, "../../PTCG_CardDB_Tc/market-prices.json"),
  path.resolve(process.cwd(), "../PTCG_CardDB_Tc/market-prices.json"),
  "C:/AI_Server/Coding/PTCG_CardDB_Tc/market-prices.json",
];

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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verbose = args.includes("--verbose");
  const fileArgRaw = args.find((a) => a.startsWith("--file="));
  const fileArg = fileArgRaw ? fileArgRaw.substring(7) : undefined;

  // Resolve the JSON file path
  const candidates = fileArg
    ? [path.resolve(fileArg), ...DEFAULT_FILE_CANDIDATES]
    : DEFAULT_FILE_CANDIDATES;
  const filePath = candidates.find((c) => fs.existsSync(c));
  if (!filePath) {
    console.error("❌ market-prices.json not found in:");
    candidates.forEach((c) => console.error("   ", c));
    console.error("\n   Provide --file=<path> or ensure PTCG_CardDB_Tc is a sibling folder.");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("PTCG_2026 — Market Price Import (Beehive TCG HK)");
  console.log(`Source : ${filePath}`);
  if (dryRun) console.log("Mode   : dry-run (no writes)");
  console.log("=".repeat(60));

  // 1. Parse JSON
  const raw: MarketPriceFile = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`\n📊 File stats:`);
  console.log(`   Total entries     : ${raw.cards.length}`);
  if (raw.summary) {
    const s = raw.summary as Record<string, unknown>;
    console.log(`   Matched entries   : ${s.matchedCards ?? "?"}`);
    console.log(`   Last update       : ${s.lastUpdate ?? "?"}`);
  }

  // 2. Build webCardId → entry map (skip unmatched and entries without id)
  const idMap = new Map<string, MarketEntry>(); // webCardId → entry
  let skippedUnmatched = 0;
  let skippedNoId = 0;
  let skippedZeroPrice = 0;

  for (const entry of raw.cards) {
    if (!entry.matched) { skippedUnmatched++; continue; }
    const wid = buildWebCardId(entry);
    if (!wid) { skippedNoId++; continue; }
    const price = resolvePrice(entry);
    if (price <= 0) { skippedZeroPrice++; continue; }
    idMap.set(wid, entry);
  }

  const webCardIds = Array.from(idMap.keys());
  console.log(`\n🔑 Eligible entries  : ${webCardIds.length}`);
  console.log(`   Skipped unmatched  : ${skippedUnmatched}`);
  console.log(`   Skipped no id      : ${skippedNoId}`);
  console.log(`   Skipped price=0    : ${skippedZeroPrice}`);

  if (webCardIds.length === 0) {
    console.warn("\n⚠️  Nothing to import.");
    return;
  }

  // 3. Batch-lookup cards in DB by webCardId
  console.log("\n🔍 Looking up cards in database…");
  const cardDbMap = new Map<string, string>(); // webCardId → internal card.id

  for (let i = 0; i < webCardIds.length; i += CHUNK) {
    const batch = webCardIds.slice(i, i + CHUNK);
    const found = await prisma.card.findMany({
      where: { webCardId: { in: batch } },
      select: { id: true, webCardId: true },
    });
    for (const c of found) cardDbMap.set(c.webCardId, c.id);
  }

  console.log(`   Found in DB        : ${cardDbMap.size} / ${webCardIds.length}`);
  console.log(`   Not in DB (skip)   : ${webCardIds.length - cardDbMap.size}`);

  if (cardDbMap.size === 0) {
    console.warn("\n⚠️  No cards matched in DB. Import HK cards first with import-cards-direct.ts.");
    return;
  }

  if (dryRun) {
    console.log("\nDry run complete — no data written.");
    return;
  }

  // 4. Fetch existing CardPrice rows for all matched cards
  console.log("\n💾 Upserting CardPrice records…");
  const allCardIds = Array.from(cardDbMap.values());

  const existingPrices = new Map<string, { id: string; price: number }>();
  for (let i = 0; i < allCardIds.length; i += CHUNK) {
    const batch = allCardIds.slice(i, i + CHUNK);
    const rows = await prisma.cardPrice.findMany({
      where: { cardId: { in: batch }, source: "OTHER" },
      select: { id: true, cardId: true, price: true },
    });
    for (const r of rows) existingPrices.set(r.cardId, { id: r.id, price: r.price });
  }

  // 5. Prepare upsert lists
  const toCreate: Array<{
    cardId: string; source: "OTHER"; price: number;
    currency: string; inStock: boolean; fetchedAt: Date;
  }> = [];

  const toUpdate: Array<{
    id: string; price: number; currency: string;
    inStock: boolean; fetchedAt: Date;
  }> = [];

  const historyRows: Array<{
    cardId: string; source: "OTHER"; price: number;
    currency: string; date: Date;
  }> = [];

  for (const [wid, cardId] of cardDbMap) {
    const entry = idMap.get(wid)!;
    const price = resolvePrice(entry);
    const currency = entry.currency ?? "HKD";
    const inStock = resolveInStock(entry);
    const fetchedAt = resolveFetchedAt(entry);

    const existing = existingPrices.get(cardId);
    if (existing) {
      toUpdate.push({ id: existing.id, price, currency, inStock, fetchedAt });
      // Record history only when price changed
      if (Math.abs(price - existing.price) > 0.01) {
        historyRows.push({ cardId, source: "OTHER", price, currency, date: fetchedAt });
      }
    } else {
      toCreate.push({ cardId, source: "OTHER", price, currency, inStock, fetchedAt });
      historyRows.push({ cardId, source: "OTHER", price, currency, date: fetchedAt });
    }

    if (verbose) {
      const action = existing ? "UPDATE" : "CREATE";
      console.log(`  [${action}] ${wid} → HK$${price} (${inStock ? "in stock" : "out of stock"})`);
    }
  }

  // 6. Write in chunks inside transactions
  let upserted = 0;
  let histAdded = 0;

  // Creates
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK);
    await prisma.cardPrice.createMany({ data: chunk, skipDuplicates: true });
    upserted += chunk.length;
    process.stdout.write(".");
  }

  // Updates
  for (const u of toUpdate) {
    await prisma.cardPrice.update({
      where: { id: u.id },
      data: { price: u.price, currency: u.currency, inStock: u.inStock, fetchedAt: u.fetchedAt },
    });
    upserted++;
  }

  // History
  for (let i = 0; i < historyRows.length; i += CHUNK) {
    const chunk = historyRows.slice(i, i + CHUNK);
    await prisma.priceHistory.createMany({ data: chunk });
    histAdded += chunk.length;
  }

  console.log(`\n\n${"=".repeat(60)}`);
  console.log("IMPORT COMPLETE");
  console.log("=".repeat(60));
  console.log(`Cards matched in DB    : ${cardDbMap.size}`);
  console.log(`Prices created         : ${toCreate.length}`);
  console.log(`Prices updated         : ${toUpdate.length}`);
  console.log(`Total upserted         : ${upserted}`);
  console.log(`History entries added  : ${histAdded}`);
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

