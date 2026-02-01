import { PrismaClient, Prisma } from './node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  // Get all Pokemon cards and filter in application code
  const allPokemon = await prisma.card.findMany({
    where: { supertype: 'POKEMON' },
    select: {
      webCardId: true,
      name: true,
      abilities: true,
      evolutionStage: true,
      types: true
    }
  });

  const withAbilities = allPokemon.filter(c => c.abilities !== null);
  const withoutAbilities = allPokemon.filter(c => c.abilities === null);

  console.log('=== Pokemon Cards (特性 = Abilities) ===');
  console.log('Total Pokemon:', allPokemon.length);
  console.log('With abilities:', withAbilities.length);
  console.log('Without abilities:', withoutAbilities.length);
  console.log('');

  console.log('=== Sample Cards with Abilities ===\n');
  withAbilities.slice(0, 5).forEach(card => {
    console.log(`${card.webCardId} - ${card.name}`);
    console.log(`  Evolution: ${card.evolutionStage || 'N/A'}`);
    console.log(`  Types: ${card.types.join(', ')}`);
    console.log(`  Abilities:`, card.abilities);
    console.log('');
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
