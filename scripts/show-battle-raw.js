const { PrismaClient } = require('../packages/database/node_modules/.prisma/client');
(async () => {
  const prisma = new PrismaClient();
  const id = 'cmlbrxxuo0003mvrgzs48urdn';
  try {
    const b = await prisma.battleLog.findUnique({ where: { id }, select: { rawLog: true } });
    if (!b) return console.log('Not found');
    const lines = b.rawLog.split('\n').map(l => l.trim()).filter(Boolean);
    console.log(lines.slice(0, 120).join('\n'));
  } finally {
    await prisma.$disconnect();
  }
})();
