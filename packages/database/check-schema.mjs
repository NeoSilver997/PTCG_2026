import { PrismaClient } from './.prisma/client/index.js';
const p = new PrismaClient();
const rows = await p.$queryRawUnsafe(
  "SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='scraper_jobs' ORDER BY ordinal_position"
);
rows.forEach(r => console.log(r.column_name.padEnd(20), r.data_type.padEnd(20), r.udt_name));
await p.$disconnect();
