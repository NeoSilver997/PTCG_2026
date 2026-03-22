import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function main() {
  const webCardId = process.argv[2] || 'jp48533';
  const card = await prisma.card.findUnique({
    where: { webCardId },
    select: { id: true, name: true, primaryCardId: true },
  });
  if (!card) { console.log('card not found'); return; }
  console.log('card:', card);

  const ids: string[] = card.primaryCardId
    ? (await prisma.card.findMany({ where: { primaryCardId: card.primaryCardId }, select: { id: true } })).map(c => c.id)
    : [card.id];
  console.log('checking', ids.length, 'sibling card id(s)');

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT date_trunc('week', t.date)::date AS week_start, COUNT(DISTINCT d.id) AS deck_count
    FROM deck_cards dc
    JOIN decks d ON d.id = dc."deckId"
    JOIN tournament_results tr ON tr."deckId" = d.id
    JOIN tournaments t ON t.id = tr."tournamentId"
    WHERE dc."cardId" = ANY($1::text[])
    GROUP BY 1 ORDER BY 1 ASC
  `, ids);

  console.log('All-time weekly usage:');
  for (const r of rows) {
    console.log(`  ${new Date(r.week_start).toISOString().slice(0, 10)}  decks: ${r.deck_count}`);
  }
  console.log(`Total weeks with data: ${rows.length}`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); process.exit(1); });
