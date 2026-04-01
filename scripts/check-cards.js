const { PrismaClient } = require('../packages/database/node_modules/.prisma/client');
const prisma = new PrismaClient();
prisma.card.findMany({
  where: { webCardId: { in: ['en24871', 'hk15263', 'jp50006'] } },
  select: {
    webCardId: true, name: true, language: true, variantType: true, primaryCardId: true,
    primaryCard: { select: { id: true, cardNumber: true, primaryExpansion: { select: { code: true } } } }
  }
}).then(r => { console.log(JSON.stringify(r, null, 2)); return prisma.$disconnect(); });
