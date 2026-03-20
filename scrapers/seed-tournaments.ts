/**
 * Seed Tournament Data - reads PTCG_CardDB/1_Webscraper/event_data, inserts into PTCG_2026 DB.
 * Usage: npx tsx scrapers/seed-tournaments.ts [--limit=N] [--all] [--event-id=952769] [--refresh-existing]
 */
import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const EVENT_DATA_ROOT = "C:/AI_Server/Coding/PTCG_CardDB/1_Webscraper/event_data";
const DEFAULT_LIMIT = 50;

interface EventResult { rank: string; player_name: string; deck_id: string; }
interface EventInfo {
  event_url: string; event_id: string; event_title: string; event_date: string;
  event_host: string; event_address: string; event_capacity: string; results: EventResult[];
}
interface DeckCard { card_id: string; card_name: string; card_code: string; quantity: number; image_url: string; }
interface DeckJson { deck_id: string; cards: DeckCard[]; }

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
  const plain = path.join(dir, `deck_${deckId}.json`);
  if (fs.existsSync(plain)) return plain;
  const files = fs.readdirSync(dir);
  const m = files.find((f) => f.endsWith(`_${deckId}.json`) && f.startsWith("deck_"));
  return m ? path.join(dir, m) : null;
}

async function seedEvent(eventDir: string, refreshExisting: boolean): Promise<boolean> {
  const infoPath = path.join(eventDir, "event_info.json");
  if (!fs.existsSync(infoPath)) return false;
  let event: EventInfo;
  try { event = JSON.parse(fs.readFileSync(infoPath, "utf-8")); } catch { return false; }
  if (!event.event_id || !event.event_title) return false;

  const existing = await prisma.tournament.findUnique({ where: { eventId: event.event_id } });
  if (existing && !refreshExisting) { process.stdout.write("s"); return false; }

  const locParts = [event.event_host, event.event_address].map((s) => (s||"").trim()).filter(Boolean);
  let tournament;
  if (existing) {
    tournament = await prisma.tournament.update({
      where: { id: existing.id },
      data: {
        name: event.event_title,
        type: inferType(event.event_title) as any,
        date: new Date(event.event_date),
        location: locParts.join(", ") || undefined,
        region: "JP" as any,
        playerCount: event.results.length,
        sourceUrl: event.event_url,
      },
    });

    // Rebuild results so existing tournaments can be repaired with deck links.
    await prisma.tournamentResult.deleteMany({ where: { tournamentId: tournament.id } });
  } else {
    tournament = await prisma.tournament.create({
      data: {
        eventId: event.event_id,
        name: event.event_title,
        type: inferType(event.event_title) as any,
        date: new Date(event.event_date),
        location: locParts.join(", ") || undefined,
        region: "JP" as any,
        playerCount: event.results.length,
        sourceUrl: event.event_url,
      },
    });
  }

  for (let i = 0; i < event.results.length; i++) {
    const r = event.results[i];
    let deckId: string | null = null;

    if (r.deck_id) {
      const deckPath = findDeckPath(eventDir, r.deck_id);
      if (deckPath) {
        try {
          const dj: DeckJson = JSON.parse(fs.readFileSync(deckPath, "utf-8"));
          const deckData = dj.cards.map((c) => ({ cardId: c.card_id, cardName: c.card_name, cardCode: c.card_code, quantity: c.quantity, imageUrl: c.image_url }));

          const existingDeck = await findDeckByCode(r.deck_id);
          const deck = existingDeck
            ? { id: existingDeck.id }
            : await prisma.deck.create({
                data: {
                  name: `${r.player_name} - ${r.rank}`,
                  isPublic: true,
                  format: "Standard",
                },
              });

          await prisma.$executeRaw`
            UPDATE decks
            SET "deckCode" = ${r.deck_id},
                "deckData" = ${JSON.stringify(deckData)}::jsonb,
                "updatedAt" = NOW()
            WHERE id = ${deck.id}
          `;

          for (const c of dj.cards) {
            const card = await prisma.card.findFirst({ where: { webCardId: `jp${c.card_id}` }, select: { id: true } });
            if (card) await prisma.deckCard.upsert({ where: { deckId_cardId: { deckId: deck.id, cardId: card.id } }, update: { quantity: c.quantity }, create: { deckId: deck.id, cardId: card.id, quantity: c.quantity } });
          }
          deckId = deck.id;
        } catch (_) {}
      }
    }

    await prisma.tournamentResult.create({
      data: { tournamentId: tournament.id, placement: i+1, playerName: r.player_name, deckName: r.rank, deckId: deckId??undefined },
    });
  }
  process.stdout.write(".");
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const refreshExisting = args.includes("--refresh-existing");
  const lm = args.find((a) => a.startsWith("--limit="));
  const eventIdArg = args.find((a) => a.startsWith("--event-id="));
  const targetEventId = eventIdArg ? eventIdArg.split("=")[1] : undefined;
  const limit = all ? Infinity : lm ? parseInt(lm.split("=")[1],10) : DEFAULT_LIMIT;

  console.log("=".repeat(60));
  console.log("PTCG_2026 - Tournament Bulk Seed");
  console.log(`Source: ${EVENT_DATA_ROOT}`);
  console.log(`Limit : ${limit===Infinity?"ALL":limit} new events`);
  if (targetEventId) {
    console.log(`Target eventId: ${targetEventId}`);
  }
  if (refreshExisting) {
    console.log("Mode: refresh existing tournaments");
  }
  console.log("=".repeat(60));

  if (!fs.existsSync(EVENT_DATA_ROOT)) { console.error("ERROR: Source not found"); process.exit(1); }

  const allDirs = fs.readdirSync(EVENT_DATA_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("event_"))
    .map((e) => path.join(EVENT_DATA_ROOT, e.name))
    .sort();

  const dirs = targetEventId
    ? allDirs.filter((dir) => {
        const infoPath = path.join(dir, "event_info.json");
        if (!fs.existsSync(infoPath)) return false;
        try {
          const info = JSON.parse(fs.readFileSync(infoPath, "utf-8"));
          return info?.event_id === targetEventId;
        } catch {
          return false;
        }
      })
    : allDirs;

  console.log(`Found ${dirs.length} event directories\n`);
  let seeded=0, skipped=0, failed=0;

  for (const dir of dirs) {
    if (seeded >= limit) break;
    try { const ok = await seedEvent(dir, refreshExisting); if (ok) seeded++; else skipped++; }
    catch (_) { process.stdout.write("E"); failed++; }
  }

  const [tt, tr, td] = await Promise.all([prisma.tournament.count(), prisma.tournamentResult.count(), prisma.deck.count()]);
  console.log("\n\n" + "=".repeat(60));
  console.log("SEED COMPLETE");
  console.log(`Imported: ${seeded} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Tournaments: ${tt} | Results: ${tr} | Decks: ${td}`);
  console.log("=".repeat(60));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());