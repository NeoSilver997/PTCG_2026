import { PrismaClient } from './packages/database/node_modules/.prisma/client/default.js';

const prisma = new PrismaClient();

async function checkSubtypes() {
  try {
    // Check cards with non-empty subtypes
    const cardsWithSubtypes = await prisma.card.findMany({
      where: {
        subtypes: {
          isEmpty: false
        }
      },
      take: 5,
      select: {
        webCardId: true,
        name: true,
        subtypes: true,
        language: true,
        supertype: true
      }
    });
    
    console.log('=== Cards with subtypes ===');
    console.log(JSON.stringify(cardsWithSubtypes, null, 2));
    
    // Count total cards with subtypes
    const countWithSubtypes = await prisma.card.count({
      where: {
        subtypes: {
          isEmpty: false
        }
      }
    });
    
    console.log(`\n=== Total cards with subtypes: ${countWithSubtypes} ===`);
    
    // Count total cards with empty subtypes
    const countEmptySubtypes = await prisma.card.count({
      where: {
        subtypes: {
          isEmpty: true
        }
      }
    });
    
    console.log(`=== Total cards with empty subtypes: ${countEmptySubtypes} ===`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSubtypes();
