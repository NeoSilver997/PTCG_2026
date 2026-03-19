const { PrismaClient } = require('../packages/database/node_modules/.prisma/client');
(async () => {
  const prisma = new PrismaClient();
  try {
    const logs = await prisma.battleLog.findMany({ where: { rawLog: { not: null } }, select: { id: true, rawLog: true, matchTitle: true, player1Name: true, player2Name: true, createdAt: true } });
    if (!logs.length) {
      console.log('No battle logs with rawLog found.');
      return;
    }

    const { BattleLogParser } = require('../apps/api/src/battles/battle-log-parser');

    const results = [];
    for (const l of logs) {
      const parser = new BattleLogParser({ card: { findFirst: (opts) => prisma.card.findFirst(opts) } });
      const parsed = await parser.parseLogText(l.rawLog || '');
      const missing = parsed.actions.filter(a => a.actionType === 'TURN_START' && a.metadata?.missingActive);
      if (missing.length) {
        results.push({ id: l.id, matchTitle: l.matchTitle, createdAt: l.createdAt, player1: l.player1Name, player2: l.player2Name, missing });
      }
    }

    if (!results.length) {
      console.log('No battle logs with missing active at turn start found.');
    } else {
      console.log('Battle logs with missing active at turn start:');
      for (const r of results) {
        console.log(JSON.stringify(r, null, 2));
      }
    }
  } catch (err) {
    console.error('Error scanning DB:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
