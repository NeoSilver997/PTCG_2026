import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function testCompleteMetaSummary() {
  try {
    console.log('Testing complete getDeckMetaSummary() implementation...\n');

    // 1. Test top cards query
    console.log('1. Testing top cards query...');
    const topCards = await prisma.$queryRaw`
      SELECT
        c.id as card_id,
        c.name,
        c."imageUrl" as card_image,
        c.supertype,
        c.subtypes,
        SUM(dc.quantity)::int as frequency,
        COUNT(DISTINCT d.id)::int as deck_count
      FROM deck_cards dc
      JOIN cards c ON c.id = dc."cardId"
      JOIN decks d ON d.id = dc."deckId"
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t ON t.id = tr."tournamentId"
      GROUP BY c.id, c.name, c."imageUrl", c.supertype, c.subtypes
      ORDER BY frequency DESC
      LIMIT 5
    `;
    console.log(`   ✓ Found ${topCards.length} top cards`);
    if (topCards.length > 0) {
      console.log(`   ✓ Top card: ${topCards[0].name} (${topCards[0].frequency} total uses)`);
    }

    // 2. Test type distribution
    console.log('\n2. Testing Pokemon type distribution query...');
    const types = await prisma.$queryRaw`
      WITH deck_types AS (
        SELECT
          d.id as deck_id,
          tr.placement,
          unnest(c.types)::text as pokemon_type
        FROM decks d
        JOIN tournament_results tr ON tr."deckId" = d.id
        JOIN tournaments t ON t.id = tr."tournamentId"
        JOIN deck_cards dc ON dc."deckId" = d.id
        JOIN cards c ON c.id = dc."cardId"
        WHERE c.supertype = 'POKEMON'
      ),
      type_stats AS (
        SELECT
          pokemon_type,
          COUNT(DISTINCT deck_id)::int as deck_count,
          ROUND(AVG(placement)::numeric, 2)::float as avg_placement,
          ROUND(100.0 * COUNT(DISTINCT CASE WHEN placement <= 8 THEN deck_id END) / COUNT(DISTINCT deck_id), 1)::float as win_rate_percent
        FROM deck_types
        GROUP BY pokemon_type
      )
      SELECT * FROM type_stats
      WHERE deck_count >= 5
      ORDER BY win_rate_percent DESC, deck_count DESC
      LIMIT 5
    `;
    console.log(`   ✓ Found ${types.length} Pokemon types with sufficient data`);
    if (types.length > 0) {
      console.log(`   ✓ Top type: ${types[0].pokemon_type} (${types[0].win_rate_percent}% win rate, ${types[0].deck_count} decks)`);
    }

    // 3. Test deck stats
    console.log('\n3. Testing deck composition statistics...');
    const stats = await prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT d.id)::int as total_decks,
        ROUND(AVG(CASE WHEN c.supertype = 'POKEMON' THEN dc.quantity ELSE 0 END)::numeric, 1)::float as avg_pokemon,
        ROUND(AVG(CASE WHEN c.supertype = 'TRAINER' THEN dc.quantity ELSE 0 END)::numeric, 1)::float as avg_trainer,
        ROUND(AVG(CASE WHEN c.supertype = 'ENERGY' THEN dc.quantity ELSE 0 END)::numeric, 1)::float as avg_energy
      FROM decks d
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t ON t.id = tr."tournamentId"
      JOIN deck_cards dc ON dc."deckId" = d.id
      JOIN cards c ON c.id = dc."cardId"
    `;
    console.log(`   ✓ Deck stats: ${stats[0].total_decks} decks analyzed`);
    console.log(`   ✓ Avg composition: ${stats[0].avg_pokemon} Pokemon, ${stats[0].avg_trainer} Trainers, ${stats[0].avg_energy} Energy`);

    // 4. Test archetypes
    console.log('\n4. Testing archetype identification...');
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
        avg_placement
      FROM arch_stats
      ORDER BY deck_count DESC
      LIMIT 5
    `;
    console.log(`   ✓ Found ${archetypes.length} archetypes`);
    if (archetypes.length > 0) {
      console.log(`   ✓ Top archetype: ${archetypes[0].primary_type} (${archetypes[0].deck_count} decks, avg placement: ${archetypes[0].avg_placement})`);
    }

    console.log('\n✅ All meta-summary queries work correctly!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testCompleteMetaSummary();
