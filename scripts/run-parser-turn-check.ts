(async () => {
  const { BattleLogParser } = require('../apps/api/src/battles/battle-log-parser');

  const fs = require('fs');
  const path = require('path');
  const glob = require('glob');
  const sampleFiles = glob.sync(path.join(__dirname, '..', 'sample-battle-log*.txt'));

  const mockPrisma = { card: { findFirst: async () => null } };
  const parser = new BattleLogParser(mockPrisma);

  for (const samplePath of sampleFiles) {
    const sample = fs.readFileSync(samplePath, 'utf8');
    const result = await parser.parseLogText(sample);

    const missingTurns = result.actions.filter((x: any) => x.actionType === 'TURN_START' && x.metadata?.missingActive);
    if (missingTurns.length > 0) {
      console.log(`\nFile: ${samplePath}`);
      for (const a of missingTurns) {
        console.log(JSON.stringify(a, null, 2));
      }
    }
  }

  console.log('\nScan complete.');
})();
