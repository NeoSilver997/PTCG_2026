/**
 * Update existing cards with supertype, types, and rarity from JSON
 */

import { PrismaClient, Supertype, PokemonType, Rarity } from '@ptcg/database';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TYPE_MAP: Record<string, PokemonType> = {
  'COLORLESS': PokemonType.COLORLESS,
  'DARKNESS': PokemonType.DARKNESS,
  'DRAGON': PokemonType.DRAGON,
  'FAIRY': PokemonType.FAIRY,
  'FIGHTING': PokemonType.FIGHTING,
  'FIRE': PokemonType.FIRE,
  'GRASS': PokemonType.GRASS,
  'LIGHTNING': PokemonType.LIGHTNING,
  'METAL': PokemonType.METAL,
  'PSYCHIC': PokemonType.PSYCHIC,
  'WATER': PokemonType.WATER,
};

async function updateCardsFromJSON() {
  const jsonPath = path.join(__dirname, '..', 'data', 'cards', 'japan', 'japanese_cards_40k_sv8.json');
  
  console.log('Reading JSON file...');
  const cards = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  
  console.log(`Found ${cards.length} cards in JSON`);
  
  let updated = 0;
  let notFound = 0;
  
  for (const card of cards) {
    try {
      // Map enum values
      const supertype = card.supertype as Supertype;
      const types = (card.pokemonTypes || []).map((t: string) => TYPE_MAP[t] || t as PokemonType);
      const rarity = card.rarity as Rarity;
      
      await prisma.card.update({
        where: { webCardId: card.webCardId },
        data: {
          supertype,
          types,
          rarity,
        },
      });
      
      updated++;
      if (updated % 10 === 0) {
        console.log(`Updated ${updated} cards...`);
      }
    } catch (error) {
      notFound++;
      // Card doesn't exist or other error
    }
  }
  
  console.log(`\nUpdate complete:`);
  console.log(`- Updated: ${updated}`);
  console.log(`- Not found: ${notFound}`);
  
  // Verify
  const sample = await prisma.card.findMany({
    where: { supertype: Supertype.POKEMON },
    take: 3,
    select: { name: true, supertype: true, types: true, rarity: true },
  });
  
  console.log('\nSample Pokemon cards:');
  console.log(JSON.stringify(sample, null, 2));
}

updateCardsFromJSON()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
