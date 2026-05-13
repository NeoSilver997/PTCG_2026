/**
 * map-zh-to-en.ts
 *
 * Maps ZH_TW (Chinese) PrimaryCards to their EN_US (English) counterparts
 * within the same PrimaryExpansion using two complementary strategies:
 *
 * Pass 1 — Pokémon: language-neutral attack fingerprint (cost + damage + HP + types)
 *           Enhanced by pokemonSpeciesId when available for stronger disambiguation.
 *
 * Pass 2 — Trainer / Energy: effect-tag fingerprint
 *           effectTags + specialEffectTags + supertype + subtype + regulationMark
 *           regulationMark is required to match — same regulation mark = same era print.
 *
 * Problem this solves:
 *   EN_US cards are imported as separate PrimaryCards because their collector numbers
 *   or expansion codes may differ from ZH_TW.  This script links EN_US cards to the
 *   canonical PrimaryCard that already has the ZH_TW (and usually JA_JP) variant,
 *   so all language variants share one PrimaryCard identity.
 *
 * Actions:
 *   1. Dry-run (default): report matches / ambiguous / unmatched — no DB changes.
 *   2. Apply  (--apply):  re-point EN_US card.primaryCardId → ZH_TW PrimaryCard.id,
 *                         delete orphaned EN-only PrimaryCards.
 *
 * Usage:
 *   npx tsx scrapers/map-zh-to-en.ts                         # dry-run report
 *   npx tsx scrapers/map-zh-to-en.ts --apply                 # apply (interactive confirm)
 *   npx tsx scrapers/map-zh-to-en.ts --apply --yes           # apply without prompt
 *   npx tsx scrapers/map-zh-to-en.ts --expansion SV9         # limit to one expansion
 *
 * Field sync (EN → ZH/JP):
 *   rarity, variantType  — always overwritten on ZH card with EN value
 *   regulationMark       — FILL ONLY when ZH is null (never overwrite existing value)
 *   artist, evolvesFrom, ruleBox, subtypes — fill only when ZH is null/empty
 * Field sync (ZH → EN):
 *   regulationMark — fill EN when EN is null/empty and ZH has a value
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

// Cross-expansion code map: ZH/HK expansion code → EN expansion code.
// Used when an EN release bundles multiple HK sub-expansions under a single EN code.
// e.g. ME02 (EN) contains the same cards as M2 + MBD + MBG (HK).
const ZH_TO_EN_CODE: Record<string, string> = {
  // Sun-Moon era mega bundles
  'M1S': 'ME01', 'M1L': 'ME01',
  'M2':  'ME02', 'MBD': 'ME02', 'MBG': 'ME02',
  'M2A': 'ME2',  'MC':  'ME2',
  'M3':  'ME03',

  // Scarlet & Violet — Black/White split sets
  'SV11B': 'ZSV10',
  'SV11W': 'RSV10',

  // SV10 bundle (EN SV10 includes SV9A, SVOD, SVOM sub-sets)
  'SV9A': 'SV10', 'SVOD': 'SV10', 'SVOM': 'SV10',

  // SV09 bundle (EN SV09 includes HK SVM promo set)
  'SV9': 'SV09', 'SVM': 'SV09',

  // SV8 / SV8A (EN bundles SV8A content into base SV8 expansion)
  'SV8A': 'SV8',

  // SV7
  'SV7':  'SV07',

  // SV6 / SV6.5
  'SV6':  'SV06', 'SV6A': 'SV6',

  // SV5 bundle (EN SV05 includes SV5A + SV5K sub-sets)
  'SV5A': 'SV05', 'SV5K': 'SV05',
};

const APPLY      = process.argv.includes('--apply');
const YES        = process.argv.includes('--yes');
const EXP_IDX    = process.argv.indexOf('--expansion');
const FILTER_EXP: string | null = (
  EXP_IDX >= 0 && process.argv[EXP_IDX + 1] && !process.argv[EXP_IDX + 1].startsWith('--')
) ? process.argv[EXP_IDX + 1].toUpperCase() : null;

const CHUNK = 200;

// ─────────────────────────────────────────────────────────────
// Fingerprint helpers
// ─────────────────────────────────────────────────────────────

/**
 * Language-neutral attack fingerprint.
 * Combines attack cost (energy types) + damage + HP + types.
 * These fields are identical across all language prints of the same card.
 * Returns null when no attacks are stored (trainer/energy/Pokémon with empty attacks).
 */
function computeAttackFingerprint(
  attacks: any,
  hp: number | null,
  types: string[],
): string | null {
  if (!attacks || !Array.isArray(attacks) || attacks.length === 0) return null;
  const normalized = attacks.map((a: any) => ({
    cost: [...(a.cost ?? [])].sort().join(','),
    damage: String(a.damage ?? ''),
  }));
  const typesKey = [...(types ?? [])].sort().join(',');
  return `HP:${hp ?? '?'}|T:${typesKey}|${JSON.stringify(normalized)}`;
}

/**
 * Effect-tag fingerprint for trainer/energy cards.
 * Combines effectTags + specialEffectTags + supertype + subtype + regulationMark.
 *
 * Including regulationMark ensures that reprints of the same trainer (e.g. multiple
 * versions of Professor's Research) in the same expansion don't collide: only the
 * exact same era print of the card will match.
 *
 * Returns null when tags are empty or only contain the generic fallback '其他效果'.
 */
