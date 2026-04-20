/**
 * fix-effect-tags-manual.ts
 *
 * One-time script to correct misclassified effectTags on specific cards:
 *   - 特殊紅牌 (hk18898): remove 抽卡效果, 搜索效果
 *   - 超級皮可西ex: remove 棄牌區傷害加成
 *   - 變化之書: remove 棄牌區傷害加成
 *   - All cards: remove 特殊能量 (rule deleted)
 *
 * Usage:
 *   npx tsx scrapers/fix-effect-tags-manual.ts
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Fix 特殊紅牌 (hk18898) — remove 抽卡效果 and 搜索效果
  const specialRedCard = await prisma.card.findUnique({
    where: { webCardId: 'hk18898' },
    select: { primaryCardId: true },
  });

  if (specialRedCard) {
    const pc = await prisma.primaryCard.findUnique({
      where: { id: specialRedCard.primaryCardId },
      select: { id: true, name: true, effectTags: true },
    });
    if (pc) {
      const fixedTags = pc.effectTags.filter(t => !['抽卡效果', '搜索效果'].includes(t));
      await prisma.primaryCard.update({
        where: { id: pc.id },
        data: { effectTags: fixedTags },
      });
      console.log(`✔ ${pc.name}: removed 抽卡效果/搜索效果 → [${fixedTags.join(', ')}]`);
    }
  } else {
    console.warn('⚠ hk18898 not found');
  }

  // 2. Fix by primaryCard name for メガピクシーex (超級皮可西ex) and 変化の書 (變化之書)
  const nameFixList: [string, string[]][] = [
    ['メガピクシーex', ['棄牌區傷害加成']],
    ['変化の書',    ['棄牌區傷害加成']],
  ];

  for (const [name, tagsToRemove] of nameFixList) {
    const pc = await prisma.primaryCard.findFirst({
      where: { name },
      select: { id: true, name: true, effectTags: true },
    });
    if (pc) {
      const fixedTags = pc.effectTags.filter(t => !tagsToRemove.includes(t));
      await prisma.primaryCard.update({
        where: { id: pc.id },
        data: { effectTags: fixedTags },
      });
      console.log(`✔ ${pc.name}: removed [${tagsToRemove.join(', ')}] → [${fixedTags.join(', ')}]`);
    } else {
      console.warn(`⚠ PrimaryCard "${name}" not found`);
    }
  }

  // 3. Remove 特殊能量 from all cards that have it
  const withSpecialEnergy = await prisma.primaryCard.findMany({
    where: { effectTags: { has: '特殊能量' } },
    select: { id: true, name: true, effectTags: true },
  });

  if (withSpecialEnergy.length > 0) {
    await prisma.$transaction(
      withSpecialEnergy.map(pc =>
        prisma.primaryCard.update({
          where: { id: pc.id },
          data: { effectTags: pc.effectTags.filter(t => t !== '特殊能量') },
        })
      )
    );
    console.log(`✔ Removed 特殊能量 tag from ${withSpecialEnergy.length} cards: ${withSpecialEnergy.map(c => c.name).join(', ')}`);
  } else {
    console.log('ℹ No cards had 特殊能量 tag');
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
