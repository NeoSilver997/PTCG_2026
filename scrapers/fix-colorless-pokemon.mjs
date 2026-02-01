// Fix Pokemon cards without types - set them to COLORLESS
import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function fixColorlessPokemon() {
  console.log('Fixing Pokemon cards without types (setting to COLORLESS)...\n');
  
  // Get Pokemon cards without types
  const pokemonWithoutTypes = await prisma.card.findMany({
    where: {
      supertype: 'POKEMON',
      types: { isEmpty: true }
    },
    select: {
      id: true,
      webCardId: true,
      name: true,
      hp: true,
    }
  });
  
  console.log(`Found ${pokemonWithoutTypes.length} Pokemon cards without types\n`);
  console.log('Sample Pokemon being updated:');
  pokemonWithoutTypes.slice(0, 10).forEach(card => {
    console.log(`  ${card.webCardId.padEnd(12)} | ${card.name.padEnd(30)} | HP: ${card.hp || 'N/A'}`);
  });
  
  console.log(`\nUpdating all ${pokemonWithoutTypes.length} Pokemon to COLORLESS type...`);
  
  // Update all of them to COLORLESS
  const result = await prisma.card.updateMany({
    where: {
      supertype: 'POKEMON',
      types: { isEmpty: true }
    },
    data: {
      types: ['COLORLESS']
    }
  });
  
  console.log(`\n✅ Successfully updated ${result.count} Pokemon cards to COLORLESS type\n`);
  
  // Verify
  const stillMissingTypes = await prisma.card.count({
    where: {
      supertype: 'POKEMON',
      types: { isEmpty: true }
    }
  });
  
  const totalPokemon = await prisma.card.count({
    where: { supertype: 'POKEMON' }
  });
  
  const colorlessPokemon = await prisma.card.count({
    where: {
      supertype: 'POKEMON',
      types: { has: 'COLORLESS' }
    }
  });
  
  console.log('='.repeat(80));
  console.log('VERIFICATION:');
  console.log('='.repeat(80));
  console.log(`Total Pokemon cards: ${totalPokemon}`);
  console.log(`COLORLESS Pokemon: ${colorlessPokemon}`);
  console.log(`Pokemon still without types: ${stillMissingTypes}`);
  
  if (stillMissingTypes === 0) {
    console.log('\n🎉 All Pokemon cards now have types!');
  } else {
    console.log(`\n⚠️  ${stillMissingTypes} Pokemon still need manual review`);
  }
}

fixColorlessPokemon()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
