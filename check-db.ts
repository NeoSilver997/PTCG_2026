import { PrismaClient } from './packages/database/node_modules/.prisma/client';

const p = new PrismaClient();

async function main() {
  // Check column types for scraper_jobs
  const cols = await p.$queryRawUnsafe<any[]>(
    "SELECT column_name, udt_name, data_type FROM information_schema.columns WHERE table_name='scraper_jobs' ORDER BY ordinal_position"
  );
  console.log('=== scraper_jobs columns ===');
  cols.forEach(c => console.log(`  ${c.column_name.padEnd(20)} ${c.udt_name.padEnd(20)} ${c.data_type}`));

  // Try to read rows
  console.log('\n=== sample rows ===');
  try {
    const rows = await p.$queryRawUnsafe<any[]>('SELECT id, source, status FROM scraper_jobs LIMIT 5');
    rows.forEach(r => console.log(r));
  } catch (e: any) {
    console.error('Error reading rows:', e.message);
  }

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
