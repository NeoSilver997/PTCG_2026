import { PrismaClient } from './packages/database/node_modules/.prisma/client/default.js';

const prisma = new PrismaClient();

async function clearPokemonSubtypes() {
  try {
    console.log('🔧 Clearing subtypes for Pokemon cards...');
    
    const result = await prisma.card.updateMany({
      where: {
        supertype: 'POKEMON'
      },
      data: {
        subtypes: []
      }
    });
    
    console.log(`✅ Cleared subtypes for ${result.count} Pokemon cards`);
    
    // Verify
    const pokemonWithSubtypes = await prisma.card.count({
      where: {
        supertype: 'POKEMON',
        subtypes: {
          isEmpty: false
        }
      }
    });
    
    console.log(`📊 Pokemon cards with subtypes remaining: ${pokemonWithSubtypes}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearPokemonSubtypes();
