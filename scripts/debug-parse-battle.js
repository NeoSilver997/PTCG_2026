const { PrismaClient } = require('../packages/database/node_modules/.prisma/client');
(async () => {
  const prisma = new PrismaClient();
  const id = 'cmlbrxxuo0003mvrgzs48urdn';
  try {
    const b = await prisma.battleLog.findUnique({ where: { id }, select: { rawLog: true } });
    if (!b) return console.log('Not found');
    const { BattleLogParser } = require('../apps/api/src/battles/battle-log-parser');
    const parser = new BattleLogParser({ card: { findFirst: async () => null } });
    const parsed = await parser.parseLogText(b.rawLog);
    console.log('First 30 actions:');
    for (const a of parsed.actions.slice(0, 40)) {
      console.log(`${a.actionType.padEnd(12)} | player=${a.player} | card=${a.cardName} | metadata=${JSON.stringify(a.metadata)}`);
    }

    console.log('\nTURN_START entries:');
    for (const t of parsed.actions.filter(x => x.actionType === 'TURN_START')) {
      console.log(JSON.stringify(t, null, 2));
    }

  } finally {
    await prisma.$disconnect();
  }
})();
