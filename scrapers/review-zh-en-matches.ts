/**
 * review-zh-en-matches.ts
 *
 * Local review server for ZH_TW → EN_US card mapping.
 * Shows each proposed match as a side-by-side card image pair for visual
 * confirmation before committing to the database.
 *
 * Usage:
 *   npx tsx scrapers/review-zh-en-matches.ts                 # all expansions
 *   npx tsx scrapers/review-zh-en-matches.ts --expansion SV10
 *   npx tsx scrapers/review-zh-en-matches.ts --port 3334
 *
 * Workflow:
 *   1. Run this script
 *   2. Open http://localhost:3333 in your browser
 *   3. Review ZH ↔ EN card pairs visually
 *   4. Toggle off any incorrect pairs
 *   5. Click "Apply Confirmed" to write to DB
 */

import { createServer } from 'http';
import type { ServerResponse } from 'http';
import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const prisma = new PrismaClient();

const PORT_IDX = process.argv.indexOf('--port');
const PORT = PORT_IDX >= 0 && process.argv[PORT_IDX + 1]
  ? parseInt(process.argv[PORT_IDX + 1], 10) : 3333;
const EXP_IDX = process.argv.indexOf('--expansion');
const FILTER_EXP: string | null = (
  EXP_IDX >= 0 && process.argv[EXP_IDX + 1] && !process.argv[EXP_IDX + 1].startsWith('--')
) ? process.argv[EXP_IDX + 1].toUpperCase() : null;

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────
// Cross-expansion code map  (same as map-zh-to-en.ts)
// ─────────────────────────────────────────────────────────────
const ZH_TO_EN_CODE: Record<string, string> = {
  'M1S': 'ME01', 'M1L': 'ME01',
  'M2':  'ME02', 'MBD': 'ME02', 'MBG': 'ME02',
  'M2A': 'ME2', 'MC': 'ME2',
  'M3':  'ME03',
  'SV11B': 'ZSV10', 'SV11W': 'RSV10',
  'SV9A': 'SV10', 'SVOD': 'SV10', 'SVOM': 'SV10',
  'SV9': 'SV09', 'SVM': 'SV09',
  'SV8': 'SV08', 'SV8A': 'SV8',
  'SV7': 'SV07',
  'SV6': 'SV06', 'SV6A': 'SV6',
  'SV5A': 'SV05', 'SV5K': 'SV05',
};

// ─────────────────────────────────────────────────────────────
// Fingerprint helpers
// ─────────────────────────────────────────────────────────────
function computeAttackFingerprint(attacks: any, hp: number | null, types: string[]): string | null {
  if (!attacks || !Array.isArray(attacks) || attacks.length === 0) return null;
  const normalized = attacks.map((a: any) => ({
    cost: [...(a.cost ?? [])].sort().join(','),
    damage: String(a.damage ?? ''),
  }));
  return `HP:${hp ?? '?'}|T:${[...(types ?? [])].sort().join(',')}|${JSON.stringify(normalized)}`;
}

function maxAttackDamage(attacks: any): number {
  if (!attacks || !Array.isArray(attacks) || attacks.length === 0) return 0;
  let max = 0;
  for (const a of attacks) {
    const d = parseInt(String(a.damage ?? '0').replace(/[^0-9]/g, ''), 10) || 0;
    if (d > max) max = d;
  }
  return max;
}

function computeEffectFingerprint(
  effectTags: string[], specialEffectTags: string[],
  supertype: string | null, subtype: string | null, regulationMark: string | null,
): string | null {
  const allTags = [...effectTags, ...specialEffectTags.map(t => 'S:' + t)].sort();
  if (allTags.length === 0) return null;
  if (allTags.length === 1 && allTags[0] === '其他效果') return null;
  const typeKey = [supertype ?? 'UNKNOWN', subtype ?? ''].filter(Boolean).join('/');
  return typeKey + (regulationMark ? '|R:' + regulationMark : '') + ':' + allTags.join('|');
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface DbCard {
  id: string;
  primaryCardId: string;
  webCardId: string;
  language: string;
  name: string;
  variantType: string;
  rarity: string | null;
  regulationMark: string | null;
  artist: string | null;
  evolvesFrom: string | null;
  ruleBox: string | null;
  subtypes: string[];
  attacks: any;
  hp: number | null;
  types: string[];
  supertype: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
}

interface DbPrimaryCard {
  id: string;
  name: string;
  cardNumber: string | null;
  primaryExpansionId: string | null;
  expansionCode: string | null;
  pokemonSpeciesId: string | null;
  attackFingerprint: string | null;
  effectFingerprint: string | null;
  effectTags: string[];
  specialEffectTags: string[];
  cards: DbCard[];
}

interface UpdateRecord {
  zhPrimaryCardId: string;
  zhPrimaryCardName: string;
  zhExpansionCode: string | null;
  zhCards: DbCard[];
  enPrimaryCard: DbPrimaryCard;
  enCard: DbCard | null;
  matchMethod: string;
}

interface AmbiguousRecord {
  zhPrimaryCardId: string;
  zhPrimaryCardName: string;
  zhExpansionCode: string | null;
  zhCards: DbCard[];
  enCandidates: DbPrimaryCard[];
  matchMethod: string;
  reason: string;
}

export interface ReviewMatch {
  id: string;              // zhPrimaryCardId
  enPrimaryCardId: string;
  zhName: string;
  enName: string;
  zhExpansion: string;
  enExpansion: string;
  enNumber: string | null;
  matchMethod: string;
  zhWebCardId: string;
  enWebCardId: string;
  zhImageUrl: string | null;
  enImageUrl: string | null;
  hp: number | null;
  types: string[];
  rarity: string | null;
  regulationMark: string | null;
}

export interface AmbiguousReview {
  id: string;              // zhPrimaryCardId
  zhName: string;
  zhExpansion: string;
  zhWebCardId: string;
  zhImageUrl: string | null;
  zhSourceUrl: string | null;
  hp: number | null;
  types: string[];
  rarity: string | null;
  regulationMark: string | null;
  matchMethod: string;
  reason: string;
  candidates: {
    enPrimaryCardId: string;
    enName: string;
    enExpansion: string;
    enWebCardId: string;
    enImageUrl: string | null;
    enNumber: string | null;
    enSourceUrl: string | null;
  }[];
}

function toReviewMatch(u: UpdateRecord): ReviewMatch {
  const zhCard = u.zhCards[0];
  const enCard = u.enCard;
  return {
    id: u.zhPrimaryCardId,
    enPrimaryCardId: u.enPrimaryCard.id,
    zhName: u.zhPrimaryCardName,
    enName: u.enPrimaryCard.name,
    zhExpansion: u.zhExpansionCode ?? '?',
    enExpansion: u.enPrimaryCard.expansionCode ?? '?',
    enNumber: u.enPrimaryCard.cardNumber,
    matchMethod: u.matchMethod,
    zhWebCardId: zhCard?.webCardId ?? '',
    enWebCardId: enCard?.webCardId ?? '',
    zhImageUrl: zhCard?.imageUrl ?? null,
    enImageUrl: enCard?.imageUrl ?? null,
    hp: enCard?.hp ?? zhCard?.hp ?? null,
    types: enCard?.types ?? zhCard?.types ?? [],
    rarity: enCard?.rarity ?? zhCard?.rarity ?? null,
    regulationMark: enCard?.regulationMark ?? zhCard?.regulationMark ?? null,
  };
}

function toAmbiguousReview(a: AmbiguousRecord): AmbiguousReview {
  const zhCard = a.zhCards[0];
  return {
    id: a.zhPrimaryCardId,
    zhName: a.zhPrimaryCardName,
    zhExpansion: a.zhExpansionCode ?? '?',
    zhWebCardId: zhCard?.webCardId ?? '',
    zhImageUrl: zhCard?.imageUrl ?? null,
    zhSourceUrl: zhCard?.sourceUrl ?? null,
    hp: zhCard?.hp ?? null,
    types: zhCard?.types ?? [],
    rarity: zhCard?.rarity ?? null,
    regulationMark: zhCard?.regulationMark ?? null,
    matchMethod: a.matchMethod,
    reason: a.reason,
    candidates: a.enCandidates.map(en => {
      const enCard = en.cards[0] ?? null;
      return {
        enPrimaryCardId: en.id,
        enName: en.name,
        enExpansion: en.expansionCode ?? '?',
        enWebCardId: enCard?.webCardId ?? '',
        enImageUrl: enCard?.imageUrl ?? null,
        enNumber: en.cardNumber,
        enSourceUrl: enCard?.sourceUrl ?? null,
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// DB Loading
// ─────────────────────────────────────────────────────────────
async function loadPCards(sourceLang: 'ZH_TW' | 'EN_US', absentLang: 'EN_US' | 'ZH_TW'): Promise<DbPrimaryCard[]> {
  const expFilter = FILTER_EXP ? `AND pe.code = '${FILTER_EXP}'` : '';
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT pc.id, pc.name, pc."cardNumber", pc."primaryExpansionId",
           pe.code AS "expansionCode", pc."pokemonSpeciesId",
           pc."effectTags", pc."specialEffectTags"
    FROM primary_cards pc
    LEFT JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId"
    WHERE EXISTS (SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = '${sourceLang}')
      AND NOT EXISTS (SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = '${absentLang}')
    ${expFilter}
    ORDER BY pe.code, pc.name
  `);
  if (rows.length === 0) return [];

  const pcIds = rows.map((r: any) => r.id);
  const rawCards = await prisma.card.findMany({
    where: { primaryCardId: { in: pcIds }, language: sourceLang },
    select: {
      id: true, primaryCardId: true, webCardId: true, language: true, name: true,
      variantType: true, rarity: true, regulationMark: true, artist: true,
      evolvesFrom: true, ruleBox: true, subtypes: true, attacks: true,
      hp: true, types: true, supertype: true, imageUrl: true, sourceUrl: true,
    },
  });
  const cards = rawCards as unknown as DbCard[];

  const cardsByPCId = new Map<string, DbCard[]>();
  for (const c of cards) {
    const arr = cardsByPCId.get(c.primaryCardId) ?? [];
    arr.push(c);
    cardsByPCId.set(c.primaryCardId, arr);
  }

  const pickRep = (list: DbCard[]) =>
    list.find(c => c.variantType === 'NORMAL') ?? list[0] ?? null;

  return rows.map((r: any) => {
    const cardList = cardsByPCId.get(r.id) ?? [];
    const rep = pickRep(cardList);
    return {
      id: r.id, name: r.name, cardNumber: r.cardNumber,
      primaryExpansionId: r.primaryExpansionId, expansionCode: r.expansionCode,
      pokemonSpeciesId: r.pokemonSpeciesId ?? null,
      attackFingerprint: rep ? computeAttackFingerprint(rep.attacks, rep.hp, rep.types) : null,
      effectFingerprint: computeEffectFingerprint(
        r.effectTags ?? [], r.specialEffectTags ?? [],
        rep?.supertype ?? null, rep?.subtypes?.[0] ?? null, rep?.regulationMark ?? null,
      ),
      effectTags: r.effectTags ?? [], specialEffectTags: r.specialEffectTags ?? [],
      cards: cardList,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Build EN-by-expansion cross map
// ─────────────────────────────────────────────────────────────
async function buildEnByExpansion(
  zhOnly: DbPrimaryCard[],
  enAll: DbPrimaryCard[],
): Promise<Map<string, DbPrimaryCard[]>> {
  const zhCodeToExpId = new Map<string, string>();
  for (const zh of zhOnly) {
    if (zh.primaryExpansionId && zh.expansionCode)
      zhCodeToExpId.set(zh.expansionCode, zh.primaryExpansionId);
  }

  const neededEnCodes = [...new Set(
    [...zhCodeToExpId.keys()].map(c => ZH_TO_EN_CODE[c]).filter(Boolean) as string[]
  )];

  const enCodeToExpId = new Map<string, string>();
  if (neededEnCodes.length > 0) {
    const ph = neededEnCodes.map((_, i) => '$' + (i + 1)).join(', ');
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, code FROM primary_expansions WHERE code IN (${ph})`, ...neededEnCodes,
    );
    for (const r of rows) enCodeToExpId.set(r.code, r.id);
  }

  const enExpIdToZhExpIds = new Map<string, string[]>();
  for (const [zhCode, zhExpId] of zhCodeToExpId) {
    const enCode = ZH_TO_EN_CODE[zhCode];
    if (!enCode) continue;
    const enExpId = enCodeToExpId.get(enCode);
    if (!enExpId) continue;
    const arr = enExpIdToZhExpIds.get(enExpId) ?? [];
    if (!arr.includes(zhExpId)) arr.push(zhExpId);
    enExpIdToZhExpIds.set(enExpId, arr);
  }

  const enByExpansion = new Map<string, DbPrimaryCard[]>();
  for (const en of enAll) {
    if (!en.primaryExpansionId) continue;
    const zhExpIds = enExpIdToZhExpIds.get(en.primaryExpansionId);
    if (zhExpIds?.length) {
      for (const zhExpId of zhExpIds) {
        const arr = enByExpansion.get(zhExpId) ?? [];
        arr.push(en);
        enByExpansion.set(zhExpId, arr);
      }
    } else {
      const arr = enByExpansion.get(en.primaryExpansionId) ?? [];
      arr.push(en);
      enByExpansion.set(en.primaryExpansionId, arr);
    }
  }
  return enByExpansion;
}

// ─────────────────────────────────────────────────────────────
// Matching  (same logic as map-zh-to-en.ts runMatching)
// ─────────────────────────────────────────────────────────────
function runMatching(
  zhCards: DbPrimaryCard[],
  enByExpansion: Map<string, DbPrimaryCard[]>,
): { updates: UpdateRecord[]; ambiguous: AmbiguousRecord[] } {
  const updates: UpdateRecord[] = [];
  const ambiguous: AmbiguousRecord[] = [];
  const enAtkFpLookup  = new Map<string, Map<string, DbPrimaryCard[]>>();
  const enSpecFpLookup = new Map<string, Map<string, DbPrimaryCard[]>>();
  const enEffFpLookup  = new Map<string, Map<string, DbPrimaryCard[]>>();

  for (const [expId, enList] of enByExpansion) {
    const atkMap = new Map<string, DbPrimaryCard[]>();
    const specMap = new Map<string, DbPrimaryCard[]>();
    const effMap = new Map<string, DbPrimaryCard[]>();
    for (const en of enList) {
      if (en.attackFingerprint !== null) {
        const a = atkMap.get(en.attackFingerprint) ?? []; a.push(en); atkMap.set(en.attackFingerprint, a);
        if (en.pokemonSpeciesId) {
          const k = en.pokemonSpeciesId + '|' + en.attackFingerprint;
          const s = specMap.get(k) ?? []; s.push(en); specMap.set(k, s);
        }
      } else if (en.effectFingerprint !== null) {
        const e = effMap.get(en.effectFingerprint) ?? []; e.push(en); effMap.set(en.effectFingerprint, e);
      }
    }
    enAtkFpLookup.set(expId, atkMap);
    enSpecFpLookup.set(expId, specMap);
    enEffFpLookup.set(expId, effMap);
  }

  const inc = (m: Map<string, Map<string, number>>, expId: string, key: string) => {
    const inner = m.get(expId) ?? new Map<string, number>();
    inner.set(key, (inner.get(key) ?? 0) + 1);
    m.set(expId, inner);
  };
  const zhAtkSib  = new Map<string, Map<string, number>>();
  const zhSpecSib = new Map<string, Map<string, number>>();
  const zhEffSib  = new Map<string, Map<string, number>>();
  for (const zh of zhCards) {
    if (!zh.primaryExpansionId) continue;
    if (zh.attackFingerprint !== null) {
      inc(zhAtkSib, zh.primaryExpansionId, zh.attackFingerprint);
      if (zh.pokemonSpeciesId) inc(zhSpecSib, zh.primaryExpansionId, zh.pokemonSpeciesId + '|' + zh.attackFingerprint);
    }
    if (zh.attackFingerprint === null && zh.effectFingerprint !== null)
      inc(zhEffSib, zh.primaryExpansionId, zh.effectFingerprint);
  }

  for (const zh of zhCards) {
    if (!zh.primaryExpansionId) continue;
    const expId = zh.primaryExpansionId;
    let matched = false;

    if (zh.attackFingerprint !== null) {
      let enCandidates: DbPrimaryCard[] = [];
      let method = 'attack-fingerprint';
      let sibCount = 1;

      if (zh.pokemonSpeciesId) {
        const k = zh.pokemonSpeciesId + '|' + zh.attackFingerprint;
        enCandidates = enSpecFpLookup.get(expId)?.get(k) ?? [];
        sibCount = zhSpecSib.get(expId)?.get(k) ?? 1;
        if (enCandidates.length > 0) method = 'pokemon-species+attack';
      }
      if (enCandidates.length === 0) {
        enCandidates = enAtkFpLookup.get(expId)?.get(zh.attackFingerprint) ?? [];
        sibCount = zhAtkSib.get(expId)?.get(zh.attackFingerprint) ?? 1;
        method = 'attack-fingerprint';
      }
      if (enCandidates.length === 1 && sibCount === 1) {
        updates.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name,
          zhExpansionCode: zh.expansionCode,
          zhCards: zh.cards, enPrimaryCard: enCandidates[0],
          enCard: enCandidates[0].cards[0] ?? null, matchMethod: method,
        });
      } else if (enCandidates.length > 1) {
        ambiguous.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name,
          zhExpansionCode: zh.expansionCode,
          zhCards: zh.cards, enCandidates, matchMethod: method,
          reason: `${enCandidates.length} EN candidates share same fingerprint`,
        });
      } else if (sibCount > 1) {
        ambiguous.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name,
          zhExpansionCode: zh.expansionCode,
          zhCards: zh.cards, enCandidates: enCandidates.length === 1 ? enCandidates : [],
          matchMethod: method,
          reason: `${sibCount} ZH cards share same fingerprint (reprint)`,
        });
      }
      matched = true;
    }

    if (!matched && zh.effectFingerprint !== null) {
      const enCandidates = enEffFpLookup.get(expId)?.get(zh.effectFingerprint) ?? [];
      const sibCount = zhEffSib.get(expId)?.get(zh.effectFingerprint) ?? 1;
      if (enCandidates.length === 1 && sibCount === 1) {
        updates.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name,
          zhExpansionCode: zh.expansionCode,
          zhCards: zh.cards, enPrimaryCard: enCandidates[0],
          enCard: enCandidates[0].cards[0] ?? null, matchMethod: 'effect-tag+regmark',
        });
      } else if (enCandidates.length > 1) {
        ambiguous.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name,
          zhExpansionCode: zh.expansionCode,
          zhCards: zh.cards, enCandidates, matchMethod: 'effect-tag+regmark',
          reason: `${enCandidates.length} EN candidates share same effect fingerprint`,
        });
      } else if (sibCount > 1) {
        ambiguous.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name,
          zhExpansionCode: zh.expansionCode,
          zhCards: zh.cards, enCandidates: enCandidates.length === 1 ? enCandidates : [],
          matchMethod: 'effect-tag+regmark',
          reason: `${sibCount} ZH cards share same effect fingerprint (reprint)`,
        });
      }
    }
  }
  return { updates, ambiguous };
}

