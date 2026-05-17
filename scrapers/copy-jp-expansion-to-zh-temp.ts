/**
 * copy-jp-expansion-to-zh-temp.ts
 *
 * Clone all JP cards in one expansion into temporary ZH_TW cards.
 *
 * Goal:
 * - Create "temp" Chinese cards for a whole JP expansion while preserving card structure.
 * - Reuse existing ZH_TW data linked to the same PrimaryCard when available
 *   (old translation logic fallback), otherwise fall back to JP values.
 *
 * WebCardId format:
 * - source: jp50300 -> target: zh50300temp
 * - configurable via --prefix / --suffix
 *
 * Usage:
 *   npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --expansion M5
 *   npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --source-webcard jp50300
 *   npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --source-webcard jp50300 --expansion M5 --apply
 *   npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --expansion M5 --apply --overwrite-existing
 */

import { PrismaClient, LanguageCode, Region, VariantType } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();
const regionalExpansionCache = new Map<string, string>();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const OVERWRITE_EXISTING = args.includes('--overwrite-existing');
const USE_LLM_FALLBACK = args.includes('--use-llm-fallback');

function getArg(flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

const EXPANSION_ARG = getArg('--expansion');
const SOURCE_WEBCARD = getArg('--source-webcard');
const PREFIX = getArg('--prefix') ?? 'zh';
const SUFFIX = getArg('--suffix') ?? 'temp';
const LLM_BASE_URL = getArg('--llm-base-url') ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const LLM_MODEL = getArg('--llm-model') ?? process.env.OLLAMA_MODEL ?? 'deepseek-coder-v2:16b';

function normalizeExpansion(code: string): string {
  return code.trim().toUpperCase();
}

function extractNumericId(webCardId: string): string | null {
  const m = webCardId.match(/(\d+)$/);
  return m ? m[1] : null;
}

function makeZhTempWebCardId(jpWebCardId: string): string | null {
  const num = extractNumericId(jpWebCardId);
  if (!num) return null;
  return `${PREFIX}${num}${SUFFIX}`;
}

function preferZh<T>(zhValue: T | null | undefined, jpValue: T | null | undefined): T | null {
  if (zhValue !== null && zhValue !== undefined) return zhValue;
  return jpValue ?? null;
}

function normalizeTextKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function getMappedOrOriginal(value: unknown, map: Map<string, string>): unknown {
  if (typeof value !== 'string') return value;
  const key = normalizeTextKey(value);
  return map.get(key) ?? value;
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(v => v && typeof v === 'object') as Record<string, unknown>[];
}

type TranslationMemory = {
  cardName: Map<string, string>;
  text: Map<string, string>;
  rules: Map<string, string>;
  flavorText: Map<string, string>;
  abilityName: Map<string, string>;
  abilityDescription: Map<string, string>;
  attackName: Map<string, string>;
  attackEffect: Map<string, string>;
};

type PokedexNameMapper = {
  byJa: Map<string, string>;
  sortedJaNames: string[];
};

type LlmState = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  cache: Map<string, string>;
  translatedCount: number;
  attemptedCount: number;
  failedCount: number;
};

function putMapPair(map: Map<string, string>, jp: unknown, zh: unknown) {
  const jpKey = normalizeTextKey(jp);
  const zhVal = normalizeTextKey(zh);
  if (!jpKey || !zhVal) return;
  if (!map.has(jpKey)) map.set(jpKey, zhVal);
}

