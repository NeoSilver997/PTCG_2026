import { PrismaClient } from './packages/database/node_modules/.prisma/client/default.js';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Subtype mapping from Japanese to English enum
const SUBTYPE_MAP = {
  'BASIC': 'BASIC',
  'STAGE_1': 'STAGE_1',
  'STAGE_2': 'STAGE_2',
  'ITEM': 'ITEM',
  'SUPPORTER': 'SUPPORTER',
  'STADIUM': 'STADIUM',
  'TOOL': 'TOOL',
  'BASIC_ENERGY': 'BASIC_ENERGY',
  'SPECIAL_ENERGY': 'SPECIAL_ENERGY'
};

async function updateCardSubtypes() {
  try {
    console.log('🔍 Reading scraped JSON files...');
    
    const dataDir = path.join(process.cwd(), 'data', 'cards', 'japan');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    
    console.log(`📁 Found ${files.length} JSON files`);
    
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const cards = JSON.parse(content);
      
      console.log(`\n📄 Processing ${file} (${cards.length} cards)...`);
      
      for (const card of cards) {
        totalProcessed++;
        
        try {
          //  Old format: "subtype": "BASIC" (string)
          // New format: "subtypes": ["BASIC"] (array)
          const subtype = card.subtype;
          
          if (!subtype) {
            // Skip cards without subtype
            continue;
          }
          
          // Map to enum value
          const subtypeEnum = SUBTYPE_MAP[subtype];
          if (!subtypeEnum) {
            console.log(`⚠️  Unknown subtype: ${subtype} for card ${card.webCardId}`);
            continue;
          }
          
          // Update card in database
          const result = await prisma.card.updateMany({
            where: { webCardId: card.webCardId },
            data: {
              subtypes: [subtypeEnum]
            }
          });
          
          if (result.count > 0) {
            totalUpdated++;
            if (totalUpdated % 100 === 0) {
              console.log(`  ✅ Updated ${totalUpdated} cards...`);
            }
          }
          
        } catch (error) {
          totalErrors++;
          console.error(`❌ Error updating ${card.webCardId}:`, error.message);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log('='.repeat(60));
    console.log(`Total processed: ${totalProcessed}`);
    console.log(`Successfully updated: ${totalUpdated}`);
    console.log(`Errors: ${totalErrors}`);
    console.log('='.repeat(60));
    
    // Verify
    const cardsWithSubtypes = await prisma.card.count({
      where: {
        subtypes: {
          isEmpty: false
        }
      }
    });
    
    console.log(`\n✅ Cards with subtypes in database: ${cardsWithSubtypes}`);
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateCardSubtypes();
