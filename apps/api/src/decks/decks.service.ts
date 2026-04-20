import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDeckDto } from './dto/create-deck.dto';
import { FindAllDecksDto } from './dto/find-all-decks.dto';

const BASIC_ENERGY_SUBTYPES = ['BASIC_ENERGY'];

@Injectable()
export class DecksService {
  private readonly logger = new Logger(DecksService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: FindAllDecksDto): Promise<{ data: any[]; meta: { total: number; skip: number; take: number } }> {
    const where: any = {};

    if (query.archetype) where.archetype = query.archetype;
    if (query.userId) where.userId = query.userId;
    if (query.isPublic !== undefined) where.isPublic = query.isPublic;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.deck.findMany({
        where,
        skip: query.skip ?? 0,
        take: query.take ?? 50,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { cards: true } },
        },
      }),
      this.prisma.deck.count({ where }),
    ]);

    const deckIds = data.map((d) => d.id);
    const qtys = deckIds.length > 0
      ? await this.prisma.deckCard.groupBy({
          by: ['deckId'],
          where: { deckId: { in: deckIds } },
          _sum: { quantity: true },
        })
      : [];
    const qtyMap = new Map(qtys.map((q) => [q.deckId, q._sum.quantity ?? 0]));
    const enriched = data.map((d) => ({ ...d, totalCards: qtyMap.get(d.id) ?? 0 }));

    return { data: enriched, meta: { total, skip: query.skip ?? 0, take: query.take ?? 50 } };
  }

  async findOne(id: string): Promise<any> {
    const deck = await this.prisma.deck.findUnique({
      where: { id },
      include: {
        cards: {
          include: {
            card: {
              select: {
                webCardId: true,
                name: true,
                imageUrl: true,
                supertype: true,
                subtypes: true,
                types: true,
                rarity: true,
                hp: true,
                attacks: true,
                abilities: true,
                weaknesses: true,
                resistances: true,
                evolutionStage: true,
                primaryCardId: true,
                language: true,
                primaryCard: {
                  select: {
                    effectTags: true,
                    specialEffectTags: true,
                  },
                },
              },
            },
          },
          orderBy: [{ card: { supertype: 'asc' } }],
        },
        tournamentResults: {
          include: {
            tournament: {
              select: {
                date: true,
                name: true,
                location: true,
                type: true,
                playerCount: true,
                region: true,
                eventId: true,
              },
            },
          },
        },
      },
    });

    if (!deck) {
      throw new NotFoundException(`Deck ${id} not found`);
    }

    await this.hydrateDeckExtras(deck);
    await this.resolveCanonicalWebCardIds(deck);
    await this.resolveChineseVariants(deck);
    await this.addPricingInfo(deck);
    this.buildEffectSummary(deck);

    return deck;
  }

  /**
   * For Pokémon cards, resolve the canonical (preferred JA_JP) webCardId for each
   * primaryCard, so the UI can link to the correct card rather than whatever
   * happened to be name-matched during import.
   * Non-Pokémon cards are unique per name so no resolution is needed.
   */
  private async resolveCanonicalWebCardIds(deck: any): Promise<void> {
    const pokemonEntries = (deck.cards ?? []).filter(
      (dc: any) => dc.card?.supertype === 'POKEMON' && dc.card?.primaryCardId,
    );
    if (pokemonEntries.length === 0) return;

    const primaryCardIds = [...new Set<string>(pokemonEntries.map((dc: any) => dc.card.primaryCardId))];

    // Fetch all language variants for these primaryCards in one query.
    // Prefer JA_JP first (tournament decks are JP), then any available language.
    const variants = await this.prisma.card.findMany({
      where: { primaryCardId: { in: primaryCardIds } },
      select: { primaryCardId: true, webCardId: true, language: true },
      orderBy: [{ language: 'asc' }, { createdAt: 'asc' }],
    });

    // Build primaryCardId -> best webCardId map (JA_JP wins over others)
    const canonicalMap = new Map<string, string>();
    for (const v of variants) {
      const current = canonicalMap.get(v.primaryCardId);
      if (!current || v.language === 'JA_JP') {
        canonicalMap.set(v.primaryCardId, v.webCardId);
      }
    }

    for (const dc of pokemonEntries) {
      const canonical = canonicalMap.get(dc.card.primaryCardId);
      if (canonical) {
        dc.card.canonicalWebCardId = canonical;
      }
    }
  }

  private async resolveChineseVariants(deck: any): Promise<void> {
    const allEntries = (deck.cards ?? []).filter((dc: any) => dc.card?.primaryCardId);
    if (allEntries.length === 0) return;

    const primaryCardIds = [...new Set<string>(allEntries.map((dc: any) => dc.card.primaryCardId))];

    // Fetch ZH_TW variants; prefer NORMAL variantType as the canonical Chinese card
    const zhVariants = await this.prisma.card.findMany({
      where: { primaryCardId: { in: primaryCardIds }, language: 'ZH_TW' },
      select: { id: true, primaryCardId: true, name: true, webCardId: true, imageUrl: true, variantType: true, abilities: true, attacks: true },
      orderBy: { variantType: 'asc' },
    });

    // Build map: primaryCardId → best ZH_TW card (NORMAL wins)
    const zhMap = new Map<string, { id: string; name: string; webCardId: string; imageUrl: string | null; abilities: any; attacks: any }>();
    for (const v of zhVariants) {
      const existing = zhMap.get(v.primaryCardId);
      if (!existing || v.variantType === 'NORMAL') {
        zhMap.set(v.primaryCardId, { id: v.id, name: v.name, webCardId: v.webCardId, imageUrl: v.imageUrl, abilities: v.abilities, attacks: v.attacks });
      }
    }

    for (const dc of allEntries) {
      const zh = zhMap.get(dc.card.primaryCardId);
      if (zh) {
        dc.card.zhName = zh.name;
        dc.card.zhWebCardId = zh.webCardId;
        dc.card.zhImageUrl = zh.imageUrl;
        dc.card.zhCardId = zh.id;
        // Only set zh abilities/attacks if the ZH card actually has them
        if (Array.isArray(zh.abilities) && zh.abilities.length > 0) dc.card.zhAbilities = zh.abilities;
        if (Array.isArray(zh.attacks) && zh.attacks.length > 0) dc.card.zhAttacks = zh.attacks;
      }
      // Flatten effectTags from nested primaryCard relation
      if (dc.card.primaryCard?.effectTags) {
        dc.card.effectTags = [
          ...(dc.card.primaryCard.effectTags ?? []),
          ...(dc.card.primaryCard.specialEffectTags ?? []),
        ];
      }
    }
  }

  private async addPricingInfo(deck: any): Promise<void> {
    const deckCards = deck.cards ?? [];
    if (deckCards.length === 0) return;

    const cardIds = deckCards.map((dc: any) => dc.cardId) as string[];
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Single query: for each deck card (JP), get the LATEST price per ZH_TW variant.
    // Uses DISTINCT ON to pick only the most recent price record per card — avoids stale
    // min/max across 90 days pulling in outdated prices (e.g. old $2 record hiding new $580).
    const priceRows = await this.prisma.$queryRaw<Array<{
      deckCardId: string;
      primaryCardId: string;
      zhCardId: string;
      zhName: string;
      zhWebCardId: string;
      zhImageUrl: string | null;
      variantType: string;
      rarity: string | null;
      minPrice: number;
      maxPrice: number;
      currency: string;
      latestFetchedAt: Date;
      inStock: boolean;
    }>>`
      WITH latest_prices AS (
        SELECT DISTINCT ON ("cardId")
          "cardId", price, "inStock", currency, "fetchedAt"
        FROM card_prices
        WHERE price > 0
          AND "fetchedAt" >= ${ninetyDaysAgo}
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
      WHERE jp_c.id = ANY(${cardIds})
      ORDER BY lp.price ASC
    `;

    // Collect ALL rows per deckCardId (sorted ASC by price from SQL)
    const allRowsMap = new Map<string, typeof priceRows>();
    const primaryMinMap = new Map<string, number>();
    const primaryMaxMap = new Map<string, number>();
    let currency = 'HKD';

    for (const row of priceRows) {
      currency = row.currency;
      if (!allRowsMap.has(row.deckCardId)) allRowsMap.set(row.deckCardId, []);
      allRowsMap.get(row.deckCardId)!.push(row);
      // Per primaryCard: track global min/max across all ZH variants
      const curMin = primaryMinMap.get(row.primaryCardId);
      const curMax = primaryMaxMap.get(row.primaryCardId);
      const rowMin = Number(row.minPrice);
      const rowMax = Number(row.maxPrice);
      if (curMin === undefined || rowMin < curMin) primaryMinMap.set(row.primaryCardId, rowMin);
      if (curMax === undefined || rowMax > curMax) primaryMaxMap.set(row.primaryCardId, rowMax);
    }

    // Fetch USER-source prices via dedicated method keyed by zhWebCardId (the string
    // the frontend posts when saving — completely independent of internal UUID mapping)
    const zhWebCardIds = deckCards
      .map((dc: any) => dc.card?.zhWebCardId as string | undefined)
      .filter((id: string | undefined): id is string => Boolean(id));
    const userPriceByWebCardId = await this.fetchUserPrices(zhWebCardIds);

    // Annotate each deck card
    for (const deckCard of deckCards) {
      const rows = allRowsMap.get(deckCard.cardId);
      if (!rows || rows.length === 0) continue;

      const lowRow  = rows[0];
      const highRow = rows[rows.length - 1];
      const midRow  = rows.length > 2 ? rows[Math.floor((rows.length - 1) / 2)] : (rows.length === 2 ? rows[1] : null);

      // Attach Chinese card identity from cheapest variant
      if (!deckCard.card.zhName) {
        deckCard.card.zhName    = lowRow.zhName;
        deckCard.card.zhWebCardId = lowRow.zhWebCardId;
        deckCard.card.zhImageUrl  = lowRow.zhImageUrl;
      }

      // Build up to 3 price tiers: low / mid / high
      const tierRows = [lowRow, ...(midRow && midRow !== lowRow ? [midRow] : []), ...(highRow !== lowRow ? [highRow] : [])];
      deckCard.zhTiers = tierRows.map((r) => ({
        variantType: r.variantType,
        rarity: r.rarity,
        imageUrl: r.zhImageUrl,
        price: Number(r.minPrice),
        currency: r.currency,
        inStock: Boolean(r.inStock),
      }));

      // Keep zhPricing / zhVariantPricing for backwards compat
      deckCard.zhPricing = {
        lowest: Number(lowRow.minPrice),
        highest: Number(highRow.maxPrice),
        currency: lowRow.currency,
        lastUpdated: lowRow.latestFetchedAt,
      };

      const primaryId = deckCard.card?.primaryCardId ?? lowRow.primaryCardId;
      if (primaryMinMap.has(primaryId)) {
        deckCard.zhVariantPricing = {
          lowestRarity: primaryMinMap.get(primaryId)!,
          highestRarity: primaryMaxMap.get(primaryId)!,
          currency: lowRow.currency,
        };
      }

      // Attach USER price — keyed by the zhWebCardId string set by resolveChineseVariants
      const userPrice = userPriceByWebCardId.get(deckCard.card?.zhWebCardId);
      if (userPrice !== undefined) deckCard.userPrice = userPrice;
    }

    // Deck-level totals
    let zhLowestTotal = 0;
    let zhHighestTotal = 0;
    let zhBudgetTotal = 0;
    let zhPremiumTotal = 0;

    for (const deckCard of deckCards) {
      const qty = deckCard.quantity ?? 1;
      if (deckCard.zhPricing) {
        zhLowestTotal += deckCard.zhPricing.lowest * qty;
        zhHighestTotal += deckCard.zhPricing.highest * qty;
      }
      if (deckCard.zhVariantPricing) {
        // Use USER price as budget floor if saved
        const budgetMin = deckCard.userPrice ?? deckCard.zhVariantPricing.lowestRarity;
        zhBudgetTotal += budgetMin * qty;
        zhPremiumTotal += deckCard.zhVariantPricing.highestRarity * qty;
      }
    }

    deck.pricing = {
      currency,
      zh: {
        lowestTotal: zhLowestTotal,    // total using cheapest ZH variant per card
        highestTotal: zhHighestTotal,  // total using priciest ZH variant per card
        budgetTotal: zhBudgetTotal,    // total using cheapest rarity across all ZH prints
        premiumTotal: zhPremiumTotal,  // total using priciest rarity across all ZH prints
        currency,
      },
    };
  }

  /**
   * Fetch USER-source prices keyed by ZH card webCardId string.
   * Completely separate from the main price query — uses the same webCardId
   * the frontend posts to /prices when saving, so there is no UUID mismatch.
   */
  private async fetchUserPrices(zhWebCardIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (zhWebCardIds.length === 0) return result;

    const rows = await this.prisma.$queryRaw<Array<{ webCardId: string; price: number }>>`
      SELECT DISTINCT ON (c."webCardId")
        c."webCardId", cp.price
      FROM card_prices cp
      JOIN cards c ON c.id = cp."cardId"
      WHERE c."webCardId" = ANY(${zhWebCardIds})
        AND cp.source = 'USER'
      ORDER BY c."webCardId", cp."fetchedAt" DESC
    `;
    for (const r of rows) result.set(r.webCardId, Number(r.price));
    return result;
  }

  private buildEffectSummary(deck: any): void {
    const abilities: Array<{ cardName: string; name: string; effect: string }> = [];
    const attacks: Array<{ cardName: string; name: string; damage: string; effect: string }> = [];

    for (const deckCard of deck.cards ?? []) {
      const card = deckCard.card;
      if (!card) continue;

      const displayName = card.zhName ?? card.name;

      if (Array.isArray(card.abilities)) {
        for (const ab of card.abilities) {
          if (ab?.name) {
            abilities.push({ cardName: displayName, name: ab.name, effect: ab.effect ?? ab.text ?? '' });
          }
        }
      }

      if (Array.isArray(card.attacks)) {
        for (const atk of card.attacks) {
          if (atk?.name) {
            attacks.push({
              cardName: displayName,
              name: atk.name,
              damage: atk.damage ?? '',
              effect: atk.effect ?? atk.text ?? '',
            });
          }
        }
      }
    }

    deck.effectSummary = { abilities, attacks };
  }

  async findOneByCode(deckCode: string): Promise<any> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM decks WHERE "deckCode" = ${deckCode} LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException(`Deck code ${deckCode} not found`);
    }

    return this.findOne(rows[0].id);
  }

  private async hydrateDeckExtras(deck: any) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; deckCode: string | null; deckData: any }>>`
      SELECT id, "deckCode", "deckData" FROM decks WHERE id = ${deck.id}
    `;
    if (rows.length > 0) {
      deck.deckCode = rows[0].deckCode;
      deck.deckData = rows[0].deckData;
    }
  }

  async create(dto: CreateDeckDto): Promise<any> {
    if (dto.cards && dto.cards.length > 0) {
      await this.validateCardCounts(dto.cards);
    }

    // Resolve webCardIds → actual Card.id
    const resolvedCards = dto.cards
      ? await Promise.all(
          dto.cards.map(async (c) => {
            const card = await this.prisma.card.findUnique({
              where: { webCardId: c.cardId },
              select: { id: true },
            });
            if (!card) throw new NotFoundException(`Card ${c.cardId} not found`);
            return { cardId: card.id, quantity: c.quantity };
          }),
        )
      : undefined;

    const deck = await this.prisma.deck.create({
      data: {
        name: dto.name,
        description: dto.description,
        archetype: dto.archetype as any,
        format: dto.format,
        isPublic: dto.isPublic ?? false,
        cards: resolvedCards
          ? {
              create: resolvedCards.map((c) => ({
                cardId: c.cardId,
                quantity: c.quantity,
              })),
            }
          : undefined,
      },
      include: {
        cards: { include: { card: { select: { webCardId: true, name: true } } } },
      },
    });

    this.logger.log(`Created deck: ${deck.id} (${deck.name})`);
    return deck;
  }

  async addCards(deckId: string, cards: { cardId: string; quantity: number }[]): Promise<any> {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException(`Deck ${deckId} not found`);

    await this.validateCardCounts(cards);

    for (const { cardId: webCardId, quantity } of cards) {
      const card = await this.prisma.card.findUnique({
        where: { webCardId },
        select: { id: true },
      });
      if (!card) throw new NotFoundException(`Card ${webCardId} not found`);

      await this.prisma.deckCard.upsert({
        where: { deckId_cardId: { deckId, cardId: card.id } },
        create: { deckId, cardId: card.id, quantity },
        update: { quantity },
      });
    }

    return this.findOne(deckId);
  }

  async removeCard(deckId: string, webCardId: string): Promise<any> {
    const deck = await this.prisma.deck.findUnique({ where: { id: deckId } });
    if (!deck) throw new NotFoundException(`Deck ${deckId} not found`);

    const card = await this.prisma.card.findUnique({
      where: { webCardId },
      select: { id: true },
    });
    if (!card) throw new NotFoundException(`Card ${webCardId} not found`);

    await this.prisma.deckCard.delete({
      where: { deckId_cardId: { deckId, cardId: card.id } },
    });

    return this.findOne(deckId);
  }

  async remove(id: string) {
    const deck = await this.prisma.deck.findUnique({ where: { id } });
    if (!deck) throw new NotFoundException(`Deck ${id} not found`);
    await this.prisma.deck.delete({ where: { id } });
  }

  private async validateCardCounts(cards: { cardId: string; quantity: number }[]) {
    for (const { cardId, quantity } of cards) {
      if (quantity < 1 || quantity > 4) {
        // Check if it's a Basic Energy (exempt from 4-copy rule)
        const card = await this.prisma.card.findUnique({
          where: { webCardId: cardId },
          select: { subtypes: true },
        });

        if (!card || !card.subtypes.some((s) => BASIC_ENERGY_SUBTYPES.includes(s))) {
          if (quantity > 4) {
            throw new BadRequestException(
              `Card ${cardId}: max 4 copies allowed (got ${quantity})`,
            );
          }
        }
      }
    }
  }

  /* ── Pokémon role overrides per event deck ───────────────────── */

  /** Returns the most-recently assigned role for each card across ALL decks (for cross-deck presets). */
  async lookupCardRoles(cardIds: string[]): Promise<Record<string, string>> {
    if (!cardIds.length) return {};
    const rows = await this.prisma.$queryRaw<Array<{ canonicalWebCardId: string; role: string }>>`
      SELECT DISTINCT ON ("canonicalWebCardId") "canonicalWebCardId", role::text
      FROM deck_card_roles
      WHERE "canonicalWebCardId" = ANY(${cardIds})
      ORDER BY "canonicalWebCardId", "updatedAt" DESC
    `;
    return Object.fromEntries(rows.map((r) => [r.canonicalWebCardId, r.role]));
  }

  /** Returns a map of canonicalWebCardId → role for all saved overrides in a deck. */
  async getRolesForDeck(deckCode: string): Promise<Record<string, string>> {
    const rows = await this.prisma.$queryRaw<Array<{ canonicalWebCardId: string; role: string }>>`
      SELECT "canonicalWebCardId", role::text FROM deck_card_roles
      WHERE "deckCode" = ${deckCode}
    `;
    return Object.fromEntries(rows.map((r) => [r.canonicalWebCardId, r.role]));
  }

  /** Upserts a single role override. Returns the saved entry. */
  async upsertRole(deckCode: string, canonicalWebCardId: string, role: string): Promise<{ canonicalWebCardId: string; role: string }> {
    const VALID_ROLES = ['POKEMON_MAIN', 'POKEMON_SUPPORT', 'POKEMON_EVOLUTION'];
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}. Must be one of ${VALID_ROLES.join(', ')}`);
    }
    const id = `${deckCode}:${canonicalWebCardId}`;
    await this.prisma.$executeRaw`
      INSERT INTO deck_card_roles (id, "deckCode", "canonicalWebCardId", role, "createdAt", "updatedAt")
      VALUES (${id}, ${deckCode}, ${canonicalWebCardId}, ${role}::"DeckPokemonRole", NOW(), NOW())
      ON CONFLICT ("deckCode", "canonicalWebCardId")
      DO UPDATE SET role = ${role}::"DeckPokemonRole", "updatedAt" = NOW()
    `;
    return { canonicalWebCardId, role };
  }

  /** Removes a single role override (card reverts to heuristic). */
  async clearRole(deckCode: string, canonicalWebCardId: string): Promise<void> {
    await this.prisma.$executeRaw`
      DELETE FROM deck_card_roles
      WHERE "deckCode" = ${deckCode} AND "canonicalWebCardId" = ${canonicalWebCardId}
    `;
  }
}

