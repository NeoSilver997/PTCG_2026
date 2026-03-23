const { PrismaClient } = require('../packages/database/node_modules/.prisma/client');
const p = new PrismaClient();
const { Prisma } = require('../packages/database/node_modules/.prisma/client');

async function main() {
  const rows = await p.$queryRaw`SELECT count(*) as cnt FROM deck_card_roles`;
  console.log('count:', rows);
  const sample = await p.$queryRaw`SELECT * FROM deck_card_roles LIMIT 5`;
  console.log('sample:', sample);
}
main().catch(console.error).finally(() => p.$disconnect());