function computeEffectFingerprint(
  effectTags: string[],
  specialEffectTags: string[],
  supertype: string | null,
  subtype: string | null,
  regulationMark: string | null,
): string | null {
  const allTags = [
    ...effectTags,
    ...specialEffectTags.map(t => `S:${t}`),
  ].sort();
  if (allTags.length === 0) return null;
  if (allTags.length === 1 && allTags[0] === '其他效果') return null;
  const typeKey = [supertype ?? 'UNKNOWN', subtype ?? ''].filter(Boolean).join('/');
  const regKey = regulationMark ? `|R:${regulationMark}` : '';
  return `${typeKey}${regKey}:${allTags.join('|')}`;
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
  attacks: any;
  hp: number | null;
  types: string[];
  supertype: string | null;
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
  // Representative card fields (pulled from first card)
  repSupertype: string | null;
  repSubtype: string | null;
  repRegulationMark: string | null;
}

// ─────────────────────────────────────────────────────────────
// DB loading
// ─────────────────────────────────────────────────────────────

async function loadPrimaryCards(
  sourceLang: 'ZH_TW' | 'EN_US',
  absentLang: 'EN_US' | 'ZH_TW',
): Promise<DbPrimaryCard[]> {
  // Only filter by expansion for the ZH source query; EN candidates need to include
  // cross-mapped expansions (e.g. SV8A ZH → SV8 EN) so never filter EN by FILTER_EXP.
  const expansionFilter = (FILTER_EXP && sourceLang === 'ZH_TW')
    ? `AND pe.code = '${FILTER_EXP}'`
    : '';

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      pc.id, pc.name, pc."cardNumber", pc."primaryExpansionId",
      pe.code AS "expansionCode",
      pc."pokemonSpeciesId",
      pc."effectTags", pc."specialEffectTags"
    FROM primary_cards pc
    LEFT JOIN primary_expansions pe ON pe.id = pc."primaryExpansionId"
    WHERE EXISTS (
      SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = '${sourceLang}'
    )
    AND NOT EXISTS (
      SELECT 1 FROM cards c WHERE c."primaryCardId" = pc.id AND c.language = '${absentLang}'
    )
    ${expansionFilter}
    ORDER BY pe.code, pc.name
  `);

  if (rows.length === 0) return [];

  const pcIds = rows.map((r: any) => r.id);
  const rawCards = await prisma.card.findMany({
    where: { primaryCardId: { in: pcIds }, language: sourceLang },
    select: {
      id: true, primaryCardId: true, webCardId: true, language: true,
      variantType: true, rarity: true, regulationMark: true,
      artist: true, evolvesFrom: true, ruleBox: true, subtypes: true,
      attacks: true, hp: true, types: true, supertype: true,
    },
  });

  const cards = rawCards as unknown as DbCard[];

  // Index cards by primaryCardId; pick representative (first NORMAL variant preferred)
  const cardsByPCId = new Map<string, DbCard[]>();
  for (const c of cards) {
    const arr = cardsByPCId.get(c.primaryCardId) ?? [];
    arr.push(c);
    cardsByPCId.set(c.primaryCardId, arr);
  }

  const pickRep = (list: DbCard[]): DbCard | null => {
    return list.find(c => c.variantType === 'NORMAL') ?? list[0] ?? null;
  };

  return rows.map((r: any) => {
    const cardList = cardsByPCId.get(r.id) ?? [];
    const rep = pickRep(cardList);
    const atkFp = rep
      ? computeAttackFingerprint(rep.attacks, rep.hp, rep.types)
      : null;
    const efxFp = computeEffectFingerprint(
      r.effectTags ?? [],
      r.specialEffectTags ?? [],
      rep?.supertype ?? null,
      rep?.subtypes?.[0] ?? null,
      rep?.regulationMark ?? null,
    );
    return {
      id: r.id,
      name: r.name,
      cardNumber: r.cardNumber,
      primaryExpansionId: r.primaryExpansionId,
      expansionCode: r.expansionCode,
      pokemonSpeciesId: r.pokemonSpeciesId ?? null,
      attackFingerprint: atkFp,
      effectFingerprint: efxFp,
      effectTags: r.effectTags ?? [],
      specialEffectTags: r.specialEffectTags ?? [],
      cards: cardList,
      repSupertype: rep?.supertype ?? null,
      repSubtype: rep?.subtypes?.[0] ?? null,
      repRegulationMark: rep?.regulationMark ?? null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────

type MatchMethod = 'pokemon-species+attack' | 'attack-fingerprint' | 'effect-tag+regmark' | 'special-tag+regmark' | 'subtype+regmark-1:1';

interface UpdateRecord {
  zhPrimaryCardId: string;
  zhPrimaryCardName: string;
  zhCardNumber: string | null;
  zhCards: DbCard[];
  enPrimaryCard: DbPrimaryCard;
  enCard: DbCard | null;
  matchMethod: MatchMethod;
}

interface AmbiguousRecord {
  zhName: string;
  expansion: string;
  fp: string;
  enCandidates: string[];
}

interface UnmatchedRecord {
  zhId: string;
  zhName: string;
  expansion: string;
  reason: string;
}

function runMatching(
  zhCards: DbPrimaryCard[],
  enByExpansion: Map<string, DbPrimaryCard[]>,
): {
  updates: UpdateRecord[];
  ambiguous: AmbiguousRecord[];
  unmatched: UnmatchedRecord[];
} {
  const updates: UpdateRecord[] = [];
  const ambiguous: AmbiguousRecord[] = [];
  const unmatched: UnmatchedRecord[] = [];

  // ── Build EN lookup tables per expansion ──

  // expansionId → Map<attackFingerprint, DbPrimaryCard[]>
  const enAtkFpLookup = new Map<string, Map<string, DbPrimaryCard[]>>();
  // expansionId → Map<speciesId+attackFp, DbPrimaryCard[]>
  const enSpeciesFpLookup = new Map<string, Map<string, DbPrimaryCard[]>>();
  // expansionId → Map<effectFingerprint, DbPrimaryCard[]>
  const enEffFpLookup = new Map<string, Map<string, DbPrimaryCard[]>>();
  // Pass 3A: expansionId → Map<specialTags+subtype+reg key, DbPrimaryCard[]>
  const enSpecialTagLookup = new Map<string, Map<string, DbPrimaryCard[]>>();
  // Pass 3B: expansionId → Map<subtype+reg key, DbPrimaryCard[]>
  const enSubtypeRegLookup = new Map<string, Map<string, DbPrimaryCard[]>>();

  for (const [expId, enList] of enByExpansion) {
    const atkMap = new Map<string, DbPrimaryCard[]>();
    const specMap = new Map<string, DbPrimaryCard[]>();
    const effMap = new Map<string, DbPrimaryCard[]>();

    for (const en of enList) {
      // Attack fingerprint index
      if (en.attackFingerprint !== null) {
        const arr = atkMap.get(en.attackFingerprint) ?? [];
        arr.push(en);
        atkMap.set(en.attackFingerprint, arr);

        // Species + attack fingerprint (stronger key)
        if (en.pokemonSpeciesId !== null) {
          const specKey = `${en.pokemonSpeciesId}|${en.attackFingerprint}`;
          const sarr = specMap.get(specKey) ?? [];
          sarr.push(en);
          specMap.set(specKey, sarr);
        }
      }

      // Effect fingerprint index (only for cards without attacks)
      if (en.attackFingerprint === null && en.effectFingerprint !== null) {
        const arr = effMap.get(en.effectFingerprint) ?? [];
        arr.push(en);
        effMap.set(en.effectFingerprint, arr);
      }

      // Pass 3A: special-tag + subtype + regulationMark (no-attack cards only)
      if (en.attackFingerprint === null) {
        const specTags = [...(en.specialEffectTags ?? [])].sort().join(',');
        const subtype = en.repSubtype ?? '';
        const reg = en.repRegulationMark ?? '';
        if (specTags) {
          const key3a = `S:${specTags}|${subtype}|R:${reg}`;
          const specTagMap = enSpecialTagLookup.get(expId) ?? new Map<string, DbPrimaryCard[]>();
          const s3arr = specTagMap.get(key3a) ?? [];
          s3arr.push(en);
          specTagMap.set(key3a, s3arr);
          enSpecialTagLookup.set(expId, specTagMap);
        }
        // Pass 3B: subtype + regulationMark (no-attack cards, 1:1 fallback)
        if (subtype || reg) {
          const key3b = `${subtype}|R:${reg}`;
          const subtypeMap = enSubtypeRegLookup.get(expId) ?? new Map<string, DbPrimaryCard[]>();
          const s3barr = subtypeMap.get(key3b) ?? [];
          s3barr.push(en);
          subtypeMap.set(key3b, s3barr);
          enSubtypeRegLookup.set(expId, subtypeMap);
        }
      }
    }

    enAtkFpLookup.set(expId, atkMap);
    enSpeciesFpLookup.set(expId, specMap);
    enEffFpLookup.set(expId, effMap);
  }

  // ── Global (cross-expansion) lookup tables for fallback matching ──
  const GLOBAL_KEY = '__GLOBAL__';
  const globalAtkMap = new Map<string, DbPrimaryCard[]>();
  const globalSpecMap = new Map<string, DbPrimaryCard[]>();
  const globalEffMap = new Map<string, DbPrimaryCard[]>();
  const globalSpecialTagMap = new Map<string, DbPrimaryCard[]>(); // Pass 3A global
  for (const en of (enByExpansion.get(GLOBAL_KEY) ?? [])) {
    if (en.attackFingerprint !== null) {
      const arr = globalAtkMap.get(en.attackFingerprint) ?? [];
      arr.push(en);
      globalAtkMap.set(en.attackFingerprint, arr);
      if (en.pokemonSpeciesId !== null) {
        const specKey = `${en.pokemonSpeciesId}|${en.attackFingerprint}`;
        const sarr = globalSpecMap.get(specKey) ?? [];
        sarr.push(en);
        globalSpecMap.set(specKey, sarr);
      }
    }
    if (en.attackFingerprint === null && en.effectFingerprint !== null) {
      const arr = globalEffMap.get(en.effectFingerprint) ?? [];
      arr.push(en);
      globalEffMap.set(en.effectFingerprint, arr);
    }
    // Pass 3A global: specialEffectTags + subtype + reg
    if (en.attackFingerprint === null) {
      const specTags = [...(en.specialEffectTags ?? [])].sort().join(',');
      const subtype = en.repSubtype ?? '';
      const reg = en.repRegulationMark ?? '';
      if (specTags) {
        const key3a = `S:${specTags}|${subtype}|R:${reg}`;
        const arr = globalSpecialTagMap.get(key3a) ?? [];
        arr.push(en);
        globalSpecialTagMap.set(key3a, arr);
      }
    }
  }

  // ── Sibling counts: how many ZH cards share the same fingerprint in an expansion ──
  const zhAtkSiblings = new Map<string, Map<string, number>>();   // expId → fp → count
  const zhEffSiblings = new Map<string, Map<string, number>>();
  const zhSpecSiblings = new Map<string, Map<string, number>>();

  for (const zh of zhCards) {
    if (!zh.primaryExpansionId) continue;

    const countIn = (mapOfMaps: Map<string, Map<string, number>>, key: string) => {
      const inner = mapOfMaps.get(zh.primaryExpansionId!) ?? new Map<string, number>();
      inner.set(key, (inner.get(key) ?? 0) + 1);
      mapOfMaps.set(zh.primaryExpansionId!, inner);
    };

    if (zh.attackFingerprint !== null) {
      countIn(zhAtkSiblings, zh.attackFingerprint);
      if (zh.pokemonSpeciesId !== null) {
        countIn(zhSpecSiblings, `${zh.pokemonSpeciesId}|${zh.attackFingerprint}`);
      }
    }
    if (zh.attackFingerprint === null && zh.effectFingerprint !== null) {
      countIn(zhEffSiblings, zh.effectFingerprint);
    }
  }

  // ── Match each ZH PrimaryCard ──

  for (const zh of zhCards) {
    if (!zh.primaryExpansionId) {
      unmatched.push({ zhId: zh.id, zhName: zh.name, expansion: zh.expansionCode ?? '?', reason: 'no primaryExpansionId' });
      continue;
    }

    const expId = zh.primaryExpansionId;
    let matched = false;

    // --- Pass 1: Pokémon with attacks ---
    if (zh.attackFingerprint !== null) {
      const specMap = enSpeciesFpLookup.get(expId);
      const atkMap = enAtkFpLookup.get(expId);

      let enCandidates: DbPrimaryCard[] = [];
      let matchMethod: MatchMethod = 'attack-fingerprint';
      let zhSibCount = 1;

      // Prefer species+attack fingerprint when pokemonSpeciesId is available
      if (zh.pokemonSpeciesId && specMap) {
        const specKey = `${zh.pokemonSpeciesId}|${zh.attackFingerprint}`;
        enCandidates = specMap.get(specKey) ?? [];
        zhSibCount = zhSpecSiblings.get(expId)?.get(specKey) ?? 1;
        if (enCandidates.length > 0) matchMethod = 'pokemon-species+attack';
      }

      // Fall back to pure attack fingerprint if species lookup failed
      if (enCandidates.length === 0 && atkMap) {
        enCandidates = atkMap.get(zh.attackFingerprint) ?? [];
        zhSibCount = zhAtkSiblings.get(expId)?.get(zh.attackFingerprint) ?? 1;
        matchMethod = 'attack-fingerprint';
      }

      // Global fallback: search across all EN expansions if per-expansion failed.
      // SAFETY: Only use species+attack global fallback (not bare attack FP) to avoid
      // matching reprinted Pokémon with identical attacks from completely different eras.
      // Additionally filter by regulation mark proximity (≤2 letters apart) to prevent
      // cross-era merges (e.g. ZH reg:E matching EN reg:I from a different generation).
      if (enCandidates.length === 0) {
        if (zh.pokemonSpeciesId) {
          const specKey = `${zh.pokemonSpeciesId}|${zh.attackFingerprint}`;
          const globalSpecCandidates = globalSpecMap.get(specKey) ?? [];
          if (globalSpecCandidates.length > 0) {
            // Filter by regulation mark proximity to prevent cross-era merges
            const REG_ORDER = ['A','B','C','D','E','F','G','H','I','J'];
            const zhReg = zh.repRegulationMark ?? zh.cards[0]?.regulationMark ?? null;
            const zhRegIdx = zhReg ? REG_ORDER.indexOf(zhReg) : -1;
            enCandidates = globalSpecCandidates.filter(en => {
              const enReg = en.repRegulationMark ?? en.cards[0]?.regulationMark ?? null;
              if (zhRegIdx < 0 || !enReg) return true; // can't compare, allow
              const enRegIdx = REG_ORDER.indexOf(enReg);
              if (enRegIdx < 0) return true;
              return Math.abs(zhRegIdx - enRegIdx) <= 2; // within 2 regulation marks = same era
            });
            if (enCandidates.length > 0) matchMethod = 'pokemon-species+attack';
          }
        }
        // NOTE: globalAtkMap (bare attack fingerprint) fallback intentionally REMOVED.
        // It caused cross-era merges by matching reprinted Pokémon with identical attacks
        // from different generations (e.g. S8/Huntail reg:E matched to SV-era EN reg:I).
        // Use species+attack fallback above, or add expansion code mappings to ZH_TO_EN_CODE.

        if (enCandidates.length > 0) {
          // Use 1 as global zhSibCount — if FP is ambiguous, enCandidates.length > 1 catches it
          zhSibCount = 1;
        }
      }

      if (enCandidates.length === 0) {
        unmatched.push({ zhId: zh.id, zhName: zh.name, expansion: zh.expansionCode ?? '?', reason: 'no EN match for attack fingerprint' });
        matched = true; // consumed — don't push to effect pass
      } else if (enCandidates.length > 1) {
        ambiguous.push({
          zhName: zh.name, expansion: zh.expansionCode ?? '?',
          fp: zh.attackFingerprint,
          enCandidates: enCandidates.map(e => e.name),
        });
        matched = true;
      } else if (zhSibCount > 1) {
        ambiguous.push({
          zhName: zh.name, expansion: zh.expansionCode ?? '?',
          fp: zh.attackFingerprint,
          enCandidates: [`${enCandidates[0].name} (1 EN but ${zhSibCount} ZH share same fingerprint)`],
        });
        matched = true;
      } else {
        // Safe 1:1 match
        const enPC = enCandidates[0];
        updates.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name, zhCardNumber: zh.cardNumber,
          zhCards: zh.cards, enPrimaryCard: enPC, enCard: enPC.cards[0] ?? null,
          matchMethod,
        });
        matched = true;
      }
    }

    if (matched) continue;

    // --- Pass 2: Trainer / Energy — effect-tag + regulationMark fingerprint ---
    if (zh.effectFingerprint !== null) {
      const effMap = enEffFpLookup.get(expId);
      let enCandidates = effMap?.get(zh.effectFingerprint) ?? [];
      // Global fallback for effect fingerprint
      if (enCandidates.length === 0) {
        enCandidates = globalEffMap.get(zh.effectFingerprint) ?? [];
      }
      const zhSibCount = zhEffSiblings.get(expId)?.get(zh.effectFingerprint) ?? 1;

      if (enCandidates.length === 0) {
        // Fall through to Pass 3 — don't push unmatched yet
      } else if (enCandidates.length > 1) {
        ambiguous.push({
          zhName: zh.name, expansion: zh.expansionCode ?? '?',
          fp: zh.effectFingerprint,
          enCandidates: enCandidates.map(e => e.name),
        });
        matched = true;
      } else if (zhSibCount > 1) {
        ambiguous.push({
          zhName: zh.name, expansion: zh.expansionCode ?? '?',
          fp: zh.effectFingerprint,
          enCandidates: [`${enCandidates[0].name} (1 EN but ${zhSibCount} ZH share same effect fingerprint)`],
        });
        matched = true;
      } else {
        const enPC = enCandidates[0];
        updates.push({
          zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name, zhCardNumber: zh.cardNumber,
          zhCards: zh.cards, enPrimaryCard: enPC, enCard: enPC.cards[0] ?? null,
          matchMethod: 'effect-tag+regmark',
        });
        matched = true;
      }
    }

    if (matched) continue;

    // --- Pass 3: Trainer / Energy fallback matching ---
    // Handles cards where effectTags differ between ZH and EN due to keyword analysis gaps,
    // or cards with no distinctive effectTags but unique specialEffectTags or subtype/reg.

    // Pass 3A: specialEffectTags + subtype + regulationMark
    {
      const specTags = [...(zh.specialEffectTags ?? [])].sort().join(',');
      const subtype = zh.repSubtype ?? '';
      const reg = zh.repRegulationMark ?? '';
      if (specTags) {
        const key3a = `S:${specTags}|${subtype}|R:${reg}`;
        const specTagMap = enSpecialTagLookup.get(expId);
        let enCandidates3a = specTagMap?.get(key3a) ?? [];
        // Global fallback
        if (enCandidates3a.length === 0) {
          enCandidates3a = globalSpecialTagMap.get(key3a) ?? [];
        }

        if (enCandidates3a.length === 1) {
          const enPC = enCandidates3a[0];
          updates.push({
            zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name, zhCardNumber: zh.cardNumber,
            zhCards: zh.cards, enPrimaryCard: enPC, enCard: enPC.cards[0] ?? null,
            matchMethod: 'special-tag+regmark',
          });
          matched = true;
        } else if (enCandidates3a.length > 1) {
          ambiguous.push({
            zhName: zh.name, expansion: zh.expansionCode ?? '?',
            fp: key3a,
            enCandidates: enCandidates3a.map(e => e.name),
          });
          matched = true;
        }
      }
    }

    if (matched) continue;

    // Pass 3B: subtype + regulationMark — only when exactly 1 ZH and 1 EN candidate in expansion
    {
      const subtype = zh.repSubtype ?? '';
      const reg = zh.repRegulationMark ?? '';
      if (subtype && reg) {
        const key3b = `${subtype}|R:${reg}`;
        const subtypeMap = enSubtypeRegLookup.get(expId);
        const enCandidates3b = subtypeMap?.get(key3b) ?? [];

        // Count how many ZH cards share this subtype+reg key in this expansion
        const zhSiblings3b = zhCards.filter(z =>
          z.primaryExpansionId === expId &&
          z.attackFingerprint === null &&
          (z.repSubtype ?? '') === subtype &&
          (z.repRegulationMark ?? '') === reg
        ).length;

        if (enCandidates3b.length === 1 && zhSiblings3b === 1) {
          // Unique 1:1 match — safe to link
          const enPC = enCandidates3b[0];
          updates.push({
            zhPrimaryCardId: zh.id, zhPrimaryCardName: zh.name, zhCardNumber: zh.cardNumber,
            zhCards: zh.cards, enPrimaryCard: enPC, enCard: enPC.cards[0] ?? null,
            matchMethod: 'subtype+regmark-1:1',
          });
          matched = true;
        } else if (enCandidates3b.length > 1 || (enCandidates3b.length === 1 && zhSiblings3b > 1)) {
          // Multiple candidates or multiple ZH sibs — ambiguous
          ambiguous.push({
            zhName: zh.name, expansion: zh.expansionCode ?? '?',
            fp: key3b,
            enCandidates: enCandidates3b.map(e => e.name),
          });
          matched = true;
        }
      }
    }

    if (matched) continue;

    // If we reach here, nothing worked — record unmatched
    if (zh.effectFingerprint !== null) {
      unmatched.push({ zhId: zh.id, zhName: zh.name, expansion: zh.expansionCode ?? '?', reason: 'no EN effect-tag match' });
    } else {
      unmatched.push({ zhId: zh.id, zhName: zh.name, expansion: zh.expansionCode ?? '?', reason: 'no attacks and no distinctive effect tags' });
    }
  } // end for zh of zhCards

  return { updates, ambiguous, unmatched };
}

// ─────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────

function printMatch(u: UpdateRecord): void {
  const zhCard = u.zhCards[0];
  const enCard = u.enCard;
  const zhWebIds = u.zhCards.map(c => c.webCardId).join(', ');
  const enWebId = enCard?.webCardId ?? '(no card)';
  const attacks: any[] = Array.isArray(enCard?.attacks) ? enCard!.attacks : [];
  const attackSummary = attacks.length > 0
    ? attacks.map((a: any) => {
        const cost = Array.isArray(a.cost) ? a.cost.join('+') : (a.cost ?? '?');
        return `${a.name ?? ''}(${cost}→${a.damage ?? '–'})`;
      }).join(' | ')
    : '–';
  const hp = enCard?.hp ?? zhCard?.hp ?? null;
  const types = (enCard?.types ?? zhCard?.types ?? []).join('/') || '–';
  const rarity = enCard?.rarity ?? zhCard?.rarity ?? '–';
  const regMark = enCard?.regulationMark ?? zhCard?.regulationMark ?? '';
  const subtype = (enCard?.subtypes ?? zhCard?.subtypes ?? []).join('/') || '–';
  console.log(
    `  [${u.enPrimaryCard.expansionCode}/${u.enPrimaryCard.cardNumber}]` +
    `  HP:${hp ?? '–'}  Type:${types}  ${subtype !== '–' ? `Subtype:${subtype}  ` : ''}` +
    `Rarity:${rarity}  Reg:${regMark || '–'}  [${u.matchMethod}]` +
    `\n    ZH: ${zhWebIds} "${u.zhPrimaryCardName}"` +
    `\n    EN: ${enWebId} "${u.enPrimaryCard.name}"  attacks: ${attackSummary}`
  );
}

// ─────────────────────────────────────────────────────────────
// Apply
// ─────────────────────────────────────────────────────────────

async function applyUpdates(updates: UpdateRecord[]): Promise<void> {
  let applied = 0;
  let fieldsSynced = 0;
  const orphanedPrimaryCardIds = new Set<string>();

  // EN → ZH reverse sync (regulationMark)
  const zhUpdates: { cardId: string; data: Record<string, unknown> }[] = [];
  const zhUpdateSet = new Set<string>();

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const ops: Promise<any>[] = [];

    for (const u of chunk) {
      orphanedPrimaryCardIds.add(u.enPrimaryCard.id);
      const enCard = u.enCard;

      for (const enDbCard of u.enPrimaryCard.cards) {
        // Re-point EN card to the ZH PrimaryCard
        const syncFields: Record<string, unknown> = {
          primaryCardId: u.zhPrimaryCardId,
        };

        if (enCard) {
          // EN is authoritative for these three
          // (Applied here on ZH cards via reverse sync below)
        }

        // Sync EN fields onto EN card itself (no change needed — it already has correct fields)
        // But we need to sync ZH fields: fill nulls from EN
        // We'll do that on ZH cards separately

        ops.push(
          prisma.card.update({ where: { id: enDbCard.id }, data: syncFields })
        );
      }

      // Sync EN metadata onto ZH cards
      if (enCard) {
        for (const zhCard of u.zhCards) {
          const zhSync: Record<string, unknown> = {};
          // EN is authoritative for rarity and variantType — always overwrite on ZH
          if (enCard.rarity && zhCard.rarity !== enCard.rarity)           zhSync.rarity = enCard.rarity;
          if (enCard.variantType && zhCard.variantType !== enCard.variantType) zhSync.variantType = enCard.variantType;
          // regulationMark: only FILL when ZH is null — never overwrite an existing value.
          // Overwriting caused cross-era corruption (EN reg:I wrongly pushed to ZH reg:E cards).
          if (enCard.regulationMark && !zhCard.regulationMark) zhSync.regulationMark = enCard.regulationMark;
          // Fill nulls on ZH
          if (!zhCard.artist     && enCard.artist)     zhSync.artist     = enCard.artist;
          if (!zhCard.evolvesFrom && enCard.evolvesFrom) zhSync.evolvesFrom = enCard.evolvesFrom;
          if (!zhCard.ruleBox    && enCard.ruleBox)    zhSync.ruleBox    = enCard.ruleBox;
          if ((!zhCard.subtypes || zhCard.subtypes.length === 0) && enCard.subtypes?.length > 0)
            zhSync.subtypes = enCard.subtypes;

          if (Object.keys(zhSync).length > 0) {
            ops.push(prisma.card.update({ where: { id: zhCard.id }, data: zhSync }));
            fieldsSynced++;
          }

          // Reverse sync: ZH → EN for regulationMark when EN is null
          if (!enCard.regulationMark && zhCard.regulationMark && !zhUpdateSet.has(enCard.id)) {
            zhUpdateSet.add(enCard.id);
            zhUpdates.push({ cardId: enCard.id, data: { regulationMark: zhCard.regulationMark } });
          }
        }
      }
    }

    await prisma.$transaction(ops);
    applied += chunk.reduce((s, u) => s + u.enPrimaryCard.cards.length, 0);
    process.stdout.write(`\r  Re-pointed ${applied} EN_US cards...`);
  }

  console.log(`\n✅ Re-pointed ${applied} EN_US cards to ZH PrimaryCards`);
  console.log(`✏️  Synced EN→ZH fields on ${fieldsSynced} ZH cards`);

  // ZH → EN reverse sync
  if (zhUpdates.length > 0) {
    console.log('\nApplying ZH → EN reverse sync (regulationMark)...');
    let revApplied = 0;
    for (let i = 0; i < zhUpdates.length; i += CHUNK) {
      const chunk = zhUpdates.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map(u => prisma.card.update({ where: { id: u.cardId }, data: u.data }))
      );
      revApplied += chunk.length;
      process.stdout.write(`\r  Updated ${revApplied}/${zhUpdates.length} EN cards...`);
    }
    console.log(`\n✏️  Synced ZH→EN regulationMark on ${revApplied} EN cards`);
  }

  // Delete orphaned EN-only PrimaryCards (those that now have 0 cards left)
  console.log('\nCleaning up orphaned EN-only PrimaryCards...');
  let deletedOrphans = 0;
  for (const pcId of orphanedPrimaryCardIds) {
    const remaining = await prisma.card.count({ where: { primaryCardId: pcId } });
    if (remaining === 0) {
      await prisma.primaryCard.delete({ where: { id: pcId } });
      deletedOrphans++;
    }
  }
  console.log(`🗑️  Deleted ${deletedOrphans} orphaned EN-only PrimaryCards`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log(`ZH_TW → EN_US Mapping${APPLY ? ' [APPLY MODE]' : ' [DRY RUN]'}`);
  if (FILTER_EXP) console.log(`Expansion filter: ${FILTER_EXP}`);
  console.log('='.repeat(60));

  // ── Load ZH_TW-only PrimaryCards (have ZH_TW, no EN_US) ──
  console.log('\nQuerying ZH_TW-only PrimaryCards from DB...');
  const zhOnly = await loadPrimaryCards('ZH_TW', 'EN_US');
  console.log(`  Found ${zhOnly.length} ZH_TW PrimaryCards without EN_US`);

  if (zhOnly.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  // ── Load EN_US-only PrimaryCards for the same expansions ──
  const expansionIds = [...new Set(
    zhOnly.map(c => c.primaryExpansionId).filter(Boolean) as string[]
  )];
  console.log(`  Spanning ${expansionIds.length} expansions`);

  // ── Build cross-expansion mapping: ZH expCode → EN expCode ──
  // Collect all ZH expansion codes present in the working set
  const zhCodeToExpId = new Map<string, string>(); // zhExpCode → zhExpId
  for (const zh of zhOnly) {
    if (zh.primaryExpansionId && zh.expansionCode)
      zhCodeToExpId.set(zh.expansionCode, zh.primaryExpansionId);
  }

  // Find unique EN expansion codes needed via ZH_TO_EN_CODE
  const neededEnCodes = [...new Set(
    [...zhCodeToExpId.keys()].map(c => ZH_TO_EN_CODE[c]).filter(Boolean) as string[]
  )];

  // Look up EN expansion IDs from DB by code
  const enCodeToExpId = new Map<string, string>(); // enExpCode → enExpId
  if (neededEnCodes.length > 0) {
    const placeholders = neededEnCodes.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, code FROM primary_expansions WHERE code IN (${placeholders})`,
      ...neededEnCodes,
    );
    for (const r of rows) enCodeToExpId.set(r.code, r.id);
    if (neededEnCodes.length > 0)
      console.log(`  Cross-expansion map: ${neededEnCodes.map(c => `${[...zhCodeToExpId.keys()].filter(k => ZH_TO_EN_CODE[k] === c).join('+')}→${c}`).join(', ')}`);
  }

  // Build: enExpId → [zhExpId, ...] (one EN expansion may cover multiple ZH expansions)
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

  console.log('Querying EN_US PrimaryCards from DB...');
  // EN_US cards — no ZH_TW counterpart yet
  const allEnOnly = await loadPrimaryCards('EN_US', 'ZH_TW');
  // Include same-expansion EN cards AND cross-mapped EN expansion cards
  const crossMappedEnExpIds = [...enExpIdToZhExpIds.keys()];
  // Include ALL EN-only cards — global pool enables cross-expansion matching.
  // Fingerprint uniqueness ensures correct 1:1 disambiguation even without expansion scoping.
  const enInScope = allEnOnly;
  console.log(`  Found ${enInScope.length} EN_US PrimaryCards (global pool)`);

  // Group EN cards by expansion.
  // Cross-mapped EN cards are filed under EACH corresponding ZH expansion ID so that
  // runMatching (which keys candidates by zh.primaryExpansionId) can find them.
  const enByExpansion = new Map<string, DbPrimaryCard[]>();
  for (const en of enInScope) {
    if (!en.primaryExpansionId) continue;
    const zhExpIds = enExpIdToZhExpIds.get(en.primaryExpansionId);
    if (zhExpIds && zhExpIds.length > 0) {
      // Cross-mapped: file under every ZH expansion this EN expansion covers
      for (const zhExpId of zhExpIds) {
        const arr = enByExpansion.get(zhExpId) ?? [];
        arr.push(en);
        enByExpansion.set(zhExpId, arr);
      }
    } else {
      // Same-expansion: file under own expansion ID
      const arr = enByExpansion.get(en.primaryExpansionId) ?? [];
      arr.push(en);
      enByExpansion.set(en.primaryExpansionId, arr);
    }
  }

  // Add ALL EN-only cards to a global pool key for cross-expansion fallback
  const GLOBAL_KEY = '__GLOBAL__';
  for (const en of allEnOnly) {
    const arr = enByExpansion.get(GLOBAL_KEY) ?? [];
    arr.push(en);
    enByExpansion.set(GLOBAL_KEY, arr);
  }

  // ── Run matching ──
  console.log('\nMatching...');
  const { updates, ambiguous, unmatched } = runMatching(zhOnly, enByExpansion);

  const speciesMatches = updates.filter(u => u.matchMethod === 'pokemon-species+attack');
  const atkFpMatches   = updates.filter(u => u.matchMethod === 'attack-fingerprint');
  const effFpMatches   = updates.filter(u => u.matchMethod === 'effect-tag+regmark');
  const specTagMatches = updates.filter(u => u.matchMethod === 'special-tag+regmark');
  const subtypeMatches = updates.filter(u => u.matchMethod === 'subtype+regmark-1:1');

  // ── Report ──
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`ZH_TW-only PrimaryCards:            ${zhOnly.length}`);
  console.log(`  ✅ Species+attack matches (1:1):   ${speciesMatches.length}`);
  console.log(`  ✅ Attack-fp matches (1:1):         ${atkFpMatches.length}`);
  console.log(`  ✅ Effect-tag+regmark matches (1:1):${effFpMatches.length}`);
  console.log(`  ✅ Special-tag+regmark (Pass 3A):   ${specTagMatches.length}`);
  console.log(`  ✅ Subtype+regmark 1:1 (Pass 3B):   ${subtypeMatches.length}`);
  console.log(`  ⚠️  Ambiguous:                      ${ambiguous.length}`);
  console.log(`  ❌ Unmatched:                       ${unmatched.length}`);

  // Per-expansion breakdown
  const expBreakdown = new Map<string, { matched: number; ambig: number; unmatched: number }>();
  for (const u of updates) {
    const exp = u.enPrimaryCard.expansionCode ?? '?';
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
    console.log(`${'EXP'.padEnd(12)} ${'MATCH'.padStart(6)} ${'AMBIG'.padStart(6)} ${'UNMATCH'.padStart(8)}`);
    for (const [exp, stat] of [...expBreakdown.entries()].sort()) {
      console.log(`${exp.padEnd(12)} ${String(stat.matched).padStart(6)} ${String(stat.ambig).padStart(6)} ${String(stat.unmatched).padStart(8)}`);
    }
  }

  // Ambiguous
  if (ambiguous.length > 0) {
    console.log(`\n─── Ambiguous (first 20) — multiple cards share same fingerprint ───`);
    for (const a of ambiguous.slice(0, 20)) {
      console.log(`  [${a.expansion}] "${a.zhName}" → EN candidates: ${a.enCandidates.slice(0, 3).join(', ')}${a.enCandidates.length > 3 ? ` (+${a.enCandidates.length - 3} more)` : ''}`);
      console.log(`    fp: ${a.fp.slice(0, 100)}`);
    }
    if (ambiguous.length > 20) console.log(`  ... and ${ambiguous.length - 20} more`);
  }

  // Unmatched breakdown
  if (unmatched.length > 0) {
    const reasonCounts = new Map<string, number>();
    for (const u of unmatched) {
      reasonCounts.set(u.reason, (reasonCounts.get(u.reason) ?? 0) + 1);
    }
    console.log('\n─── Unmatched breakdown ───');
    for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(5)}  ${reason}`);
    }
  }

  // Display matches
  const newSpeciesMatches = speciesMatches.filter(u =>
    u.zhCards.some(c => c.primaryCardId !== u.enPrimaryCard.id)
  );
  const newAtkFpMatches = atkFpMatches.filter(u =>
    u.zhCards.some(c => c.primaryCardId !== u.enPrimaryCard.id)
  );
  const newEffFpMatches = effFpMatches.filter(u =>
    u.zhCards.some(c => c.primaryCardId !== u.enPrimaryCard.id)
  );
  const alreadyLinkedCount = updates.length - newSpeciesMatches.length - newAtkFpMatches.length - newEffFpMatches.length;

  if (newSpeciesMatches.length > 0) {
    const note = alreadyLinkedCount > 0 ? `, ${alreadyLinkedCount} already linked skipped` : '';
    console.log(`\n─── Pokémon (species+attack) matches (${newSpeciesMatches.length}${note}) ───`);
    for (const u of newSpeciesMatches) printMatch(u);
  }
  if (newAtkFpMatches.length > 0) {
    console.log(`\n─── Pokémon (attack fingerprint only) matches (${newAtkFpMatches.length}) ───`);
    for (const u of newAtkFpMatches) printMatch(u);
  }
  if (newEffFpMatches.length > 0) {
    console.log(`\n─── Trainer/Energy (effect-tag+regmark) matches (${newEffFpMatches.length}) ───`);
    for (const u of newEffFpMatches) printMatch(u);
  }

  if (!APPLY) {
    console.log('\n' + '─'.repeat(60));
    console.log('DRY RUN complete. Run with --apply to apply changes.');
    console.log('  npx tsx scrapers/map-zh-to-en.ts --apply');
    console.log('  npx tsx scrapers/map-zh-to-en.ts --apply --yes');
    console.log('  npx tsx scrapers/map-zh-to-en.ts --apply --expansion SV9 --yes');
    await prisma.$disconnect();
    return;
  }

  if (updates.length === 0) {
    console.log('\nNo safe 1:1 matches to apply.');
    await prisma.$disconnect();
    return;
  }

  // Confirm
  if (!YES) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(res =>
      rl.question(
        `\nApply ${updates.length} ZH→EN links ` +
        `(${speciesMatches.length} species+atk + ${atkFpMatches.length} atk-fp + ${effFpMatches.length} effect-tag)? (yes/no): `,
        res,
      )
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      await prisma.$disconnect();
      return;
    }
  }

  console.log('\nApplying updates...');
  await applyUpdates(updates);

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
