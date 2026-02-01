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
  variantType?: string;
}

function generateSkillsSignature(card: any): string {
  // Create a signature from abilities and attacks to identify unique card mechanics
  const abilitiesStr = JSON.stringify(card.abilities || []);
  const attacksStr = JSON.stringify(card.attacks || []);
  const combined = `${abilitiesStr}|${attacksStr}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

async function importCard(prisma: PrismaClient, card: any) {
  // Extract card number from collectorNumber (e.g., "001/100" -> "001")
  let cardNumber = card.collectorNumber ? card.collectorNumber.split('/')[0] : card.cardNumber;
  
  // Fallback: Extract from webCardId (e.g., "jp45650" -> "45650")
  if (!cardNumber && card.webCardId) {
    const match = card.webCardId.match(/\d+$/);
    if (match) {
      cardNumber = match[0];
      console.log(`  ℹ Using webCardId number for ${card.webCardId}: ${cardNumber}`);
    }
  }
  
  if (!cardNumber) {
    throw new Error(`Missing card number for ${card.webCardId}`);
  }
  
  // 1. Get or create PrimaryExpansion
  const canonicalCode = card.expansionCode.toUpperCase();
  const primaryExpansion = await prisma.primaryExpansion.upsert({
    where: { code: canonicalCode },
    update: {},
    create: {
      code: canonicalCode,
      nameEn: `Japanese Set ${canonicalCode}`,
    },
  });

  // 2. Get or create RegionalExpansion
  await prisma.regionalExpansion.upsert({
    where: {
      primaryExpansionId_region: {
        primaryExpansionId: primaryExpansion.id,
        region: Region.JP,
      },
    },
    update: { code: card.expansionCode },
    create: {
      primaryExpansionId: primaryExpansion.id,
      region: Region.JP,
      code: card.expansionCode,
      name: `Japanese ${card.expansionCode}`,
    },
  });

  // 3. Get or create PrimaryCard based on name + skills signature
  const skillsSignature = generateSkillsSignature(card);
  
  const primaryCard = await prisma.primaryCard.upsert({
    where: {
      name_skillsSignature: {
        name: card.name,
        skillsSignature: skillsSignature,
      },
    },
    update: {},
    create: {
      name: card.name,
      skillsSignature: skillsSignature,
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

  // 5. Upsert Card using webCardId as unique key
  await prisma.card.upsert({
    where: { webCardId: card.webCardId },
    update: {
      primaryCardId: primaryCard.id,
      name: card.name,
      supertype,
      subtypes,
      evolutionStage,
      ruleBox,
      hp,
      types,
      abilities: card.abilities || null,
      attacks: card.attacks || null,
      rules: card.rules || [],
      flavorText: card.flavorText || null,
      artist: card.artist || null,
      rarity,
      regulationMark: card.regulationMark || null,
      imageUrl: card.imageUrl || null,
      imageUrlHiRes: card.imageUrlHiRes || null,
      variantType,
    },
    create: {
      primaryCardId: primaryCard.id,
      webCardId: card.webCardId,
      language: LanguageCode.JA_JP,
      variantType,
      name: card.name,
      supertype,
      subtypes,
      evolutionStage,
      ruleBox,
      hp,
      types,
      abilities: card.abilities || null,
      attacks: card.attacks || null,
      rules: card.rules || [],
      flavorText: card.flavorText || null,
      artist: card.artist || null,
      rarity,
      regulationMark: card.regulationMark || null,
      imageUrl: card.imageUrl || null,
      imageUrlHiRes: card.imageUrlHiRes || null,
    },
  });
}

async function main() {
  const prisma = new PrismaClient();
  
  const args = process.argv.slice(2);
  const jsonDir = args[0] || path.join(__dirname, '../data/cards/japan');
  const pattern = args[1] || 'japanese_cards_40k_*.json';
  
  console.log(`\n📂 Importing from: ${jsonDir}`);
  console.log(`🔍 Pattern: ${pattern}\n`);
  
  const files = fs.readdirSync(jsonDir)
    .filter(f => f.match(new RegExp(pattern.replace('*', '.*'))))
    .sort();
  
  console.log(`Found ${files.length} JSON files\n`);
  
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (const file of files) {
    const filePath = path.join(jsonDir, file);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${file}`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      const cards: JapaneseCard[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      console.log(`Loaded ${cards.length} cards`);
      
      let success = 0;
      let failed = 0;
      
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        try {
          await importCard(prisma, card);
          success++;
          
          if ((i + 1) % 50 === 0) {
            console.log(`  Progress: ${i + 1}/${cards.length} cards...`);
          }
        } catch (error) {
          failed++;
          console.error(`  ✗ Failed ${card.webCardId}: ${error.message}`);
        }
      }
      
      console.log(`✓ ${file}: ${success} success, ${failed} failed`);
      totalSuccess += success;
      totalFailed += failed;
      
    } catch (error) {
      console.error(`✗ Error processing ${file}: ${error.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('IMPORT SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`Files processed: ${files.length}`);
  console.log(`Successfully imported: ${totalSuccess}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`${'='.repeat(60)}\n`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
