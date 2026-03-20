#!/usr/bin/env node

/**
 * Final Verification Script for Deck Meta-Summary Implementation
 * Checks all required files are in place and contain expected code
 */

import fs from 'fs';
import path from 'path';

const checks = [
  {
    name: 'Backend Service Method',
    file: 'apps/api/src/tournaments/tournaments.service.ts',
    search: 'async getDeckMetaSummary',
  },
  {
    name: 'Backend Controller Endpoint',
    file: 'apps/api/src/tournaments/tournaments.controller.ts',
    search: "@Get('meta/deck-summary')",
  },
  {
    name: 'Frontend Page Component',
    file: 'apps/web/src/app/deck-builder/meta-summary/page.tsx',
    search: 'DeckMetaSummaryPage',
  },
  {
    name: 'Feature Documentation',
    file: 'DECK_META_SUMMARY.md',
    search: 'Deck Meta-Summary Feature',
  },
  {
    name: 'Implementation Verification',
    file: 'IMPLEMENTATION_VERIFICATION.md',
    search: 'Production Ready',
  },
];

console.log('🔍 Verifying Deck Meta-Summary Implementation\n');

let allPassed = true;

for (const check of checks) {
  const filePath = path.join(process.cwd(), check.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${check.name}: File not found`);
    allPassed = false;
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(check.search)) {
    console.log(`✅ ${check.name}: OK`);
  } else {
    console.log(`❌ ${check.name}: Content not found (searched for "${check.search}")`);
    allPassed = false;
  }
}

console.log();
if (allPassed) {
  console.log('✨ All verification checks passed!');
  console.log('\nNext Steps:');
  console.log('1. Start API server: pnpm --filter @ptcg/api dev');
  console.log('2. Start Web app: pnpm --filter web dev');
  console.log('3. Open: http://localhost:3001/deck-builder/meta-summary');
  process.exit(0);
} else {
  console.log('⚠️  Some checks failed. Please review the errors above.');
  process.exit(1);
}