async function buildTranslationMemory(): Promise<TranslationMemory> {
  const cardName = new Map<string, string>();
  const text = new Map<string, string>();
  const rules = new Map<string, string>();
  const flavorText = new Map<string, string>();
  const abilityName = new Map<string, string>();
  const abilityDescription = new Map<string, string>();
  const attackName = new Map<string, string>();
  const attackEffect = new Map<string, string>();

  const rows = await prisma.card.findMany({
    where: {
      OR: [
        { language: LanguageCode.JA_JP },
        {
          language: LanguageCode.ZH_TW,
          NOT: { webCardId: { endsWith: SUFFIX } },
        },
      ],
    },
    select: {
      primaryCardId: true,
      language: true,
      webCardId: true,
      name: true,
      text: true,
      rules: true,
      flavorText: true,
      abilities: true,
      attacks: true,
    },
    orderBy: [{ primaryCardId: 'asc' }, { language: 'asc' }],
  });

  const firstJaByPrimary = new Map<string, (typeof rows)[number]>();
  const firstZhByPrimary = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    if (row.language === LanguageCode.JA_JP && !firstJaByPrimary.has(row.primaryCardId)) {
      firstJaByPrimary.set(row.primaryCardId, row);
    }
    if (row.language === LanguageCode.ZH_TW && !firstZhByPrimary.has(row.primaryCardId)) {
      firstZhByPrimary.set(row.primaryCardId, row);
    }
  }

  for (const [primaryCardId, ja] of firstJaByPrimary.entries()) {
    const zh = firstZhByPrimary.get(primaryCardId);
    if (!zh) continue;

    putMapPair(cardName, ja.name, zh.name);
    putMapPair(text, ja.text, zh.text);
    putMapPair(flavorText, ja.flavorText, zh.flavorText);

    if (Array.isArray(ja.rules) && Array.isArray(zh.rules) && ja.rules.length === zh.rules.length) {
      for (let i = 0; i < ja.rules.length; i++) {
        putMapPair(rules, ja.rules[i], zh.rules[i]);
      }
    }

    const jaAbilities = asObjectArray(ja.abilities);
    const zhAbilities = asObjectArray(zh.abilities);
    const abilityLen = Math.min(jaAbilities.length, zhAbilities.length);
    for (let i = 0; i < abilityLen; i++) {
      putMapPair(abilityName, jaAbilities[i].name, zhAbilities[i].name);
      putMapPair(abilityDescription, jaAbilities[i].description, zhAbilities[i].description);
    }

    const jaAttacks = asObjectArray(ja.attacks);
    const zhAttacks = asObjectArray(zh.attacks);
    const attackLen = Math.min(jaAttacks.length, zhAttacks.length);
    for (let i = 0; i < attackLen; i++) {
      putMapPair(attackName, jaAttacks[i].name, zhAttacks[i].name);
      putMapPair(attackEffect, jaAttacks[i].effect, zhAttacks[i].effect);
    }
  }

  return {
    cardName,
    text,
    rules,
    flavorText,
    abilityName,
    abilityDescription,
    attackName,
    attackEffect,
  };
}

async function buildPokedexNameMapper(): Promise<PokedexNameMapper> {
  const rows = await prisma.pokemonSpecies.findMany({
    select: {
      nameJa: true,
      nameZhHant: true,
    },
  });

  const byJa = new Map<string, string>();
  for (const row of rows) {
    const ja = normalizeTextKey(row.nameJa);
    const zh = normalizeTextKey(row.nameZhHant);
    if (!ja || !zh) continue;
    if (!byJa.has(ja)) byJa.set(ja, zh);
  }

  const sortedJaNames = [...byJa.keys()].sort((a, b) => b.length - a.length);
  return { byJa, sortedJaNames };
}

function splitPokemonNameSuffix(name: string): { base: string; suffix: string } {
  const cleaned = normalizeTextKey(name);
  const suffixPattern = /( ?(?:ex|EX|GX|VSTAR|VMAX|V-UNION|VUNION|V|BREAK|LEGEND))$/i;
  const m = cleaned.match(suffixPattern);
  if (!m) return { base: cleaned, suffix: '' };
  const suffix = m[1];
  const base = cleaned.slice(0, cleaned.length - suffix.length);
  return { base, suffix };
}

function hasJapaneseLikeChars(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value);
}

function needsLlmTranslation(original: unknown, mapped: unknown): boolean {
  if (typeof original !== 'string' || typeof mapped !== 'string') return false;
  const a = normalizeTextKey(original);
  const b = normalizeTextKey(mapped);
  if (!a) return false;
  if (a !== b) return false;
  return hasJapaneseLikeChars(a);
}

