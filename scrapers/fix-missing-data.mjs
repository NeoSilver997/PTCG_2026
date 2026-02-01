// Comprehensive script to fix all cards with missing supertype/types from JSON files
import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Type mapping from JSON to Prisma enum
const TYPE_MAP = {
  'GRASS': 'GRASS',
  'FIRE': 'FIRE',
  'WATER': 'WATER',
  'LIGHTNING': 'LIGHTNING',
  'PSYCHIC': 'PSYCHIC',
  'FIGHTING': 'FIGHTING',
  'DARKNESS': 'DARKNESS',
  'METAL': 'METAL',
  'FAIRY': 'FAIRY',
  'DRAGON': 'DRAGON',
  'COLORLESS': 'COLORLESS',
};

const SUPERTYPE_MAP = {
  'POKEMON': 'POKEMON',
  'TRAINER': 'TRAINER',
  'ENERGY': 'ENERGY',
};

const RARITY_MAP = {
  'C': 'COMMON',
  'COMMON': 'COMMON',
  'U': 'UNCOMMON',
  'UNCOMMON': 'UNCOMMON',
  'R': 'RARE',
  'RARE': 'RARE',
  'RR': 'DOUBLE_RARE',
  'DOUBLE_RARE': 'DOUBLE_RARE',
  'RRR': 'ULTRA_RARE',
  'ULTRA_RARE': 'ULTRA_RARE',
  'AR': 'ILLUSTRATION_RARE',
  'ILLUSTRATION_RARE': 'ILLUSTRATION_RARE',
  'SAR': 'SPECIAL_ILLUSTRATION_RARE',
  'SPECIAL_ILLUSTRATION_RARE': 'SPECIAL_ILLUSTRATION_RARE',
  'UR': 'HYPER_RARE',
  'HYPER_RARE': 'HYPER_RARE',
  'PROMO': 'PROMO',
  'SR': 'SHINY_RARE',
  'SHINY_RARE': 'SHINY_RARE',
  'ACE': 'ACE_SPEC',
  'ACE_SPEC': 'ACE_SPEC',
};

async function loadAllJsonFiles() {
  const cardsDir = path.join(__dirname, '../data/cards/japan');
  const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json'));
  
  console.log(`Found ${files.length} JSON files in ${cardsDir}\n`);
  
  const allCards = new Map(); // webCardId -> card data
  
  for (const file of files) {
    const filePath = path.join(cardsDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    if (Array.isArray(content)) {
      content.forEach(card => {
        allCards.set(card.webCardId, card);
      });
    }
  }
  
  console.log(`Loaded ${allCards.size} unique cards from JSON files\n`);
  return allCards;
}

async function fixMissingData() {
  console.log('Starting comprehensive data fix...\n');
  console.log('='.repeat(80));
  
  // Load all JSON data
  const jsonCards = await loadAllJsonFiles();
  
  // Get all cards from database that need fixing
  const cardsNeedingFix = await prisma.card.findMany({
    where: {
      OR: [
        { supertype: null },
        {
          AND: [
            { supertype: 'POKEMON' },
            { types: { isEmpty: true } }
          ]
        }
      ]
    },
    select: {
      id: true,
      webCardId: true,
      name: true,
      supertype: true,
      types: true,
      rarity: true,
    }
  });
  
  console.log(`Found ${cardsNeedingFix.length} cards needing fixes in database\n`);
  
  const stats = {
    total: cardsNeedingFix.length,
    updated: 0,
    noJsonData: 0,
    pokemonWithoutTypes: 0,
    errors: [],
  };
  
  for (const dbCard of cardsNeedingFix) {
    try {
      const jsonCard = jsonCards.get(dbCard.webCardId);
      
      if (!jsonCard) {
        stats.noJsonData++;
        console.log(`⚠️  No JSON data for: ${dbCard.webCardId} (${dbCard.name})`);
        continue;
      }
      
      // Prepare update data
      const updateData = {};
      
      // Fix supertype
      if (!dbCard.supertype && jsonCard.supertype) {
        const mappedSupertype = SUPERTYPE_MAP[jsonCard.supertype];
        if (mappedSupertype) {
          updateData.supertype = mappedSupertype;
        }
      }
      
      // Fix types for Pokemon - use first type only
      if (jsonCard.supertype === 'POKEMON' && jsonCard.pokemonTypes && jsonCard.pokemonTypes.length > 0) {
        const firstType = jsonCard.pokemonTypes[0];
        const mappedType = TYPE_MAP[firstType];
        
        if (mappedType) {
          updateData.types = mappedType;
        } else {
          stats.pokemonWithoutTypes++;
          console.log(`⚠️  Pokemon without valid type: ${dbCard.webCardId} (${dbCard.name})`);
        }
      }
      
      // Fix rarity if missing
      if (!dbCard.rarity && jsonCard.rarity) {
        const mappedRarity = RARITY_MAP[jsonCard.rarity];
        if (mappedRarity) {
          updateData.rarity = mappedRarity;
        }
      }
      
      // Update if we have data to update
      if (Object.keys(updateData).length > 0) {
        await prisma.card.update({
          where: { id: dbCard.id },
          data: updateData,
        });
        
        stats.updated++;
        
        const updates = [];
        if (updateData.supertype) updates.push(`supertype=${updateData.supertype}`);
        if (updateData.types) updates.push(`types=${updateData.types}`);
        if (updateData.rarity) updates.push(`rarity=${updateData.rarity}`);
        
        console.log(`✅ ${dbCard.webCardId.padEnd(12)} | ${dbCard.name.padEnd(30)} | ${updates.join(', ')}`);
      }
      
    } catch (error) {
      stats.errors.push(`${dbCard.webCardId}: ${error.message}`);
      console.error(`❌ Error updating ${dbCard.webCardId}:`, error.message);
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('FIX SUMMARY:');
  console.log('='.repeat(80));
  console.log(`Total cards processed: ${stats.total}`);
  console.log(`Successfully updated: ${stats.updated}`);
  console.log(`No JSON data found: ${stats.noJsonData}`);
  console.log(`Pokemon without types: ${stats.pokemonWithoutTypes}`);
  console.log(`Errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  // Verify fix
  console.log('\n' + '='.repeat(80));
  console.log('VERIFICATION:');
  console.log('='.repeat(80));
  
  const stillMissingSuper = await prisma.card.count({
    where: { supertype: null }
  });
  
  const pokemonMissingTypes = await prisma.card.count({
    where: {
      supertype: 'POKEMON',
      types: { isEmpty: true }
    }
  });
  
  console.log(`Cards still with NULL supertype: ${stillMissingSuper}`);
  console.log(`Pokemon still without types: ${pokemonMissingTypes}`);
  
  if (stillMissingSuper === 0 && pokemonMissingTypes === 0) {
    console.log('\n🎉 All issues fixed!');
  } else {
    console.log('\n⚠️  Some issues remain - may need manual review');
  }
}

fixMissingData()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
