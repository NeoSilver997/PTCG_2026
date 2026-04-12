/**
 * revert-non100-links.ts
 *
 * Reverts HK cards in non-100%-match expansions that were incorrectly linked
 * to JP PrimaryCards by a previous run of map-hk-to-jp.ts.
 *
 * A card is "incorrectly linked" if:
 *   - It's a HK (ZH_TW) card
 *   - Its expansion (from JSON) has < 100% JP match rate
 *   - Its current primaryCardId is shared with at least one JA_JP card
 *     (i.e. it was moved to a JP PrimaryCard)
 *
 * For each such card, a new HK-only PrimaryCard is created under the same
 * PrimaryExpansion used by the unmodified cards in the same HK expansion.
 *
 * Usage:
 *   npx tsx scrapers/revert-non100-links.ts          # dry-run
 *   npx tsx scrapers/revert-non100-links.ts --apply  # apply
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

interface SourceCard {
  webCardId: string;
  expansionCode: string;
  collectorNumber: string;
}

function generateSkillsSignature(abilities: any, attacks: any): string {
  const abilitiesStr = JSON.stringify(abilities || []);
  const attacksStr = JSON.stringify(attacks || []);
  return crypto.createHash('sha256').update(`${abilitiesStr}|${attacksStr}`).digest('hex').substring(0, 16);
}

function normalizeExpansion(code: string): string {
  return code.toUpperCase();
}

function normalizeCollector(coll: string): string {
  return coll.split('/')[0].trim();
}

function loadHKJsonCards(): SourceCard[] {
  const dir = 'data/cards/hongkong';
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.startsWith('hk_cards_') && f.endsWith('.json'));
  const all: SourceCard[] = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      for (const c of raw) {
        if (!c.webCardId || !c.expansionCode || !c.collectorNumber) continue;
        all.push({
          webCardId: c.webCardId,
          expansionCode: normalizeExpansion(c.expansionCode),
          collectorNumber: normalizeCollector(c.collectorNumber),
        });
      }
    } catch (e) {
      console.warn(`  ⚠ Could not read ${file}: ${e}`);
    }
  }
  return all;
}

function loadJPJsonKeys(): Set<string> {
  const jpDir = 'data/cards/japan';
  const rootDir = '.';
  const set = new Set<string>();

  const addFromDir = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        for (const c of raw) {
          if (!c.expansionCode || !c.collectorNumber) continue;
          const key = normalizeExpansion(c.expansionCode) + ':' + normalizeCollector(c.collectorNumber);
          set.add(key);
        }
      } catch (_) {}
    }
  };

  addFromDir(jpDir, 'japanese_cards_');
  addFromDir(rootDir, 'japanese_cards_');
  return set;
}

async function main() {
  console.log('='.repeat(60));
  console.log(`Revert non-100% HK→JP links${APPLY ? ' [APPLY MODE]' : ' [DRY RUN]'}`);
  console.log('='.repeat(60));

  // 1. Load JSON data
  console.log('\nLoading JSON data...');
  const hkCards = loadHKJsonCards();
  const jpKeySet = loadJPJsonKeys();
  console.log(`  HK JSON cards: ${hkCards.length}`);
  console.log(`  JP JSON keys:  ${jpKeySet.size}`);

  // 2. Compute per-expansion match rates; identify non-100% expansions
  const expTotal = new Map<string, number>();
  const expMatchedCount = new Map<string, number>();
  const hkSrcByWebId = new Map<string, SourceCard>();

  for (const c of hkCards) {
    hkSrcByWebId.set(c.webCardId, c);
    expTotal.set(c.expansionCode, (expTotal.get(c.expansionCode) ?? 0) + 1);
    const baseKey = `${c.expansionCode}:${c.collectorNumber}`;
    if (jpKeySet.has(baseKey)) {
      expMatchedCount.set(c.expansionCode, (expMatchedCount.get(c.expansionCode) ?? 0) + 1);
    }
  }

  const non100Expansions = new Set<string>();
  const partialExpansions: string[] = []; // non-100% with some matches
  for (const [exp, total] of expTotal) {
    const matched = expMatchedCount.get(exp) ?? 0;
    if (matched < total) {
      non100Expansions.add(exp);
      if (matched > 0) partialExpansions.push(`${exp}: ${matched}/${total}`);
    }
  }
  console.log(`\nNon-100% expansions with partial matches (cards that may have been incorrectly linked):`);
  partialExpansions.forEach(e => console.log(`  ${e}`));

  // 3. Query DB: all ZH_TW cards
  console.log('\nQuerying DB...');
  const dbHKCards = await prisma.card.findMany({
    where: { language: 'ZH_TW' },
    select: {
      id: true,
      webCardId: true,
      name: true,
      abilities: true,
      attacks: true,
      primaryCardId: true,
      primaryCard: {
        select: {
          id: true,
          cardNumber: true,
          primaryExpansionId: true,
          primaryExpansion: { select: { code: true } },
          cards: { where: { language: 'JA_JP' }, select: { id: true }, take: 1 },
        },
      },
    },
  });

  // 4. Find incorrectly linked cards: in a non-100% expansion, primaryCard shared with JP card
  type NeedsRevert = {
    hkCardId: string;
    hkWebCardId: string;
    expansionCode: string;
    collectorNumber: string;
    currentPrimaryCardId: string;
    cardName: string;
    abilities: any;
    attacks: any;
  };

  const toRevert: NeedsRevert[] = [];
  const webIdsInNon100 = new Set<string>();
  for (const c of hkCards) {
    if (non100Expansions.has(c.expansionCode)) webIdsInNon100.add(c.webCardId);
  }

  for (const dbCard of dbHKCards) {
    if (!webIdsInNon100.has(dbCard.webCardId)) continue;
    // Check if this card's primaryCard is shared with any JP card
    const sharedWithJP = dbCard.primaryCard.cards.length > 0;
    if (!sharedWithJP) continue;

    const src = hkSrcByWebId.get(dbCard.webCardId);
    if (!src) continue;

    toRevert.push({
      hkCardId: dbCard.id,
      hkWebCardId: dbCard.webCardId,
      expansionCode: src.expansionCode,
      collectorNumber: src.collectorNumber,
      currentPrimaryCardId: dbCard.primaryCardId,
      cardName: dbCard.name,
      abilities: dbCard.abilities,
      attacks: dbCard.attacks,
    });
  }

  console.log(`\nCards needing revert: ${toRevert.length}`);
  if (toRevert.length === 0) {
    console.log('Nothing to revert. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // 5. Group by expansion code; find reference PrimaryExpansionId from unchanged HK cards
  // For each expansion, find a card that was NOT moved (primaryCard has no JP cards)
  const expPrimaryExpansionId = new Map<string, string>();

  for (const exp of non100Expansions) {
    // Find any HK DB card in this expansion that is still on an HK-only PrimaryCard
    const unchangedCard = dbHKCards.find(c => {
      const src = hkSrcByWebId.get(c.webCardId);
      return src?.expansionCode === exp && c.primaryCard.cards.length === 0;
    });
    if (unchangedCard) {
      expPrimaryExpansionId.set(exp, unchangedCard.primaryCard.primaryExpansionId);
      console.log(`  ${exp}: found HK PrimaryExpansion via ${unchangedCard.webCardId} (${unchangedCard.primaryCard.primaryExpansion.code})`);
    } else {
      // Fallback: all cards in this expansion were moved or not in JSON
      // Try to find via RegionalExpansion table
      const regional = await prisma.regionalExpansion.findFirst({
        where: { region: 'ZH_TW', code: { contains: exp } },
        select: { primaryExpansionId: true, code: true },
      });
      if (regional) {
        expPrimaryExpansionId.set(exp, regional.primaryExpansionId);
        console.log(`  ${exp}: found HK PrimaryExpansion via RegionalExpansion (${regional.code})`);
      } else {
        console.warn(`  ⚠ ${exp}: could NOT find HK PrimaryExpansion — will skip cards in this expansion`);
      }
    }
  }

  // 6. Build updates: for each card to revert, find or create a HK PrimaryCard
  type RevertUpdate = {
    hkCardId: string;
    hkWebCardId: string;
    newPrimaryCardId: string;
    created: boolean;
  };

  const revertUpdates: RevertUpdate[] = [];

  // Cache: `${primaryExpansionId}:${cardNumber}` → PrimaryCard.id
  const pcCache = new Map<string, string>();

  for (const item of toRevert) {
    const primaryExpansionId = expPrimaryExpansionId.get(item.expansionCode);
    if (!primaryExpansionId) {
      console.warn(`  ⚠ Skipping ${item.hkWebCardId} — no PrimaryExpansion found for ${item.expansionCode}`);
      continue;
    }

    const cacheKey = `${primaryExpansionId}:${item.collectorNumber}`;

    if (pcCache.has(cacheKey)) {
      revertUpdates.push({ hkCardId: item.hkCardId, hkWebCardId: item.hkWebCardId, newPrimaryCardId: pcCache.get(cacheKey)!, created: false });
      continue;
    }

    // Look for existing PrimaryCard (might not exist if it was deleted)
    const existing = await prisma.primaryCard.findFirst({
      where: { primaryExpansionId, cardNumber: item.collectorNumber },
      select: { id: true },
    });

    if (existing) {
      pcCache.set(cacheKey, existing.id);
      revertUpdates.push({ hkCardId: item.hkCardId, hkWebCardId: item.hkWebCardId, newPrimaryCardId: existing.id, created: false });
    } else if (APPLY) {
      // Must create a new PrimaryCard
      const skillsSignature = generateSkillsSignature(item.abilities, item.attacks);
      const newPc = await prisma.primaryCard.upsert({
        where: { name_skillsSignature: { name: item.cardName, skillsSignature } },
        update: { primaryExpansionId, cardNumber: item.collectorNumber },
        create: { name: item.cardName, skillsSignature, primaryExpansionId, cardNumber: item.collectorNumber },
        select: { id: true },
      });
      pcCache.set(cacheKey, newPc.id);
      revertUpdates.push({ hkCardId: item.hkCardId, hkWebCardId: item.hkWebCardId, newPrimaryCardId: newPc.id, created: true });
    } else {
      // Dry-run: mark as "(would create)"
      pcCache.set(cacheKey, `(new:${primaryExpansionId}:${item.collectorNumber})`);
      revertUpdates.push({ hkCardId: item.hkCardId, hkWebCardId: item.hkWebCardId, newPrimaryCardId: `(would-create)`, created: true });
    }
  }

  const toCreate = revertUpdates.filter(u => u.created).length;
  console.log(`\nRevert updates planned: ${revertUpdates.length}`);
  console.log(`  PrimaryCards to create: ${toCreate}`);

  if (!APPLY) {
    console.log('\n' + '─'.repeat(60));
    console.log('DRY RUN complete. Run with --apply to revert changes.');
    console.log('  npx tsx scrapers/revert-non100-links.ts --apply');
    await prisma.$disconnect();
    return;
  }

  // 7. Apply updates in chunks of 200
  console.log('\nApplying reverts...');
  const CHUNK = 200;
  let applied = 0;
  for (let i = 0; i < revertUpdates.length; i += CHUNK) {
    const chunk = revertUpdates.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map(u => prisma.card.update({ where: { id: u.hkCardId }, data: { primaryCardId: u.newPrimaryCardId } }))
    );
    applied += chunk.length;
    process.stdout.write(`\r  Reverted ${applied}/${revertUpdates.length}...`);
  }
  console.log(`\n✅ Reverted ${applied} HK cards to their own PrimaryCards`);
  console.log(`🆕 Created ${toCreate} new HK PrimaryCards`);

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
