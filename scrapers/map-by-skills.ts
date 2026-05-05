/**
 * map-by-skills.ts
 *
 * Maps HK-only PrimaryCards to their JP counterparts using a language-neutral
 * attack fingerprint computed fresh from the current DB content.
 *
 * Problem this solves:
 *   map-hk-to-jp.ts matches cards by expansionCode + collectorNumber.
 *   In some expansions (e.g. M4, AC2D) the HK collector numbers differ from JP,
 *   so those cards are skipped.  This script uses a fresh attack fingerprint
 *   (hash of attacks[].cost + attacks[].damage — language-neutral fields)
 *   as the matching key instead.
 *
 * Why NOT use PrimaryCard.skillsSignature:
 *   - That field is set at import time.  If abilities/attacks were null at import
 *     but later populated, the stored signature is stale and unreliable.
 *   - Trainer/energy cards (no attacks) all share the same empty signature.
 *   - This script computes a FRESH fingerprint from current DB content.
 *
 * Matching scope:
 *   Only Pokémon cards with at least one attack are matched.
 *   Attack cost (energy types) and damage are the same across languages.
 *   Trainer and energy cards are excluded — they have no attacks.
 *
 * Strategy:
 *   - "HK-only PrimaryCard" = a PrimaryCard with ≥1 ZH_TW card and zero JA_JP cards.
 *   - For each HK-only PrimaryCard, compute attackFingerprint from its ZH_TW card.
 *   - Find JP PrimaryCards in the same PrimaryExpansion with the same fingerprint.
 *   - Safe-match: exactly 1 JP candidate AND exactly 1 HK with that fingerprint → auto-matchable.
 *   - Ambiguous:  multiple JP or multiple HK share fingerprint → skip, report.
 *   - Unmatched:  no JP candidate or no attacks → skip, report.
 *
 * Actions:
 *   1. Dry-run (default): report matches / ambiguous / unmatched — no DB changes.
 *   2. Apply  (--apply):  re-point ZH_TW card.primaryCardId → JP PrimaryCard.id,
 *                         delete orphaned HK-only PrimaryCards.
 *
 * Usage:
 *   npx tsx scrapers/map-by-skills.ts                         # dry-run report
 *   npx tsx scrapers/map-by-skills.ts --apply                 # apply (interactive confirm)
 *   npx tsx scrapers/map-by-skills.ts --apply --yes           # apply without prompt
 *   npx tsx scrapers/map-by-skills.ts --expansion AC2D        # limit to one expansion
 *
 * Field sync (JP → HK):
 *   rarity, regulationMark, variantType  — always overwritten with JP value (JP is authoritative)
 *   artist, evolvesFrom, ruleBox, subtypes — fill only when HK is null/empty
 * Field sync (HK → JP):
 *   regulationMark — fill JP when JP is null/empty and HK has a value
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();
const APPLY       = process.argv.includes('--apply');
const YES         = process.argv.includes('--yes');
const EXP_IDX     = process.argv.indexOf('--expansion');
const FILTER_EXP: string | null = (
  EXP_IDX >= 0 && process.argv[EXP_IDX + 1] && !process.argv[EXP_IDX + 1].startsWith('--')
) ? process.argv[EXP_IDX + 1].toUpperCase() : null;

const CHUNK = 200;

// ─────────────────────────────────────────────────────────────
// Language-neutral attack fingerprint
// ─────────────────────────────────────────────────────────────

/**
 * Compute a fingerprint from attack cost + damage only.
 * These fields are identical across JP and ZH_TW prints of the same card.
 * Card name, attack name, and effect text are excluded (they are translated).
 *
 * Returns null if the card has no attacks (trainer/energy/Pokémon with no attacks stored).
 */