// ─────────────────────────────────────────────────────────────
// Match cache (built once on first request)
// ─────────────────────────────────────────────────────────────
let cachedUpdates: UpdateRecord[] | null = null;
let cachedAmbiguous: AmbiguousRecord[] | null = null;
let cacheBuilding = false;
let cacheCallbacks: Array<(u: UpdateRecord[], a: AmbiguousRecord[]) => void> = [];

function getMatches(): Promise<{ updates: UpdateRecord[]; ambiguous: AmbiguousRecord[] }> {
  if (cachedUpdates !== null && cachedAmbiguous !== null)
    return Promise.resolve({ updates: cachedUpdates, ambiguous: cachedAmbiguous });
  return new Promise(resolve => {
    cacheCallbacks.push(resolve);
    if (cacheBuilding) return;
    cacheBuilding = true;
    (async () => {
      console.log('Building match cache...');
      const zhOnly   = await loadPCards('ZH_TW', 'EN_US');
      const allEnOnly = await loadPCards('EN_US', 'ZH_TW');
      const enByExpansion = await buildEnByExpansion(zhOnly, allEnOnly);
      const result = runMatching(zhOnly, enByExpansion);
      cachedUpdates = result.updates;
      cachedAmbiguous = result.ambiguous;
      console.log(`Cache ready: ${cachedUpdates.length} matches, ${cachedAmbiguous.length} ambiguous`);
      const cbs = cacheCallbacks; cacheCallbacks = [];
      for (const cb of cbs) cb(cachedUpdates!, cachedAmbiguous!);
    })().catch(e => {
      console.error('Cache build error:', e);
      cacheBuilding = false;
      const cbs = cacheCallbacks; cacheCallbacks = [];
      for (const cb of cbs) cb([], []);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// ─────────────────────────────────────────────────────────────
// HTML page  (all JS uses string concatenation to avoid ${ conflicts)
// ─────────────────────────────────────────────────────────────
const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZH&#8594;EN Card Review</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font:13px/1.5 system-ui,sans-serif}
#topbar{position:sticky;top:0;z-index:10;background:#161b22;border-bottom:1px solid #30363d;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#topbar h1{font-size:15px;color:#58a6ff;white-space:nowrap;margin-right:4px}
.stat{color:#8b949e;font-size:12px;white-space:nowrap}
select{background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:6px;font-size:12px}
.btn{padding:5px 13px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:600}
.btn-ghost{background:#21262d;color:#c9d1d9}
.btn-ghost:hover{background:#30363d}
#btn-apply{background:#238636;color:#fff;padding:6px 18px;font-size:13px}
#btn-apply:disabled{background:#21262d;color:#6e7681;cursor:not-allowed}
#btn-apply:not(:disabled):hover{background:#2ea043}
#loading{padding:60px;text-align:center;color:#8b949e;font-size:16px}
#matches{padding:6px 8px}
.section-head{padding:8px 12px 4px;font-size:11px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #21262d;margin-top:4px}
.row{display:grid;grid-template-columns:1fr 96px 1fr 80px;gap:8px;padding:8px 12px;border-bottom:1px solid #1c2128;align-items:center;transition:background .12s}
.row:hover{background:#161b22}
.row.skipped{opacity:.38}
.row.skipped .card-img-wrap{filter:grayscale(.9)}
.card-side{display:flex;gap:8px;align-items:flex-start;min-width:0}
.card-side.en{flex-direction:row-reverse;text-align:right}
.card-side.en .info{align-items:flex-end}
.card-img-wrap{flex-shrink:0;width:68px;height:95px;border-radius:5px;overflow:hidden;background:#21262d;border:1px solid #30363d;position:relative}
.card-img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.no-img{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#484f58;font-size:22px}
.info{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.card-name{font-weight:600;font-size:12px;color:#e6edf3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-id{font-size:10px;color:#6e7681;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-hp{font-size:11px;color:#3fb950}
.card-types{font-size:11px;color:#8b949e}
.card-rarity{font-size:11px;color:#d29922}
.card-reg{font-size:11px;color:#8b949e}
.mid{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;padding:0 4px}
.exp-row{display:flex;flex-direction:column;align-items:center;gap:2px}
.exp-zh{font-size:10px;color:#8b949e}
.exp-en{font-size:10px;color:#8b949e}
.exp-badge{background:#1f3d5c;color:#58a6ff;padding:2px 7px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap}
.method-badge{padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;white-space:nowrap}
.method-badge.species{background:#1b3626;color:#3fb950}
.method-badge.attack{background:#272215;color:#d29922}
.method-badge.effect{background:#1f1b3a;color:#a371f7}
.arrow{color:#30363d;font-size:16px}
.act{display:flex;justify-content:center;align-items:center}
.tog{padding:5px 8px;border-radius:6px;border:none;cursor:pointer;font-size:12px;font-weight:700;width:70px;transition:background .12s}
.tog.on{background:#238636;color:#fff}
.tog.on:hover{background:#2ea043}
.tog.off{background:#30363d;color:#6e7681}
.tog.off:hover{background:#3d444e}
#toast{position:fixed;bottom:20px;right:20px;background:#1b3626;border:1px solid #238636;color:#3fb950;padding:12px 20px;border-radius:8px;display:none;font-weight:600;z-index:100;max-width:340px}
#toast.err{background:#3d1a1a;border-color:#f85149;color:#f85149}
 .empty{padding:40px;text-align:center;color:#8b949e}
 .candidates{display:flex;gap:6px;overflow-x:auto;padding:4px 0}
 .candidate-card{display:flex;flex-direction:column;gap:2px;align-items:center;min-width:0}
 .candidate-card .card-img-wrap{width:60px;height:84px}
 .candidate-card .card-name{font-size:11px}
 .candidate-card .card-id{font-size:9px}
 .reason{font-size:10px;color:#f0883e;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
</head>
<body>
<div id="topbar">
  <h1>ZH &#8594; EN Card Review</h1>
  <span class="stat" id="stat-label">Loading...</span>
  <span class="stat" id="stat-ambig"></span>
  <button class="btn btn-ghost tab-btn active" id="tab-matches" onclick="switchTab('matches')">Matches</button>
  <button class="btn btn-ghost tab-btn" id="tab-ambiguous" onclick="switchTab('ambiguous')">Ambiguous</button>
  <select id="filter-exp" onchange="applyFilters()"><option value="">All expansions</option></select>
  <select id="filter-method" onchange="applyFilters()">
    <option value="">All methods</option>
    <option value="pokemon-species+attack">species+attack</option>
    <option value="attack-fingerprint">attack fp</option>
    <option value="effect-tag+regmark">effect+regmark</option>
  </select>
  <button class="btn btn-ghost" onclick="selectAll(true)">&#10003; All</button>
  <button class="btn btn-ghost" onclick="selectAll(false)">&#10007; None</button>
  <button class="btn" id="btn-apply" disabled onclick="doApply()">Apply 0</button>
</div>
<div id="loading">Loading matches&#8230;</div>
<div id="matches" style="display:none"></div>
<div id="ambiguous" style="display:none"></div>
<div id="toast"></div>

<script>
var state = {
  matches: [],
  ambiguous: [],
  confirmed: {},
  activeTab: 'matches',
  filter: { exp: '', method: '' }
};

function rebuildExpFilter() {
  var sel = document.getElementById('filter-exp');
  var prev = sel.value;
  if (state.activeTab === 'matches') {
    var exps = [];
    state.matches.forEach(function(m) { if (exps.indexOf(m.enExpansion) === -1) exps.push(m.enExpansion); });
    exps.sort();
    sel.innerHTML = '<option value="">All (' + state.matches.length + ')</option>';
    exps.forEach(function(e) {
      var count = state.matches.filter(function(m) { return m.enExpansion === e; }).length;
      sel.innerHTML += '<option value="' + esc(e) + '">' + esc(e) + ' (' + count + ')</option>';
    });
  } else {
    var exps = [];
    state.ambiguous.forEach(function(a) { if (exps.indexOf(a.zhExpansion) === -1) exps.push(a.zhExpansion); });
    exps.sort();
    sel.innerHTML = '<option value="">All (' + state.ambiguous.length + ')</option>';
    exps.forEach(function(e) {
      var count = state.ambiguous.filter(function(a) { return a.zhExpansion === e; }).length;
      sel.innerHTML += '<option value="' + esc(e) + '">' + esc(e) + ' (' + count + ')</option>';
    });
  }
  // Restore previous selection if still available
  if (prev) sel.value = prev;
  if (!sel.value) state.filter.exp = '';
}

function switchTab(tab) {
  state.activeTab = tab;
  state.filter.exp = '';
  document.getElementById('tab-matches').className = 'btn btn-ghost tab-btn' + (tab === 'matches' ? ' active' : '');
  document.getElementById('tab-ambiguous').className = 'btn btn-ghost tab-btn' + (tab === 'ambiguous' ? ' active' : '');
  document.getElementById('matches').style.display = tab === 'matches' ? 'block' : 'none';
  document.getElementById('ambiguous').style.display = tab === 'ambiguous' ? 'block' : 'none';
  rebuildExpFilter();
  renderMatches();
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imgSrc(url) {
  if (!url) return '';
  if (url.indexOf('http') === 0) return url;
  return '/local-img?p=' + encodeURIComponent(url);
}

function methodClass(m) {
  if (m === 'pokemon-species+attack') return 'species';
  if (m === 'attack-fingerprint') return 'attack';
  return 'effect';
}

function methodLabel(m) {
  if (m === 'pokemon-species+attack') return 'species+atk';
  if (m === 'attack-fingerprint') return 'atk fp';
  return 'effect+reg';
}

function cardSide(name, wid, imgUrl, hp, types, rarity, regMark, isEn) {
  var src = imgSrc(imgUrl);
  var imgTag = src
    ? '<img src="' + esc(src) + '" loading="lazy" alt="" onerror="this.hidden=true">'
    : '';
  var noImgStyle = src ? 'display:none' : '';
  var typeStr = (types || []).join('/');
  var p = [];
  p.push('<div class="card-side ' + (isEn ? 'en' : 'zh') + '">');
  p.push('<div class="card-img-wrap">');
  p.push(imgTag);
  p.push('<div class="no-img" style="' + noImgStyle + '">&#128247;</div>');
  p.push('</div>');
  p.push('<div class="info">');
  p.push('<div class="card-name" title="' + esc(name) + '">' + esc(name) + '</div>');
  p.push('<div class="card-id">' + esc(wid) + '</div>');
  if (hp) p.push('<div class="card-hp">HP ' + hp + '</div>');
  if (typeStr) p.push('<div class="card-types">' + esc(typeStr) + '</div>');
  if (rarity) p.push('<div class="card-rarity">' + esc(rarity) + '</div>');
  if (regMark) p.push('<div class="card-reg">Reg ' + esc(regMark) + '</div>');
  p.push('</div>');
  p.push('</div>');
  return p.join('');
}

function renderRow(m) {
  var isOn = state.confirmed[m.id] !== false;
  var p = [];
  p.push('<div class="row' + (isOn ? '' : ' skipped') + '" id="r-' + esc(m.id) + '">');
  p.push(cardSide(m.zhName, m.zhWebCardId, m.zhImageUrl, m.hp, m.types, m.rarity, m.regulationMark, false));
  p.push('<div class="mid">');
  p.push('<div class="exp-row">');
  if (m.zhExpansion !== m.enExpansion) {
    p.push('<span class="exp-zh">' + esc(m.zhExpansion) + '</span>');
    p.push('<span class="exp-badge">' + esc(m.enExpansion) + '</span>');
  } else {
    p.push('<span class="exp-badge">' + esc(m.enExpansion) + '</span>');
  }
  p.push('</div>');
  p.push('<span class="method-badge ' + methodClass(m.matchMethod) + '">' + methodLabel(m.matchMethod) + '</span>');
  p.push('<span class="arrow">&#8594;</span>');
  p.push('</div>');
  p.push(cardSide(m.enName, m.enWebCardId, m.enImageUrl, m.hp, m.types, m.rarity, m.regulationMark, true));
  p.push('<div class="act">');
  p.push('<button class="tog ' + (isOn ? 'on' : 'off') + '" onclick="toggle(\\'' + esc(m.id) + '\\')"> ' + (isOn ? '&#10003; Link' : '&#10007; Skip') + '</button>');
  p.push('</div>');
  p.push('</div>');
  return p.join('');
}

function renderAmbiguousRow(a) {
  var isOn = state.confirmed[a.id] !== false;
  var p = [];
  p.push('<div class="row' + (isOn ? '' : ' skipped') + '" id="r-' + esc(a.id) + '">');
  p.push(cardSide(a.zhName, a.zhWebCardId, a.zhImageUrl, a.hp, a.types, a.rarity, a.regulationMark, false));
  p.push('<div class="mid">');
  p.push('<div class="exp-row">');
  p.push('<span class="exp-zh">' + esc(a.zhExpansion) + '</span>');
  p.push('</div>');
  p.push('<span class="method-badge ' + methodClass(a.matchMethod) + '">' + methodLabel(a.matchMethod) + '</span>');
  p.push('<div class="reason" title="' + esc(a.reason) + '">' + esc(a.reason) + '</div>');
  p.push('</div>');
  p.push('<div class="candidates">');
  a.candidates.forEach(function(c, idx) {
    p.push('<div class="candidate-card">');
    p.push(cardSide(c.enName, c.enWebCardId, c.enImageUrl, null, [], null, null, true));
    p.push('<div class="exp-badge">' + esc(c.enExpansion) + (c.enNumber ? ' #' + esc(c.enNumber) : '') + '</div>');
    p.push('</div>');
  });
  p.push('</div>');
  p.push('<div class="act">');
  p.push('<button class="tog ' + (isOn ? 'on' : 'off') + '" onclick="toggle(\\'' + esc(a.id) + '\\')"> ' + (isOn ? '&#10003; Link' : '&#10007; Skip') + '</button>');
  p.push('</div>');
  p.push('</div>');
  return p.join('');
}

function filtered() {
  if (state.activeTab === 'matches') {
    return state.matches.filter(function(m) {
      if (state.filter.exp && m.enExpansion !== state.filter.exp) return false;
      if (state.filter.method && m.matchMethod !== state.filter.method) return false;
      return true;
    });
  } else {
    return state.ambiguous.filter(function(a) {
      if (state.filter.exp && a.zhExpansion !== state.filter.exp) return false;
      if (state.filter.method && a.matchMethod !== state.filter.method) return false;
      return true;
    });
  }
}

function renderMatches() {
  var vis = filtered();
  if (vis.length === 0) {
    var container = state.activeTab === 'matches' ? 'matches' : 'ambiguous';
    document.getElementById(container).innerHTML = '<div class="empty">No ' + state.activeTab + ' for current filter</div>';
    updateStats();
    return;
  }
  if (state.activeTab === 'matches') {
    var byExp = {};
    vis.forEach(function(m) {
      var key = m.enExpansion;
      if (!byExp[key]) byExp[key] = [];
      byExp[key].push(m);
    });
    var html = [];
    Object.keys(byExp).sort().forEach(function(exp) {
      var rows = byExp[exp];
      var confirmed = rows.filter(function(m) { return state.confirmed[m.id] !== false; }).length;
      html.push('<div class="section-head">' + esc(exp) + ' &mdash; ' + confirmed + ' / ' + rows.length + ' confirmed</div>');
      rows.forEach(function(m) { html.push(renderRow(m)); });
    });
    document.getElementById('matches').innerHTML = html.join('');
  } else {
    var byExp = {};
    vis.forEach(function(a) {
      var key = a.zhExpansion;
      if (!byExp[key]) byExp[key] = [];
      byExp[key].push(a);
    });
    var html = [];
    Object.keys(byExp).sort().forEach(function(exp) {
      var rows = byExp[exp];
      var confirmed = rows.filter(function(a) { return state.confirmed[a.id] !== false; }).length;
      html.push('<div class="section-head">' + esc(exp) + ' &mdash; ' + confirmed + ' / ' + rows.length + ' confirmed</div>');
      rows.forEach(function(a) { html.push(renderAmbiguousRow(a)); });
    });
    document.getElementById('ambiguous').innerHTML = html.join('');
  }
  updateStats();
}

function updateStats() {
  var total = state.matches.length;
  var confirmed = state.matches.filter(function(m) { return state.confirmed[m.id] !== false; }).length;
  var ambigLinkable = state.ambiguous.filter(function(a) { return state.confirmed[a.id] !== false && a.candidates.length === 1; }).length;
  var totalApply = confirmed + ambigLinkable;
  document.getElementById('stat-label').textContent = confirmed + ' / ' + total + ' matches confirmed';
  document.getElementById('stat-ambig').textContent = ambigLinkable + ' / ' + state.ambiguous.length + ' ambiguous linkable';
  document.getElementById('tab-ambiguous').textContent = 'Ambiguous (' + state.ambiguous.length + ')';
  var btn = document.getElementById('btn-apply');
  btn.textContent = 'Apply ' + totalApply;
  btn.disabled = totalApply === 0;
}

function toggle(id) {
  state.confirmed[id] = (state.confirmed[id] === false) ? true : false;
  var row = document.getElementById('r-' + id);
  if (row) {
    var isOn = state.confirmed[id] !== false;
    row.className = 'row' + (isOn ? '' : ' skipped');
    var btn = row.querySelector('.tog');
    if (btn) {
      btn.className = 'tog ' + (isOn ? 'on' : 'off');
      btn.innerHTML = isOn ? '&#10003; Link' : '&#10007; Skip';
    }
    // Update section header count
    var exp = state.matches.find(function(m) { return m.id === id; });
    if (exp) updateSectionCount(exp.enExpansion);
  }
  updateStats();
}

function updateSectionCount(expCode) {
  var rows = state.matches.filter(function(m) { return m.enExpansion === expCode; });
  var confirmed = rows.filter(function(m) { return state.confirmed[m.id] !== false; }).length;
  // Find section header — not worth re-querying DOM for now; full re-render on apply
}

function selectAll(val) {
  filtered().forEach(function(m) { state.confirmed[m.id] = val; });
  renderMatches();
}

function applyFilters() {
  var sel1 = document.getElementById('filter-exp');
  var sel2 = document.getElementById('filter-method');
  state.filter.exp    = sel1 ? sel1.value : '';
  state.filter.method = sel2 ? sel2.value : '';
  renderMatches();
}

function showToast(msg, isErr) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = isErr ? 'err' : '';
  t.style.display = 'block';
  setTimeout(function() { t.style.display = 'none'; }, 5000);
}

function doApply() {
  var matchIds = state.matches
    .filter(function(m) { return state.confirmed[m.id] !== false; })
    .map(function(m) { return m.id; });
  // Include ambiguous records with exactly 1 candidate that are confirmed
  var ambigIds = state.ambiguous
    .filter(function(a) { return state.confirmed[a.id] !== false && a.candidates.length === 1; })
    .map(function(a) { return a.id; });
  var ids = matchIds.concat(ambigIds);
  if (!ids.length) return;
  var btn = document.getElementById('btn-apply');
  btn.disabled = true;
  btn.textContent = 'Applying...';
  fetch('/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    showToast('Applied ' + data.applied + ' links, removed ' + data.deleted + ' orphans', false);
    // Reload
    state.matches = [];
    state.confirmed = {};
    document.getElementById('matches').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    document.getElementById('loading').textContent = 'Refreshing...';
    fetch('/api/matches').then(function(r) { return r.json(); }).then(init);
  })
  .catch(function(e) {
    showToast('Error: ' + e.message, true);
    btn.disabled = false;
    btn.textContent = 'Apply ' + ids.length;
  });
}

function init(data) {
  state.matches = data.matches || [];
  state.ambiguous = data.ambiguous || [];
  state.confirmed = {};
  
  // Initialize confirmed state for both matches and ambiguous records
  state.matches.forEach(function(m) { state.confirmed[m.id] = true; });
  state.ambiguous.forEach(function(a) { state.confirmed[a.id] = true; }); // Use the same state object for simplicity, but track ambiguous IDs separately if needed later.

  document.getElementById('loading').style.display = 'none';
  document.getElementById('matches').style.display = state.activeTab === 'matches' ? 'block' : 'none';
  document.getElementById('ambiguous').style.display = state.activeTab === 'ambiguous' ? 'block' : 'none';
  rebuildExpFilter();
  renderMatches();
}

fetch('/api/matches')
  .then(function(r) { return r.json(); })
  .then(function(data) {
    // Fetch ambiguous matches as well
    return Promise.all([
      Promise.resolve(data),
      fetch('/api/ambiguous').then(function(r) { return r.json(); })
    ]);
  })
  .then(function(results) {
    var data = results[0];
    var ambiguousData = results[1];
    init({ matches: data.matches, ambiguous: ambiguousData.ambiguous });
  })
  .catch(function(e) {
    document.getElementById('loading').textContent = 'Error: ' + e.message;
  });
</script>
</body>
</html>`;


// ── Pair Page (/pair) ─────────────────────────────────────────────────────
const PAIR_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZH↔EN Pair Builder</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;font-size:13px;padding:10px}
h1{font-size:17px;margin-bottom:8px;color:#e6edf3}
.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 10px;background:#161b22;border-radius:8px;border:1px solid #30363d;margin-bottom:10px}
select,input{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:6px;font-size:12px}
.btn{background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px}
.btn:hover{background:#30363d}.btn.active{background:#1f6feb;border-color:#388bfd;color:#fff}
.btn-load{background:#1f6feb;border-color:#388bfd;color:#fff;font-weight:600}
.btn-load:hover{background:#388bfd}
.stats{font-size:11px;color:#8b949e;display:flex;gap:10px;margin-left:auto}
.stat-g{color:#3fb950}.stat-y{color:#e3b341}
.columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.col-header{font-size:12px;color:#8b949e;padding:4px 6px;background:#161b22;border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between}
.col-header span{color:#e6edf3;font-weight:600}
.card-list{display:flex;flex-direction:column;gap:6px;min-height:60px}
.card-row{display:flex;gap:8px;align-items:flex-start;padding:8px;background:#161b22;border:2px solid #30363d;border-radius:8px;cursor:grab;transition:border-color .15s,opacity .15s;position:relative}
.card-row:hover{border-color:#58a6ff}
.card-row.dragging{opacity:.4;border-style:dashed}
.card-row.drag-over{border-color:#3fb950;background:#0d2118}
.card-row.linked{border-color:#3fb950;opacity:.6;cursor:default}
.card-row.unmatched{opacity:.5}
.fp-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px}
.card-img{width:56px;height:78px;object-fit:contain;border-radius:4px;background:#0d1117;flex-shrink:0}
.card-img-ph{width:56px;height:78px;background:#0d1117;border:1px dashed #30363d;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#484f58;font-size:9px;text-align:center;flex-shrink:0}
.card-info{flex:1;min-width:0}
.card-name{font-weight:600;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}
.card-meta{font-size:10px;color:#8b949e;margin-top:1px}
.card-fp{font-size:9px;color:#6e7681;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-tags{font-size:9px;color:#6e7681;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-linked-badge{position:absolute;top:4px;right:4px;font-size:10px;color:#3fb950}
.card-hide-btn{position:absolute;top:4px;left:4px;font-size:11px;color:#6e7681;background:none;border:none;cursor:pointer;padding:0 3px;line-height:1;opacity:0}
.card-row:hover .card-hide-btn{opacity:1}
.card-row.hidden-card{opacity:.35;border-style:dashed;border-color:#484f58}
.stat-h{color:#6e7681;cursor:pointer;text-decoration:underline dotted}
.src-link{color:#58a6ff;font-size:9px;opacity:.7;text-decoration:none;display:inline-block;margin-top:2px}
.src-link:hover{opacity:1}
.section-title{font-size:11px;color:#8b949e;padding:6px 0 4px;border-top:1px solid #21262d;margin-top:8px;cursor:pointer;display:flex;justify-content:space-between}
.section-title:hover{color:#c9d1d9}
.linked-section{margin-top:4px}
/* Modal */
.modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:center;justify-content:center}
.modal-bg.open{display:flex}
.modal{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;max-width:500px;width:90%;max-height:90vh;overflow-y:auto}
.modal h2{font-size:15px;margin-bottom:14px;color:#e6edf3}
.modal-pair{display:flex;gap:12px;margin-bottom:16px}
.modal-card{flex:1;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:10px;text-align:center}
.modal-card img{width:80px;height:112px;object-fit:contain;border-radius:4px;margin-bottom:6px}
.modal-card .mc-name{font-weight:600;font-size:12px;color:#e6edf3}
.modal-card .mc-meta{font-size:10px;color:#8b949e;margin-top:2px}
.modal-arrow{display:flex;align-items:center;color:#58a6ff;font-size:20px;flex-shrink:0}
.modal-fp-match{text-align:center;font-size:11px;margin-bottom:12px;padding:6px;border-radius:6px}
.modal-fp-match.match{background:#0d2118;color:#3fb950}
.modal-fp-match.no-match{background:#2d1b00;color:#e3b341}
.modal-actions{display:flex;gap:8px}
.btn-cancel{flex:1;background:#21262d;border:1px solid #30363d;color:#8b949e;padding:8px;border-radius:6px;cursor:pointer;font-size:13px}
.btn-cancel:hover{background:#30363d}
.btn-confirm{flex:2;background:#238636;border:1px solid #2ea043;color:#fff;padding:8px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600}
.btn-confirm:hover{background:#2ea043}
#toast{position:fixed;bottom:16px;right:16px;background:#238636;color:#fff;padding:8px 14px;border-radius:8px;display:none;font-size:13px;z-index:9999}
#toast.err{background:#da3633}
#loading{color:#8b949e;padding:20px;text-align:center}
</style>
</head>
<body>
<h1>ZH ↔ EN Pair Builder</h1>
<div class="toolbar">
  <label style="font-size:12px;color:#8b949e">ZH:
    <select id="sel-zh" onchange="onZhChange(this.value)"><option value="">— select —</option></select>
  </label>
  <label style="font-size:12px;color:#8b949e">EN:
    <select id="sel-en"><option value="">— select —</option></select>
  </label>
  <button class="btn btn-load" onclick="loadCards()">Load</button>
  <button class="btn" id="btn-remap" onclick="remapExpansion()" title="Run map-zh-to-en --apply for current ZH expansion">Re-map</button>
  <button class="btn" id="f-all"    onclick="setFilter('all')"    >All</button>
  <button class="btn" id="f-fp"     onclick="setFilter('fp')"     >Pokemon FP</button>
  <button class="btn" id="f-tag"    onclick="setFilter('tag')"    >Trainer tag</button>
  <button class="btn" id="f-linked" onclick="setFilter('linked')" >Linked</button>
  <button class="btn" id="btn-zh-linked" onclick="toggleZhLinked()" title="Show already-linked ZH cards in the left column">ZH: +Linked</button>
  <button class="btn" id="btn-hide-old-reg" onclick="toggleHideOldReg()" title="Hide cards with regulation marks A-G">Hide A-G</button>
  <select id="f-supertype" onchange="setSupertype(this.value)" style="font-size:12px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 6px">
    <option value="">All types</option>
    <option value="POKEMON">&#x1f7e2; Pokemon</option>
    <option value="TRAINER">&#x1f7e6; Trainer</option>
    <option value="ENERGY">&#x26a1; Energy</option>
  </select>
  <select id="f-ptype" onchange="setPtype(this.value)" style="font-size:12px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 6px">
    <option value="">All elements</option>
    <option value="FIRE">&#x1f525; Fire</option>
    <option value="WATER">&#x1f4a7; Water</option>
    <option value="GRASS">&#x1f33f; Grass</option>
    <option value="LIGHTNING">&#x26a1; Lightning</option>
    <option value="PSYCHIC">&#x1f52e; Psychic</option>
    <option value="FIGHTING">&#x1f94a; Fighting</option>
    <option value="DARKNESS">&#x1f311; Darkness</option>
    <option value="METAL">&#x2699;&#xfe0f; Metal</option>
    <option value="DRAGON">&#x1f409; Dragon</option>
    <option value="COLORLESS">&#x2b55; Colorless</option>
    <option value="FAIRY">&#x2728; Fairy</option>
  </select>
  <select id="f-subtype" onchange="setSubtype(this.value)" style="font-size:12px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 6px">
    <option value="">All subtypes</option>
    <option value="SUPPORTER">Supporter</option>
    <option value="ITEM">Item</option>
    <option value="STADIUM">Stadium</option>
    <option value="TOOL">Tool</option>
    <option value="BASIC_ENERGY">Basic Energy</option>
    <option value="SPECIAL_ENERGY">Special Energy</option>
  </select>
  <select id="f-reg" onchange="setRegMark(this.value)" style="font-size:12px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 6px">
    <option value="">All &#35215;&#26684;</option>
    <option value="H">H</option>
    <option value="I">I</option>
    <option value="J">J</option>
    <option value="G">G</option>
    <option value="F">F</option>
    <option value="E">E</option>
    <option value="D">D</option>
    <option value="C">C</option>
    <option value="B">B</option>
    <option value="A">A</option>
    <option value="NONE">&#8212; no mark</option>
  </select>
  <select id="f-sort" onchange="setSortBy(this.value)" style="font-size:12px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:2px 6px">
    <option value="">Sort: default</option>
    <option value="type">Sort: type &#x2192; HP &#x2193; &#x2192; DMG</option>
    <option value="hp">Sort: HP &#x2193; then DMG</option>
    <option value="damage">Sort: DMG &#x2193; then HP</option>
    <option value="tag">Sort: tag count &#x2193;</option>
    <option value="subtype">Sort: subtype &#x2192; tag &#x2193;</option>
  </select>
  <div class="stats">
    <span class="stat-g" id="st-linked">0 linked</span>
    <span class="stat-y" id="st-zh">0 ZH</span>
    <span class="stat-y" id="st-en">0 EN</span>
    <span class="stat-h" id="st-hidden" onclick="toggleShowHidden()"></span>
</div>
<div id="loading" style="display:none">Loading...</div>
<div id="main" style="display:none">
  <div class="columns">
    <div>
      <div class="col-header"><span id="zh-col-title">ZH Unlinked</span><span id="zh-count"></span></div>
      <div class="card-list" id="zh-list"></div>
    </div>
    <div>
      <div class="col-header"><span>EN Unlinked</span><span id="en-count"></span></div>
      <div class="card-list" id="en-list"></div>
    </div>
  </div>
  <div class="linked-section">
    <div class="section-title" onclick="toggleLinked()"><span id="linked-hdr">Linked pairs (0)</span><span id="linked-tog">▶</span></div>
    <div id="linked-list" style="display:none"></div>
  </div>
</div>

<!-- Confirmation modal -->
<div class="modal-bg" id="modal">
  <div class="modal">
    <h2>Confirm Link</h2>
    <div class="modal-pair">
      <div class="modal-card" id="mc-zh"></div>
      <div class="modal-arrow">↔</div>
      <div class="modal-card" id="mc-en"></div>
    </div>
    <div class="modal-fp-match" id="mc-fp-status"></div>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-confirm" id="mc-btn" onclick="confirmLink()">Link</button>
    </div>
  </div>
</div>
<div id="toast"></div>

<script>
var g = {
  zh: [], en: [], linked: [],
  fpMap: {},        // fp -> color (hex)
  pending: null,    // { zhCard, enCard }
  filter: 'all',
  linkedOpen: false,
  hidden: new Set(),   // pcIds hidden by user
  showHidden: false,
  zhShowLinked: false,  // show linked ZH cards in the ZH column
  hideOldReg: false,    // hide A-G regulation marks
  supertype: '',        // 'POKEMON'|'TRAINER'|'ENERGY'|''
  ptype: '',            // PokemonType filter
  subtype: '',          // Trainer/Energy subtype filter
  regMark: '',          // regulationMark filter
  sortBy: '',           // 'hp'|'damage'|'tag'|''
};

var FP_COLORS = ['#1f4e6e','#1e3a5f','#2d4a1e','#4a1e2d','#2d2a1e','#1e2d4a','#3a1e4a','#1e4a3a'];
var fpColorIdx = 0;
var fpColorCache = {};

function fpColor(fp) {
  if (!fp) return '#21262d';
  if (!fpColorCache[fp]) { fpColorCache[fp] = FP_COLORS[fpColorIdx++ % FP_COLORS.length]; }
  return fpColorCache[fp];
}

function esc(s) { return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function imgSrc(url) { if(!url) return ''; return url.indexOf('http')===0?url:'/local-img?p='+encodeURIComponent(url); }

function showToast(msg,err){
  var t=document.getElementById('toast');
  t.textContent=msg; t.className=err?'err':''; t.style.display='block';
  clearTimeout(t._tid); t._tid=setTimeout(function(){t.style.display='none';},3000);
}

function cardSearchUrl(name,exp,src){ return src||('https://www.google.com/search?q='+encodeURIComponent('pokemon card '+(name||'')+' '+(exp||''))+'&tbm=isch'); }

function imgErr(el) { el.style.display='none'; if(el.nextSibling) el.nextSibling.style.display='flex'; }

function imgHtml(url,id,w,h){
  var label=esc(id||'no img');
  if(!url) return '<div class="card-img-ph" style="width:'+w+'px;height:'+h+'px">'+label+'</div>';
  return '<img class="card-img" style="width:'+w+'px;height:'+h+'px" src="'+esc(imgSrc(url))+'" loading="lazy" alt="" onerror="imgErr(this)">'
    +'<div class="card-img-ph" style="width:'+w+'px;height:'+h+'px;display:none">'+label+'</div>';
}

function cardHtml(c, side) {
  var fp = c.attackFp || c.effectFp || '';
  var color = fp ? fpColor(fp) : '#21262d';
  var linked = c.linkedEnId || c.linkedZhId;
  var hidden = !linked && g.hidden.has(c.pcId);
  var cls = 'card-row' + (linked?' linked':'') + (hidden?' hidden-card':'');
  var drag = linked ? '' : ' draggable="true" data-side="'+esc(side)+'" data-pcid="'+esc(c.pcId)+'" data-webid="'+esc(c.webCardId)+'" ondragstart="onDragStart(event,this)" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event,this)"';
  var meta = [];
  if (c.hp) meta.push('HP'+c.hp);
  if (c.maxDamage) meta.push('ATK'+c.maxDamage);
  if (c.types && c.types.length) meta.push(c.types.join('/'));
  if (c.rarity) meta.push(c.rarity);
  if (c.expCode) meta.push(c.expCode+(c.cardNumber?'#'+c.cardNumber:''));
  var fpShort = fp ? fp.substring(0,60)+(fp.length>60?'…':'') : '';
  var tags = c.effectTags && c.effectTags.length ? c.effectTags.slice(0,4).join(' · ') : '';
  return '<div class="'+cls+'" id="pr-'+esc(c.pcId)+'"'+drag+'>'
    +'<button class="card-hide-btn" data-pcid="'+esc(c.pcId)+'" onclick="hideCard(event,this.dataset.pcid)">&#x2715;</button>'
    +'<div class="fp-dot" style="background:'+color+'" title="'+esc(fp)+'"></div>'
    +imgHtml(c.imageUrl, c.webCardId, 56, 78)
    +'<div class="card-info">'
      +'<div class="card-name">'+esc(c.name)+'</div>'
      +'<div class="card-meta">'+esc(meta.join(' · '))+'</div>'
      +(fpShort?'<div class="card-fp">'+esc(fpShort)+'</div>':'')
      +(tags?'<div class="card-tags">tags: '+esc(tags)+'</div>':'')
      +'<a class="src-link" href="'+esc(cardSearchUrl(c.name,c.expCode,c.sourceUrl))+'" target="_blank">🔍 ref</a>'
    +'</div>'
    +(linked?'<span class="card-linked-badge">✓</span>':'')
    +'</div>';
}

function linkedPairHtml(p) {
  var meta = [];
  if (p.hp) meta.push('HP'+p.hp);
  if (p.types && p.types.length) meta.push(p.types.join('/'));
  if (p.rarity) meta.push(p.rarity);
  return '<div class="card-row linked" style="margin-bottom:4px">'
    +'<div class="fp-dot" style="background:#3fb950"></div>'
    +imgHtml(p.zhImageUrl, p.zhWebCardId, 40, 56)
    +imgHtml(p.enImageUrl, p.enWebCardId, 40, 56)
    +'<div class="card-info">'
      +'<div class="card-name">'+esc(p.zhName)+' ↔ '+esc(p.enName)+'</div>'
      +'<div class="card-meta">'+esc(meta.join(' · '))+' | '+esc(p.zhExpCode)+'→'+esc(p.enExpCode)+'</div>'
    +'</div><span class="card-linked-badge">✓</span></div>';
}

function applyFilter(list, isZhSide) {
  var f = g.filter;
  var showH = g.showHidden;
  var OLD_REGS = ['A','B','C','D','E','F','G'];
  // For ZH side: optionally include linked cards
  var base;
  if (isZhSide && g.zhShowLinked) {
    base = list.filter(function(c){ return (showH || !g.hidden.has(c.pcId)); });
  } else {
    base = list.filter(function(c){ return !c.linkedEnId && !c.linkedZhId && (showH || !g.hidden.has(c.pcId)); });
  }
  if (f === 'linked') return list.filter(function(c){ return c.linkedEnId || c.linkedZhId; });
  var result = base;
  if (f === 'fp') result = result.filter(function(c){ return c.attackFp; });
  else if (f === 'tag') result = result.filter(function(c){ return c.effectFp && !c.attackFp; });
  if (g.supertype) result = result.filter(function(c){ return c.supertype === g.supertype; });
  if (g.ptype) result = result.filter(function(c){ return c.types && c.types.indexOf(g.ptype) !== -1; });
  if (g.subtype) result = result.filter(function(c){ return c.subtypes && c.subtypes.indexOf(g.subtype) !== -1; });
  if (g.regMark === 'NONE') result = result.filter(function(c){ return !c.regulationMark; });
  else if (g.regMark) result = result.filter(function(c){ return c.regulationMark === g.regMark; });
  if (g.hideOldReg) result = result.filter(function(c){ return !c.regulationMark || OLD_REGS.indexOf(c.regulationMark) === -1; });
  return result;
}

function setSupertype(v) { g.supertype = v; render(); }
function setPtype(v) { g.ptype = v; render(); }
function setSubtype(v) { g.subtype = v; render(); }
function setRegMark(v) { g.regMark = v; render(); }
function setSortBy(v) { g.sortBy = v; render(); }
function toggleZhLinked() {
  g.zhShowLinked = !g.zhShowLinked;
  var btn = document.getElementById('btn-zh-linked');
  if (btn) btn.classList.toggle('active', g.zhShowLinked);
  render();
}
function toggleHideOldReg() {
  g.hideOldReg = !g.hideOldReg;
  var btn = document.getElementById('btn-hide-old-reg');
  if (btn) btn.classList.toggle('active', g.hideOldReg);
  render();
}

function remapExpansion() {
  var zh = document.getElementById('sel-zh').value;
  if (!zh || zh === 'ALL') { alert('Select a specific ZH expansion to re-map (not All unlinked)'); return; }
  var btn = document.getElementById('btn-remap');
  btn.disabled = true; btn.textContent = 'Re-mapping...';
  fetch('/api/remap-expansion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expansion: zh })
  }).then(function(r) { return r.json(); }).then(function(d) {
    btn.disabled = false; btn.textContent = 'Re-map';
    if (d.error) { alert('Error: ' + d.error); return; }
    alert((d.ok ? 'Re-map complete' : 'Re-map finished (exit ' + d.exitCode + ')') + '\\n\\n' + (d.summary || 'No output'));
    loadCards();
  }).catch(function(e) { btn.disabled = false; btn.textContent = 'Re-map'; alert('Error: ' + e); });
}

var TYPE_ORDER = ['FIRE','WATER','GRASS','LIGHTNING','PSYCHIC','FIGHTING','DARKNESS','METAL','DRAGON','COLORLESS','FAIRY'];
var SUBTYPE_ORDER = ['SUPPORTER','ITEM','STADIUM','TOOL','BASIC_ENERGY','SPECIAL_ENERGY'];

function applySort(list) {
  if (!g.sortBy) return list;
  var s = g.sortBy;
  return list.slice().sort(function(a, b) {
    if (s === 'type') {
      var ta = (a.types && a.types[0]) || 'ZZZ';
      var tb = (b.types && b.types[0]) || 'ZZZ';
      var ti = TYPE_ORDER.indexOf(ta); var tj = TYPE_ORDER.indexOf(tb);
      if (ti === -1) ti = 99; if (tj === -1) tj = 99;
      if (ti !== tj) return ti - tj;
      var hd = (b.hp || 0) - (a.hp || 0);
      return hd !== 0 ? hd : (b.maxDamage || 0) - (a.maxDamage || 0);
    }
    if (s === 'hp') {
      var d = (b.hp || 0) - (a.hp || 0);
      return d !== 0 ? d : (b.maxDamage || 0) - (a.maxDamage || 0);
    }
    if (s === 'damage') {
      var d = (b.maxDamage || 0) - (a.maxDamage || 0);
      return d !== 0 ? d : (b.hp || 0) - (a.hp || 0);
    }
    if (s === 'tag') return (b.effectTags ? b.effectTags.length : 0) - (a.effectTags ? a.effectTags.length : 0);
    if (s === 'subtype') {
      var sa = (a.subtypes && a.subtypes[0]) || '';
      var sb = (b.subtypes && b.subtypes[0]) || '';
      var si = SUBTYPE_ORDER.indexOf(sa); var sj = SUBTYPE_ORDER.indexOf(sb);
      if (si === -1) si = 99; if (sj === -1) sj = 99;
      if (si !== sj) return si - sj;
      return (b.effectTags ? b.effectTags.length : 0) - (a.effectTags ? a.effectTags.length : 0);
    }
    return 0;
  });
}

function hideCard(e, pcId) {
  e.stopPropagation(); e.preventDefault();
  if (g.hidden.has(pcId)) g.hidden.delete(pcId); else g.hidden.add(pcId);
  render();
}

function toggleShowHidden() {
  g.showHidden = !g.showHidden;
  render();
}

function render() {
  var zhShow = g.filter === 'linked' ? g.zh.filter(function(c){return c.linkedEnId;}) : applyFilter(g.zh, true);
  var enShow = g.filter === 'linked' ? g.en.filter(function(c){return c.linkedZhId;}) : applyFilter(g.en, false);
  zhShow = applySort(zhShow);
  enShow = applySort(enShow);

  var zhColEl = document.getElementById('zh-col-title');
  if (zhColEl) zhColEl.textContent = g.zhShowLinked ? 'ZH All' : 'ZH Unlinked';

  document.getElementById('zh-list').innerHTML = zhShow.map(function(c){return cardHtml(c,'zh');}).join('') || '<div style="color:#6e7681;padding:12px;text-align:center">None</div>';
  document.getElementById('en-list').innerHTML = enShow.map(function(c){return cardHtml(c,'en');}).join('') || '<div style="color:#6e7681;padding:12px;text-align:center">None</div>';
  document.getElementById('zh-count').textContent = zhShow.length;
  document.getElementById('en-count').textContent = enShow.length;

  // Stats
  var linkedZh = g.zh.filter(function(c){return c.linkedEnId;}).length;
  var hiddenCount = g.hidden.size;
  document.getElementById('st-linked').textContent = linkedZh + ' linked';
  document.getElementById('st-zh').textContent = g.zh.filter(function(c){return !c.linkedEnId;}).length + ' ZH unlinked';
  document.getElementById('st-en').textContent = g.en.filter(function(c){return !c.linkedZhId;}).length + ' EN unlinked';
  var hidEl = document.getElementById('st-hidden');
  if (hidEl) hidEl.textContent = hiddenCount ? (g.showHidden ? 'hide hidden ('+hiddenCount+')' : 'show hidden ('+hiddenCount+')') : '';

  // Linked section
  document.getElementById('linked-hdr').textContent = 'Linked pairs (' + g.linked.length + ')';
  if (g.linkedOpen) {
    document.getElementById('linked-list').innerHTML = g.linked.map(linkedPairHtml).join('');
  }
}

function setFilter(f) {
  g.filter = f;
  ['all','fp','tag','linked'].forEach(function(id){
    var el = document.getElementById('f-'+id);
    if (el) el.classList.toggle('active', id===f);
  });
  render();
}

function toggleLinked() {
  g.linkedOpen = !g.linkedOpen;
  document.getElementById('linked-tog').textContent = g.linkedOpen ? '▼' : '▶';
  document.getElementById('linked-list').style.display = g.linkedOpen ? '' : 'none';
  if (g.linkedOpen) document.getElementById('linked-list').innerHTML = g.linked.map(linkedPairHtml).join('');
}

// ── Drag-and-drop ──
var dragState = null;

function onDragStart(e, el) {
  dragState = { side: el.dataset.side, pcId: el.dataset.pcid, webCardId: el.dataset.webid };
  e.dataTransfer.effectAllowed = 'link';
}
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e, el) {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if (!dragState) return;
  var targetSide = el.dataset.side; var targetPcId = el.dataset.pcid; var targetWebCardId = el.dataset.webid;
  if (dragState.side === targetSide) { dragState=null; return; }  // same side = no-op
  var zhWebId = dragState.side === 'zh' ? dragState.webCardId : targetWebCardId;
  var enWebId  = dragState.side === 'en' ? dragState.webCardId : targetWebCardId;
  var zhPcId  = dragState.side === 'zh' ? dragState.pcId : targetPcId;
  var enPcId  = dragState.side === 'en' ? dragState.pcId : targetPcId;
  dragState = null;
  openModal(zhWebId, enWebId, zhPcId, enPcId);
}

function findCard(list, pcId) { return list.find(function(c){return c.pcId===pcId;})||null; }

function openModal(zhWebId, enWebId, zhPcId, enPcId) {
  var zh = findCard(g.zh, zhPcId);
  var en = findCard(g.en, enPcId);
  if (!zh || !en) return;
  g.pending = { zhWebId: zhWebId, enWebId: enWebId };

  var fpMatch = zh.attackFp && en.attackFp && zh.attackFp === en.attackFp;
  var tagMatch = zh.effectFp && en.effectFp && zh.effectFp === en.effectFp;

  document.getElementById('mc-zh').innerHTML =
    imgHtml(zh.imageUrl, zh.webCardId, 80, 112)
    + '<div class="mc-name">'+esc(zh.name)+'</div>'
    + '<div class="mc-meta">'+esc(zh.expCode)+'<br>'+esc(zh.webCardId)+'</div>';
  document.getElementById('mc-en').innerHTML =
    imgHtml(en.imageUrl, en.webCardId, 80, 112)
    + '<div class="mc-name">'+esc(en.name)+'</div>'
    + '<div class="mc-meta">'+esc(en.expCode)+'<br>'+esc(en.webCardId)+'</div>';

  var fpEl = document.getElementById('mc-fp-status');
  if (fpMatch) {
    fpEl.className='modal-fp-match match'; fpEl.textContent='✓ Attack fingerprint matches';
  } else if (tagMatch) {
    fpEl.className='modal-fp-match match'; fpEl.textContent='✓ Trainer effect tags match';
  } else {
    fpEl.className='modal-fp-match no-match'; fpEl.textContent='⚠ Fingerprints do NOT match — verify manually';
  }
  document.getElementById('modal').classList.add('open');
  var btn = document.getElementById('mc-btn');
  btn.disabled=false; btn.textContent='Link';
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  g.pending = null;
}

function confirmLink() {
  if (!g.pending) return;
  var zh = g.pending.zhWebId, en = g.pending.enWebId;
  var btn = document.getElementById('mc-btn');
  btn.disabled=true; btn.textContent='Linking...';
  fetch('/api/link-by-webid',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ zhWebId: zh, enWebId: en })
  }).then(function(r){return r.json();})
    .then(function(data){
      if(data.error) throw new Error(data.error);
      btn.disabled=false; btn.textContent='Link';
      showToast('✓ Linked: '+zh+' ↔ '+en);
      closeModal();
      // Mark both as linked locally
      var zhC = g.zh.find(function(c){return c.webCardId===zh;});
      var enC = g.en.find(function(c){return c.webCardId===en;});
      if(zhC) zhC.linkedEnId = enC ? enC.pcId : en;
      if(enC) enC.linkedZhId = zhC ? zhC.pcId : zh;
      if(zhC && enC) g.linked.unshift({
        zhName:zhC.name, enName:enC.name, zhExpCode:zhC.expCode, enExpCode:enC.expCode,
        zhImageUrl:zhC.imageUrl, enImageUrl:enC.imageUrl,
        zhWebCardId:zh, enWebCardId:en,
        hp:zhC.hp, types:zhC.types, rarity:zhC.rarity,
      });
      // Auto-open linked section to show new pair
      g.linkedOpen = true;
      document.getElementById('linked-tog').textContent = '\u25bc';
      document.getElementById('linked-list').style.display = '';
      render();
    }).catch(function(err){
      showToast('Error: '+err.message, true);
      btn.disabled=false; btn.textContent='Link';
    });
}

// ── Expansion selectors ──
var ZH_TO_EN = __ZH_TO_EN_JSON__;

// All EN codes stored for rebuilding dropdown
var ALL_EN_CODES = [];

function onZhChange(zhCode) {
  var sel = document.getElementById('sel-en');
  if (!zhCode || zhCode === 'ALL') {
    // Show all EN options
    sel.innerHTML = '<option value="">Any</option>';
    ALL_EN_CODES.forEach(function(c){ sel.innerHTML += '<option value="'+esc(c)+'">'+esc(c)+'</option>'; });
    return;
  }
  var enCode = ZH_TO_EN[zhCode] || '';
  // Rebuild EN dropdown: only the mapped expansion + Any
  sel.innerHTML = '<option value="">Any</option>';
  if (enCode) sel.innerHTML += '<option value="'+esc(enCode)+'" selected>'+esc(enCode)+'</option>';
  else ALL_EN_CODES.forEach(function(c){ sel.innerHTML += '<option value="'+esc(c)+'">'+esc(c)+'</option>'; });
}

function loadCards() {
  var zh = document.getElementById('sel-zh').value;
  var en = document.getElementById('sel-en').value;
  if (!zh) { showToast('Select a ZH expansion', true); return; }
  // For ALL mode force no EN filter
  if (zh === 'ALL') en = '';
  document.getElementById('loading').style.display='';
  document.getElementById('main').style.display='none';
  fpColorCache = {}; fpColorIdx = 0; g.fp = {};
  fetch('/api/expansion-cards?zh='+encodeURIComponent(zh)+(en?'&en='+encodeURIComponent(en):''))
    .then(function(r){return r.json();})
    .then(function(data){
      if(data.error) throw new Error(data.error);
      g.zh = data.zhCards; g.en = data.enCards; g.linked = data.linked; g.pending=null;
      // Pre-assign FP colors so matching cards share same color across both columns
      var allCards = g.zh.concat(g.en);
      allCards.forEach(function(c){
        var fp = c.attackFp || c.effectFp;
        if (fp) fpColor(fp);
      });
      document.getElementById('loading').style.display='none';
      document.getElementById('main').style.display='';
      setFilter('all');
    }).catch(function(err){
      document.getElementById('loading').textContent = 'Error: '+err.message;
    });
}

// Populate expansion selectors on page load
fetch('/api/expansions')
  .then(function(r){return r.json();})
  .then(function(data){
    var zhSel = document.getElementById('sel-zh');
    var enSel = document.getElementById('sel-en');
    ALL_EN_CODES = data.en.sort();
    enSel.innerHTML = '<option value="">Any</option>';
    // ZH dropdown: All Unlinked first, then per-expansion
    zhSel.innerHTML = '<option value="">\u2014 select \u2014</option><option value="ALL">\u2605 All unlinked</option>';
    data.zh.sort().forEach(function(c){
      zhSel.innerHTML += '<option value="'+esc(c)+'">'+esc(c)+'</option>';
    });
    ALL_EN_CODES.forEach(function(c){
      enSel.innerHTML += '<option value="'+esc(c)+'">'+esc(c)+'</option>';
    });
  });
</script>
</body>
</html>`;


// ─────────────────────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────────────────────
// ── Linkage Review Page (/link) ───────────────────────────────────────────
const LINK_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ZH→EN Linkage Review</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;font-size:13px;padding:12px}
h1{font-size:18px;margin-bottom:8px;color:#e6edf3}
.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:8px;background:#161b22;border-radius:8px;border:1px solid #30363d}
select{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:6px;font-size:12px}
.stats{display:flex;gap:12px;font-size:12px;color:#8b949e;margin-left:auto}
.stat.green{color:#3fb950}.stat.yellow{color:#e3b341}
.grid{display:flex;flex-wrap:wrap;gap:10px}
.link-card{background:#161b22;border:2px solid #30363d;border-radius:10px;padding:10px;width:340px;transition:border-color .15s}
.link-card.done{border-color:#3fb950;opacity:.7}
.link-card.skipped{border-color:#484f58;opacity:.5}
.zh-side{display:flex;gap:8px;margin-bottom:8px}
.zh-img-wrap{width:80px;height:112px;flex-shrink:0;position:relative}
.zh-img-wrap img{width:80px;height:112px;object-fit:contain;border-radius:4px;background:#0d1117}
.img-placeholder{display:flex;align-items:center;justify-content:center;background:#0d1117;border-radius:4px;border:1px dashed #30363d;color:#484f58;font-size:10px;text-align:center}
.zh-info{flex:1;min-width:0}
.zh-name{font-weight:600;color:#e6edf3;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.zh-exp{font-size:11px;color:#8b949e;margin-bottom:4px}
.zh-meta{font-size:10px;color:#6e7681;margin-bottom:4px}
.reason-tag{font-size:10px;background:#21262d;padding:2px 6px;border-radius:4px;color:#8b949e;display:inline-block}
.candidates-label{font-size:11px;color:#8b949e;margin-bottom:5px}
.no-cands{font-size:11px;color:#e3b341;padding:8px;background:#21262d;border-radius:6px;text-align:center;margin-bottom:6px}
.candidates{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.cand{width:96px;border:2px solid #30363d;border-radius:6px;padding:4px;cursor:pointer;transition:border-color .15s;position:relative}
.cand:hover{border-color:#58a6ff}
.cand.selected{border-color:#3fb950;background:#0d2118}
.cand-tick{position:absolute;top:2px;right:3px;color:#3fb950;font-size:14px;display:none}
.cand.selected .cand-tick{display:block}
.cand img{width:100%;aspect-ratio:3/4;object-fit:contain;border-radius:4px;background:#0d1117}
.cand-name{font-size:10px;color:#c9d1d9;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cand-meta{font-size:9px;color:#6e7681}
.card-actions{display:flex;gap:6px}
.btn-skip{flex:1;background:#21262d;border:1px solid #30363d;color:#8b949e;padding:5px;border-radius:6px;cursor:pointer;font-size:12px}
.btn-skip:hover{background:#30363d;color:#c9d1d9}
.btn-apply{flex:2;background:#238636;border:1px solid #2ea043;color:#fff;padding:5px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}
.btn-apply:hover:not(:disabled){background:#2ea043}
.btn-apply:disabled{opacity:.5;cursor:default}
.done-badge{color:#3fb950;font-size:12px;padding:6px;text-align:center;flex:1}
.skip-badge{color:#6e7681;font-size:12px;padding:6px;text-align:center;flex:1}
#toast{position:fixed;bottom:16px;right:16px;background:#238636;color:#fff;padding:8px 14px;border-radius:8px;display:none;font-size:13px;z-index:9999}
#toast.err{background:#da3633}
.src-link{color:#58a6ff;font-size:10px;text-decoration:none;opacity:0.75;display:inline-block;margin-top:2px}.src-link:hover{opacity:1}
</style>
</head>
<body>
<h1>ZH&#8594;EN Linkage</h1>
<div class="direct-link-panel" style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px 12px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
  <span style="color:#8b949e;font-size:12px;white-space:nowrap">Direct link:</span>
  <input id="dl-zh" placeholder="ZH webCardId (e.g. hk12387)" style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:6px;font-size:12px;width:200px">
  <input id="dl-en" placeholder="EN webCardId (e.g. en16815)" style="background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:6px;font-size:12px;width:200px">
  <button onclick="directLink()" style="background:#238636;border:1px solid #2ea043;color:#fff;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Link</button>
  <span id="dl-status" style="font-size:12px;color:#8b949e"></span>
</div>
<div class="toolbar">
  <label>Expansion: <select id="exp-filter" onchange="filterByExp(this.value)"><option value="">All</option></select></label>
  <div class="stats">
    <span class="stat green" id="stat-linked"></span>
    <span class="stat yellow" id="stat-skipped"></span>
    <span class="stat" id="stat-total"></span>
  </div>
</div>
<div class="grid" id="grid"></div>
<div id="toast"></div>
<script>
var state = {
  all: [],
  byExp: {},
  activeExp: '',
  resolved: {},
  selected: {},
};

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function imgSrc(url) {
  if (!url) return '';
  if (url.indexOf('http') === 0) return url;
  return '/local-img?p=' + encodeURIComponent(url);
}

function showToast(msg, isErr) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = isErr ? 'err' : '';
  t.style.display = 'block';
  clearTimeout(t._tid);
  t._tid = setTimeout(function(){ t.style.display='none'; }, 3000);
}

function updateProgress() {
  var linked = Object.values(state.resolved).filter(function(v){ return v==='linked'; }).length;
  var skipped = Object.values(state.resolved).filter(function(v){ return v==='skipped'; }).length;
  var total = state.all.length;
  document.getElementById('stat-linked').textContent = '\u2713 ' + linked + ' linked';
  document.getElementById('stat-skipped').textContent = '\u2717 ' + skipped + ' skipped';
  document.getElementById('stat-total').textContent = total + ' total';
}

function handleCandClick(el) { selectCandidate(el.dataset.cardid, el.dataset.enid); }
function handleSkip(el) { skipCard(el.dataset.cardid); }
function handleApply(el) { applyCard(el.dataset.cardid); }

function selectCandidate(cardId, enPrimaryCardId) {
  state.selected[cardId] = enPrimaryCardId;
  var row = document.getElementById('lc-' + cardId);
  if (!row) return;
  row.querySelectorAll('.cand').forEach(function(el) {
    el.classList.toggle('selected', el.dataset.enid === enPrimaryCardId);
  });
  var btn = row.querySelector('.btn-apply');
  if (btn) btn.disabled = false;
}

function skipCard(cardId) {
  state.resolved[cardId] = 'skipped';
  var row = document.getElementById('lc-' + cardId);
  if (row) {
    row.classList.add('skipped');
    var acts = row.querySelector('.card-actions');
    if (acts) acts.innerHTML = '<div class="skip-badge">\u2717 Skipped</div>';
  }
  updateProgress();
}

function applyCard(cardId) {
  var enId = state.selected[cardId];
  if (!enId) return;
  var btn = document.querySelector('#lc-' + cardId + ' .btn-apply');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  fetch('/api/link-one', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zhId: cardId, enId: enId })
  }).then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      state.resolved[cardId] = 'linked';
      var row = document.getElementById('lc-' + cardId);
      if (row) {
        row.classList.add('done');
        var acts = row.querySelector('.card-actions');
        if (acts) acts.innerHTML = '<div class="done-badge">\u2713 Linked</div>';
      }
      updateProgress();
    }).catch(function(err) {
      showToast('Error: ' + err.message, true);
      if (btn) { btn.disabled = false; btn.textContent = 'Link'; }
    });
}

function directLink() {
  var zh = document.getElementById('dl-zh').value.trim();
  var en = document.getElementById('dl-en').value.trim();
  var st = document.getElementById('dl-status');
  if (!zh || !en) { st.style.color='#e3b341'; st.textContent='Enter both IDs'; return; }
  st.style.color='#8b949e'; st.textContent='Linking...';
  fetch('/api/link-by-webid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zhWebId: zh, enWebId: en })
  }).then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) throw new Error(data.error);
      st.style.color='#3fb950';
      st.textContent = '\u2713 Linked: ' + (data.zhName||zh) + ' \u2194 ' + (data.enName||en);
      document.getElementById('dl-zh').value = '';
      document.getElementById('dl-en').value = '';
    }).catch(function(err) {
      st.style.color='#da3633'; st.textContent = 'Error: ' + err.message;
    });
}

function cardSearchUrl(name, exp, src) {
  if (src) return src;
  return 'https://www.google.com/search?q=' + encodeURIComponent('pokemon card ' + (name||'') + ' ' + (exp||'')) + '&tbm=isch';
}
function imgError(el) { el.style.display='none'; if(el.nextSibling) el.nextSibling.style.display='flex'; }

function zhImgHtml(url, id) {
  var label = id ? esc(id) : 'No img';
  if (!url) return '<div class="img-placeholder" style="width:80px;height:112px">' + label + '</div>';
  return '<img src="' + esc(imgSrc(url)) + '" style="width:80px;height:112px;object-fit:contain;border-radius:4px;background:#0d1117" loading="lazy" alt=""'
    + ' onerror="imgError(this)">'
    + '<div class="img-placeholder" style="width:80px;height:112px;display:none">' + label + '</div>';
}

function candImgHtml(url, id) {
  var label = id ? esc(id) : 'No img';
  if (!url) return '<div class="img-placeholder" style="aspect-ratio:3/4">' + label + '</div>';
  return '<img src="' + esc(imgSrc(url)) + '" loading="lazy" alt="" style="width:100%;aspect-ratio:3/4;object-fit:contain;border-radius:4px;background:#0d1117"'
    + ' onerror="imgError(this)">'
    + '<div class="img-placeholder" style="aspect-ratio:3/4;display:none">' + label + '</div>';
}

function renderCard(a) {
  var resolved = state.resolved[a.id];
  var selectedEnId = state.selected[a.id];
  var p = [];
  p.push('<div class="link-card' + (resolved==='linked'?' done':resolved==='skipped'?' skipped':'') + '" id="lc-' + esc(a.id) + '">');
  p.push('<div class="zh-side">');
  p.push('<div class="zh-img-wrap">' + zhImgHtml(a.zhImageUrl, a.zhWebCardId) + '</div>');
  p.push('<div class="zh-info">');
  p.push('<div class="zh-name">' + esc(a.zhName) + '</div>');
  p.push('<a class="src-link" href="' + esc(cardSearchUrl(a.zhName, a.zhExpansion, a.zhSourceUrl)) + '" target="_blank" onclick="event.stopPropagation()">&#128269; ref</a>');
  p.push('<div class="zh-exp">' + esc(a.zhExpansion) + '</div>');
  var meta = [];
  if (a.hp) meta.push('HP ' + a.hp);
  if (a.types && a.types.length) meta.push(a.types.join('/'));
  if (a.rarity) meta.push(a.rarity);
  if (a.regulationMark) meta.push('Reg:' + a.regulationMark);
  if (meta.length) p.push('<div class="zh-meta">' + esc(meta.join(' \u00b7 ')) + '</div>');
  p.push('<div class="reason-tag">' + esc(a.reason || a.matchMethod) + '</div>');
  p.push('</div></div>');
  if (a.candidates.length === 0) {
    p.push('<div class="no-cands">No EN candidates found</div>');
  } else {
    p.push('<div class="candidates-label">' + a.candidates.length + ' candidate' + (a.candidates.length!==1?'s':'') + ' \u2014 click to select:</div>');
    p.push('<div class="candidates">');
    a.candidates.forEach(function(c) {
      var isSel = selectedEnId === c.enPrimaryCardId;
      p.push('<div class="cand' + (isSel?' selected':'') + '" data-cardid="' + esc(a.id) + '" data-enid="' + esc(c.enPrimaryCardId) + '" onclick="handleCandClick(this)">');
      p.push('<div class="cand-tick">\u2713</div>');
      p.push(candImgHtml(c.enImageUrl, c.enWebCardId));
      p.push('<div class="cand-name">' + esc(c.enName) + '</div>');
      var cmeta = [esc(c.enExpansion)];
      if (c.enNumber) cmeta.push('#'+esc(c.enNumber));
      if (c.hp) cmeta.push('HP'+c.hp);
      p.push('<div class="cand-meta">' + cmeta.join(' ') + '</div>');
      p.push('<a class="src-link" href="' + esc(cardSearchUrl(c.enName, c.enExpansion, c.enSourceUrl)) + '" target="_blank" onclick="event.stopPropagation()">&#128269; ref</a>');
      p.push('</div>');
    });
    p.push('</div>');
  }
  p.push('<div class="card-actions">');
  if (resolved === 'linked') {
    p.push('<div class="done-badge">\u2713 Linked</div>');
  } else if (resolved === 'skipped') {
    p.push('<div class="skip-badge">\u2717 Skipped</div>');
  } else {
    p.push('<button class="btn-skip" data-cardid="' + esc(a.id) + '" onclick="handleSkip(this)">Skip</button>');
    p.push('<button class="btn-apply" data-cardid="' + esc(a.id) + '" onclick="handleApply(this)" ' + (selectedEnId?'':'disabled') + '>Link</button>');
  }
  p.push('</div></div>');
  return p.join('');
}

function render() {
  var list = state.activeExp ? (state.byExp[state.activeExp] || []) : state.all;
  var html = [];
  list.forEach(function(a) { html.push(renderCard(a)); });
  document.getElementById('grid').innerHTML = html.join('');
  updateProgress();
}

function filterByExp(exp) { state.activeExp = exp; render(); }

function buildExpFilter(items) {
  var exps = {};
  items.forEach(function(a) { exps[a.zhExpansion] = (exps[a.zhExpansion]||0) + 1; });
  var sel = document.getElementById('exp-filter');
  var cur = sel.value;
  sel.innerHTML = '<option value="">All (' + items.length + ')</option>';
  Object.keys(exps).sort().forEach(function(exp) {
    var opt = document.createElement('option');
    opt.value = exp; opt.textContent = exp + ' (' + exps[exp] + ')';
    if (exp === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}

fetch('/api/ambiguous')
  .then(function(r) { return r.json(); })
  .then(function(data) {
    state.all = data.ambiguous || [];
    state.byExp = {};
    state.all.forEach(function(a) {
      if (!state.byExp[a.zhExpansion]) state.byExp[a.zhExpansion] = [];
      state.byExp[a.zhExpansion].push(a);
    });
    state.all.forEach(function(a) {
      if (a.candidates.length === 1) state.selected[a.id] = a.candidates[0].enPrimaryCardId;
    });
    buildExpFilter(state.all);
    render();
  });
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  const u = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const p = u.pathname;

  if (p === '/' || p === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE_HTML);
    return;
  }

  if (p === '/api/matches') {
    getMatches()
      .then(result => sendJson(res, { total: result.updates.length, matches: result.updates.map(toReviewMatch) }))
      .catch(e => sendJson(res, { error: String(e) }, 500));
    return;
  }

  if (p === '/api/ambiguous') {
    getMatches()
      .then(result => sendJson(res, {
        total: result.ambiguous.length,
        ambiguous: result.ambiguous.map(toAmbiguousReview),
      }))
      .catch(e => sendJson(res, { error: String(e) }, 500));
    return;
  }

  if (p === '/api/apply' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      getMatches().then(async result => {
        const { ids } = JSON.parse(body) as { ids: string[] };
        // Build a combined map: zhPrimaryCardId → enPrimaryCardId
        // from both confirmed matches and ambiguous records with 1 candidate
        const linkMap = new Map<string, string>();
        for (const u of result.updates) {
          if (ids.includes(u.zhPrimaryCardId))
            linkMap.set(u.zhPrimaryCardId, u.enPrimaryCard.id);
        }
        for (const a of result.ambiguous) {
          if (ids.includes(a.zhPrimaryCardId) && a.enCandidates.length === 1)
            linkMap.set(a.zhPrimaryCardId, a.enCandidates[0].id);
        }
        if (linkMap.size === 0) return { applied: 0, deleted: 0 };
        // Re-point EN cards to ZH PrimaryCard (correct linking mechanism)
        let applied = 0;
        let deleted = 0;
        for (const [zhId, enId] of linkMap) {
          await prisma.card.updateMany({ where: { primaryCardId: enId }, data: { primaryCardId: zhId } }).catch(() => null);
          const remaining = await prisma.card.count({ where: { primaryCardId: enId } }).catch(() => 1);
          if (remaining === 0) { await prisma.primaryCard.delete({ where: { id: enId } }).catch(() => null); deleted++; }
          applied++;
        }
        cachedUpdates = null;
        cachedAmbiguous = null;
        cacheBuilding = false;
        return { applied, deleted };
      })
      .then(result => sendJson(res, result))
      .catch(e => sendJson(res, { error: String(e) }, 500));
    });
    return;
  }

  if (p === '/pair' || p === '/pair/') {
    // Inject ZH_TO_EN_CODE as JSON for the client-side JS
    const pairHtml = PAIR_PAGE_HTML.replace('__ZH_TO_EN_JSON__', JSON.stringify(ZH_TO_EN_CODE));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pairHtml);
    return;
  }

  if (p === '/link' || p === '/link/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(LINK_PAGE_HTML);
    return;
  }

  if (p === '/api/expansions' && req.method === 'GET') {
    prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT pe.code, 'ZH' as lang
      FROM primary_expansions pe
      WHERE EXISTS (
        SELECT 1 FROM primary_cards pc2
        JOIN cards c ON c."primaryCardId" = pc2.id AND c.language = 'ZH_TW'
        WHERE pc2."primaryExpansionId" = pe.id
      )
      UNION
      SELECT DISTINCT pe.code, 'EN' as lang
      FROM primary_expansions pe
      WHERE EXISTS (
        SELECT 1 FROM primary_cards pc2
        JOIN cards c ON c."primaryCardId" = pc2.id AND c.language = 'EN_US'
        WHERE pc2."primaryExpansionId" = pe.id
      )
      ORDER BY code
    `).then((rows: any[]) => {
      const zh = rows.filter((r: any) => r.lang === 'ZH').map((r: any) => r.code);
      const en = rows.filter((r: any) => r.lang === 'EN').map((r: any) => r.code);
      sendJson(res, { zh, en });
    }).catch((e: any) => sendJson(res, { error: String(e) }, 500));
    return;
  }

  if (p === '/api/expansion-cards' && req.method === 'GET') {
    const zhCode = u.searchParams.get('zh')?.toUpperCase() ?? '';
    const enCode = u.searchParams.get('en')?.toUpperCase() ?? '';
    if (!zhCode) { sendJson(res, { error: 'zh param required' }, 400); return; }

    (async () => {
      const ALL_MODE = zhCode === 'ALL';

      // Load ZH primaryCards
      const zhRows = ALL_MODE
        ? await prisma.$queryRawUnsafe<any[]>(`
            SELECT pc.id, pc.name, pc."cardNumber", pc."pokemonSpeciesId",
                   pc."effectTags", pc."specialEffectTags", pe.code as "expCode"
            FROM primary_cards pc
            JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId"
            WHERE EXISTS (SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = 'ZH_TW')
              AND NOT EXISTS (SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = 'EN_US')
            ORDER BY pe.code, LENGTH(pc."cardNumber"), pc."cardNumber"
          `)
        : await prisma.$queryRawUnsafe<any[]>(`
            SELECT pc.id, pc.name, pc."cardNumber", pc."pokemonSpeciesId",
                   pc."effectTags", pc."specialEffectTags", pe.code as "expCode"
            FROM primary_cards pc
            JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId" AND pe.code = $1
            ORDER BY LENGTH(pc."cardNumber"), pc."cardNumber"
          `, zhCode);

      // Load EN primaryCards
      const enRows = ALL_MODE
        ? await prisma.$queryRawUnsafe<any[]>(`
            SELECT pc.id, pc.name, pc."cardNumber", pc."pokemonSpeciesId",
                   pc."effectTags", pc."specialEffectTags", pe.code as "expCode"
            FROM primary_cards pc
            JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId"
            WHERE EXISTS (SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = 'EN_US')
              AND NOT EXISTS (SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = 'ZH_TW')
            ORDER BY pe.code, LENGTH(pc."cardNumber"), pc."cardNumber"
          `)
        : enCode ? await prisma.$queryRawUnsafe<any[]>(`
            SELECT pc.id, pc.name, pc."cardNumber", pc."pokemonSpeciesId",
                   pc."effectTags", pc."specialEffectTags", pe.code as "expCode"
            FROM primary_cards pc
            JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId" AND pe.code = $1
            ORDER BY LENGTH(pc."cardNumber"), pc."cardNumber"
          `, enCode) : [];

      const allPcIds = [...zhRows, ...enRows].map((r: any) => r.id);
      if (allPcIds.length === 0) { sendJson(res, { zhCards: [], enCards: [], linked: [] }); return; }

      // Load cards for all primaryCards
      const rawCards = await prisma.card.findMany({
        where: { primaryCardId: { in: allPcIds } },
        select: {
          id: true, primaryCardId: true, webCardId: true, language: true, name: true,
          variantType: true, rarity: true, regulationMark: true, subtypes: true,
          attacks: true, hp: true, types: true, supertype: true, imageUrl: true, sourceUrl: true,
        },
      }) as any[];

      // Index cards by primaryCardId, prefer NORMAL variant
      const cardsByPc = new Map<string, any>();
      for (const c of rawCards) {
        const existing = cardsByPc.get(c.primaryCardId);
        if (!existing || c.variantType === 'NORMAL') cardsByPc.set(c.primaryCardId, c);
      }

      // For each ZH primaryCard: pick ZH representative card
      // For each EN primaryCard: pick EN representative card
      // Also detect if a ZH primaryCard ALSO has EN card (already linked) and vice versa
      const linkedPairs: any[] = [];
      const zhCards: any[] = [];
      const enCards: any[] = [];

      const repCard = (pcId: string, lang: string) => {
        const all = rawCards.filter((c: any) => c.primaryCardId === pcId && c.language === lang);
        return all.find((c: any) => c.variantType === 'NORMAL') ?? all[0] ?? null;
      };

      // Check which ZH primaryCards have EN cards (already linked)
      const zhLinkedPcIds = new Set<string>();
      const enLinkedPcIds = new Set<string>();

      for (const pc of zhRows) {
        const hasZh = rawCards.some((c: any) => c.primaryCardId === pc.id && c.language === 'ZH_TW');
        const hasEn = rawCards.some((c: any) => c.primaryCardId === pc.id && c.language === 'EN_US');
        if (hasZh && hasEn) zhLinkedPcIds.add(pc.id);
      }
      for (const pc of enRows) {
        const hasEn = rawCards.some((c: any) => c.primaryCardId === pc.id && c.language === 'EN_US');
        const hasZh = rawCards.some((c: any) => c.primaryCardId === pc.id && c.language === 'ZH_TW');
        if (hasEn && hasZh) enLinkedPcIds.add(pc.id);
      }

      for (const pc of zhRows) {
        const zh = repCard(pc.id, 'ZH_TW');
        if (!zh) continue;
        const atkFp = computeAttackFingerprint(zh.attacks, zh.hp, zh.types);
        const efxFp = computeEffectFingerprint(
          pc.effectTags ?? [], pc.specialEffectTags ?? [],
          zh.supertype ?? null, zh.subtypes?.[0] ?? null, zh.regulationMark ?? null,
        );
        const isLinked = zhLinkedPcIds.has(pc.id);
        const card: any = {
          pcId: pc.id, name: pc.name, cardNumber: pc.cardNumber, expCode: pc.expCode,
          webCardId: zh.webCardId, imageUrl: zh.imageUrl, sourceUrl: zh.sourceUrl,
          hp: zh.hp, types: zh.types, rarity: zh.rarity, regulationMark: zh.regulationMark,
          supertype: zh.supertype, subtypes: zh.subtypes,
          attackFp: atkFp, effectFp: efxFp,
          effectTags: pc.effectTags ?? [],
          maxDamage: maxAttackDamage(zh.attacks),
          linkedEnId: isLinked ? pc.id : null,
        };
        if (isLinked) {
          const en = repCard(pc.id, 'EN_US');
          linkedPairs.push({
            zhPcId: pc.id, zhName: pc.name, zhWebCardId: zh.webCardId, zhImageUrl: zh.imageUrl,
            zhExpCode: pc.expCode,
            enName: en?.name ?? pc.name, enWebCardId: en?.webCardId ?? '', enImageUrl: en?.imageUrl ?? null,
            enExpCode: enCode || pc.expCode,
            hp: zh.hp, types: zh.types, rarity: zh.rarity,
          });
        } else {
          zhCards.push(card);
        }
      }

      for (const pc of enRows) {
        if (enLinkedPcIds.has(pc.id)) continue; // already counted in linked via ZH side
        const en = repCard(pc.id, 'EN_US');
        if (!en) continue;
        const atkFp = computeAttackFingerprint(en.attacks, en.hp, en.types);
        const efxFp = computeEffectFingerprint(
          pc.effectTags ?? [], pc.specialEffectTags ?? [],
          en.supertype ?? null, en.subtypes?.[0] ?? null, en.regulationMark ?? null,
        );
        enCards.push({
          pcId: pc.id, name: pc.name, cardNumber: pc.cardNumber, expCode: pc.expCode,
          webCardId: en.webCardId, imageUrl: en.imageUrl, sourceUrl: en.sourceUrl,
          hp: en.hp, types: en.types, rarity: en.rarity, regulationMark: en.regulationMark,
          supertype: en.supertype, subtypes: en.subtypes,
          attackFp: atkFp, effectFp: efxFp,
          effectTags: pc.effectTags ?? [],
          maxDamage: maxAttackDamage(en.attacks),
          linkedZhId: null,
        });
      }

      sendJson(res, { zhCards, enCards, linked: linkedPairs });
    })().catch((e: any) => sendJson(res, { error: String(e) }, 500));
    return;
  }

  if (p === '/api/link-by-webid' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { zhWebId, enWebId } = JSON.parse(body) as { zhWebId: string; enWebId: string };
        if (!zhWebId || !enWebId) { sendJson(res, { error: 'zhWebId and enWebId required' }, 400); return; }
        // Look up both cards
        const cards = await prisma.card.findMany({
          where: { webCardId: { in: [zhWebId, enWebId] } },
          select: { id: true, primaryCardId: true, webCardId: true, language: true, name: true },
        });
        const zhCard = cards.find(c => c.webCardId === zhWebId);
        const enCard = cards.find(c => c.webCardId === enWebId);
        if (!zhCard) { sendJson(res, { error: `Card not found: ${zhWebId}` }, 404); return; }
        if (!enCard) { sendJson(res, { error: `Card not found: ${enWebId}` }, 404); return; }
        if (zhCard.primaryCardId === enCard.primaryCardId) {
          sendJson(res, { ok: true, alreadyLinked: true, zhName: zhCard.name, enName: enCard.name });
          return;
        }
        const zhPcId = zhCard.primaryCardId;
        const enPcId = enCard.primaryCardId;
        // Fetch EN PrimaryCard's effect tags before merge/delete
        const enPc = await prisma.primaryCard.findUnique({
          where: { id: enPcId },
          select: { effectTags: true, specialEffectTags: true },
        });
        // Re-point EN cards → ZH primaryCard
        await prisma.card.updateMany({ where: { primaryCardId: enPcId }, data: { primaryCardId: zhPcId } });
        // Merge EN tags into ZH PrimaryCard (union — no duplicates)
        let tagsMerged = 0;
        if (enPc && (enPc.effectTags.length > 0 || enPc.specialEffectTags.length > 0)) {
          const zhPc = await prisma.primaryCard.findUnique({ where: { id: zhPcId }, select: { effectTags: true, specialEffectTags: true } });
          const mergedTags = [...new Set([...(zhPc?.effectTags ?? []), ...enPc.effectTags])];
          const mergedSpecial = [...new Set([...(zhPc?.specialEffectTags ?? []), ...enPc.specialEffectTags])];
          const addedTags = mergedTags.length - (zhPc?.effectTags?.length ?? 0);
          const addedSpecial = mergedSpecial.length - (zhPc?.specialEffectTags?.length ?? 0);
          if (addedTags > 0 || addedSpecial > 0) {
            await prisma.primaryCard.update({ where: { id: zhPcId }, data: { effectTags: mergedTags, specialEffectTags: mergedSpecial } });
            tagsMerged = addedTags + addedSpecial;
          }
        }
        const remaining = await prisma.card.count({ where: { primaryCardId: enPcId } }).catch(() => 1);
        if (remaining === 0) await prisma.primaryCard.delete({ where: { id: enPcId } }).catch(() => null);
        cachedUpdates = null; cachedAmbiguous = null; cacheBuilding = false;
        sendJson(res, { ok: true, zhName: zhCard.name, enName: enCard.name, tagsMerged });
      } catch (e) {
        sendJson(res, { error: String(e) }, 500);
      }
    });
    return;
  }

  if (p === '/api/link-one' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      const { zhId, enId } = JSON.parse(body) as { zhId: string; enId: string };
      prisma.card.updateMany({ where: { primaryCardId: enId }, data: { primaryCardId: zhId } })
        .then(async () => {
          const remaining = await prisma.card.count({ where: { primaryCardId: enId } }).catch(() => 1);
          if (remaining === 0) await prisma.primaryCard.delete({ where: { id: enId } }).catch(() => null);
          cachedUpdates = null; cachedAmbiguous = null; cacheBuilding = false;
          sendJson(res, { ok: true });
        }).catch(e => sendJson(res, { error: String(e) }, 500));
    });
    return;
  }

  if (p === '/api/remap-expansion' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { expansion } = JSON.parse(body) as { expansion?: string };
        const args = ['tsx', 'scrapers/map-zh-to-en.ts', '--apply', '--yes'];
        if (expansion) args.push('--expansion', expansion);
        const result = spawnSync('npx', args, {
          cwd: WORKSPACE_ROOT,
          encoding: 'utf-8',
          timeout: 180000,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        cachedUpdates = null; cachedAmbiguous = null; cacheBuilding = false;
        const output = (result.stdout || '') + (result.stderr || '');
        const summaryLines = output.split('\n').filter(l =>
          /matched|ambiguous|unmatched|re-pointed|synced|deleted|applied|error/i.test(l) ||
          l.includes('\u2705') || l.includes('\u274c') || l.includes('\u2717') || l.includes('\u270f')
        );
        sendJson(res, { ok: result.status === 0, summary: summaryLines.join('\n') || output.slice(-800), exitCode: result.status });
      } catch (e) {
        sendJson(res, { error: String(e) }, 500);
      }
    });
    return;
  }

    if (p === '/local-img') {
    const imgPath = u.searchParams.get('p');
    if (!imgPath) { res.writeHead(400); res.end(); return; }
    const full = imgPath.startsWith('/') || imgPath.match(/^[A-Za-z]:/)
      ? imgPath
      : path.resolve(WORKSPACE_ROOT, imgPath);
    // Security: must be within workspace
    if (!full.startsWith(WORKSPACE_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    try {
      const data = fs.readFileSync(full);
      const ext = path.extname(full).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
    return;
  }

  res.writeHead(404); res.end();
});

async function main() {
  server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('ZH→EN Card Review Server');
    console.log(`Open:  http://localhost:${PORT}`);
    console.log(`Pair:  http://localhost:${PORT}/pair`);
    if (FILTER_EXP) console.log(`Filter: ${FILTER_EXP}`);
    console.log('Press Ctrl+C to stop');
    console.log('='.repeat(50));
  });
  // Warm cache on startup so first page load is fast
  getMatches().catch(console.error);
}

process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); });
process.on('unhandledRejection', (reason) => { console.error('[unhandledRejection]', reason); });
// Keep the event loop alive so Node doesn't exit after all Prisma queries settle
const _keepAlive = setInterval(() => {}, 1 << 30);
main().catch(async e => { console.error('[main error]', e); await prisma.$disconnect(); process.exit(1); });
process.on('SIGINT', async () => { console.log('\nStopping...'); clearInterval(_keepAlive); await prisma.$disconnect(); process.exit(0); });
