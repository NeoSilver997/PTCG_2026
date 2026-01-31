// Simple script to update existing cards with pokemonTypes from JSON
import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';
import fs from 'fs';

const prisma = new PrismaClient();

async function updateCardsWithTypes() {
  const jsonPath = '../data/cards/japan/japanese_cards_40k_sv7.json';
  const cardsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  
  console.log(`Loaded ${cardsData.length} cards from JSON`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const cardData of cardsData.slice(0, 20)) { // Update first 20 cards for testing
    try {
      // Find card by webCardId
      const existingCard = await prisma.card.findUnique({
        where: { webCardId: cardData.webCardId }
      });
      
      if (existingCard) {
        // Update with types from pokemonTypes field
        await prisma.card.update({
          where: { webCardId: cardData.webCardId },
          data: {
            types: cardData.pokemonTypes || [],
            supertype: cardData.supertype || null,
            rarity: cardData.rarity || null,
          }
        });
        updated++;
        console.log(`✓ Updated ${cardData.webCardId}: ${cardData.name} - types: ${cardData.pokemonTypes?.join(', ')}`);
      } else {
        notFound++;
        console.log(`✗ Card not found: ${cardData.webCardId}`);
      }
    } catch (error) {
      console.error(`Error updating ${cardData.webCardId}:`, error.message);
    }
  }
  
  console.log(`\nUpdated: ${updated}, Not found: ${notFound}`);
}

updateCardsWithTypes()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
