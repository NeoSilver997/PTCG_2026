import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
const p = new PrismaClient();

async function main() {
  // How many decks/results have card data for recent weeks?
  // "Feb 28" week = Mar 1-7 (weekIdx 1 with period ending Mar 21)
  const weeks = [
    { label: "Feb 21 (week0 Feb 22-28)", from: new Date("2026-02-22"), to: new Date("2026-02-28T23:59:59Z") },
    { label: "Feb 28 (week1 Mar 01-07)", from: new Date("2026-03-01"), to: new Date("2026-03-07T23:59:59Z") },
    { label: "Mar 07 (week2 Mar 08-14)", from: new Date("2026-03-08"), to: new Date("2026-03-14T23:59:59Z") },
    { label: "Mar 14 (week3 Mar 15-21)", from: new Date("2026-03-15"), to: new Date("2026-03-21T23:59:59Z") },
  ];

  for (const w of weeks) {
    const tournaments = await p.tournament.findMany({
      where: { date: { gte: w.from, lte: w.to } },
      select: { id: true, date: true, eventId: true, results: {
        select: { deckId: true, deck: { select: { _count: { select: { cards: true } } } } }
      }},
    });
    const totalResults = tournaments.flatMap(t => t.results).length;
    const resultsWithDeck = tournaments.flatMap(t => t.results).filter(r => r.deckId).length;
    const resultsWithCards = tournaments.flatMap(t => t.results).filter(r => r.deck && (r.deck as any)._count.cards > 0).length;
    console.log(`${w.label}:`);
    console.log(`  tournaments=${tournaments.length}, results=${totalResults}, withDeck=${resultsWithDeck}, withCards=${resultsWithCards}`);
  }
}
main().catch(console.error).finally(() => p.$disconnect());
