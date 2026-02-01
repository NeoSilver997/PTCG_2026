import { PrismaClient } from './packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function checkSubtypesSummary() {
  try {
    console.log('📊 Checking database field counts...\n');
    
    // Total cards
    const total = await prisma.card.count();
    console.log(`Total cards: ${total}\n`);
    
    // Group by subtypes
    console.log('='.repeat(60));
    console.log('SUBTYPES (Trainer/Energy only):');
    console.log('='.repeat(60));
    const subtypesGroups = await prisma.card.groupBy({
      by: ['subtypes'],
      _count: true,
    });
    subtypesGroups.forEach(({ subtypes, _count }) => {
      console.log(`${JSON.stringify(subtypes).padEnd(40)} : ${_count}`);
    });
    
    // Group by evolutionStage
    console.log('\n' + '='.repeat(60));
    console.log('EVOLUTION STAGE (Pokemon only):');
    console.log('='.repeat(60));
    const evolutionGroups = await prisma.card.groupBy({
      by: ['evolutionStage'],
      _count: true,
    });
    evolutionGroups.forEach(({ evolutionStage, _count }) => {
      console.log(`${String(evolutionStage).padEnd(40)} : ${_count}`);
    });
    
    // Group by ruleBox
    console.log('\n' + '='.repeat(60));
    console.log('RULE BOX (Special mechanics):');
    console.log('='.repeat(60));
    const ruleBoxGroups = await prisma.card.groupBy({
      by: ['ruleBox'],
      _count: true,
    });
    ruleBoxGroups.forEach(({ ruleBox, _count }) => {
      console.log(`${String(ruleBox).padEnd(40)} : ${_count}`);
    });
    
    // Sample cards with subtypes
    console.log('\n' + '='.repeat(60));
    console.log('SAMPLE CARDS WITH SUBTYPES:');
    console.log('='.repeat(60));
    const cardsWithSubtypes = await prisma.card.findMany({
      where: {
        subtypes: { isEmpty: false }
      },
      take: 5,
      select: {
        webCardId: true,
        name: true,
        supertype: true,
        subtypes: true,
      }
    });
    cardsWithSubtypes.forEach(card => {
      console.log(`${card.webCardId} - ${card.name} (${card.supertype}): ${JSON.stringify(card.subtypes)}`);
    });
    
    // Sample cards with evolutionStage
    console.log('\n' + '='.repeat(60));
    console.log('SAMPLE CARDS WITH EVOLUTION STAGE:');
    console.log('='.repeat(60));
    const cardsWithEvolution = await prisma.card.findMany({
      where: {
        evolutionStage: { not: null }
      },
      take: 5,
      select: {
        webCardId: true,
        name: true,
        evolutionStage: true,
      }
    });
    cardsWithEvolution.forEach(card => {
      console.log(`${card.webCardId} - ${card.name}: ${card.evolutionStage}`);
    });
    
    // Sample cards with ruleBox
    console.log('\n' + '='.repeat(60));
    console.log('SAMPLE CARDS WITH RULE BOX:');
    console.log('='.repeat(60));
    const cardsWithRuleBox = await prisma.card.findMany({
      where: {
        ruleBox: { not: null }
      },
      take: 5,
      select: {
        webCardId: true,
        name: true,
        ruleBox: true,
      }
    });
    cardsWithRuleBox.forEach(card => {
      console.log(`${card.webCardId} - ${card.name}: ${card.ruleBox}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSubtypesSummary();
