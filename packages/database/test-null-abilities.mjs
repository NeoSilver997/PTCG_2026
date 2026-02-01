import { PrismaClient } from './node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function testAbilitiesFilter() {
  console.log('\n=== Testing abilities filter conditions ===\n');
  
  // Test exact match for JSON null
  const exactNull = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities = 'null'::jsonb
  `;
  console.log('Cards with abilities = null (JSON):', exactNull[0].count.toString());
  
  // Test IS NULL
  const sqlNull = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities IS NULL
  `;
  console.log('Cards with abilities IS NULL (SQL):', sqlNull[0].count.toString());
  
  // Test NOT NULL with actual data
  const withData = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM cards c
    WHERE c.supertype = 'POKEMON' AND (c.abilities IS NOT NULL AND c.abilities != 'null'::jsonb)
  `;
  console.log('Cards with abilities (has data):', withData[0].count.toString());
  
  // Get samples
  const sampleWithNull = await prisma.$queryRaw`
    SELECT "webCardId", name, abilities::text as abilities_text
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities = 'null'::jsonb
    LIMIT 3
  `;
  
  console.log('\n=== Sample cards with abilities = null ===');
  console.log(JSON.stringify(sampleWithNull, null, 2));
  
  await prisma.$disconnect();
}

testAbilitiesFilter().catch(console.error);
