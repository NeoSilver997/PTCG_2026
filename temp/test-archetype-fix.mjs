import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function testArchetypeQuery() {
  try {
    console.log('Testing corrected archetype query...\n');

    const archetypes = await prisma.$queryRaw`
      WITH primary_types AS (
        SELECT DISTINCT
          d.id as deck_id,
          tr.placement,
          c.types[1]::text as primary_type
        FROM decks d
        JOIN tournament_results tr ON tr."deckId" = d.id
        JOIN tournaments t ON t.id = tr."tournamentId"
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.supertype = 'POKEMON' AND array_length(c.types, 1) > 0
      ),
      arch_stats AS (
        SELECT
          primary_type,
          COUNT(DISTINCT deck_id)::int as deck_count,
          ROUND(AVG(placement)::numeric, 2)::float as avg_placement
        FROM primary_types
        GROUP BY primary_type
      )
      SELECT
        primary_type,
        primary_type as archetype_name,
        deck_count,
        avg_placement,
        '' as top_pokemon
      FROM arch_stats
      ORDER BY deck_count DESC
      LIMIT 10
    `;
    
    console.log(`✅ Archetype query works! Found ${archetypes.length} archetypes`);
    archetypes.forEach((arch, idx) => {
      console.log(`   ${idx + 1}. ${arch.primary_type}: ${arch.deck_count} decks, avg placement ${arch.avg_placement}`);
    });
    
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testArchetypeQuery();
