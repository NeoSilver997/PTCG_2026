import { PrismaClient } from './packages/database/node_modules/.prisma/client/default.js';

const prisma = new PrismaClient();

async function summarizeCardTypes() {
  try {
    console.log('📊 Card Type Summary\n');
    console.log('='.repeat(60));
    
    // Total cards
    const total = await prisma.card.count();
    console.log(`\n🎴 Total Cards: ${total.toLocaleString()}\n`);
    
    // By Supertype
    console.log('='.repeat(60));
    console.log('📋 By Supertype:');
    console.log('='.repeat(60));
    
    const supertypes = await prisma.card.groupBy({
      by: ['supertype'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });
    
    supertypes.forEach(({ supertype, _count }) => {
      const percentage = (((_count.id / total) * 100).toFixed(1));
      console.log(`  ${supertype.padEnd(12)} ${_count.id.toLocaleString().padStart(6)}  (${percentage}%)`);
    });
    
    // By Pokemon Types
    console.log('\n' + '='.repeat(60));
    console.log('⚡ By Pokemon Type:');
    console.log('='.repeat(60));
    
    const pokemonTypes = await prisma.card.groupBy({
      by: ['types'],
      where: { supertype: 'POKEMON' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });
    
    pokemonTypes.forEach(({ types, _count }) => {
      if (types) {
        const percentage = (((_count.id / total) * 100).toFixed(1));
        console.log(`  ${types.padEnd(12)} ${_count.id.toLocaleString().padStart(6)}  (${percentage}%)`);
      }
    });
    
    // By Subtypes
    console.log('\n' + '='.repeat(60));
    console.log('🏷️  By Subtype:');
    console.log('='.repeat(60));
    
    // Get all cards with subtypes
    const cardsWithSubtypes = await prisma.card.findMany({
      where: {
        subtypes: { isEmpty: false }
      },
      select: {
        subtypes: true,
        supertype: true
      }
    });
    
    // Count subtypes manually
    const subtypeCounts = {};
    cardsWithSubtypes.forEach(card => {
      card.subtypes.forEach(subtype => {
        subtypeCounts[subtype] = (subtypeCounts[subtype] || 0) + 1;
      });
    });
    
    // Sort by count
    const sortedSubtypes = Object.entries(subtypeCounts)
      .sort((a, b) => b[1] - a[1]);
    
    if (sortedSubtypes.length > 0) {
      sortedSubtypes.forEach(([subtype, count]) => {
        const percentage = (((count / total) * 100).toFixed(1));
        console.log(`  ${subtype.padEnd(20)} ${count.toLocaleString().padStart(6)}  (${percentage}%)`);
      });
    } else {
      console.log('  No cards with subtypes found');
    }
    
    // By Rarity
    console.log('\n' + '='.repeat(60));
    console.log('💎 By Rarity:');
    console.log('='.repeat(60));
    
    const rarities = await prisma.card.groupBy({
      by: ['rarity'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });
    
    rarities.forEach(({ rarity, _count }) => {
      if (rarity) {
        const percentage = (((_count.id / total) * 100).toFixed(1));
        console.log(`  ${rarity.padEnd(25)} ${_count.id.toLocaleString().padStart(6)}  (${percentage}%)`);
      }
    });
    
    // By Language
    console.log('\n' + '='.repeat(60));
    console.log('🌐 By Language:');
    console.log('='.repeat(60));
    
    const languages = await prisma.card.groupBy({
      by: ['language'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    });
    
    languages.forEach(({ language, _count }) => {
      const percentage = (((_count.id / total) * 100).toFixed(1));
      console.log(`  ${language.padEnd(12)} ${_count.id.toLocaleString().padStart(6)}  (${percentage}%)`);
    });
    
    // Special counts
    console.log('\n' + '='.repeat(60));
    console.log('✨ Special Attributes:');
    console.log('='.repeat(60));
    
    const withAbilities = await prisma.card.count({
      where: { abilities: { not: null } }
    });
    
    const withAttacks = await prisma.card.count({
      where: { attacks: { not: null } }
    });
    
    const withRuleBox = await prisma.card.count({
      where: { ruleBox: { not: null } }
    });
    
    console.log(`  With Abilities:        ${withAbilities.toLocaleString().padStart(6)}  (${((withAbilities / total) * 100).toFixed(1)}%)`);
    console.log(`  With Attacks:          ${withAttacks.toLocaleString().padStart(6)}  (${((withAttacks / total) * 100).toFixed(1)}%)`);
    console.log(`  With RuleBox:          ${withRuleBox.toLocaleString().padStart(6)}  (${((withRuleBox / total) * 100).toFixed(1)}%)`);
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

summarizeCardTypes();
