import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { 
  LanguageCode, 
  Supertype, 
  Subtype, 
  PokemonType, 
  Rarity, 
  VariantType,
  Region 
} from '@ptcg/database';
import { JapaneseCardDto } from './dto/import-japanese-cards.dto';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  // Mapping tables from Japanese to Prisma enums
  private readonly SUPERTYPE_MAP: Record<string, Supertype> = {
    'ポケモン': Supertype.POKEMON,
    'トレーナーズ': Supertype.TRAINER,
    'エネルギー': Supertype.ENERGY,
  };

  private readonly SUBTYPE_MAP: Record<string, Subtype> = {
    'たねポケモン': Subtype.BASIC,
    '1進化': Subtype.STAGE_1,
    '2進化': Subtype.STAGE_2,
    'グッズ': Subtype.ITEM,
    'サポート': Subtype.SUPPORTER,
    'スタジアム': Subtype.STADIUM,
    'ポケモンのどうぐ': Subtype.TOOL,
    '基本エネルギー': Subtype.BASIC_ENERGY,
    '特殊エネルギー': Subtype.SPECIAL_ENERGY,
  };

  private readonly TYPE_MAP: Record<string, PokemonType> = {
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

  private readonly RARITY_MAP: Record<string, Rarity> = {
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

  private readonly VARIANT_MAP: Record<string, VariantType> = {
    'NORMAL': VariantType.NORMAL,
    'REVERSE_HOLO': VariantType.REVERSE_HOLO,
    'HOLO': VariantType.HOLO,
    'AR': VariantType.AR,
    'SAR': VariantType.SAR,
    'SSR': VariantType.SSR,
    'SR': VariantType.SR,
    'UR': VariantType.UR,
    'MUR': VariantType.MUR,
    'MA': VariantType.MA,
  };

  constructor(private prisma: PrismaService) {}

  async importJapaneseCards(cards: JapaneseCardDto[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const stats = { success: 0, failed: 0, errors: [] as string[] };
    
    this.logger.log(`Starting import of ${cards.length} Japanese cards`);

    for (const cardData of cards) {
      try {
        await this.importSingleCard(cardData);
        stats.success++;
      } catch (error) {
        stats.failed++;
        const errorMsg = `Failed to import ${cardData.webCardId}: ${error.message}`;
        this.logger.error(errorMsg);
        stats.errors.push(errorMsg);
      }
    }

    this.logger.log(`Import complete: ${stats.success} success, ${stats.failed} failed`);
    return stats;
  }

  private async importSingleCard(cardData: JapaneseCardDto): Promise<void> {
    // 1. Generate skills signature
    const skillsSignature = this.generateSkillsSignature(cardData);

    // 2. Get or create PrimaryCard based on name + skills
    const primaryCard = await this.getOrCreatePrimaryCard(
      cardData.name,
      skillsSignature
    );

    // 3. Create or update Card
    await this.upsertCard(primaryCard.id, cardData);
  }

  private generateSkillsSignature(cardData: JapaneseCardDto): string {
    const crypto = require('crypto');
    const skillsData = {
      abilities: cardData.abilities || [],
      attacks: cardData.attacks || [],
    };
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(skillsData))
      .digest('hex');
    return hash.substring(0, 16);
  }

  private async getOrCreatePrimaryCard(
    name: string,
    skillsSignature: string
  ) {
    return await this.prisma.primaryCard.upsert({
      where: {
        name_skillsSignature: {
          name,
          skillsSignature,
        },
      },
      update: {},
      create: {
        name,
        skillsSignature,
      },
    });
  }

  private async upsertCard(primaryCardId: string, cardData: JapaneseCardDto) {
    const variantType = cardData.variantType 
      ? (this.VARIANT_MAP[cardData.variantType.toUpperCase()] || VariantType.NORMAL)
      : VariantType.NORMAL;

    // Map Japanese data to Prisma enums
    // Handle both Japanese text and enum values for supertype
    let supertype = null;
    if (cardData.supertype) {
      // First try as Japanese text
      supertype = this.SUPERTYPE_MAP[cardData.supertype];
      // If not found, try as enum value
      if (!supertype && Object.values(Supertype).includes(cardData.supertype as Supertype)) {
        supertype = cardData.supertype as Supertype;
      }
    }

    const subtypes = cardData.subtypes
      ? cardData.subtypes
          .map(st => this.SUBTYPE_MAP[st])
          .filter(Boolean)
      : [];

    // Handle both 'types' and 'pokemonTypes' fields - use first type only
    const typesArray = cardData.pokemonTypes || cardData.types || [];
    let type: PokemonType | null = null;
    if (typesArray.length > 0) {
      const firstType = typesArray[0];
      // First try as enum value (already in correct format)
      if (Object.values(PokemonType).includes(firstType as PokemonType)) {
        type = firstType as PokemonType;
      } else {
        // Then try mapping from Japanese
        type = this.TYPE_MAP[firstType] || null;
      }
    }

    // Handle both short codes and enum values for rarity  
    let rarity = null;
    if (cardData.rarity) {
      // First try as short code (C, U, R, etc.)
      rarity = this.RARITY_MAP[cardData.rarity.toUpperCase()];
      // If not found, try as enum value
      if (!rarity && Object.values(Rarity).includes(cardData.rarity as Rarity)) {
        rarity = cardData.rarity as Rarity;
      }
    }

    const hp = cardData.hp ? parseInt(cardData.hp, 10) : null;

    // Validation: Pokemon cards MUST have a type
    if (supertype === Supertype.POKEMON && !type) {
      throw new BadRequestException(
        `Pokemon card ${cardData.webCardId} (${cardData.name}) must have a type. ` +
        `Received pokemonTypes: ${JSON.stringify(cardData.pokemonTypes)}, types: ${JSON.stringify(cardData.types)}`
      );
    }

    return await this.prisma.card.upsert({
      where: { webCardId: cardData.webCardId },
      update: {
        name: cardData.name,
        supertype,
        subtypes: subtypes as any,
        hp,
        types: type as any,
        abilities: (cardData.abilities || null) as any,
        attacks: (cardData.attacks || null) as any,
        rules: cardData.rules || [],
        flavorText: cardData.flavorText || null,
        artist: cardData.artist || null,
        rarity,
        regulationMark: cardData.regulationMark || null,
        imageUrl: cardData.imageUrl || null,
        imageUrlHiRes: cardData.imageUrlHiRes || null,
        variantType,
      },
      create: {
        primaryCardId,
        webCardId: cardData.webCardId,
        language: LanguageCode.JA_JP,
        variantType,
        name: cardData.name,
        supertype,
        subtypes: subtypes as any,
        hp,
        types: type as any,
        abilities: (cardData.abilities || null) as any,
        attacks: (cardData.attacks || null) as any,
        rules: cardData.rules || [],
        flavorText: cardData.flavorText || null,
        artist: cardData.artist || null,
        rarity,
        regulationMark: cardData.regulationMark || null,
        imageUrl: cardData.imageUrl || null,
        imageUrlHiRes: cardData.imageUrlHiRes || null,
      },
    });
  }

  async getCards(params: {
    skip?: number;
    take?: number;
    language?: LanguageCode;
    expansionCode?: string;
    name?: string;
    supertype?: string;
    types?: string;
    rarity?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    subtypes?: string;
    ruleBox?: string;
    variantType?: string;
    minHp?: number;
    maxHp?: number;
    artist?: string;
    regulationMark?: string;
    hasAbilities?: boolean;
    hasAttacks?: boolean;
  }): Promise<{
    data: any[];
    pagination: {
      total: number;
      skip: number;
      take: number;
      hasMore: boolean;
    };
  }> {
    const { 
      skip = 0, 
      take = 50, 
      language, 
      expansionCode, 
      name, 
      supertype, 
      types, 
      rarity,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      subtypes,
      ruleBox,
      variantType,
      minHp,
      maxHp,
      artist,
      regulationMark,
      hasAbilities,
      hasAttacks,
    } = params;

    const where: any = {};
    
    // Existing filters
    if (language) {
      where.language = language;
    }
    if (name) {
      where.name = {
        contains: name,
        mode: 'insensitive',
      };
    }
    if (supertype) {
      where.supertype = supertype;
    }
    if (types) {
      where.types = types;
    }
    if (rarity) {
      where.rarity = rarity;
    }

    // New advanced filters
    if (subtypes) {
      where.subtypes = {
        has: subtypes,
      };
    }
    if (ruleBox) {
      where.ruleBox = ruleBox;
    }
    if (variantType) {
      where.variantType = variantType;
    }
    if (minHp !== undefined || maxHp !== undefined) {
      where.hp = {};
      if (minHp !== undefined) {
        where.hp.gte = minHp;
      }
      if (maxHp !== undefined) {
        where.hp.lte = maxHp;
      }
    }
    if (artist) {
      where.artist = {
        contains: artist,
        mode: 'insensitive',
      };
    }
    if (regulationMark) {
      where.regulationMark = regulationMark;
    }
    if (hasAbilities !== undefined) {
      if (hasAbilities) {
        where.abilities = { not: null };
      } else {
        where.abilities = null;
      }
    }
    if (hasAttacks !== undefined) {
      if (hasAttacks) {
        where.attacks = { not: null };
      } else {
        where.attacks = null;
      }
    }

    // Dynamic sorting
    const orderBy: any = {};
    const validSortFields = ['name', 'hp', 'createdAt', 'updatedAt', 'rarity', 'supertype'];
    if (sortBy && validSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc'; // Default sort
    }

    const [cards, total] = await Promise.all([
      this.prisma.card.findMany({
        where,
        skip,
        take: Math.min(take, 100), // Max 100 per page
        include: {
          primaryCard: true,
        },
        orderBy,
      }),
      this.prisma.card.count({ where }),
    ]);

    return {
      data: cards,
      pagination: {
        total,
        skip,
        take,
        hasMore: skip + take < total,
      },
    };
  }

  async getCardById(id: string): Promise<any> {
    return await this.prisma.card.findUnique({
      where: { id },
      include: {
        primaryCard: true,
      },
    });
  }

  async getCardByWebCardId(webCardId: string): Promise<any> {
    const card = await this.prisma.card.findUnique({
      where: { webCardId },
      include: {
        primaryCard: true,
      },
    });

    if (!card) {
      return null;
    }

    // Get language variants (cards with same primaryCardId)
    const languageVariants = await this.prisma.card.findMany({
      where: {
        primaryCardId: card.primaryCardId,
        NOT: {
          id: card.id, // Exclude current card
        },
      },
      select: {
        id: true,
        webCardId: true,
        name: true,
        language: true,
        variantType: true,
        imageUrl: true,
      },
    });

    return {
      ...card,
      languageVariants,
    };
  }
}
