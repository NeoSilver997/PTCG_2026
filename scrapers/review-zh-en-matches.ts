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
  'M2A': 'ME2.5', 'MC': 'ME2.5',
  'M3':  'ME03',
  'SV11B': 'ZSV10', 'SV11W': 'RSV10',
  'SV9A': 'SV10', 'SVOD': 'SV10', 'SVOM': 'SV10',
  'SV9': 'SV09', 'SVM': 'SV09',
  'SV8': 'SV08', 'SV8A': 'SV8.5',
  'SV7': 'SV07',
  'SV6': 'SV06', 'SV6A': 'SV6.5',
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
      hp: true, types: true, supertype: true, imageUrl: true,
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
function runMatching(zhCards: DbPrimaryCard[], enByExpansion: Map<string, DbPrimaryCard[]>): UpdateRecord[] {
  const updates: UpdateRecord[] = [];

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
      }
    }
  }
  return updates;
}

// ─────────────────────────────────────────────────────────────
// Match cache (built once on first request)
// ─────────────────────────────────────────────────────────────
let cachedUpdates: UpdateRecord[] | null = null;
let cacheBuilding = false;
let cacheCallbacks: Array<(u: UpdateRecord[]) => void> = [];

function getMatches(): Promise<UpdateRecord[]> {
  if (cachedUpdates !== null) return Promise.resolve(cachedUpdates);
  return new Promise(resolve => {
    cacheCallbacks.push(resolve);
    if (cacheBuilding) return;
    cacheBuilding = true;
    (async () => {
      console.log('Building match cache...');
      const zhOnly   = await loadPCards('ZH_TW', 'EN_US');
      const allEnOnly = await loadPCards('EN_US', 'ZH_TW');
      const enByExpansion = await buildEnByExpansion(zhOnly, allEnOnly);
      cachedUpdates = runMatching(zhOnly, enByExpansion);
      console.log(`Cache ready: ${cachedUpdates.length} matches`);
      const cbs = cacheCallbacks; cacheCallbacks = [];
      for (const cb of cbs) cb(cachedUpdates!);
    })().catch(e => {
      console.error('Cache build error:', e);
      cacheBuilding = false;
      const cbs = cacheCallbacks; cacheCallbacks = [];
      for (const cb of cbs) cb([]);
    });
  });
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

// ─────────────────────────────────────────────────────────────
// Apply confirmed
// ─────────────────────────────────────────────────────────────
async function applyConfirmed(ids: string[], allUpdates: UpdateRecord[]): Promise<{ applied: number; deleted: number }> {
  const toApply = allUpdates.filter(u => ids.includes(u.zhPrimaryCardId));
  const orphanIds = new Set<string>();
  const CHUNK = 200;
  let applied = 0;

  for (let i = 0; i < toApply.length; i += CHUNK) {
    const chunk = toApply.slice(i, i + CHUNK);
    const ops: Promise<any>[] = [];
    for (const u of chunk) {
      orphanIds.add(u.enPrimaryCard.id);
      const enCard = u.enCard;
      for (const ec of u.enPrimaryCard.cards) {
        ops.push(prisma.card.update({ where: { id: ec.id }, data: { primaryCardId: u.zhPrimaryCardId } }));
      }
      if (enCard) {
        for (const zc of u.zhCards) {
          const sync: Record<string, unknown> = {};
          if (enCard.rarity && zc.rarity !== enCard.rarity)                        sync.rarity       = enCard.rarity;
          if (enCard.variantType && zc.variantType !== enCard.variantType)          sync.variantType  = enCard.variantType;
          if (enCard.regulationMark && zc.regulationMark !== enCard.regulationMark) sync.regulationMark = enCard.regulationMark;
          if (!zc.artist     && enCard.artist)     sync.artist     = enCard.artist;
          if (!zc.evolvesFrom && enCard.evolvesFrom) sync.evolvesFrom = enCard.evolvesFrom;
          if (!zc.ruleBox    && enCard.ruleBox)    sync.ruleBox    = enCard.ruleBox;
          if ((!zc.subtypes || zc.subtypes.length === 0) && enCard.subtypes?.length > 0)
            sync.subtypes = enCard.subtypes;
          if (Object.keys(sync).length > 0)
            ops.push(prisma.card.update({ where: { id: zc.id }, data: sync }));
          if (!enCard.regulationMark && zc.regulationMark)
            ops.push(prisma.card.update({ where: { id: enCard.id }, data: { regulationMark: zc.regulationMark } }));
        }
      }
    }
    await prisma.$transaction(ops);
    applied += chunk.reduce((s, u) => s + u.enPrimaryCard.cards.length, 0);
  }

  let deleted = 0;
  for (const pcId of orphanIds) {
    const remaining = await prisma.card.count({ where: { primaryCardId: pcId } });
    if (remaining === 0) { await prisma.primaryCard.delete({ where: { id: pcId } }); deleted++; }
  }

  // Invalidate cache so next request re-runs matching
  cachedUpdates = null;
  cacheBuilding = false;
  return { applied, deleted };
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
</style>
</head>
<body>
<div id="topbar">
  <h1>ZH &#8594; EN Card Review</h1>
  <span class="stat" id="stat-label">Loading...</span>
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
<div id="toast"></div>

<script>
var state = {
  matches: [],
  confirmed: {},
  filter: { exp: '', method: '' }
};

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

function filtered() {
  return state.matches.filter(function(m) {
    if (state.filter.exp && m.expansion !== state.filter.exp) return false;
    if (state.filter.method && m.matchMethod !== state.filter.method) return false;
    return true;
  });
}

function renderMatches() {
  var vis = filtered();
  if (vis.length === 0) {
    document.getElementById('matches').innerHTML = '<div class="empty">No matches for current filter</div>';
    updateStats();
    return;
  }
  // Group by EN expansion for cleaner browsing
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
  updateStats();
}

function updateStats() {
  var total = state.matches.length;
  var confirmed = state.matches.filter(function(m) { return state.confirmed[m.id] !== false; }).length;
  document.getElementById('stat-label').textContent = confirmed + ' / ' + total + ' confirmed';
  var btn = document.getElementById('btn-apply');
  btn.textContent = 'Apply ' + confirmed;
  btn.disabled = confirmed === 0;
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
  var ids = state.matches
    .filter(function(m) { return state.confirmed[m.id] !== false; })
    .map(function(m) { return m.id; });
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
  state.confirmed = {};
  state.matches.forEach(function(m) { state.confirmed[m.id] = true; });

  // Populate expansion filter (group by EN expansion)
  var exps = [];
  state.matches.forEach(function(m) {
    if (exps.indexOf(m.enExpansion) === -1) exps.push(m.enExpansion);
  });
  exps.sort();
  var sel = document.getElementById('filter-exp');
  sel.innerHTML = '<option value="">All (' + state.matches.length + ')</option>';
  exps.forEach(function(e) {
    var count = state.matches.filter(function(m) { return m.enExpansion === e; }).length;
    sel.innerHTML += '<option value="' + esc(e) + '">' + esc(e) + ' (' + count + ')</option>';
  });

  document.getElementById('loading').style.display = 'none';
  document.getElementById('matches').style.display = 'block';
  renderMatches();
}

fetch('/api/matches')
  .then(function(r) { return r.json(); })
  .then(init)
  .catch(function(e) {
    document.getElementById('loading').textContent = 'Error: ' + e.message;
  });
</script>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────────────────────
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
      .then(updates => sendJson(res, { total: updates.length, matches: updates.map(toReviewMatch) }))
      .catch(e => sendJson(res, { error: String(e) }, 500));
    return;
  }

  if (p === '/api/apply' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      getMatches().then(updates => {
        const { ids } = JSON.parse(body) as { ids: string[] };
        return applyConfirmed(ids, updates);
      })
      .then(result => sendJson(res, result))
      .catch(e => sendJson(res, { error: String(e) }, 500));
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
    if (FILTER_EXP) console.log(`Filter: ${FILTER_EXP}`);
    console.log('Press Ctrl+C to stop');
    console.log('='.repeat(50));
  });
  // Warm cache on startup so first page load is fast
  getMatches().catch(console.error);
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
process.on('SIGINT', async () => { console.log('\nStopping...'); await prisma.$disconnect(); process.exit(0); });