async function llmTranslateText(
  value: unknown,
  field: 'attack_name' | 'attack_effect' | 'ability_name' | 'ability_description',
  llm: LlmState,
): Promise<unknown> {
  if (!llm.enabled || typeof value !== 'string') return value;
  const source = normalizeTextKey(value);
  if (!source) return value;

  const cacheKey = `${field}:${source}`;
  const cached = llm.cache.get(cacheKey);
  if (cached) return cached;

  llm.attemptedCount++;

  const prompt = [
    'Translate the following Pokemon TCG Japanese text into Traditional Chinese (Taiwan).',
    'Rules:',
    '1) Output only translated text, no explanation.',
    '2) Keep card mechanics and game terms precise.',
    '3) Preserve symbols and numbers exactly when possible.',
    '4) If already Chinese, return as-is.',
    '',
    `Field: ${field}`,
    `Input: ${source}`,
  ].join('\n');

  try {
    const res = await fetch(`${llm.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llm.model,
        prompt,
        stream: false,
        options: { temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      llm.failedCount++;
      return value;
    }

    const body = await res.json() as { response?: string };
    const translated = normalizeTextKey(body.response ?? '');
    if (!translated) {
      llm.failedCount++;
      return value;
    }

    llm.cache.set(cacheKey, translated);
    if (translated !== source) llm.translatedCount++;
    return translated;
  } catch {
    llm.failedCount++;
    return value;
  }
}

function translatePokemonNameWithPokedex(
  name: string | null | undefined,
  supertype: string | null | undefined,
  mapper: PokedexNameMapper,
): string | null {
  if (!name) return null;
  if (supertype !== 'POKEMON') return name;

  const normalized = normalizeTextKey(name);
  if (!normalized) return name;

  const exact = mapper.byJa.get(normalized);
  if (exact) return exact;

  const { base, suffix } = splitPokemonNameSuffix(normalized);

  for (const ja of mapper.sortedJaNames) {
    if (!base.includes(ja)) continue;
    const zh = mapper.byJa.get(ja);
    if (!zh) continue;
    const replacedBase = base.replace(ja, zh);
    return `${replacedBase}${suffix}`;
  }

  return name;
}

async function translateAbilities(value: unknown, tm: TranslationMemory, llm: LlmState): Promise<unknown> {
  const arr = asObjectArray(value);
  if (arr.length === 0) return value;
  const out: Record<string, unknown>[] = [];
  for (const a of arr) {
    let nameMapped = getMappedOrOriginal(a.name, tm.abilityName);
    let descMapped = getMappedOrOriginal(a.description, tm.abilityDescription);

    if (needsLlmTranslation(a.name, nameMapped)) {
      nameMapped = await llmTranslateText(nameMapped, 'ability_name', llm);
    }
    if (needsLlmTranslation(a.description, descMapped)) {
      descMapped = await llmTranslateText(descMapped, 'ability_description', llm);
    }

    out.push({
      ...a,
      name: nameMapped,
      description: descMapped,
    });
  }
  return out;
}

async function translateAttacks(value: unknown, tm: TranslationMemory, llm: LlmState): Promise<unknown> {
  const arr = asObjectArray(value);
  if (arr.length === 0) return value;
  const out: Record<string, unknown>[] = [];
  for (const a of arr) {
    let nameMapped = getMappedOrOriginal(a.name, tm.attackName);
    let effectMapped = getMappedOrOriginal(a.effect, tm.attackEffect);

    if (needsLlmTranslation(a.name, nameMapped)) {
      nameMapped = await llmTranslateText(nameMapped, 'attack_name', llm);
    }
    if (needsLlmTranslation(a.effect, effectMapped)) {
      effectMapped = await llmTranslateText(effectMapped, 'attack_effect', llm);
    }

    out.push({
      ...a,
      name: nameMapped,
      effect: effectMapped,
    });
  }
  return out;
}

function translateRules(value: string[] | null | undefined, tm: TranslationMemory): string[] | null {
  if (!Array.isArray(value)) return value ?? null;
  return value.map(v => getMappedOrOriginal(v, tm.rules) as string);
}

function firstAbilityOrAttackSnippet(abilities: unknown, attacks: unknown): string {
  const ab = asObjectArray(abilities);
  if (ab[0]) {
    const name = normalizeTextKey(ab[0].name);
    const desc = normalizeTextKey(ab[0].description);
    const s = `${name} ${desc}`.trim();
    return s.slice(0, 80);
  }
  const at = asObjectArray(attacks);
  if (at[0]) {
    const name = normalizeTextKey(at[0].name);
    const effect = normalizeTextKey(at[0].effect);
    const s = `${name} ${effect}`.trim();
    return s.slice(0, 80);
  }
  return '(no ability/attack text)';
}

async function resolveExpansionCode(): Promise<string> {
  if (EXPANSION_ARG) return normalizeExpansion(EXPANSION_ARG);

  if (!SOURCE_WEBCARD) {
    throw new Error('Provide either --expansion <CODE> or --source-webcard <jpXXXXX>.');
  }

  const source = await prisma.card.findUnique({
    where: { webCardId: SOURCE_WEBCARD },
    select: {
      webCardId: true,
      primaryCard: {
        select: {
          primaryExpansion: {
            select: { code: true },
          },
        },
      },
    },
  });

  if (!source?.primaryCard?.primaryExpansion?.code) {
    throw new Error(`Cannot resolve expansion from source webCardId: ${SOURCE_WEBCARD}`);
  }

  return normalizeExpansion(source.primaryCard.primaryExpansion.code);
}

async function getOrCreateRegionalExpansionHK(primaryExpansionId: string, expansionCode: string): Promise<string> {
  const cacheKey = `${primaryExpansionId}:HK`;
  const cached = regionalExpansionCache.get(cacheKey);
  if (cached) return cached;

  let reg = await prisma.regionalExpansion.findUnique({
    where: {
      primaryExpansionId_region: {
        primaryExpansionId,
        region: Region.HK,
      },
    },
    select: { id: true },
  });

  if (reg?.id) {
    regionalExpansionCache.set(cacheKey, reg.id);
    return reg.id;
  }

  const created = await prisma.regionalExpansion.create({
    data: {
      primaryExpansionId,
      region: Region.HK,
      code: expansionCode.toLowerCase(),
      name: `HK ${expansionCode}`,
    },
    select: { id: true },
  });

  regionalExpansionCache.set(cacheKey, created.id);
  return created.id;
}

async function main() {
  const expansionCode = await resolveExpansionCode();

  console.log('='.repeat(70));
  console.log(`JP expansion -> ZH temp clone ${APPLY ? '[APPLY]' : '[DRY-RUN]'}`);
  console.log('='.repeat(70));
  console.log(`Expansion: ${expansionCode}`);
  console.log(`WebCardId pattern: ${PREFIX}<digits>${SUFFIX}`);
  console.log(`Overwrite existing temp cards: ${OVERWRITE_EXISTING ? 'YES' : 'NO'}`);
  console.log(`LLM fallback: ${USE_LLM_FALLBACK ? `ON (${LLM_MODEL} @ ${LLM_BASE_URL})` : 'OFF'}`);

  const llmState: LlmState = {
    enabled: USE_LLM_FALLBACK,
    baseUrl: LLM_BASE_URL,
    model: LLM_MODEL,
    cache: new Map<string, string>(),
    translatedCount: 0,
    attemptedCount: 0,
    failedCount: 0,
  };

  const pokedexMapper = await buildPokedexNameMapper();
  const translationMemory = await buildTranslationMemory();
  console.log(`Pokedex mapper loaded: ${pokedexMapper.byJa.size}`);
  console.log(
    `Translation memory loaded: names=${translationMemory.cardName.size}, text=${translationMemory.text.size}, ` +
    `abilities=${translationMemory.abilityDescription.size}, attacks=${translationMemory.attackEffect.size}`
  );

  const jpCards = await prisma.card.findMany({
    where: {
      language: LanguageCode.JA_JP,
      primaryCard: {
        primaryExpansion: {
          code: expansionCode,
        },
      },
    },
    select: {
      id: true,
      webCardId: true,
      primaryCardId: true,
      regionalExpansionId: true,
      name: true,
      supertype: true,
      subtypes: true,
      hp: true,
      types: true,
      ruleBox: true,
      abilities: true,
      attacks: true,
      weaknesses: true,
      resistances: true,
      retreatCost: true,
      rules: true,
      flavorText: true,
      artist: true,
      rarity: true,
      regulationMark: true,
      imageUrl: true,
      imageUrlHiRes: true,
      evolutionStage: true,
      text: true,
      collectorNumber: true,
      evolvesFrom: true,
      evolvesTo: true,
      sourceUrl: true,
      variantType: true,
      primaryCard: {
        select: {
          id: true,
          primaryExpansionId: true,
          primaryExpansion: {
            select: { code: true },
          },
        },
      },
    },
    orderBy: [{ webCardId: 'asc' }],
  });

  if (jpCards.length === 0) {
    console.log('No JP cards found for the expansion.');
    await prisma.$disconnect();
    return;
  }

  console.log(`JP cards found: ${jpCards.length}`);

  const primaryIds = [...new Set(jpCards.map(c => c.primaryCardId))];
  const existingZhByPrimary = await prisma.card.findMany({
    where: {
      language: LanguageCode.ZH_TW,
      primaryCardId: { in: primaryIds },
    },
    select: {
      id: true,
      primaryCardId: true,
      webCardId: true,
      name: true,
      text: true,
      abilities: true,
      attacks: true,
      rules: true,
      flavorText: true,
      artist: true,
      regulationMark: true,
      rarity: true,
      imageUrl: true,
      imageUrlHiRes: true,
      sourceUrl: true,
      subtypes: true,
      evolvesFrom: true,
      evolvesTo: true,
      hp: true,
      types: true,
      ruleBox: true,
      evolutionStage: true,
      collectorNumber: true,
      variantType: true,
      weaknesses: true,
      resistances: true,
      retreatCost: true,
      supertype: true,
    },
  });

  const zhByPrimary = new Map<string, (typeof existingZhByPrimary)[number]>();
  for (const row of existingZhByPrimary) {
    if (row.webCardId.endsWith(SUFFIX)) continue;
    if (!zhByPrimary.has(row.primaryCardId)) zhByPrimary.set(row.primaryCardId, row);
  }

  const existingTempCards = await prisma.card.findMany({
    where: {
      language: LanguageCode.ZH_TW,
      webCardId: {
        startsWith: PREFIX,
        endsWith: SUFFIX,
      },
      primaryCard: {
        primaryExpansion: {
          code: expansionCode,
        },
      },
    },
    select: { id: true, webCardId: true },
  });
  const existingTempSet = new Set(existingTempCards.map(c => c.webCardId));
  const existingTempByWebCardId = new Map(existingTempCards.map(c => [c.webCardId, c.id] as const));

  let toCreate = 0;
  let toUpdate = 0;
  let skippedAlreadyExists = 0;
  let skippedNoNumericId = 0;
  let skippedMissingExpansion = 0;
  let translatedFromOldZh = 0;
  let translatedByMemory = 0;

  type CreatePayload = {
    webCardId: string;
    data: Parameters<typeof prisma.card.create>[0]['data'];
  };
  type UpdatePayload = {
    id: string;
    webCardId: string;
    data: Parameters<typeof prisma.card.update>[0]['data'];
  };
  const createPayloads: CreatePayload[] = [];
  const updatePayloads: UpdatePayload[] = [];

  for (const jp of jpCards) {
    const zhTempWebCardId = makeZhTempWebCardId(jp.webCardId);
    if (!zhTempWebCardId) {
      skippedNoNumericId++;
      continue;
    }

    const existingId = existingTempByWebCardId.get(zhTempWebCardId);
    if (existingId && !OVERWRITE_EXISTING) {
      skippedAlreadyExists++;
      continue;
    }

    const zhOld = zhByPrimary.get(jp.primaryCardId);
    if (zhOld) translatedFromOldZh++;

    const primaryExpansionId = jp.primaryCard.primaryExpansionId;
    const primaryExpansionCode = jp.primaryCard.primaryExpansion?.code;
    if (!primaryExpansionId || !primaryExpansionCode) {
      skippedMissingExpansion++;
      continue;
    }

    const regionalExpansionId = await getOrCreateRegionalExpansionHK(
      primaryExpansionId,
      primaryExpansionCode,
    );

    const pokedexName = translatePokemonNameWithPokedex(jp.name, jp.supertype, pokedexMapper);
    const translatedName = getMappedOrOriginal(pokedexName, translationMemory.cardName);
    const translatedText = getMappedOrOriginal(jp.text, translationMemory.text);
    const translatedFlavor = getMappedOrOriginal(jp.flavorText, translationMemory.flavorText);
    const translatedRules = translateRules(jp.rules, translationMemory);
    const translatedAbilities = await translateAbilities(jp.abilities, translationMemory, llmState);
    const translatedAttacks = await translateAttacks(jp.attacks, translationMemory, llmState);
    const pokedexEvolvesFrom = translatePokemonNameWithPokedex(jp.evolvesFrom, 'POKEMON', pokedexMapper);
    const pokedexEvolvesTo = translatePokemonNameWithPokedex(jp.evolvesTo, 'POKEMON', pokedexMapper);
    const translatedEvolvesFrom = getMappedOrOriginal(pokedexEvolvesFrom, translationMemory.cardName);
    const translatedEvolvesTo = getMappedOrOriginal(pokedexEvolvesTo, translationMemory.cardName);

    const memoryTranslatedThisCard = (
      normalizeTextKey(translatedName) !== normalizeTextKey(jp.name) ||
      normalizeTextKey(translatedText) !== normalizeTextKey(jp.text) ||
      normalizeTextKey(translatedFlavor) !== normalizeTextKey(jp.flavorText) ||
      JSON.stringify(translatedRules ?? []) !== JSON.stringify(jp.rules ?? []) ||
      JSON.stringify(translatedAbilities ?? null) !== JSON.stringify(jp.abilities ?? null) ||
      JSON.stringify(translatedAttacks ?? null) !== JSON.stringify(jp.attacks ?? null) ||
      normalizeTextKey(translatedEvolvesFrom) !== normalizeTextKey(jp.evolvesFrom) ||
      normalizeTextKey(translatedEvolvesTo) !== normalizeTextKey(jp.evolvesTo)
    );
    if (memoryTranslatedThisCard) translatedByMemory++;

    const data: Parameters<typeof prisma.card.create>[0]['data'] = {
      primaryCardId: jp.primaryCardId,
      regionalExpansionId,
      webCardId: zhTempWebCardId,
      language: LanguageCode.ZH_TW,
      variantType: (preferZh(zhOld?.variantType, jp.variantType) ?? VariantType.NORMAL) as VariantType,
      name: (preferZh(zhOld?.name, translatedName as string | null) ?? jp.name) as string,
      supertype: preferZh(zhOld?.supertype, jp.supertype),
      subtypes: preferZh(zhOld?.subtypes, jp.subtypes) ?? [],
      hp: preferZh(zhOld?.hp, jp.hp),
      types: preferZh(zhOld?.types, jp.types) ?? [],
      ruleBox: preferZh(zhOld?.ruleBox, jp.ruleBox),
      abilities: preferZh(zhOld?.abilities as any, translatedAbilities as any),
      attacks: preferZh(zhOld?.attacks as any, translatedAttacks as any),
      weaknesses: preferZh(zhOld?.weaknesses as any, jp.weaknesses as any),
      resistances: preferZh(zhOld?.resistances as any, jp.resistances as any),
      retreatCost: preferZh(zhOld?.retreatCost, jp.retreatCost),
      rules: preferZh(zhOld?.rules, translatedRules) ?? [],
      flavorText: preferZh(zhOld?.flavorText, translatedFlavor as string | null),
      artist: preferZh(zhOld?.artist, jp.artist),
      rarity: preferZh(zhOld?.rarity, jp.rarity),
      regulationMark: preferZh(zhOld?.regulationMark, jp.regulationMark),
      imageUrl: preferZh(zhOld?.imageUrl, jp.imageUrl),
      imageUrlHiRes: preferZh(zhOld?.imageUrlHiRes, jp.imageUrlHiRes),
      evolutionStage: preferZh(zhOld?.evolutionStage, jp.evolutionStage),
      text: preferZh(zhOld?.text, translatedText as string | null),
      collectorNumber: preferZh(zhOld?.collectorNumber, jp.collectorNumber),
      evolvesFrom: preferZh(zhOld?.evolvesFrom, translatedEvolvesFrom as string | null),
      evolvesTo: preferZh(zhOld?.evolvesTo, translatedEvolvesTo as string | null),
      sourceUrl: preferZh(zhOld?.sourceUrl, jp.sourceUrl),
    };

    if (existingId) {
      const { primaryCardId: _pc, regionalExpansionId: _re, webCardId: _wid, language: _lang, ...updateData } = data as any;
      updatePayloads.push({ id: existingId, webCardId: zhTempWebCardId, data: updateData });
      toUpdate++;
    } else {
      createPayloads.push({ webCardId: zhTempWebCardId, data });
      toCreate++;
    }
  }

  console.log(`Planned creates: ${toCreate}`);
  console.log(`Planned updates: ${toUpdate}`);
  console.log(`Skip (already exists): ${skippedAlreadyExists}`);
  console.log(`Skip (cannot parse numeric id): ${skippedNoNumericId}`);
  console.log(`Skip (missing expansion link): ${skippedMissingExpansion}`);
  console.log(`Using existing old ZH translation structure: ${translatedFromOldZh}`);
  console.log(`Translated by memory mapping: ${translatedByMemory}`);
  if (USE_LLM_FALLBACK) {
    console.log(`LLM attempts: ${llmState.attemptedCount}`);
    console.log(`LLM translated fields: ${llmState.translatedCount}`);
    console.log(`LLM failed calls: ${llmState.failedCount}`);
  }

  if (!APPLY) {
    console.log('\nPreview (first 10):');
    for (const p of createPayloads.slice(0, 10)) {
      const name = normalizeTextKey((p.data as any).name) || '(no name)';
      const effectSnippet = firstAbilityOrAttackSnippet((p.data as any).abilities, (p.data as any).attacks);
      console.log(`  + ${p.webCardId} | ${name} | ${effectSnippet}`);
    }
    for (const p of updatePayloads.slice(0, Math.max(0, 10 - createPayloads.length))) {
      const name = normalizeTextKey((p.data as any).name) || '(no name)';
      const effectSnippet = firstAbilityOrAttackSnippet((p.data as any).abilities, (p.data as any).attacks);
      console.log(`  ~ ${p.webCardId} | ${name} | ${effectSnippet}`);
    }
    console.log('\nDry-run complete. Use --apply to create cards.');
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  let updated = 0;
  const chunk = 200;
  for (let i = 0; i < createPayloads.length; i += chunk) {
    const part = createPayloads.slice(i, i + chunk);
    await prisma.$transaction(
      part.map(p => prisma.card.create({ data: p.data }))
    );
    created += part.length;
    console.log(`Created ${created}/${createPayloads.length}...`);
  }

  for (let i = 0; i < updatePayloads.length; i += chunk) {
    const part = updatePayloads.slice(i, i + chunk);
    await prisma.$transaction(
      part.map(p => prisma.card.update({ where: { id: p.id }, data: p.data }))
    );
    updated += part.length;
    console.log(`Updated ${updated}/${updatePayloads.length}...`);
  }

  console.log('\nDone.');
  console.log(`Created cards: ${created}`);
  console.log(`Updated cards: ${updated}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
