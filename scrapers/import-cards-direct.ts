/**
 * Direct Database Card Import Script
 *
 * Imports card data from JSON files directly into PostgreSQL via Prisma Client.
 * Bypasses API validation and handles Japanese, Chinese, and English card data.
 *
 * Usage Examples:
 *
 * 1. Import all JSON files from all regions (japan, english, hongkong):
 *    npx tsx scrapers/import-cards-direct.ts
 *
 * 2. Import from custom base directory:
 *    npx tsx scrapers/import-cards-direct.ts "../data/cards"
 *
 * 3. Import specific region only:
 *    npx tsx scrapers/import-cards-direct.ts "../data/cards" "english"
 *
 * 4. Import from single region directory:
 *    npx tsx scrapers/import-cards-direct.ts "../data/cards/japan"
 *
 * Features:
 * - Automatic expansion code normalization (sv9 → SV9)
 * - Creates PrimaryExpansion and RegionalExpansion as needed
 * - Extracts card number from collectorNumber
 * - Skills signature for duplicate detection
 * - Handles Japanese, Chinese (HK), and English cards
 * - Supports multiple regions in single run
 */

import { PrismaClient, LanguageCode, Supertype, Subtype, EvolutionStage, RuleBox, PokemonType, Rarity, VariantType, Region } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Mapping tables
const SUPERTYPE_MAP: Record<string, Supertype> = {
  'ポケモン': Supertype.POKEMON,
  'トレーナーズ': Supertype.TRAINER,
  'エネルギー': Supertype.ENERGY,
};

const SUBTYPE_MAP: Record<string, Subtype> = {
  'グッズ': Subtype.ITEM,
  'サポート': Subtype.SUPPORTER,
  'スタジアム': Subtype.STADIUM,
  'ポケモンのどうぐ': Subtype.TOOL,
  '基本エネルギー': Subtype.BASIC_ENERGY,
  '特殊エネルギー': Subtype.SPECIAL_ENERGY,
  'TERA': Subtype.TERA,
};

const EVOLUTION_STAGE_MAP: Record<string, EvolutionStage> = {
  'たね': EvolutionStage.BASIC,
  'たねポケモン': EvolutionStage.BASIC,
  '1進化': EvolutionStage.STAGE_1,
  '2進化': EvolutionStage.STAGE_2,
  'BASIC': EvolutionStage.BASIC,
  'STAGE_1': EvolutionStage.STAGE_1,
  'STAGE_2': EvolutionStage.STAGE_2,
};

const RULEBOX_MAP: Record<string, RuleBox> = {
  'EX': RuleBox.EX,
  'GX': RuleBox.GX,
  'V': RuleBox.V,
  'VMAX': RuleBox.VMAX,
  'VSTAR': RuleBox.VSTAR,
  'RADIANT': RuleBox.RADIANT,
  'MEGA': RuleBox.MEGA,
};

const TYPE_MAP: Record<string, PokemonType> = {
  '無色': PokemonType.COLORLESS,
  '悪': PokemonType.DARKNESS,
  'ドラゴン': PokemonType.DRAGON,
  'フェアリー': PokemonType.FAIRY,
  '闘': PokemonType.FIGHTING,
  '炎': PokemonType.FIRE,
  '草': PokemonType.GRASS,
  '雷': PokemonType.LIGHTNING,
  '鋼': PokemonType.METAL,
  '超': PokemonType.PSYCHIC,
  '水': PokemonType.WATER,
};

const RARITY_MAP: Record<string, Rarity> = {
  'C': Rarity.COMMON,
  'U': Rarity.UNCOMMON,
  'R': Rarity.RARE,
  'RR': Rarity.DOUBLE_RARE,
  'RRR': Rarity.ULTRA_RARE,
  'AR': Rarity.ILLUSTRATION_RARE,
  'SAR': Rarity.SPECIAL_ILLUSTRATION_RARE,
  'UR': Rarity.HYPER_RARE,
  'PROMO': Rarity.PROMO,
  'SR': Rarity.SHINY_RARE,
  'ACE': Rarity.ACE_SPEC,
};

const VARIANT_MAP: Record<string, VariantType> = {
  'NORMAL': VariantType.NORMAL,
  'AR': VariantType.AR,
  'SAR': VariantType.SAR,
  'SR': VariantType.SR,
  'UR': VariantType.UR,
};

interface JapaneseCard {
  webCardId: string;
  name: string;
  expansionCode: string;
  cardNumber?: string;
  collectorNumber?: string;
  supertype?: string;
  subtype?: string;
  subtypes?: string[];
  evolutionStage?: string;
  hp?: string | number;
  types?: string[];
  pokemonTypes?: string[];
  abilities?: any[];
  attacks?: any[];
  rules?: string[];
  flavorText?: string;
  artist?: string;
  rarity?: string;
  regulationMark?: string;
  imageUrl?: string;
  imageUrlHiRes?: string;
  sourceUrl?: string;
  variantType?: string;
  evolvesFrom?: string;
  evolvesTo?: string;
}

