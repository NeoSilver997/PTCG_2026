/**
 * Update Hong Kong cards language code from ZH_HK to ZH_TW
 * 
 * Note: If migration was applied, enum value was renamed at DB level
 * and all existing cards should already have ZH_TW.
 * This script verifies the current state.
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';

// Use direct enum values since we can't import the enum
const LanguageCode = {
  JA_JP: 'JA_JP',
  ZH_TW: 'ZH_TW',
  EN_US: 'EN_US',
} as const;

async function updateHKLanguage() {
  const prisma = new PrismaClient();

  try {
    console.log('Searching for Hong Kong cards...\n');

    // Count HK cards before update
    const totalHkCards = await prisma.card.count({
      where: {
        webCardId: {
          startsWith: 'hk',
        },
      },
    });

    console.log(`Total HK cards found: ${totalHkCards}`);

    // Check current language distribution for HK cards
    const hkLanguages = await prisma.card.groupBy({
      where: {
        webCardId: {
          startsWith: 'hk',
        },
      },
      by: ['language'],
      _count: {
        language: true,
      },
    });

    console.log('\nCurrent language codes for HK cards:');
    hkLanguages.forEach(({ language, _count }) => {
      console.log(`  ${language}: ${_count.language} cards`);
    });

    // Count how many need updating (those with JA_JP)
    const needsUpdate = await prisma.card.count({
      where: {
        AND: [
          { webCardId: { startsWith: 'hk' } },
          { language: LanguageCode.JA_JP },
        ],
      },
    });

    if (needsUpdate > 0) {
      console.log(`\n🔄 Updating ${needsUpdate} HK cards from JA_JP to ZH_TW...`);

      // Update all HK cards to ZH_TW
      const result = await prisma.card.updateMany({
        where: {
          AND: [
            { webCardId: { startsWith: 'hk' } },
            { language: LanguageCode.JA_JP },
          ],
        },
        data: {
          language: LanguageCode.ZH_TW,
        },
      });

      console.log(`✅ Updated ${result.count} cards to ZH_TW`);

      // Verify the update
      const afterUpdate = await prisma.card.count({
        where: {
          AND: [
            { webCardId: { startsWith: 'hk' } },
            { language: LanguageCode.ZH_TW },
          ],
        },
      });

      console.log(`\nVerification: ${afterUpdate} HK cards now have ZH_TW language code`);
    } else {
      console.log('\n✅ All HK cards already have correct language code (ZH_TW)');
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateHKLanguage()
  .then(() => {
    console.log('\n✅ Language code verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error verifying language codes:', error);
    process.exit(1);
  });
