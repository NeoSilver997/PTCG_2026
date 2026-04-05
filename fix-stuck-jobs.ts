import { PrismaClient } from './packages/database/node_modules/.prisma/client';
const p = new PrismaClient();
async function main() {
  const res = await p.scraperJob.updateMany({
    where: { status: 'RUNNING', completedAt: null },
    data: { status: 'FAILED', completedAt: new Date(), errors: ['Stuck job cleaned up on restart'] }
  });
  console.log('Updated stuck RUNNING jobs:', res.count);
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
