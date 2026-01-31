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
    const supertype = cardData.supertype 
      ? this.SUPERTYPE_MAP[cardData.supertype] 
      : null;

    const subtypes = cardData.subtypes
      ? cardData.subtypes
          .map(st => this.SUBTYPE_MAP[st])
          .filter(Boolean)
      : [];

    const types = cardData.types
      ? cardData.types
          .map(t => this.TYPE_MAP[t])
          .filter(Boolean)
      : [];

    const rarity = cardData.rarity 
      ? (this.RARITY_MAP[cardData.rarity.toUpperCase()] || null)
      : null;

    const hp = cardData.hp ? parseInt(cardData.hp, 10) : null;

    return await this.prisma.card.upsert({
      where: { webCardId: cardData.webCardId },
      update: {
        name: cardData.name,
        supertype,
        subtypes: subtypes as any,
        hp,
        types: types as any,
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
        types: types as any,
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
    rarity?: string;
  }): Promise<{
    data: any[];
    pagination: {
      total: number;
      skip: number;
      take: number;
      hasMore: boolean;
    };
  }> {
    const { skip = 0, take = 50, language, expansionCode, name, supertype, rarity } = params;

    const where: any = {};
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
    if (rarity) {
      where.rarity = rarity;
    }

    const [cards, total] = await Promise.all([
      this.prisma.card.findMany({
        where,
        skip,
        take: Math.min(take, 100), // Max 100 per page
        include: {
          primaryCard: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
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
    return await this.prisma.card.findUnique({
      where: { webCardId },
      include: {
        primaryCard: true,
      },
    });
  }
}
