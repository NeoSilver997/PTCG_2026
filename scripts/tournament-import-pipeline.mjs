#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const seedScript = resolve(root, 'scrapers/seed-tournaments.ts');
const mapExportScript = resolve(root, 'scripts/export-deck-code-map.ts');

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(seedScript)) {
  console.error('seed-tournaments.ts not found');
  process.exit(1);
}

const mode = process.argv[2] || 'import-new';
const eventIdArg = process.argv.find((a) => a.startsWith('--event-id='));
const limitArg = process.argv.find((a) => a.startsWith('--limit='));

if (mode === 'repair-all') {
  run('npx', ['tsx', './scrapers/seed-tournaments.ts', '--all', '--refresh-existing']);
} else if (mode === 'repair-event') {
  if (!eventIdArg) {
    console.error('repair-event mode requires --event-id=<id>');
    process.exit(1);
  }
  run('npx', ['tsx', './scrapers/seed-tournaments.ts', '--all', '--refresh-existing', eventIdArg]);
} else if (mode === 'import-new') {
  const args = ['tsx', './scrapers/seed-tournaments.ts'];
  if (limitArg) args.push(limitArg);
  run('npx', args);
} else {
  console.error('Unknown mode. Use: import-new | repair-all | repair-event');
  process.exit(1);
}

run('npx', ['tsx', mapExportScript]);
console.log('Tournament import pipeline complete.');
