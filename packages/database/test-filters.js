const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testFilters() {
  console.log('Testing card filters...\n');
  
  // Get sample cards
  const allCards = await prisma.card.findMany({ 
    take: 5, 
    select: { name: true, supertype: true, types: true, rarity: true } 
  });
  console.log('Sample cards:', JSON.stringify(allCards, null, 2));
  
  // Test supertype filter
  const pokemonCards = await prisma.card.findMany({
    where: { supertype: 'POKEMON' },
    take: 3,
    select: { name: true, supertype: true }
  });
  console.log('\nPokemon cards:', JSON.stringify(pokemonCards, null, 2));
  
  // Test types filter
  const fireCards = await prisma.card.findMany({
    where: { types: { has: 'FIRE' } },
    take: 3,
    select: { name: true, types: true }
  });
  console.log('\nFire type cards:', JSON.stringify(fireCards, null, 2));
  
  // Test rarity filter
  const commonCards = await prisma.card.findMany({
    where: { rarity: 'COMMON' },
    take: 3,
    select: { name: true, rarity: true }
  });
  console.log('\nCommon cards:', JSON.stringify(commonCards, null, 2));
  
  await prisma.$disconnect();
}

testFilters().catch(console.error);
