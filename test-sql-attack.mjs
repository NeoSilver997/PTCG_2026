// Test SQL query for attackName filter
import { PrismaClient } from './packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function testAttackNameQuery() {
  // First, get a sample card with attacks
  const sampleCards = await prisma.$queryRaw`
    SELECT "webCardId", name, attacks 
    FROM cards 
    WHERE attacks IS NOT NULL AND attacks != 'null'::jsonb 
    LIMIT 3
  `;
  
  console.log('Sample cards with attacks:');
  console.log(JSON.stringify(sampleCards, null, 2));
  
  if (sampleCards.length > 0) {
    const sampleAttack = sampleCards[0].attacks[0]?.name;
    console.log(`\nTesting query for attack: "${sampleAttack}"`);
    
    // Test the attackName query
    const result = await prisma.$queryRaw`
      SELECT "webCardId", name, attacks
      FROM cards c
      WHERE c.attacks IS NOT NULL 
        AND c.attacks != 'null'::jsonb 
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(c.attacks) AS attack
          WHERE attack->>'name' = ${sampleAttack}
        )
      LIMIT 5
    `;
    
    console.log(`\nFound ${result.length} cards with attack "${sampleAttack}":`);
    console.log(JSON.stringify(result, null, 2));
  }
  
  await prisma.$disconnect();
}

testAttackNameQuery().catch(console.error);
