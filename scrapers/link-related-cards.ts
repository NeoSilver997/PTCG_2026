/**
 * link-related-cards.ts
 * Links specific cards as related (named-card synergy).
 * Usage: npx tsx scrapers/link-related-cards.ts
 */
import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function main() {
  // jp50163 = アンジュフラエッテ (Stadium that buffs メガフラエッテex)
  // jp50119 = メガフラエッテex
  const pairs: Array<{ from: string; to: string; relationType: string; note: string }> = [
    {
      from: 'jp50163',
      to: 'jp50119',
      relationType: 'NAMED_CARD',
      note: 'アンジュフラエッテ 效果指名 メガフラエッテex (+150HP)',
    },
  ];

  for (const pair of pairs) {
    const fromCard = await prisma.card.findUnique({
      where: { webCardId: pair.from },
      select: { primaryCardId: true, name: true },
    });
    const toCard = await prisma.card.findUnique({
      where: { webCardId: pair.to },
      select: { primaryCardId: true, name: true },
    });

    if (!fromCard) { console.error(`Not found: ${pair.from}`); continue; }
    if (!toCard)   { console.error(`Not found: ${pair.to}`);   continue; }

    console.log(`Linking: ${fromCard.name} (${pair.from}) ↔ ${toCard.name} (${pair.to})`);

    // Upsert the relation (fromCard → toCard)
    const rel = await prisma.cardRelation.upsert({
      where: {
        fromCardId_toCardId: {
          fromCardId: fromCard.primaryCardId,
          toCardId:   toCard.primaryCardId,
        },
      },
      create: {
        fromCardId:   fromCard.primaryCardId,
        toCardId:     toCard.primaryCardId,
        relationType: pair.relationType,
        note:         pair.note,
      },
      update: {
        relationType: pair.relationType,
        note:         pair.note,
      },
    });

    console.log(`  ✅ RelationId: ${rel.id}  type: ${rel.relationType}`);
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