function computeAttackFingerprint(attacks: any): string | null {
  if (!attacks || !Array.isArray(attacks) || attacks.length === 0) return null;
  const normalized = attacks.map((a: any) => ({
    cost: [...(a.cost ?? [])].sort().join(','),
    damage: String(a.damage ?? ''),
  }));
  return JSON.stringify(normalized);
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface DbCard {
  id: string;
  primaryCardId: string;
  webCardId: string;
  language: string;
  variantType: string;
  rarity: string | null;
  regulationMark: string | null;
  artist: string | null;
  evolvesFrom: string | null;
  ruleBox: string | null;
  subtypes: string[];
  attacks: any;  // JSON — used to compute attack fingerprint
  hp: number | null;
  types: string[];
  supertype: string | null;
}

interface DbPrimaryCard {
  id: string;
  name: string;
  cardNumber: string | null;
  primaryExpansionId: string | null;
  expansionCode: string | null;      // joined from primary_expansions
  attackFingerprint: string | null;  // computed fresh from representative card's attacks
  cards: DbCard[];
}

// ─────────────────────────────────────────────────────────────
// Load DB data
// ─────────────────────────────────────────────────────────────

async function loadHKOnlyPrimaryCards(): Promise<DbPrimaryCard[]> {
  // PrimaryCards that have ≥1 ZH_TW card but zero JA_JP cards
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      pc.id, pc.name, pc."cardNumber", pc."primaryExpansionId",
      pe.code AS "expansionCode"
    FROM primary_cards pc
    LEFT JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId"
    WHERE EXISTS (
      SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = 'ZH_TW'
    )
    AND NOT EXISTS (
      SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = 'JA_JP'
    )
    ${FILTER_EXP ? `AND pe.code = '${FILTER_EXP}'` : ''}
    ORDER BY pe.code, pc.name
  `);

  if (rows.length === 0) return [];

  // Fetch all ZH_TW card details for these PrimaryCards
  const pcIds = rows.map((r: any) => r.id);
  const rawCards = await prisma.card.findMany({
    where: { primaryCardId: { in: pcIds }, language: 'ZH_TW' },
    select: {
      id: true, primaryCardId: true, webCardId: true, language: true,
      variantType: true, rarity: true, regulationMark: true,
      artist: true, evolvesFrom: true, ruleBox: true, subtypes: true,
      attacks: true, hp: true, types: true, supertype: true,
    },
  });

  // Compute attack fingerprint per PrimaryCard (use first non-null attacks found)
  const pcFingerprint = new Map<string, string | null>();
  for (const c of rawCards) {
    if (!pcFingerprint.has(c.primaryCardId)) {
      pcFingerprint.set(c.primaryCardId, computeAttackFingerprint(c.attacks));
    }
  }

  const cards = rawCards as unknown as DbCard[];

  // Index cards by primaryCardId
  const cardsByPCId = new Map<string, DbCard[]>();
  for (const c of cards) {
    const arr = cardsByPCId.get(c.primaryCardId) ?? [];
    arr.push(c);
    cardsByPCId.set(c.primaryCardId, arr);
  }

  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    cardNumber: r.cardNumber,
    primaryExpansionId: r.primaryExpansionId,
    expansionCode: r.expansionCode,
    attackFingerprint: pcFingerprint.get(r.id) ?? null,
    cards: cardsByPCId.get(r.id) ?? [],
  }));
}

async function loadJPPrimaryCardsByExpansion(expansionIds: string[]): Promise<Map<string, DbPrimaryCard[]>> {
  if (expansionIds.length === 0) return new Map();

  const placeholders = expansionIds.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT pc.id, pc.name, pc."cardNumber", pc."primaryExpansionId",
            pe.code AS "expansionCode"
     FROM primary_cards pc
     LEFT JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId"
     WHERE pc."primaryExpansionId" IN (${placeholders})
       AND EXISTS (
         SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = 'JA_JP'
       )
     ORDER BY pe.code, pc.name`,
    ...expansionIds
  );

  if (rows.length === 0) return new Map();

  // Fetch JA_JP cards for these PrimaryCards
  const pcIds = rows.map((r: any) => r.id);
  const rawJPCards = await prisma.card.findMany({
    where: { primaryCardId: { in: pcIds }, language: 'JA_JP' },
    select: {
      id: true, primaryCardId: true, webCardId: true, language: true,
      variantType: true, rarity: true, regulationMark: true,
      artist: true, evolvesFrom: true, ruleBox: true, subtypes: true,
      attacks: true, hp: true, types: true, supertype: true,
    },
  });

  // Compute attack fingerprint per JP PrimaryCard (use first non-null attacks found)
  const jpPcFingerprint = new Map<string, string | null>();
  for (const c of rawJPCards) {
    if (!jpPcFingerprint.has(c.primaryCardId)) {
      jpPcFingerprint.set(c.primaryCardId, computeAttackFingerprint(c.attacks));
    }
  }

  const cards = rawJPCards as unknown as DbCard[];

  const cardsByPCId = new Map<string, DbCard[]>();
  for (const c of cards) {
    const arr = cardsByPCId.get(c.primaryCardId) ?? [];
    arr.push(c);
    cardsByPCId.set(c.primaryCardId, arr);
  }

  const byExpansion = new Map<string, DbPrimaryCard[]>();
  for (const r of rows) {
    const expId = r.primaryExpansionId as string;
    const list = byExpansion.get(expId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      cardNumber: r.cardNumber,
      primaryExpansionId: r.primaryExpansionId,
      expansionCode: r.expansionCode,
      attackFingerprint: jpPcFingerprint.get(r.id) ?? null,
      cards: cardsByPCId.get(r.id) ?? [],
    });
    byExpansion.set(expId, list);
  }
  return byExpansion;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log(`Skills-based HK → JP Mapping${APPLY ? ' [APPLY MODE]' : ' [DRY RUN]'}`);
  if (FILTER_EXP) console.log(`Expansion filter: ${FILTER_EXP}`);
  console.log('='.repeat(60));

  // ── Load HK-only PrimaryCards ──
  console.log('\nQuerying HK-only PrimaryCards from DB...');
  const hkOnlyCards = await loadHKOnlyPrimaryCards();
  console.log(`  Found ${hkOnlyCards.length} HK-only PrimaryCards`);
  if (hkOnlyCards.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  // ── Collect unique expansionIds to fetch JP cards ──
  const expansionIds = [...new Set(
    hkOnlyCards.map(c => c.primaryExpansionId).filter(Boolean) as string[]
  )];
  console.log(`  Spanning ${expansionIds.length} expansions`);

  // ── Load JP PrimaryCards grouped by expansion ──
  console.log('Querying JP PrimaryCards from DB...');
  const jpByExpansion = await loadJPPrimaryCardsByExpansion(expansionIds);
  const totalJP = [...jpByExpansion.values()].reduce((s, a) => s + a.length, 0);
  console.log(`  Found ${totalJP} JP PrimaryCards across matching expansions`);

  // ── Build per-expansion lookup: attackFingerprint → JP PrimaryCards[] ──
  // Maps expansionId → Map<fingerprint, DbPrimaryCard[]>
  // Only JP cards with non-null fingerprint (i.e. have real attacks) are indexed.
  const jpFpLookup = new Map<string, Map<string, DbPrimaryCard[]>>();
  for (const [expId, jpCards] of jpByExpansion) {
    const fpMap = new Map<string, DbPrimaryCard[]>();
    for (const jp of jpCards) {
      if (jp.attackFingerprint === null) continue; // trainer/energy — no fingerprint
      const arr = fpMap.get(jp.attackFingerprint) ?? [];
      arr.push(jp);
      fpMap.set(jp.attackFingerprint, arr);
    }
    jpFpLookup.set(expId, fpMap);
  }

  // ── Build per-expansion HK fingerprint count: expansionId → Map<fp, HK count> ──
  // Used to detect "many HK → 1 JP" false-positives
  const hkFpCount = new Map<string, Map<string, number>>();
  for (const hk of hkOnlyCards) {
    if (!hk.primaryExpansionId || hk.attackFingerprint === null) continue;
    const fpMap = hkFpCount.get(hk.primaryExpansionId) ?? new Map<string, number>();
    fpMap.set(hk.attackFingerprint, (fpMap.get(hk.attackFingerprint) ?? 0) + 1);
    hkFpCount.set(hk.primaryExpansionId, fpMap);
  }

  // ── Match each HK-only PrimaryCard ──
  type UpdateRecord = {
    hkPrimaryCardId: string;   // HK PrimaryCard to delete after re-pointing
    hkPrimaryCardName: string; // HK card name (for reporting)
    hkCards: DbCard[];         // ZH_TW cards to re-point
    jpPrimaryCard: DbPrimaryCard;
    jpCard: DbCard | null;     // representative JP card for field sync
  };

  const updates: UpdateRecord[] = [];
  const ambiguous: { hkName: string; expansion: string; fp: string; jpCandidates: string[] }[] = [];
  const unmatched: { hkName: string; expansion: string; reason: string }[] = [];
  const noExpansion: string[] = [];

  for (const hk of hkOnlyCards) {
    if (!hk.primaryExpansionId) {
      noExpansion.push(hk.name);
      continue;
    }

    // Skip cards with no attacks — trainer/energy cards can't be matched this way
    if (hk.attackFingerprint === null) {
      unmatched.push({ hkName: hk.name, expansion: hk.expansionCode ?? '?', reason: 'no attacks' });
      continue;
    }

    const fpMap = jpFpLookup.get(hk.primaryExpansionId);
    if (!fpMap) {
      unmatched.push({ hkName: hk.name, expansion: hk.expansionCode ?? '?', reason: 'no JP cards in expansion' });
      continue;
    }

    const jpCandidates = fpMap.get(hk.attackFingerprint) ?? [];
    // Count how many HK-only cards share this same fingerprint in this expansion
    const hkSiblingCount = hkFpCount.get(hk.primaryExpansionId)?.get(hk.attackFingerprint) ?? 1;

    if (jpCandidates.length === 0) {
      unmatched.push({ hkName: hk.name, expansion: hk.expansionCode ?? '?', reason: 'no JP match for attack fingerprint' });
    } else if (jpCandidates.length > 1) {
      // Multiple JP cards with same attack fingerprint — can't tell which is correct
      ambiguous.push({
        hkName: hk.name,
        expansion: hk.expansionCode ?? '?',
        fp: hk.attackFingerprint,
        jpCandidates: jpCandidates.map(j => j.name),
      });
    } else if (hkSiblingCount > 1) {
      // Exactly 1 JP candidate but multiple HK cards share the same fingerprint —
      // all would be mapped to the same JP card, which is wrong.
      ambiguous.push({
        hkName: hk.name,
        expansion: hk.expansionCode ?? '?',
        fp: hk.attackFingerprint,
        jpCandidates: [`${jpCandidates[0].name} (1 JP but ${hkSiblingCount} HK share same fingerprint)`],
      });
    } else {
      // Exactly 1 JP candidate AND exactly 1 HK with this attack fingerprint → safe 1:1 match
      const jpPC = jpCandidates[0];
      const jpCard = jpPC.cards[0] ?? null;
      updates.push({ hkPrimaryCardId: hk.id, hkPrimaryCardName: hk.name, hkCards: hk.cards, jpPrimaryCard: jpPC, jpCard });
    }
  }

  // ── Report ──
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`HK-only PrimaryCards:     ${hkOnlyCards.length}`);
  console.log(`  ✅ Safe matches (1:1):  ${updates.length}`);
  console.log(`  ⚠️  Ambiguous (collision): ${ambiguous.length}`);
  console.log(`  ❌ Unmatched (no JP):   ${unmatched.length}`);
  console.log(`  ⚠️  No expansion set:    ${noExpansion.length}`);

  // Per-expansion breakdown
  const expBreakdown = new Map<string, { matched: number; ambig: number; unmatched: number }>();
  for (const u of updates) {
    const exp = u.jpPrimaryCard.expansionCode ?? '?';
    const e = expBreakdown.get(exp) ?? { matched: 0, ambig: 0, unmatched: 0 };
    e.matched++;
    expBreakdown.set(exp, e);
  }
  for (const a of ambiguous) {
    const e = expBreakdown.get(a.expansion) ?? { matched: 0, ambig: 0, unmatched: 0 };
    e.ambig++;
    expBreakdown.set(a.expansion, e);
  }
  for (const u of unmatched) {
    const e = expBreakdown.get(u.expansion) ?? { matched: 0, ambig: 0, unmatched: 0 };
    e.unmatched++;
    expBreakdown.set(u.expansion, e);
  }

  if (expBreakdown.size > 0) {
    console.log('\n─── Per-Expansion Breakdown ───');
    console.log(`${'EXP'.padEnd(10)} ${'MATCH'.padStart(6)} ${'AMBIG'.padStart(6)} ${'UNMATCH'.padStart(8)}`);
    for (const [exp, stat] of [...expBreakdown.entries()].sort()) {
      console.log(`${exp.padEnd(10)} ${String(stat.matched).padStart(6)} ${String(stat.ambig).padStart(6)} ${String(stat.unmatched).padStart(8)}`);
    }
  }

  if (ambiguous.length > 0) {
    console.log('\n─── Ambiguous (first 20) — attack fingerprint collision: multiple HK or JP cards share same attacks ───');
    for (const a of ambiguous.slice(0, 20)) {
      console.log(`  [${a.expansion}] "${a.hkName}" → JP candidates: ${a.jpCandidates.slice(0, 3).join(', ')}${a.jpCandidates.length > 3 ? ` (+${a.jpCandidates.length - 3} more)` : ''}`);
    }
    if (ambiguous.length > 20) console.log(`  ... and ${ambiguous.length - 20} more`);
  }

  // Show unmatched breakdown by reason (only first 20)
  const noAttackCount = unmatched.filter(u => u.reason === 'no attacks').length;
  const noJPMatchCount = unmatched.filter(u => u.reason !== 'no attacks').length;
  console.log(`\n  (Unmatched breakdown: ${noAttackCount} trainer/energy with no attacks, ${noJPMatchCount} Pokémon with no JP match)`);
  const unmatchedPokemon = unmatched.filter(u => u.reason !== 'no attacks');
  if (unmatchedPokemon.length > 0 && unmatchedPokemon.length <= 30) {
    console.log('\n─── Unmatched Pokémon cards (have attacks but no JP equivalent found) ───');
    for (const u of unmatchedPokemon) {
      console.log(`  [${u.expansion}] "${u.hkName}"`);
    }
  }

  // All matches with full detail — filter out any already pointing to the correct JP PrimaryCard
  if (updates.length > 0) {
    const newMatches = updates.filter(u =>
      u.hkCards.some(c => c.primaryCardId !== u.jpPrimaryCard.id)
    );
    const alreadyLinked = updates.length - newMatches.length;
    console.log(`\n─── All matches not yet linked (${newMatches.length}${alreadyLinked > 0 ? `, ${alreadyLinked} already linked skipped` : ''}) ───`);
    for (const u of newMatches) {
      const hkCard = u.hkCards[0];
      const jpCard = u.jpCard;
      const hkWebIds = u.hkCards.map(c => c.webCardId).join(', ');
      const jpWebId = jpCard?.webCardId ?? '(no card)';

      // Build attack summary from JP card (cost → damage)
      const attacks: any[] = Array.isArray(jpCard?.attacks) ? jpCard!.attacks : [];
      const attackSummary = attacks.length > 0
        ? attacks.map((a: any) => {
            const cost = Array.isArray(a.cost) ? a.cost.join('+') : (a.cost ?? '?');
            const dmg = a.damage ?? '–';
            const name = a.name ?? '';
            return `${name}(${cost}→${dmg})`;
          }).join(' | ')
        : '–';

      const hp = jpCard?.hp ?? hkCard?.hp ?? null;
      const types = (jpCard?.types ?? hkCard?.types ?? []).join('/') || '–';
      const rarity = jpCard?.rarity ?? hkCard?.rarity ?? '–';

      console.log(
        `  [${u.jpPrimaryCard.expansionCode}/${u.jpPrimaryCard.cardNumber}]` +
        `  HP:${hp ?? '–'}  Type:${types}  Rarity:${rarity}` +
        `\n    ZH: ${hkWebIds} "${u.hkPrimaryCardName}"` +
        `\n    JP: ${jpWebId} "${u.jpPrimaryCard.name}"  attacks: ${attackSummary}`
      );
    }
  }

  if (!APPLY) {
    console.log('\n' + '─'.repeat(60));
    console.log('DRY RUN complete. Run with --apply to apply changes.');
    console.log('  npx tsx scrapers/map-by-skills.ts --apply');
    console.log('  npx tsx scrapers/map-by-skills.ts --apply --yes');
    console.log('  npx tsx scrapers/map-by-skills.ts --apply --expansion AC2D --yes');
    await prisma.$disconnect();
    return;
  }

  if (updates.length === 0) {
    console.log('\nNo safe 1:1 matches to apply.');
    await prisma.$disconnect();
    return;
  }

  // ── Confirm ──
  if (!YES) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(res =>
      rl.question(`\nApply ${updates.length} HK→JP links? (yes/no): `, res)
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      await prisma.$disconnect();
      return;
    }
  }

  console.log('\nApplying updates...');
  let applied = 0;
  let fieldsSynced = 0;
  const orphanedPrimaryCardIds = new Set<string>();
  // Reverse-sync: JP cards to update from HK data
  const jpUpdates: { jpCardId: string; syncFields: Record<string, unknown> }[] = [];
  const jpUpdateSet = new Set<string>();

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const ops: Promise<any>[] = [];

    for (const u of chunk) {
      orphanedPrimaryCardIds.add(u.hkPrimaryCardId);
      const jpCard = u.jpCard;

      for (const hkCard of u.hkCards) {
        // ── Compute field sync from JP → HK ──
        const syncFields: Record<string, unknown> = {
          primaryCardId: u.jpPrimaryCard.id,
        };
        if (jpCard) {
          // JP is authoritative for these three
          if (jpCard.rarity      && hkCard.rarity      !== jpCard.rarity)      syncFields.rarity      = jpCard.rarity;
          if (jpCard.variantType && hkCard.variantType  !== jpCard.variantType) syncFields.variantType = jpCard.variantType;
          if (jpCard.regulationMark && hkCard.regulationMark !== jpCard.regulationMark) syncFields.regulationMark = jpCard.regulationMark;
          // Fill nulls on HK only
          if (!hkCard.artist     && jpCard.artist)     syncFields.artist     = jpCard.artist;
          if (!hkCard.evolvesFrom && jpCard.evolvesFrom) syncFields.evolvesFrom = jpCard.evolvesFrom;
          if (!hkCard.ruleBox    && jpCard.ruleBox)    syncFields.ruleBox    = jpCard.ruleBox;
          if ((!hkCard.subtypes || hkCard.subtypes.length === 0) && jpCard.subtypes?.length > 0)
            syncFields.subtypes = jpCard.subtypes;

          if (Object.keys(syncFields).length > 1) fieldsSynced++; // >1 because primaryCardId is always there

          // ── Reverse sync: HK → JP for regulationMark ──
          if (!jpCard.regulationMark && hkCard.regulationMark && !jpUpdateSet.has(jpCard.id)) {
            jpUpdateSet.add(jpCard.id);
            jpUpdates.push({ jpCardId: jpCard.id, syncFields: { regulationMark: hkCard.regulationMark } });
          }
        }

        ops.push(
          prisma.card.update({ where: { id: hkCard.id }, data: syncFields })
        );
      }
    }

    await prisma.$transaction(ops);
    applied += chunk.reduce((s, u) => s + u.hkCards.length, 0);
    process.stdout.write(`\r  Re-pointed ${applied} ZH_TW cards...`);
  }
  console.log(`\n✅ Re-pointed ${applied} ZH_TW cards to JP PrimaryCards`);
  console.log(`✏️  Synced JP fields on ${fieldsSynced} HK cards`);

  // ── Reverse sync JP cards from HK data ──
  if (jpUpdates.length > 0) {
    console.log('\nApplying HK → JP reverse sync (regulationMark)...');
    let jpApplied = 0;
    for (let i = 0; i < jpUpdates.length; i += CHUNK) {
      const chunk = jpUpdates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map(u => prisma.card.update({ where: { id: u.jpCardId }, data: u.syncFields }))
      );
      jpApplied += chunk.length;
      process.stdout.write(`\r  Updated ${jpApplied}/${jpUpdates.length} JP cards...`);
    }
    console.log(`\n✏️  Synced HK→JP fields on ${jpApplied} JP cards`);
  }

  // ── Delete orphaned HK-only PrimaryCards ──
  console.log('\nCleaning up orphaned HK PrimaryCards...');
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
