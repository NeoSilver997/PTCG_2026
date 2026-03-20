import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function testMetaSummary() {
  try {
    // Test a simple query from getDeckMetaSummary
    const result = await prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT d.id)::int as total_decks,
        ROUND(AVG(CASE WHEN c.supertype = 'POKEMON' THEN dc.quantity ELSE 0 END)::numeric, 1)::float as avg_pokemon
      FROM decks d
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t ON t.id = tr."tournamentId"
      JOIN deck_cards dc ON dc."deckId" = d.id
      JOIN cards c ON c.id = dc."cardId"
    `;
    
    console.log('✅ Meta-summary backend queries work!');
    console.log('   Total decks:', result[0].total_decks);
    console.log('   Avg Pokemon per deck:', result[0].avg_pokemon);
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testMetaSummary();