function generateSkillsSignature(card: any): string {
  // Create a signature from abilities and attacks to identify unique card mechanics
  const abilitiesStr = JSON.stringify(card.abilities || []);
  const attacksStr = JSON.stringify(card.attacks || []);
  const combined = `${abilitiesStr}|${attacksStr}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

// Batch upsert expansions to avoid repeated DB calls
async function batchUpsertExpansions(prisma: PrismaClient, cards: any[]) {
  const primaryExpansions = new Map<string, { code: string; nameEn: string }>();
  const regionalExpansions = new Map<string, { primaryExpansionId: string; region: Region; code: string; name: string }>();

  // Collect unique expansions from all cards
  for (const card of cards) {
    const canonicalCode = card.expansionCode.toUpperCase();
    if (!primaryExpansions.has(canonicalCode)) {
      primaryExpansions.set(canonicalCode, {
        code: canonicalCode,
        nameEn: `Japanese Set ${canonicalCode}`,
      });
    }

    const regionMap = { 'HK': Region.HK, 'JP': Region.JP, 'EN': Region.EN };
    const region = card.region ? (regionMap[card.region] || Region.JP) : Region.JP;
    const regionalKey = `${canonicalCode}_${region}`;

    if (!regionalExpansions.has(regionalKey)) {
      regionalExpansions.set(regionalKey, {
        primaryExpansionId: canonicalCode, // Will be resolved to ID after primary upsert
        region,
        code: card.expansionCode,
        name: `${card.region || 'JP'} ${card.expansionCode}`,
      });
    }
  }

  // Batch upsert primary expansions
  if (primaryExpansions.size > 0) {
    const primaryData = Array.from(primaryExpansions.values());
    await prisma.primaryExpansion.createMany({
      data: primaryData,
      skipDuplicates: true,
    });
    console.log(`✓ Created/updated ${primaryExpansions.size} primary expansions`);
  }

  // Get primary expansion IDs and batch upsert regional expansions
  if (regionalExpansions.size > 0) {
    const regionalData = [];
    for (const [key, regional] of regionalExpansions) {
      const primary = await prisma.primaryExpansion.findUnique({
        where: { code: regional.primaryExpansionId },
        select: { id: true },
      });
      if (primary) {
        regionalData.push({
          primaryExpansionId: primary.id,
          region: regional.region,
          code: regional.code,
          name: regional.name,
        });
      }
    }

    if (regionalData.length > 0) {
      await prisma.regionalExpansion.createMany({
        data: regionalData,
        skipDuplicates: true,
      });
      console.log(`✓ Created/updated ${regionalData.length} regional expansions`);
    }
  }
}

// Optimized card import function (assumes expansions already exist)
async function importCardOptimized(prisma: PrismaClient, card: any) {
  // Skip "カード検索" (Card Search) placeholder cards
  if (card.name === 'カード検索') {
    return null;
  }

  // Extract card number from collectorNumber (e.g., "001/100" -> "001")
  let cardNumber = card.collectorNumber ? card.collectorNumber.split('/')[0] : card.cardNumber;

  // Fallback: Extract from webCardId (e.g., "jp45650" -> "45650")
  if (!cardNumber && card.webCardId) {
    const match = card.webCardId.match(/\d+$/);
    if (match) {
      cardNumber = match[0];
    }
  }

  if (!cardNumber) {
    throw new Error(`Missing card number for ${card.webCardId}`);
  }

  // Get existing expansions (should already exist from batch upsert)
  const canonicalCode = card.expansionCode.toUpperCase();
  const primaryExpansion = await prisma.primaryExpansion.findUnique({
    where: { code: canonicalCode },
  });

  if (!primaryExpansion) {
    throw new Error(`PrimaryExpansion ${canonicalCode} not found`);
  }

  const regionMap = { 'HK': Region.HK, 'JP': Region.JP, 'EN': Region.EN };
  const region = card.region ? (regionMap[card.region] || Region.JP) : Region.JP;

  const regionalExpansion = await prisma.regionalExpansion.findUnique({
    where: {
      primaryExpansionId_region: {
        primaryExpansionId: primaryExpansion.id,
        region: region,
      },
    },
  });

  if (!regionalExpansion) {
    throw new Error(`RegionalExpansion ${canonicalCode}_${region} not found`);
  }

  // 3. Get or create PrimaryCard based on expansion + number + skills
  const skillsSignature = generateSkillsSignature(card);

  const primaryCard = await prisma.primaryCard.upsert({
    where: {
      name_skillsSignature: {
        name: card.name,
        skillsSignature: skillsSignature,
      },
    },
    update: {
      primaryExpansionId: primaryExpansion.id,
      cardNumber,
    },
    create: {
      name: card.name,
      skillsSignature: skillsSignature,
      primaryExpansionId: primaryExpansion.id,
      cardNumber,
    },
  });

  // 4. Map data - handle both Japanese text and English enum values
  let supertype = null;
  if (card.supertype) {
    supertype = SUPERTYPE_MAP[card.supertype] || (Object.values(Supertype).includes(card.supertype as Supertype) ? card.supertype as Supertype : null);
  }

  // Handle subtypes (only for Trainers/Energy - Pokemon use evolutionStage instead)
  const subtypesSource = card.subtypes || (card.subtype ? [card.subtype] : []);
  const subtypes = subtypesSource
    .map(st => SUBTYPE_MAP[st] || (Object.values(Subtype).includes(st as Subtype) ? st as Subtype : null))
    .filter(Boolean) || [];

  // Map evolutionStage (for Pokemon cards only)
  let evolutionStage = null;
  if (supertype === Supertype.POKEMON && card.evolutionStage) {
    evolutionStage = EVOLUTION_STAGE_MAP[card.evolutionStage] ||
      (Object.values(EvolutionStage).includes(card.evolutionStage as EvolutionStage) ? card.evolutionStage as EvolutionStage : null);
  }

  // Map ruleBox (for special mechanics like EX, GX, V, etc.)
  let ruleBox = null;
  if (card.ruleBox) {
    ruleBox = RULEBOX_MAP[card.ruleBox.toUpperCase()] ||
      (Object.values(RuleBox).includes(card.ruleBox as RuleBox) ? card.ruleBox as RuleBox : null);
  }

  // Handle both types and pokemonTypes fields
  const typesSource = card.pokemonTypes || card.types || [];
  const types = typesSource.map(t => TYPE_MAP[t] || (Object.values(PokemonType).includes(t as PokemonType) ? t as PokemonType : null)).filter(Boolean) || [];

  let rarity = null;
  if (card.rarity) {
    rarity = RARITY_MAP[card.rarity.toUpperCase()] || (Object.values(Rarity).includes(card.rarity as Rarity) ? card.rarity as Rarity : null);
  }

  const variantType = card.variantType ? (VARIANT_MAP[card.variantType.toUpperCase()] || VariantType.NORMAL) : VariantType.NORMAL;
  const hp = card.hp ? (typeof card.hp === 'number' ? card.hp : parseInt(card.hp, 10)) : null;

  // Map language from card data (default to JA_JP for backward compatibility)
  const languageMap = {
    'ZH_TW': LanguageCode.ZH_TW,
    'JA_JP': LanguageCode.JA_JP,
    'EN_US': LanguageCode.EN_US,
  };
  const language = card.language ? (languageMap[card.language] || LanguageCode.JA_JP) : LanguageCode.JA_JP;

  // 5. Upsert Card using webCardId as unique key
  await prisma.card.upsert({
    where: { webCardId: card.webCardId },
    update: {
      primaryCardId: primaryCard.id,
      regionalExpansionId: regionalExpansion.id,
      name: card.name,
      supertype,
      subtypes,
      evolutionStage,
      evolvesFrom: card.evolvesFrom || null,
      evolvesTo: card.evolvesTo || null,
      ruleBox,
      hp,
      types,
      abilities: card.abilities || null,
      attacks: card.attacks || null,
      rules: card.rules || [],
      text: card.effectText || card.text || null,
      flavorText: card.flavorText || null,
      artist: card.artist || null,
      rarity,
      regulationMark: card.regulationMark || null,
      imageUrl: card.imageUrl || null,
      imageUrlHiRes: card.imageUrlHiRes || null,
      sourceUrl: card.sourceUrl || null,
      variantType,
    },
    create: {
      primaryCardId: primaryCard.id,
      regionalExpansionId: regionalExpansion.id,
      webCardId: card.webCardId,
      language: language,
      variantType,
      name: card.name,
      supertype,
      subtypes,
      evolutionStage,
      evolvesFrom: card.evolvesFrom || null,
      evolvesTo: card.evolvesTo || null,
      ruleBox,
      hp,
      types,
      abilities: card.abilities || null,
      attacks: card.attacks || null,
      rules: card.rules || [],
      text: card.effectText || card.text || null,
      flavorText: card.flavorText || null,
      artist: card.artist || null,
      rarity,
      regulationMark: card.regulationMark || null,
      imageUrl: card.imageUrl || null,
      imageUrlHiRes: card.imageUrlHiRes || null,
      sourceUrl: card.sourceUrl || null,
    },
  });
}

// Process cards in batches with transactions for better performance
async function importCardsBatch(prisma: PrismaClient, cards: any[], batchSize = 50) {
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);

    await prisma.$transaction(async (tx) => {
      for (const card of batch) {
        try {
          const result = await importCardOptimized(tx, card);
          if (result === null) {
            skipped++;
          } else {
            success++;
          }
        } catch (error) {
          failed++;
          console.error(`  ✗ Failed ${card.webCardId}: ${error.message}`);
        }
      }
    });

    if ((i + batch.length) % 500 === 0 || i + batch.length >= cards.length) {
      console.log(`  Progress: ${Math.min(i + batch.length, cards.length)}/${cards.length} cards...`);
    }
  }

  return { success, failed, skipped };
}

async function main() {
  // Process cards in batches with transactions for better performance
  const startTime = Date.now();
  const prisma = new PrismaClient();

  const args = process.argv.slice(2);
  const baseDir = args[0] || path.join(__dirname, '../data/cards');
  const region = args[1]; // Optional: 'japan', 'english', 'hongkong', or undefined for all

  console.log(`\n📂 Base directory: ${baseDir}`);
  console.log(`🌍 Region filter: ${region || 'all'}\n`);

  const regions = region ? [region] : ['japan', 'english', 'hongkong'];
  let totalFiles = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // Phase 1: Collect all cards and batch upsert expansions
  console.log('🚀 Phase 1: Collecting cards and preparing expansions...\n');

  const allCards: any[] = [];
  const fileCardCounts: { [key: string]: number } = {};

  for (const regionName of regions) {
    const regionDir = path.join(baseDir, regionName);
    if (!fs.existsSync(regionDir)) {
      console.log(`⚠️  Directory not found: ${regionDir} - skipping`);
      continue;
    }

    console.log(`📂 Scanning region: ${regionName.toUpperCase()}`);

    // Set pattern based on region
    let pattern: string;
    switch (regionName) {
      case 'japan':
        pattern = 'japanese_cards_*.json';
        break;
      case 'english':
        pattern = 'english_cards_*.json';
        break;
      case 'hongkong':
        pattern = 'hk_cards_*.json';
        break;
      default:
        pattern = '*.json';
    }

    const files = fs.readdirSync(regionDir)
      .filter(f => f.match(new RegExp(pattern.replace('*', '.*'))))
      .sort();

    console.log(`  Found ${files.length} files`);

    for (const file of files) {
      const filePath = path.join(regionDir, file);
      try {
        const cards: JapaneseCard[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const validCards = cards.filter(card => card.name !== 'カード検索'); // Filter out placeholder cards
        allCards.push(...validCards);
        fileCardCounts[`${regionName}/${file}`] = validCards.length;
        totalFiles++;
      } catch (error) {
        console.error(`✗ Error reading ${regionName}/${file}: ${error.message}`);
      }
    }
  }

  console.log(`\n📊 Collected ${allCards.length} total cards from ${totalFiles} files`);

  if (allCards.length === 0) {
    console.log('No cards to import. Exiting.');
    await prisma.$disconnect();
    return;
  }

  // Batch upsert all expansions upfront
  console.log('\n🏗️  Phase 2: Batch creating/updating expansions...');
  await batchUpsertExpansions(prisma, allCards);

  // Phase 3: Import cards in batches with transactions
  console.log('\n💾 Phase 3: Importing cards in optimized batches...');

  const batchSize = 50; // Process 50 cards per transaction
  const totalBatches = Math.ceil(allCards.length / batchSize);

  console.log(`Processing ${allCards.length} cards in ${totalBatches} batches of ${batchSize}...\n`);

  let processedCards = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * batchSize;
    const end = Math.min(start + batchSize, allCards.length);
    const batch = allCards.slice(start, end);

    console.log(`${'='.repeat(60)}`);
    console.log(`Batch ${batchIndex + 1}/${totalBatches}: Cards ${start + 1}-${end}`);
    console.log(`${'='.repeat(60)}`);

    const result = await importCardsBatch(prisma, batch, batchSize);

    totalSuccess += result.success;
    totalFailed += result.failed;
    totalSkipped += result.skipped;
    processedCards += batch.length;

    console.log(`✓ Batch ${batchIndex + 1}: ${result.success} success, ${result.failed} failed${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`);
  }

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  const cardsPerSecond = totalSuccess / duration;

  console.log(`\n${'='.repeat(60)}`);
  console.log('IMPORT SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Files processed: ${totalFiles}`);
  console.log(`Successfully imported: ${totalSuccess}`);
  console.log(`Failed: ${totalFailed}`);
  if (totalSkipped > 0) {
    console.log(`Skipped (placeholders): ${totalSkipped}`);
  }
  console.log(`Total time: ${duration.toFixed(2)}s`);
  console.log(`Performance: ${cardsPerSecond.toFixed(1)} cards/second`);
  console.log(`${'='.repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch(console.error);
