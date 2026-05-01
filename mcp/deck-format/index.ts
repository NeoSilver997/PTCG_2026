#!/usr/bin/env node
/**
 * PTCG 2026 — Deck Format MCP Server
 *
 * Exposes deck format logic and live DB queries to LLM agents via the
 * Model Context Protocol (stdio transport).
 *
 * Tools:
 *   get_deck              – fetch a deck by deckCode (full hydration)
 *   classify_card         – run getSectionKey heuristic on a card
 *   get_deck_sections     – classify all cards in a deck into sections
 *   get_deck_roles        – load saved role overrides for a deck
 *   lookup_card_roles     – cross-deck role lookup by primaryCardId list
 *   get_archetype_name    – derive archetype name from deck sections
 *   get_pricing_summary   – fetch pricing totals for a deck
 *
 * Resources:
 *   deck-format://logic   – returns the full deck-format-logic.md document
 *   deck-format://sections – returns section definitions (JSON)
 *   deck-format://sql/:query – returns the raw SQL for a named query
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── DB client (Prisma) ────────────────────────────────────────────────────
// Dynamic import so the server can start without a DB connection if needed
// (e.g. when queried for static schema info only).
let prisma: any = null;
async function getPrisma() {
  if (prisma) return prisma;
  try {
    const { PrismaClient } = await import('@ptcg/database');
    prisma = new PrismaClient();
  } catch {
    throw new McpError(ErrorCode.InternalError, 'Prisma client unavailable — run pnpm db:generate');
  }
  return prisma;
}

// ─── Deck section constants ────────────────────────────────────────────────
const SECTION_ORDER = [
  'pokemon-main',
  'pokemon-secondary',
  'pokemon-support',
  'pokemon-evolution',
  'supporter',
  'item',
  'ace',
  'tool',
  'stadium',
  'basic-energy',
  'special-energy',
] as const;

type SectionKey = (typeof SECTION_ORDER)[number];

const SECTION_LABELS: Record<SectionKey, string> = {
  'pokemon-main': '主攻寶可夢',
  'pokemon-secondary': '副攻寶可夢',
  'pokemon-support': '輔助寶可夢',
  'pokemon-evolution': '進化鏈寶可夢',
  supporter: '支援者',
  item: '物品',
  ace: 'ACE SPEC',
  tool: '寶可夢道具',
  stadium: '競技場',
  'basic-energy': '基本能量',
  'special-energy': '特殊能量',
};

// ─── Section heuristic ─────────────────────────────────────────────────────
interface CardInfo {
  supertype?: string | null;
  subtypes?: string[];
  rarity?: string | null;
  hp?: number | null;
  abilities?: unknown[] | null;
  quantity: number;
}

function getSectionKey(card: CardInfo): SectionKey {
  const { supertype, subtypes = [], rarity, hp, abilities, quantity } = card;
  if (supertype === 'POKEMON') {
    if (quantity >= 3 || (hp ?? 0) >= 200) return 'pokemon-main';
    if (Array.isArray(abilities) && abilities.length > 0) return 'pokemon-support';
    return 'pokemon-secondary';
  }
  if (supertype === 'ENERGY') {
    return subtypes.includes('BASIC_ENERGY') ? 'basic-energy' : 'special-energy';
  }
  // TRAINER
  if (rarity === 'ACE_SPEC_RARE' || rarity === 'ACE_SPEC') return 'ace';
  if (subtypes.includes('SUPPORTER')) return 'supporter';
  if (subtypes.includes('ITEM')) return 'item';
  if (subtypes.includes('TOOL')) return 'tool';
  if (subtypes.includes('STADIUM')) return 'stadium';
  return 'item';
}

// ─── Archetype derivation ──────────────────────────────────────────────────
const DRAW_ENGINE_JP = ['リーリエのピッピex', 'ノコッチex', 'ゲノセクトex', 'フーディン'];

function deriveArchetypeName(
  mainCards: Array<{ name?: string | null; zhName?: string | null; evolvesTo?: string | null }>,
  supportCards: Array<{ name?: string | null; zhName?: string | null }>,
): string {
  const mainNames = new Set(mainCards.map((e) => e.name));
  const filtered = mainCards.filter((e) => {
    let evo = e.evolvesTo;
    while (evo) {
      if (mainNames.has(evo)) return false;
      evo = mainCards.find((x) => x.name === evo)?.evolvesTo ?? null;
    }
    return true;
  });
  const names = [
    ...filtered
      .map((e) => e.zhName ?? e.name)
      .filter((n): n is string => !!n)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 2),
    ...supportCards
      .filter((e) => DRAW_ENGINE_JP.some((f) => (e.name ?? '').includes(f)))
      .map((e) => e.zhName ?? e.name)
      .filter((n): n is string => !!n)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .slice(0, 1),
  ];
  return names.join(' + ');
}

// ─── SQL definitions (for the sql resource) ────────────────────────────────
const SQL_QUERIES: Record<string, { description: string; sql: string }> = {
  deck_by_code: {
    description: 'Lookup deck ID by official deck code',
    sql: `SELECT id FROM decks WHERE "deckCode" = $1 LIMIT 1`,
  },
  hydrate_deck_extras: {
    description: 'Load deckCode and deckData JSON for a deck',
    sql: `SELECT id, "deckCode", "deckData" FROM decks WHERE id = $1`,
  },
  canonical_web_card_ids: {
    description: 'Resolve JA_JP-preferred webCardId per primaryCard',
    sql: `
SELECT "primaryCardId", "webCardId", language
FROM cards
WHERE "primaryCardId" = ANY($1::text[])
ORDER BY language ASC, "createdAt" ASC`,
  },
  chinese_variants: {
    description: 'Resolve ZH_TW name, image, abilities, attacks per primaryCard',
    sql: `
SELECT id, "primaryCardId", name, "webCardId", "imageUrl", "variantType", abilities, attacks
FROM cards
WHERE "primaryCardId" = ANY($1::text[])
  AND language = 'ZH_TW'
ORDER BY "variantType" ASC`,
  },
  pricing_latest: {
    description: 'Latest price per ZH_TW card variant (90-day window), all tiers sorted ASC',
    sql: `
WITH latest_prices AS (
  SELECT DISTINCT ON ("cardId")
    "cardId", price, "inStock", currency, "fetchedAt"
  FROM card_prices
  WHERE price > 0
    AND "fetchedAt" >= NOW() - INTERVAL '90 days'
  ORDER BY "cardId", "fetchedAt" DESC
)
SELECT
  jp_c.id                          AS "deckCardId",
  jp_c."primaryCardId"             AS "primaryCardId",
  zh_c.id                          AS "zhCardId",
  zh_c.name                        AS "zhName",
  zh_c."webCardId"                 AS "zhWebCardId",
  zh_c."imageUrl"                  AS "zhImageUrl",
  zh_c."variantType"               AS "variantType",
  zh_c.rarity                      AS "rarity",
  lp.price                         AS "minPrice",
  lp.price                         AS "maxPrice",
  lp.currency                      AS "currency",
  lp."fetchedAt"                   AS "latestFetchedAt",
  lp."inStock"                     AS "inStock"
FROM cards jp_c
JOIN cards zh_c
  ON zh_c."primaryCardId" = jp_c."primaryCardId"
  AND zh_c.language = 'ZH_TW'
JOIN latest_prices lp
  ON lp."cardId" = zh_c.id
WHERE jp_c.id = ANY($1::text[])
ORDER BY lp.price ASC`,
  },
  user_prices: {
    description: 'User-saved purchase prices (most recent per ZH webCardId)',
    sql: `
SELECT DISTINCT ON (c."webCardId")
  c."webCardId", cp.price
FROM card_prices cp
JOIN cards c ON c.id = cp."cardId"
WHERE c."webCardId" = ANY($1::text[])
  AND cp.source = 'USER'
ORDER BY c."webCardId", cp."fetchedAt" DESC`,
  },
  get_deck_roles: {
    description: 'Get all role overrides saved for a deck',
    sql: `
SELECT "canonicalWebCardId", role::text
FROM deck_card_roles
WHERE "deckCode" = $1`,
  },
  lookup_card_roles: {
    description: 'Cross-deck: most recent role for each card across all decks',
    sql: `
SELECT DISTINCT ON ("canonicalWebCardId") "canonicalWebCardId", role::text
FROM deck_card_roles
WHERE "canonicalWebCardId" = ANY($1::text[])
ORDER BY "canonicalWebCardId", "updatedAt" DESC`,
  },
  upsert_role: {
    description: 'Save or update a Pokémon role override for one card in a deck',
    sql: `
INSERT INTO deck_card_roles (id, "deckCode", "canonicalWebCardId", role, "createdAt", "updatedAt")
VALUES ($1, $2, $3, $4::"DeckPokemonRole", NOW(), NOW())
ON CONFLICT ("deckCode", "canonicalWebCardId")
DO UPDATE SET role = $4::"DeckPokemonRole", "updatedAt" = NOW()`,
  },
  clear_role: {
    description: 'Remove a role override (card reverts to heuristic)',
    sql: `
DELETE FROM deck_card_roles
WHERE "deckCode" = $1 AND "canonicalWebCardId" = $2`,
  },
  cache_archetype_meta: {
    description: 'Persist computed archetype name and ACE SPEC name back to decks table',
    sql: `
UPDATE decks
SET "cachedArchetypeName" = $1,
    "cachedAceName"       = $2,
    "cachedNameAt"        = NOW()
WHERE "deckCode" = $3`,
  },
  admin_empty_deck_stats: {
    description: 'Count event decks with deckData but no linked DeckCard rows',
    sql: `
SELECT
  COUNT(*) FILTER (WHERE "deckData" IS NOT NULL) AS total_with_data,
  COUNT(*) FILTER (
    WHERE "deckData" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM deck_cards dc WHERE dc."deckId" = decks.id)
  ) AS empty_count
FROM decks`,
  },
  admin_missing_meta_stats: {
    description: 'Count event decks missing cached archetype name',
    sql: `
SELECT
  COUNT(DISTINCT d.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM deck_cards dc WHERE dc."deckId" = d.id)
  ) AS total_with_cards,
  COUNT(DISTINCT d.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM deck_cards dc WHERE dc."deckId" = d.id)
      AND d."cachedArchetypeName" IS NULL
  ) AS missing_name
FROM decks d`,
  },
};

// ─── Docs path ─────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_PATH = join(__dirname, '../../docs/deck-format-logic.md');

// ─── MCP Server ────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'ptcg-deck-format', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } },
);

// ── Tools ──────────────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_deck',
      description: 'Fetch a deck by its official deck code. Returns cards, tournament results, pricing, and cached archetype name.',
      inputSchema: {
        type: 'object',
        properties: {
          deckCode: { type: 'string', description: 'Official deck code, e.g. "pMMyyp-Bj58oH-M2MpyS"' },
        },
        required: ['deckCode'],
      },
    },
    {
      name: 'classify_card',
      description: 'Run the getSectionKey heuristic on a card and return which deck section it belongs to.',
      inputSchema: {
        type: 'object',
        properties: {
          supertype: { type: 'string', enum: ['POKEMON', 'TRAINER', 'ENERGY'] },
          subtypes: { type: 'array', items: { type: 'string' } },
          rarity: { type: 'string' },
          hp: { type: 'number' },
          hasAbilities: { type: 'boolean' },
          quantity: { type: 'number' },
        },
        required: ['supertype', 'quantity'],
      },
    },
    {
      name: 'get_deck_sections',
      description: 'Classify all cards in a deck by deckCode into labelled sections. Returns each section with card list and count.',
      inputSchema: {
        type: 'object',
        properties: {
          deckCode: { type: 'string' },
          includeOverrides: { type: 'boolean', description: 'Apply saved role overrides from DB (default: true)' },
        },
        required: ['deckCode'],
      },
    },
    {
      name: 'get_deck_roles',
      description: 'Load all saved Pokémon role overrides for a specific deck.',
      inputSchema: {
        type: 'object',
        properties: {
          deckCode: { type: 'string' },
        },
        required: ['deckCode'],
      },
    },
    {
      name: 'lookup_card_roles',
      description: 'Cross-deck role lookup: returns the most-recently assigned role for each card across all decks.',
      inputSchema: {
        type: 'object',
        properties: {
          cardIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of primaryCardId / canonicalWebCardId values',
          },
        },
        required: ['cardIds'],
      },
    },
    {
      name: 'get_archetype_name',
      description: 'Derive the archetype display name for a deck from its classified sections.',
      inputSchema: {
        type: 'object',
        properties: {
          deckCode: { type: 'string' },
        },
        required: ['deckCode'],
      },
    },
    {
      name: 'get_pricing_summary',
      description: 'Get ZH_TW pricing totals (budget / premium / lowest / highest) for a deck.',
      inputSchema: {
        type: 'object',
        properties: {
          deckCode: { type: 'string' },
        },
        required: ['deckCode'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const db = await getPrisma();

  // ── classify_card ──────────────────────────────────────────────────────
  if (name === 'classify_card') {
    const section = getSectionKey({
      supertype: args.supertype as string,
      subtypes: (args.subtypes as string[]) ?? [],
      rarity: args.rarity as string | undefined,
      hp: args.hp as number | undefined,
      abilities: args.hasAbilities ? [{}] : [],
      quantity: args.quantity as number,
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ section, label: SECTION_LABELS[section] }, null, 2),
      }],
    };
  }

  // ── get_deck_roles ────────────────────────────────────────────────────
  if (name === 'get_deck_roles') {
    const rows = await db.$queryRaw`
      SELECT "canonicalWebCardId", role::text FROM deck_card_roles
      WHERE "deckCode" = ${args.deckCode}
    `;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(Object.fromEntries((rows as any[]).map((r: any) => [r.canonicalWebCardId, r.role])), null, 2),
      }],
    };
  }

  // ── lookup_card_roles ─────────────────────────────────────────────────
  if (name === 'lookup_card_roles') {
    const ids = args.cardIds as string[];
    if (!ids.length) return { content: [{ type: 'text', text: '{}' }] };
    const rows = await db.$queryRaw`
      SELECT DISTINCT ON ("canonicalWebCardId") "canonicalWebCardId", role::text
      FROM deck_card_roles
      WHERE "canonicalWebCardId" = ANY(${ids})
      ORDER BY "canonicalWebCardId", "updatedAt" DESC
    `;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(Object.fromEntries((rows as any[]).map((r: any) => [r.canonicalWebCardId, r.role])), null, 2),
      }],
    };
  }

  // ── get_deck / get_deck_sections / get_archetype_name / get_pricing_summary
  // All require loading the deck first.
  const deckRows = await db.$queryRaw`
    SELECT id FROM decks WHERE "deckCode" = ${args.deckCode} LIMIT 1
  ` as any[];
  if (!deckRows.length) throw new McpError(ErrorCode.InvalidParams, `Deck ${args.deckCode} not found`);
  const deckId = deckRows[0].id;

  // Load deck cards
  const cards = await db.deckCard.findMany({
    where: { deckId },
    include: {
      card: {
        select: {
          webCardId: true, name: true, supertype: true, subtypes: true,
          types: true, rarity: true, hp: true, abilities: true,
          evolutionStage: true, evolvesFrom: true, evolvesTo: true,
          primaryCardId: true, language: true,
        },
      },
    },
  }) as any[];

  // ── get_deck ────────────────────────────────────────────────────────────
  if (name === 'get_deck') {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: {
        id: true, deckCode: true, name: true,
        cachedArchetypeName: true, cachedAceName: true,
        cachedBudgetMin: true, cachedBudgetMax: true, priceUpdatedAt: true,
        tournamentResults: {
          include: { tournament: { select: { date: true, name: true, location: true } } },
          take: 1,
        },
      },
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...deck, cardCount: cards.reduce((s: number, c: any) => s + c.quantity, 0) }, null, 2),
      }],
    };
  }

  // ── classify all cards ─────────────────────────────────────────────────
  let roleOverrides: Record<string, string> = {};
  if (args.includeOverrides !== false) {
    const roleRows = await db.$queryRaw`
      SELECT "canonicalWebCardId", role::text FROM deck_card_roles
      WHERE "deckCode" = ${args.deckCode}
    ` as any[];
    roleOverrides = Object.fromEntries(roleRows.map((r: any) => [r.canonicalWebCardId, r.role]));
  }

  const DB_TO_SECTION: Record<string, SectionKey> = {
    POKEMON_MAIN: 'pokemon-main',
    POKEMON_SECONDARY: 'pokemon-secondary',
    POKEMON_SUPPORT: 'pokemon-support',
    POKEMON_EVOLUTION: 'pokemon-evolution',
  };

  const sections = new Map<SectionKey, any[]>();
  SECTION_ORDER.forEach((k) => sections.set(k, []));

  for (const dc of cards) {
    const key = dc.card.primaryCardId ?? dc.card.webCardId;
    const savedRole = roleOverrides[key];
    const section = savedRole ? (DB_TO_SECTION[savedRole] ?? getSectionKey({ ...dc.card, quantity: dc.quantity })) : getSectionKey({ ...dc.card, quantity: dc.quantity });
    sections.get(section)!.push({ webCardId: dc.card.webCardId, name: dc.card.name, quantity: dc.quantity });
  }

  // ── get_deck_sections ──────────────────────────────────────────────────
  if (name === 'get_deck_sections') {
    const result = Object.fromEntries(
      SECTION_ORDER.map((k) => [k, { label: SECTION_LABELS[k], count: sections.get(k)!.reduce((s, c) => s + c.quantity, 0), cards: sections.get(k) }])
    );
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  // ── get_archetype_name ─────────────────────────────────────────────────
  if (name === 'get_archetype_name') {
    const mainCards = sections.get('pokemon-main')!.map((c) => ({
      name: c.name,
      zhName: c.zhName ?? null,
      evolvesTo: cards.find((dc: any) => dc.card.webCardId === c.webCardId)?.card.evolvesTo ?? null,
    }));
    const supportCards = sections.get('pokemon-support')!.map((c) => ({ name: c.name, zhName: c.zhName ?? null }));
    const archetype = deriveArchetypeName(mainCards, supportCards);
    const aceCard = sections.get('ace')![0];
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ archetypeName: archetype, aceName: aceCard?.name ?? null }, null, 2),
      }],
    };
  }

  // ── get_pricing_summary ────────────────────────────────────────────────
  if (name === 'get_pricing_summary') {
    const deck = await db.deck.findUnique({
      where: { id: deckId },
      select: { cachedBudgetMin: true, cachedBudgetMax: true, priceUpdatedAt: true },
    });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ deckCode: args.deckCode, ...deck, currency: 'HKD' }, null, 2),
      }],
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

// ── Resources ──────────────────────────────────────────────────────────────
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'deck-format://logic',
      name: 'Deck Format Logic Documentation',
      description: 'Full markdown doc explaining classification, SQL, role system, and archetype derivation',
      mimeType: 'text/markdown',
    },
    {
      uri: 'deck-format://sections',
      name: 'Section Definitions',
      description: 'JSON: all 11 section keys with labels and color codes',
      mimeType: 'application/json',
    },
    ...Object.keys(SQL_QUERIES).map((key) => ({
      uri: `deck-format://sql/${key}`,
      name: `SQL: ${key}`,
      description: SQL_QUERIES[key].description,
      mimeType: 'text/plain',
    })),
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'deck-format://logic') {
    let content = '';
    try { content = readFileSync(DOCS_PATH, 'utf8'); }
    catch { content = '# Deck Format Logic\n\nDocs file not found. See docs/deck-format-logic.md'; }
    return { contents: [{ uri, mimeType: 'text/markdown', text: content }] };
  }

  if (uri === 'deck-format://sections') {
    const data = SECTION_ORDER.map((k) => ({ key: k, label: SECTION_LABELS[k] }));
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
  }

  const sqlMatch = uri.match(/^deck-format:\/\/sql\/(.+)$/);
  if (sqlMatch) {
    const key = sqlMatch[1];
    const q = SQL_QUERIES[key];
    if (!q) throw new McpError(ErrorCode.InvalidParams, `Unknown SQL query: ${key}`);
    return {
      contents: [{
        uri,
        mimeType: 'text/plain',
        text: `-- ${q.description}\n${q.sql.trim()}`,
      }],
    };
  }

  throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
});

// ─── Start ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
