import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { 
  LanguageCode, 
  Supertype, 
  Subtype, 
  EvolutionStage,
  PokemonType, 
  Rarity, 
  RuleBox,
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
    'グッズ': Subtype.ITEM,
    'サポート': Subtype.SUPPORTER,
    'スタジアム': Subtype.STADIUM,
    'ポケモンのどうぐ': Subtype.TOOL,
    '基本エネルギー': Subtype.BASIC_ENERGY,
    '特殊エネルギー': Subtype.SPECIAL_ENERGY,
  };

  private readonly EVOLUTION_STAGE_MAP: Record<string, EvolutionStage> = {
    'たね': EvolutionStage.BASIC,
    'たねポケモン': EvolutionStage.BASIC,
    'BASIC': EvolutionStage.BASIC,
    '1進化': EvolutionStage.STAGE_1,
    'STAGE_1': EvolutionStage.STAGE_1,
    '2進化': EvolutionStage.STAGE_2,
    'STAGE_2': EvolutionStage.STAGE_2,
  };

  private readonly RULEBOX_MAP: Record<string, RuleBox> = {
    'EX': RuleBox.EX,
    'GX': RuleBox.GX,
    'V': RuleBox.V,
    'VMAX': RuleBox.VMAX,
    'VSTAR': RuleBox.VSTAR,
    'RADIANT': RuleBox.RADIANT,
    'MEGA': RuleBox.MEGA,
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
    // 1. Get or create RegionalExpansion and PrimaryExpansion
    const { regionalExpansion, primaryExpansion } = await this.getOrCreateExpansion(
      cardData.expansionCode,
      Region.JP
    );

    // 2. Extract card number from collectorNumber (e.g., "001/100" -> "001")
    const cardNumber = cardData.collectorNumber
      ? cardData.collectorNumber.split('/')[0]
      : cardData.cardNumber || null;

    // 3. Generate skills signature
    const skillsSignature = this.generateSkillsSignature(cardData);

    // 4. Get or create PrimaryCard based on expansion + number + skills
    const primaryCard = await this.getOrCreatePrimaryCard(
      primaryExpansion.id,
      cardNumber,
      cardData.name,
      skillsSignature
    );

    // 5. Create or update Card
    await this.upsertCard(primaryCard.id, regionalExpansion.id, cardData);
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

  private async getOrCreateExpansion(
    expansionCode: string,
    region: Region
  ): Promise<{
    regionalExpansion: any;
    primaryExpansion: any;
  }> {
    // Normalize expansion code (e.g., "SV9" -> "sv9")
    const normalizedCode = expansionCode.toLowerCase();

    // Find or create RegionalExpansion
    let regionalExpansion = await this.prisma.regionalExpansion.findFirst({
      where: {
        code: normalizedCode,
        region,
      },
      include: {
        primaryExpansion: true,
      },
    });

    if (regionalExpansion) {
      return {
        regionalExpansion,
        primaryExpansion: regionalExpansion.primaryExpansion,
      };
    }

    // If not found, create both PrimaryExpansion and RegionalExpansion
    // Convert to canonical format (e.g., "sv9" -> "SV9")
    const canonicalCode = normalizedCode.toUpperCase();

    const primaryExpansion = await this.prisma.primaryExpansion.upsert({
      where: { code: canonicalCode },
      update: {},
      create: {
        code: canonicalCode,
        nameEn: `Set ${canonicalCode}`, // Placeholder, can be updated later
      },
    });

    regionalExpansion = await this.prisma.regionalExpansion.create({
      data: {
        code: normalizedCode,
        region,
        name: `${canonicalCode} (${region})`, // Placeholder
        primaryExpansionId: primaryExpansion.id,
      },
      include: {
        primaryExpansion: true,
      },
    });

    return { regionalExpansion, primaryExpansion };
  }

  private async getOrCreatePrimaryCard(
    primaryExpansionId: string,
    cardNumber: string | null,
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
      update: {
        primaryExpansionId,
        cardNumber,
      },
      create: {
        name,
        skillsSignature,
        primaryExpansionId,
        cardNumber,
      },
    });
  }

  private async upsertCard(primaryCardId: string, regionalExpansionId: string, cardData: JapaneseCardDto) {
    const variantType = cardData.variantType 
      ? (this.VARIANT_MAP[cardData.variantType.toUpperCase()] || VariantType.NORMAL)
      : VariantType.NORMAL;

    this.logger.debug(`Processing card: ${cardData.webCardId}, supertype from DTO: ${cardData.supertype}, pokemonTypes from DTO: ${JSON.stringify(cardData.pokemonTypes)}`);

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
    
    this.logger.debug(`Mapped supertype: ${supertype}`);

    // Map subtypes (only for Trainers and Energy)
    const subtypes = cardData.subtypes
      ? cardData.subtypes
          .map(st => this.SUBTYPE_MAP[st])
          .filter(Boolean)
      : [];

    // Map evolution stage (only for Pokemon)
    let evolutionStage: EvolutionStage | null = null;
    if (supertype === Supertype.POKEMON && cardData.evolutionStage) {
      evolutionStage = this.EVOLUTION_STAGE_MAP[cardData.evolutionStage] || null;
    }

    // Map ruleBox (for special mechanics)
    let ruleBox: RuleBox | null = null;
    if (cardData.ruleBox) {
      ruleBox = this.RULEBOX_MAP[cardData.ruleBox.toUpperCase()] || null;
    }

    // Handle both 'types' and 'pokemonTypes' fields - convert to array
    const typesArray = cardData.pokemonTypes || cardData.types || [];
    const types: PokemonType[] = [];
    
    this.logger.debug(`Types array from DTO: ${JSON.stringify(typesArray)}`);
    
    if (typesArray.length > 0) {
      const firstType = typesArray[0];
      // First try as enum value (already in correct format)
      if (Object.values(PokemonType).includes(firstType as PokemonType)) {
        types.push(firstType as PokemonType);
      } else {
        // Then try mapping from Japanese
        const mappedType = this.TYPE_MAP[firstType];
        if (mappedType) {
          types.push(mappedType);
        }
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

    // Validation: Pokemon cards MUST have at least one type
    if (supertype === Supertype.POKEMON && types.length === 0) {
      throw new BadRequestException(
        `Pokemon card ${cardData.webCardId} (${cardData.name}) must have a type. ` +
        `Received pokemonTypes: ${JSON.stringify(cardData.pokemonTypes)}, types: ${JSON.stringify(cardData.types)}`
      );
    }

    this.logger.debug(`Final values - supertype: ${supertype}, types: ${JSON.stringify(types)}, evolutionStage: ${evolutionStage}, imageUrl: ${cardData.imageUrl}`);

    return await this.prisma.card.upsert({
      where: { webCardId: cardData.webCardId },
      update: {
        name: cardData.name,
        supertype,
        subtypes: subtypes as any,
        evolutionStage,
        hp,
        types,
        ruleBox,
        abilities: (cardData.abilities || null) as any,
        attacks: (cardData.attacks || null) as any,
        rules: cardData.rules || [],
        text: cardData.effectText || cardData.text || null,
        flavorText: cardData.flavorText || null,
        artist: cardData.artist || null,
        rarity,
        regulationMark: cardData.regulationMark || null,
        imageUrl: cardData.imageUrl || null,
        imageUrlHiRes: cardData.imageUrlHiRes || null,
        variantType,
        regionalExpansionId,
      },
      create: {
        webCardId: cardData.webCardId,
        language: LanguageCode.JA_JP,
        variantType,
        name: cardData.name,
        supertype,
        subtypes: subtypes as any,
        evolutionStage,
        hp,
        types,
        ruleBox,
        abilities: (cardData.abilities || null) as any,
        attacks: (cardData.attacks || null) as any,
        rules: cardData.rules || [],
        text: cardData.effectText || cardData.text || null,
        flavorText: cardData.flavorText || null,
        artist: cardData.artist || null,
        rarity,
        regulationMark: cardData.regulationMark || null,
        imageUrl: cardData.imageUrl || null,
        imageUrlHiRes: cardData.imageUrlHiRes || null,
        regionalExpansionId,
        primaryCardId,
      },
    });
  }

  async getCards(params: {
    skip?: number;
    take?: number;
    webCardId?: string;
    language?: LanguageCode;
    expansionCode?: string;
    name?: string;
    supertype?: string;
    types?: string;
    rarity?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    subtypes?: string;
    evolutionStage?: string;
    ruleBox?: string;
    variantType?: string;
    minHp?: number;
    maxHp?: number;
    artist?: string;
    regulationMark?: string;
    hasAbilities?: boolean;
    hasAttackText?: boolean;
    evolvesTo?: string;
    attackName?: string;
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
      webCardId,
      language, 
      expansionCode, 
      name, 
      supertype, 
      types, 
      rarity,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      subtypes,
      evolutionStage,
      ruleBox,
      variantType,
      minHp,
      maxHp,
      artist,
      regulationMark,
      hasAbilities,
      hasAttackText,
      evolvesTo,
      attackName,
    } = params;

    const where: any = {};
    
    // Handle legacy values passed as subtypes that belong to other enums
    let actualEvolutionStage = evolutionStage;
    let actualRuleBox = ruleBox;
    let actualSubtypes = subtypes;
    
    if (subtypes) {
      const evolutionStageValues = ['BASIC', 'STAGE_1', 'STAGE_2'];
      const ruleBoxValues = ['EX', 'GX', 'V', 'VMAX', 'VSTAR', 'RADIANT', 'MEGA'];
      
      if (evolutionStageValues.includes(subtypes)) {
        // Redirect to evolutionStage filter
        this.logger.log(`Redirecting subtypes=${subtypes} to evolutionStage`);
        actualEvolutionStage = subtypes;
        actualSubtypes = undefined;
      } else if (ruleBoxValues.includes(subtypes)) {
        // Redirect to ruleBox filter
        this.logger.log(`Redirecting subtypes=${subtypes} to ruleBox`);
        actualRuleBox = subtypes;
        actualSubtypes = undefined;
      }
    }
    
    // Existing filters
    if (webCardId) {
      where.webCardId = webCardId;
    }
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
      where.types = {
        has: types,
      };
    }
    if (rarity) {
      where.rarity = rarity;
    }

    // New advanced filters
    if (actualSubtypes) {
      where.subtypes = {
        hasSome: [actualSubtypes],
      };
    }
    if (actualEvolutionStage) {
      where.evolutionStage = actualEvolutionStage;
    }
    if (actualRuleBox) {
      where.ruleBox = actualRuleBox;
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
    // Note: evolvesTo filter handled via raw SQL WHERE clause below for exact CSV matching
    if (expansionCode) {
      where.regionalExpansion = {
        code: {
          equals: expansionCode,
          mode: 'insensitive',
        },
      };
    }
    // Note: hasAbilities and hasAttackText filters are handled via raw SQL below due to Prisma JSON limitations
    // If hasAttackText is used, it will be added to the raw SQL WHERE clause

    // Dynamic sorting
    const orderBy: any = {};
    const validSortFields = ['id', 'webCardId', 'name', 'hp', 'createdAt', 'updatedAt', 'rarity', 'supertype'];
    if (sortBy && validSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc'; // Default sort
    }

    // Handle hasAbilities filter using raw SQL due to Prisma JSON limitations
    let cardsQuery = this.prisma.card.findMany({
      where,
      skip,
      take: Math.min(take, 100), // Max 100 per page
      include: {
        primaryCard: {
          include: {
            primaryExpansion: true,
          },
        },
        regionalExpansion: {
          include: {
            primaryExpansion: true,
          },
        },
      },
      orderBy,
    });

    let countQuery = this.prisma.card.count({ where });

    // Apply hasAbilities, hasAttackText, evolvesTo, or attackName filter using raw SQL if specified
    // hasAbilities, hasAttackText, and attackName require raw SQL due to Prisma JSON field limitations
    // evolvesTo requires raw SQL for exact CSV value matching
    if (hasAbilities !== undefined || hasAttackText !== undefined || evolvesTo || attackName) {
      const jsonFieldConditions: string[] = [];
      
      // For JSON fields: null (JSON null) is different from NULL (SQL null)
      // Cards without abilities have abilities = null (JSON value)
      // Cards with abilities have abilities = [{...}] (JSON array)
      if (hasAbilities !== undefined) {
        const abilityCondition = hasAbilities 
          ? `(c.abilities IS NOT NULL AND c.abilities != 'null'::jsonb)` 
          : `c.abilities = 'null'::jsonb`;
        jsonFieldConditions.push(abilityCondition);
      }
      
      // Cards without attack text have attacks = null (JSON value)
      // Cards with attack text have attacks = [{...}] (JSON array with text)
      if (hasAttackText !== undefined) {
        const attackCondition = hasAttackText
          ? `(c.attacks IS NOT NULL AND c.attacks != 'null'::jsonb)`
          : `c.attacks = 'null'::jsonb`;
        jsonFieldConditions.push(attackCondition);
      }
      
      // evolvesTo is a comma-separated string, check if the exact name appears in the CSV
      // Using PostgreSQL string functions to split and check for exact match
      if (evolvesTo) {
        // Split by comma and trim whitespace, then check if the value exists
        // This ensures "リザード" doesn't match "メガリザードン"
        // Also handles NULL evolvesTo by checking IS NOT NULL first
        const evolvesToCondition = `(c."evolvesTo" IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(string_to_array(c."evolvesTo", ',')) AS evo
          WHERE trim(evo) = '${evolvesTo.replace(/'/g, "''")}'
        ))`;
        jsonFieldConditions.push(evolvesToCondition);
      }
      
      // attackName filter: search for cards with attacks array containing an attack with matching name
      // Uses PostgreSQL's jsonb_array_elements to expand the attacks array and check each attack's name
      if (attackName) {
        const attackNameCondition = `(c.attacks IS NOT NULL AND c.attacks != 'null'::jsonb AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(c.attacks) AS attack
          WHERE attack->>'name' = '${attackName.replace(/'/g, "''")}'
        ))`;
        jsonFieldConditions.push(attackNameCondition);
      }
      
      const baseWhereConditions = Object.entries(where)
        .map(([key, value]) => {
          if (value === null || value === undefined) return null;
          if (key === 'supertype' && typeof value === 'string') return `c."${key}" = '${value}'`;
          if (key === 'name' && typeof value === 'object' && value !== null && 'contains' in value) 
            return `c."${key}" ILIKE '%${value.contains}%'`;
          if (key === 'types' && typeof value === 'object' && value !== null && 'has' in value)
            return `c."${key}" @> '["${value.has}"]'::jsonb`;
          if (key === 'evolutionStage' && typeof value === 'string') return `c."${key}" = '${value}'`;
          if (key === 'ruleBox' && typeof value === 'string') return `c."${key}" = '${value}'`;
          if (key === 'rarity' && typeof value === 'string') return `c."${key}" = '${value}'`;
          if (key === 'language' && typeof value === 'string') return `c."${key}" = '${value}'`;
          if (key === 'regulationMark' && typeof value === 'string') return `c."${key}" = '${value}'`;
          // Handle subtypes array filter
          if (key === 'subtypes' && typeof value === 'object' && value !== null && 'hasSome' in value && Array.isArray(value.hasSome)) {
            const subtypeConditions = value.hasSome.map(st => `c."${key}" @> '["${st}"]'::jsonb`);
            return subtypeConditions.length > 0 ? `(${subtypeConditions.join(' OR ')})` : null;
          }
          return null;
        })
        .filter(Boolean);
      
      // Add JSON field conditions
      baseWhereConditions.push(...jsonFieldConditions);
      
      // Build WHERE clause only if there are conditions
      const whereClause = baseWhereConditions.length > 0 
        ? `WHERE ${baseWhereConditions.join(' AND ')}` 
        : '';

      const [cards, totalResult] = await Promise.all([
        this.prisma.$queryRawUnsafe<any[]>(`
          SELECT c.*, 
                 pc.name as "primaryCardName", 
                 pc."skillsSignature" as "primaryCardSkillsSignature",
                 re.id as "regionalExpansion_id",
                 re.code as "regionalExpansion_code",
                 re.name as "regionalExpansion_name",
                 re.region as "regionalExpansion_region",
                 pe.id as "primaryExpansion_id",
                 pe.code as "primaryExpansion_code",
                 pe."nameEn" as "primaryExpansion_nameEn"
          FROM cards c
          LEFT JOIN primary_cards pc ON c."primaryCardId" = pc.id
          LEFT JOIN regional_expansions re ON c."regionalExpansionId" = re.id
          LEFT JOIN primary_expansions pe ON re."primaryExpansionId" = pe.id
          ${whereClause}
          ORDER BY c."${sortBy || 'createdAt'}" ${sortOrder || 'DESC'}
          LIMIT ${Math.min(take, 100)} OFFSET ${skip}
        `),
        this.prisma.$queryRawUnsafe<[{ count: bigint }]>(`
          SELECT COUNT(*) as count FROM cards c ${whereClause}
        `)
      ]);

      return {
        data: cards.map(card => ({
          ...card,
          primaryCard: {
            name: card.primaryCardName,
            skillsSignature: card.primaryCardSkillsSignature,
          },
          regionalExpansion: card.regionalExpansion_id ? {
            id: card.regionalExpansion_id,
            code: card.regionalExpansion_code,
            name: card.regionalExpansion_name,
            region: card.regionalExpansion_region,
            primaryExpansion: card.primaryExpansion_id ? {
              code: card.primaryExpansion_code,
              nameEn: card.primaryExpansion_nameEn,
            } : null,
          } : null,
        })),
        pagination: {
          total: Number(totalResult[0].count),
          skip,
          take,
          hasMore: skip + take < Number(totalResult[0].count),
        },
      };
    }

    const [cards, total] = await Promise.all([
      cardsQuery,
      countQuery,
    ]);

    // Include expansion info in response
    const enrichedCards = cards.map(card => ({
      ...card,
      regionalExpansion: card.regionalExpansion ? {
        id: card.regionalExpansion.id,
        code: card.regionalExpansion.code,
        name: card.regionalExpansion.name,
        region: card.regionalExpansion.region,
        primaryExpansion: card.regionalExpansion.primaryExpansion ? {
          code: card.regionalExpansion.primaryExpansion.code,
          nameEn: card.regionalExpansion.primaryExpansion.nameEn,
        } : null,
      } : null,
    }));

    return {
      data: enrichedCards,
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
        primaryCard: {
          include: {
            primaryExpansion: true,
          },
        },
        regionalExpansion: {
          include: {
            primaryExpansion: true,
          },
        },
      },
    });
  }

  async getCardByWebCardId(webCardId: string): Promise<any> {
    const card = await this.prisma.card.findUnique({
      where: { webCardId },
      include: {
        primaryCard: {
          include: {
            primaryExpansion: true,
          },
        },
        regionalExpansion: {
          include: {
            primaryExpansion: true,
          },
        },
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
        regionalExpansion: {
          select: {
            code: true,
            name: true,
            region: true,
            primaryExpansion: {
              select: {
                code: true,
                nameEn: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    return {
      ...card,
      languageVariants,
    };
  }

  async updateEvolution(
    webCardId: string,
    dto: { evolvesFrom?: string; evolvesTo?: string }
  ): Promise<any> {
    const card = await this.prisma.card.findUnique({
      where: { webCardId },
    });

    if (!card) {
      throw new NotFoundException(`Card with webCardId ${webCardId} not found`);
    }

    return await this.prisma.card.update({
      where: { webCardId },
      data: {
        evolvesFrom: dto.evolvesFrom || null,
        evolvesTo: dto.evolvesTo || null,
      },
    });
  }
}
