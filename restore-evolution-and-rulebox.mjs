import { PrismaClient } from './packages/database/node_modules/.prisma/client/index.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const prisma = new PrismaClient();

async function updateEvolutionAndRuleBox() {
  console.log('Starting evolution stage and ruleBox restoration...\n');

  const cardsDir = join(process.cwd(), 'data', 'cards', 'japan');
  const files = await readdir(cardsDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  console.log(`Found ${jsonFiles.length} JSON files to process\n`);

  let totalCards = 0;
  let updatedEvolution = 0;
  let updatedRuleBox = 0;
  let errors = 0;

  for (const file of jsonFiles) {
    const filePath = join(cardsDir, file);
    const content = await readFile(filePath, 'utf-8');
    const cards = JSON.parse(content);

    console.log(`Processing ${file} (${cards.length} cards)...`);

    for (const card of cards) {
      totalCards++;
      const webCardId = card.webCardId;

      if (!webCardId) {
        console.log(`  ⚠️  Card missing webCardId, skipping`);
        errors++;
        continue;
      }

      try {
        const updateData = {};

        // Map evolution stage (only for Pokemon)
        if (card.evolutionStage && card.supertype === 'POKEMON') {
          const evolutionStageMap = {
            '1進化': 'STAGE_1',
            '2進化': 'STAGE_2',
            'たね': 'BASIC',
            'BASIC': 'BASIC',
            'STAGE_1': 'STAGE_1',
            'STAGE_2': 'STAGE_2'
          };

          const mappedEvolution = evolutionStageMap[card.evolutionStage];
          if (mappedEvolution) {
            updateData.evolutionStage = mappedEvolution;
          }
        }

        // Map ruleBox from card name or ruleBox field
        if (card.ruleBox) {
          // Scraper may have already extracted it
          updateData.ruleBox = card.ruleBox;
        } else if (card.name) {
          // Extract from card name
          const ruleBoxMatch = card.name.match(/(VMAX|VSTAR|GX|EX|V)$/);
          if (ruleBoxMatch) {
            updateData.ruleBox = ruleBoxMatch[1];
          } else if (card.name.match(/^かがやく/)) {
            updateData.ruleBox = 'RADIANT';
          } else if (card.name.match(/M([^a-z]|$)/)) {
            updateData.ruleBox = 'MEGA';
          }
        }

        // Only update if we have data
        if (Object.keys(updateData).length > 0) {
          await prisma.card.update({
            where: { webCardId },
            data: updateData
          });

          if (updateData.evolutionStage) updatedEvolution++;
          if (updateData.ruleBox) updatedRuleBox++;
        }

      } catch (error) {
        console.log(`  ❌ Error updating ${webCardId}: ${error.message}`);
        errors++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary:');
  console.log('='.repeat(60));
  console.log(`Total cards processed:           ${totalCards}`);
  console.log(`Cards with evolutionStage set:   ${updatedEvolution}`);
  console.log(`Cards with ruleBox set:          ${updatedRuleBox}`);
  console.log(`Errors:                          ${errors}`);
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

updateEvolutionAndRuleBox().catch(console.error);
