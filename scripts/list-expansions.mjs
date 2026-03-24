import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';
const p = new PrismaClient();
const rows = await p.regionalExpansion.findMany({
  select: { code: true, name: true, region: true, _count: { select: { cards: true } } },
  orderBy: { code: 'asc' },
});
rows.forEach(x => console.log(`${x.code} | ${x.region} | ${x._count.cards} | ${x.name}`));
await p.$disconnect();
