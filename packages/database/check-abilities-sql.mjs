import { PrismaClient } from './node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function checkAbilitiesData() {
  console.log('\n=== Checking abilities field in database ===\n');
  
  // Check different states of abilities field
  const queries = [
    { label: 'abilities IS NULL', query: { abilities: null } },
    { label: 'abilities IS NOT NULL', query: { abilities: { not: null } } },
  ];
  
  // Use raw SQL to check properly
  const nullCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities IS NULL
  `;
  
  const notNullCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities IS NOT NULL
  `;
  
  const emptyArrayCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities = '[]'::jsonb
  `;
  
  const withDataCount = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities IS NOT NULL AND abilities != 'null'::jsonb
  `;
  
  console.log('Pokemon cards where abilities IS NULL:', nullCount[0].count.toString());
  console.log('Pokemon cards where abilities IS NOT NULL:', notNullCount[0].count.toString());
  console.log('Pokemon cards where abilities = []:', emptyArrayCount[0].count.toString());
  console.log('Pokemon cards with abilities array length > 0:', withDataCount[0].count.toString());
  
  // Get sample cards
  const sampleNull = await prisma.$queryRaw`
    SELECT "webCardId", name, abilities 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities IS NULL
    LIMIT 3
  `;
  
  const sampleNotNull = await prisma.$queryRaw`
    SELECT "webCardId", name, abilities 
    FROM cards 
    WHERE supertype = 'POKEMON' AND abilities IS NOT NULL
    LIMIT 3
  `;
  
  console.log('\n=== Sample cards with abilities IS NULL ===');
  console.log(JSON.stringify(sampleNull, null, 2));
  
  console.log('\n=== Sample cards with abilities (has data) ===');
  console.log(JSON.stringify(sampleNotNull, null, 2));
  
  await prisma.$disconnect();
}

checkAbilitiesData().catch(console.error);
