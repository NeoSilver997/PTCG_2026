/**
 * map-hk-to-jp.ts
 *
 * Maps Hong Kong (ZH_TW) cards to their Japanese (JA_JP) counterparts.
 * 
 * Strategy:
 *   Primary key:  expansionCode + collectorNumber (most sets share identical collector IDs)
 *   Cross-check:  pokedexNumber must match when both cards are Pokémon
 *
 * Actions:
 *   1. Dry-run (default): Report matches/mismatches/unmatched — no DB changes
 *   2. Apply  (--apply):  Update HK card.primaryCardId → JP card's PrimaryCard
 *                          Delete orphaned HK-only PrimaryCards
 *
 * Usage:
 *   npx tsx scrapers/map-hk-to-jp.ts                    # dry-run report
 *   npx tsx scrapers/map-hk-to-jp.ts --apply            # apply (interactive confirm)
 *   npx tsx scrapers/map-hk-to-jp.ts --apply --yes      # apply without prompt
 *
 * Field sync (JP → HK):
 *   rarity, regulationMark, variantType  — always overwritten with JP value (JP is authoritative)
 *   artist, evolvesFrom, ruleBox, subtypes — fill only when HK is null/empty
 * Field sync (HK → JP):
 *   regulationMark — HK scraper has it; fill JP when JP is null/empty
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const YES   = process.argv.includes('--yes');   // skip interactive prompt

// ─────────────────────────────────────────────
// 1. Load source JSON files
// ─────────────────────────────────────────────

interface SourceCard {
  webCardId: string;
  name: string;
  expansionCode: string;
  collectorNumber: string;
  supertype?: string;
  pokedexNumber?: number | null;
  variantType?: string;
}

function normalizeExpansion(code: string): string {
  return code.toUpperCase();
}

function normalizeCollector(coll: string): string {
  // "001/100" → "001"  |  "001" → "001"
  return coll.split('/')[0].trim();
}

function loadJsonFiles(dir: string, prefix: string): SourceCard[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
  const all: SourceCard[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      for (const c of raw) {
        if (!c.webCardId || !c.expansionCode || !c.collectorNumber) continue;
        all.push({
          webCardId: c.webCardId,
          name: c.name,
          expansionCode: normalizeExpansion(c.expansionCode),
          collectorNumber: normalizeCollector(c.collectorNumber),
          supertype: c.supertype,
          pokedexNumber: c.pokedexNumber ?? null,
          variantType: (c.variantType || 'NORMAL').toUpperCase(),
        });
      }
    } catch (e) {
      console.warn(`  ⚠ Could not read ${file}: ${e}`);
    }
  }
  return all;
}

// ─────────────────────────────────────────────
// 2. Main logic
// ─────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log(`HK → JP Card Mapping${APPLY ? ' [APPLY MODE]' : ' [DRY RUN]'}`);
  console.log('='.repeat(60));

  // ── Load JSON sources ──
  const hkDir = 'data/cards/hongkong';
  const jpDir = 'data/cards/japan';
  const jpRoot = '.'; // root-level japanese_cards_*.json files

  console.log('\nLoading HK JSON files...');
  const hkCards = loadJsonFiles(hkDir, 'hk_cards_');
  console.log(`  Loaded ${hkCards.length} HK cards from ${hkDir}`);

  console.log('Loading JP JSON files...');
  const jpCards40k = loadJsonFiles(path.join(jpDir), 'japanese_cards_40k_');
  const jpCardsDir = loadJsonFiles(path.join(jpDir), 'japanese_cards_');  // non-40k files in data/cards/japan
  const jpCardsRoot = loadJsonFiles(jpRoot, 'japanese_cards_');
  // 40k files take priority (more complete); data/cards/japan non-40k next; root files as last fallback
  const jpCards = [...jpCards40k, ...jpCardsDir, ...jpCardsRoot];
  console.log(`  Loaded ${jpCards.length} JP cards (${jpCards40k.length} 40k + ${jpCardsDir.length} non-40k from data/cards/japan, ${jpCardsRoot.length} from root)`);

  // ── Build JP lookup: {EXPANSION}:{COLLECTOR_NUM}:{VARIANT} → SourceCard ──
  type LookupKey = string; // `${expansion}:${collectorNum}:${variantType}`
  const jpLookup = new Map<LookupKey, SourceCard>();
  const jpLookupAny = new Map<string, SourceCard>(); // without variant

  for (const c of jpCards) {
    const key = `${c.expansionCode}:${c.collectorNumber}:${c.variantType}`;
    const keyBase = `${c.expansionCode}:${c.collectorNumber}`;
    if (!jpLookup.has(key)) jpLookup.set(key, c);
    if (!jpLookupAny.has(keyBase)) jpLookupAny.set(keyBase, c);
  }

  // ── Query DB for HK and JP cards ──
  console.log('\nQuerying DB...');
  // Fields we will sync from JP → HK when HK value is null/empty
  const SYNC_SELECT = {
    id: true, webCardId: true, primaryCardId: true, variantType: true,
    // syncable fields:
    rarity: true, regulationMark: true, subtypes: true, evolvesFrom: true, artist: true, ruleBox: true,
    primaryCard: {
      select: { id: true, cardNumber: true, primaryExpansion: { select: { code: true } } },
    },
  } as const;

  const [dbHK, dbJP] = await Promise.all([
    prisma.card.findMany({ where: { language: 'ZH_TW' }, select: SYNC_SELECT }),
    prisma.card.findMany({ where: { language: 'JA_JP' }, select: SYNC_SELECT }),
  ]);

  // Build JP DB lookup: webCardId → { primaryCardId, syncable fields }
  const jpDbByWebId = new Map<string, typeof dbJP[number]>();
  for (const c of dbJP) jpDbByWebId.set(c.webCardId, c);

  // ── Match HK JSON cards to JP JSON cards ──
  const hkSrcByWebId = new Map<string, SourceCard>();
  for (const c of hkCards) hkSrcByWebId.set(c.webCardId, c);

  const jpSrcByWebId = new Map<string, SourceCard>();
  for (const c of jpCards) jpSrcByWebId.set(c.webCardId, c);

  // ── Expansions with known HK/JP collector-number offsets ──
  // These sets have different card counts between HK and JP (HK is a subset
  // of JP collector numbers), so they falsely appear as 100%-match but
  // would be mapped INCORRECTLY by collector number.  They are handled by
  // dedicated fix scripts (_fix_svk_hk_mappings.ts, _fix_svhk_hk_mappings.ts).
  const OFFSET_EXPANSIONS = new Set(['SVK', 'SVHK']);

  // ── Compute per-expansion match rates (100%-only filter) ──
  // Group all HK JSON cards by expansion code and count JP matches per expansion
  const expTotal = new Map<string, number>();
  const expMatched = new Map<string, number>();
  for (const c of hkCards) {
    const exp = c.expansionCode;
    expTotal.set(exp, (expTotal.get(exp) ?? 0) + 1);
    const keyBase = `${exp}:${c.collectorNumber}`;
    if (jpLookupAny.has(keyBase)) {
      expMatched.set(exp, (expMatched.get(exp) ?? 0) + 1);
    }
  }
  const fullMatchExpansions = new Set<string>();
  for (const [exp, total] of expTotal) {
    if (OFFSET_EXPANSIONS.has(exp)) continue; // skip known offset expansions
    const matched100 = expMatched.get(exp) ?? 0;
    if (matched100 === total) fullMatchExpansions.add(exp);
  }
  console.log(`\n100%-match expansions: ${fullMatchExpansions.size} of ${expTotal.size} total HK expansions`);
  console.log(`Excluded (known offset): ${[...OFFSET_EXPANSIONS].filter(e => expTotal.has(e)).join(', ')}`);
  console.log(`Skipping ${expTotal.size - fullMatchExpansions.size - [...OFFSET_EXPANSIONS].filter(e => expTotal.has(e)).length} expansions with partial JP coverage.`);

  // Stats
  let matched = 0;
  let matchedWithPokedexOK = 0;
  let matchedWithPokedexMismatch = 0;
  let unmatchedHK = 0;
  let skippedNon100 = 0;
  let noJPInDB = 0;
  let alreadyLinked = 0;

  // Map: hkDbCardId → jpPrimaryCardId + fields to sync (for DB update)
  const updates: {
    hkCardDbId: string;
    hkWebCardId: string;
    jpWebCardId: string;
    jpCardDbId: string;
    jpPrimaryCardId: string;
    syncFields: Record<string, unknown>;
  }[] = [];
  // Reverse sync: JP card updates from HK data
  const jpUpdates: { jpCardDbId: string; jpWebCardId: string; syncFields: Record<string, unknown> }[] = [];
  const jpUpdateSet = new Set<string>(); // avoid duplicate JP updates
  const pokedexMismatches: { hkWebId: string; jpWebId: string; hkDex: number | null; jpDex: number | null; expansion: string; collNum: string }[] = [];
  const notInJsonHK: string[] = [];
  const notMatchedInJP: { webId: string; expansion: string; collNum: string }[] = [];

  for (const dbHKCard of dbHK) {
    const hkSrc = hkSrcByWebId.get(dbHKCard.webCardId);
    if (!hkSrc) {
      notInJsonHK.push(dbHKCard.webCardId);
      continue;
    }

    // Skip cards in expansions that don't have 100% JP coverage
    if (!fullMatchExpansions.has(hkSrc.expansionCode)) {
      skippedNon100++;
      continue;
    }

    const variant = dbHKCard.variantType || 'NORMAL';
    const key = `${hkSrc.expansionCode}:${hkSrc.collectorNumber}:${variant}`;
    const keyBase = `${hkSrc.expansionCode}:${hkSrc.collectorNumber}`;

    // Try exact variant match first, then any variant
    const jpSrc = jpLookup.get(key) ?? jpLookupAny.get(keyBase) ?? null;

    if (!jpSrc) {
      unmatchedHK++;
      if (notMatchedInJP.length < 50) {
        notMatchedInJP.push({ webId: dbHKCard.webCardId, expansion: hkSrc.expansionCode, collNum: hkSrc.collectorNumber });
      }
      continue;
    }

    // Cross-check pokedexNumber — mismatch is a WARNING only (HK source data often has wrong dex numbers)
    // We still proceed with the collector-number match; just log it for review
    if (
      hkSrc.supertype === 'POKEMON' &&
      jpSrc.supertype === 'POKEMON' &&
      hkSrc.pokedexNumber != null &&
      jpSrc.pokedexNumber != null &&
      hkSrc.pokedexNumber !== jpSrc.pokedexNumber
    ) {
      matchedWithPokedexMismatch++;
      pokedexMismatches.push({
        hkWebId: dbHKCard.webCardId,
        jpWebId: jpSrc.webCardId,
        hkDex: hkSrc.pokedexNumber,
        jpDex: jpSrc.pokedexNumber,
        expansion: hkSrc.expansionCode,
        collNum: hkSrc.collectorNumber,
      });
      // NOTE: Do NOT continue — we still apply the match (dex data in HK JSON is unreliable)
    }

    // Find JP card in DB
    const jpDbCard = jpDbByWebId.get(jpSrc.webCardId);
    if (!jpDbCard) {
      noJPInDB++;
      continue;
    }
    const jpPrimaryCardId = jpDbCard.primaryCardId;

    // Already correctly mapped?
    const alreadyMapped = dbHKCard.primaryCardId === jpPrimaryCardId;
    if (alreadyMapped) {
      alreadyLinked++;
    } else {
      matched++;
      if (
        hkSrc.pokedexNumber != null &&
        jpSrc.pokedexNumber != null &&
        hkSrc.pokedexNumber === jpSrc.pokedexNumber
      ) {
        matchedWithPokedexOK++;
      }
    }

    // Compute fields to sync from JP → HK
    // rarity + regulationMark + variantType: JP is authoritative — always overwrite HK if JP has a value
    // other fields: fill nulls/empty on HK only
    const syncFields: Record<string, unknown> = {};
    if (jpDbCard.rarity     && dbHKCard.rarity     !== jpDbCard.rarity)     syncFields.rarity     = jpDbCard.rarity;
    if (jpDbCard.variantType && dbHKCard.variantType !== jpDbCard.variantType) syncFields.variantType = jpDbCard.variantType;
    if (jpDbCard.regulationMark && dbHKCard.regulationMark !== jpDbCard.regulationMark) syncFields.regulationMark = jpDbCard.regulationMark;
    if (!dbHKCard.artist     && jpDbCard.artist)     syncFields.artist     = jpDbCard.artist;
    if (!dbHKCard.evolvesFrom && jpDbCard.evolvesFrom) syncFields.evolvesFrom = jpDbCard.evolvesFrom;
    if (!dbHKCard.ruleBox    && jpDbCard.ruleBox)    syncFields.ruleBox    = jpDbCard.ruleBox;
    if ((!dbHKCard.subtypes || dbHKCard.subtypes.length === 0) && jpDbCard.subtypes && jpDbCard.subtypes.length > 0)
      syncFields.subtypes = jpDbCard.subtypes;

    // Reverse sync: HK → JP for regulationMark (HK scraper has it; JP scraper doesn't)
    const jpSyncFields: Record<string, unknown> = {};
    if (!jpDbCard.regulationMark && dbHKCard.regulationMark) jpSyncFields.regulationMark = dbHKCard.regulationMark;
    if (Object.keys(jpSyncFields).length > 0 && !jpUpdateSet.has(jpDbCard.id)) {
      jpUpdateSet.add(jpDbCard.id);
      jpUpdates.push({ jpCardDbId: jpDbCard.id, jpWebCardId: jpDbCard.webCardId, syncFields: jpSyncFields });
    }

    // Only queue an update if there's something to do
    if (!alreadyMapped || Object.keys(syncFields).length > 0) {
      updates.push({
        hkCardDbId: dbHKCard.id,
        hkWebCardId: dbHKCard.webCardId,
        jpWebCardId: jpSrc.webCardId,
        jpCardDbId: jpDbCard.id,
        jpPrimaryCardId,
        syncFields,
      });
    }
  }

  // ─────────────────────────────────────────────
  // 3. Report
  // ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`HK cards in DB:                ${dbHK.length}`);
  console.log(`HK cards in source JSON:       ${hkCards.length}`);
  console.log(`\nMatches found:`);
  console.log(`  ✅ Already correctly linked:  ${alreadyLinked}`);
  console.log(`  🔗 To be linked:              ${matched}`);
  console.log(`     (of which Pokédex ✓):      ${matchedWithPokedexOK}`);
  console.log(`\nSkipped / problems:`);
  console.log(`  ℹ️  Skipped (non-100% expansions):  ${skippedNon100}`);
  console.log(`  ⚠️  HK dex data issues (matched anyway): ${matchedWithPokedexMismatch}`);
  console.log(`  ⚠️  No JP match in JSON:        ${unmatchedHK}`);
  console.log(`  ⚠️  JP match in JSON but not DB:${noJPInDB}`);
  console.log(`  ⚠️  HK card not in source JSON: ${notInJsonHK.length}`);

  // Count sync field stats
  const syncStats: Record<string, number> = {};
  for (const u of updates) {
    for (const k of Object.keys(u.syncFields)) syncStats[k] = (syncStats[k] || 0) + 1;
  }
  if (Object.keys(syncStats).length > 0) {
    console.log('\nFields to sync from JP → HK:');
    for (const [k, n] of Object.entries(syncStats)) console.log(`  ${k}: ${n} cards`);
  }
  // Reverse sync stats (HK → JP)
  const jpSyncStats: Record<string, number> = {};
  for (const u of jpUpdates) {
    for (const k of Object.keys(u.syncFields)) jpSyncStats[k] = (jpSyncStats[k] || 0) + 1;
  }
  if (Object.keys(jpSyncStats).length > 0) {
    console.log('\nFields to sync from HK \u2192 JP:');
    for (const [k, n] of Object.entries(jpSyncStats)) console.log(`  ${k}: ${n} cards`);
  }
  if (pokedexMismatches.length > 0) {
    console.log('\n─── Pokédex Mismatches (first 10) ───');
    for (const m of pokedexMismatches.slice(0, 10)) {
      console.log(`  [${m.expansion}/${m.collNum}] HK:${m.hkWebId}(dex=${m.hkDex}) ≠ JP:${m.jpWebId}(dex=${m.jpDex})`);
    }
  }

  if (notMatchedInJP.length > 0) {
    console.log('\n─── Unmatched HK cards (first 20, no JP equivalent found) ───');
    for (const m of notMatchedInJP.slice(0, 20)) {
      console.log(`  ${m.webId} [${m.expansion}/${m.collNum}]`);
    }
  }

  // ─────────────────────────────────────────────
  // 4. Apply (if --apply)
  // ─────────────────────────────────────────────
  if (!APPLY) {
    console.log('\n' + '─'.repeat(60));
    console.log('DRY RUN complete. Run with --apply to apply changes.');
    console.log(`  npx tsx scrapers/map-hk-to-jp.ts --apply`);
    await prisma.$disconnect();
    return;
  }

  if (updates.length === 0 && jpUpdates.length === 0) {
    console.log('\nNo updates needed.');
    await prisma.$disconnect();
    return;
  }

  // Confirm (skip if --yes flag)
  if (!YES) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const totalChanges = updates.length + jpUpdates.length;
    const answer = await new Promise<string>(res => rl.question(`\nApply ${totalChanges} DB updates? (yes/no): `, res));
    rl.close();
    if (answer.toLowerCase() !== 'yes') {
      console.log('Aborted.');
      await prisma.$disconnect();
      return;
    }
  }

  console.log('\nApplying updates...');
  let applied = 0;
  let fieldsSynced = 0;
  const orphanedPrimaryCardIds = new Set<string>();

  // Collect HK primaryCardIds before update (for orphan cleanup)
  for (const u of updates) {
    const hkCard = dbHK.find(c => c.id === u.hkCardDbId)!;
    orphanedPrimaryCardIds.add(hkCard.primaryCardId);
  }

  // Batch update in chunks of 200
  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map(u => {
        const data: Record<string, unknown> = {
          primaryCardId: u.jpPrimaryCardId,
          ...u.syncFields,
        };
        if (Object.keys(u.syncFields).length > 0) fieldsSynced++;
        return prisma.card.update({ where: { id: u.hkCardDbId }, data });
      })
    );
    applied += chunk.length;
    process.stdout.write(`\r  Updated ${applied}/${updates.length} cards...`);
  }
  console.log(`\n✅ Linked ${applied} HK cards to JP PrimaryCards`);
  console.log(`✏️  Synced JP fields on ${fieldsSynced} HK cards`);

  // Apply HK → JP reverse sync (regulationMark)
  if (jpUpdates.length > 0) {
    console.log('\nApplying HK \u2192 JP reverse sync...');
    let jpApplied = 0;
    for (let i = 0; i < jpUpdates.length; i += CHUNK) {
      const chunk = jpUpdates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map(u => prisma.card.update({ where: { id: u.jpCardDbId }, data: u.syncFields }))
      );
      jpApplied += chunk.length;
      process.stdout.write(`\r  Updated ${jpApplied}/${jpUpdates.length} JP cards...`);
    }
    console.log(`\n✏️  Synced HK fields on ${jpApplied} JP cards`);
  }

  // Delete orphaned HK PrimaryCards (no longer referenced by any card)
  let deletedOrphans = 0;
  for (const pcId of orphanedPrimaryCardIds) {
    const remaining = await prisma.card.count({ where: { primaryCardId: pcId } });
    if (remaining === 0) {
      await prisma.primaryCard.delete({ where: { id: pcId } });
      deletedOrphans++;
    }
  }
  console.log(`🗑️  Deleted ${deletedOrphans} orphaned HK-only PrimaryCards`);

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
