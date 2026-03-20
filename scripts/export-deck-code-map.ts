import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRaw<Array<{ id: string; deckCode: string | null }>>`
    SELECT id, "deckCode" FROM decks WHERE "deckCode" IS NOT NULL
  `;

  const out = rows
    .filter((r) => !!r.deckCode)
    .map((r) => ({ id: r.id, deckCode: r.deckCode as string }))
    .sort((a, b) => a.deckCode.localeCompare(b.deckCode));

  fs.writeFileSync('./apps/web/public/deck-code-map.json', JSON.stringify(out, null, 2), 'utf-8');
  console.log(`deck-code-map.json updated: ${out.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
