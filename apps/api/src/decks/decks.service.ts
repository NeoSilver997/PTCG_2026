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
                evolutionStage: true,
                primaryCardId: true,
                language: true,
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
      select: { id: true, primaryCardId: true, name: true, webCardId: true, imageUrl: true, variantType: true },
      orderBy: { variantType: 'asc' },
    });

    // Build map: primaryCardId → best ZH_TW card (NORMAL wins)
    const zhMap = new Map<string, { id: string; name: string; webCardId: string; imageUrl: string | null }>();
    for (const v of zhVariants) {
      const existing = zhMap.get(v.primaryCardId);
      if (!existing || v.variantType === 'NORMAL') {
        zhMap.set(v.primaryCardId, { id: v.id, name: v.name, webCardId: v.webCardId, imageUrl: v.imageUrl });
      }
    }

    for (const dc of allEntries) {
      const zh = zhMap.get(dc.card.primaryCardId);
      if (zh) {
        dc.card.zhName = zh.name;
        dc.card.zhWebCardId = zh.webCardId;
        dc.card.zhImageUrl = zh.imageUrl;
        dc.card.zhCardId = zh.id;
      }
    }
  }

  private async addPricingInfo(deck: any): Promise<void> {
    const deckCards = deck.cards ?? [];
    if (deckCards.length === 0) return;

    const cardIds = deckCards.map((dc: any) => dc.cardId) as string[];
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Single query: for each deck card (JP), find the cheapest and most expensive ZH_TW price
    // across ALL rarity variants of the same primaryCard. Also get the exact ZH_TW card price
    // for the NORMAL variant (or best available).
    const priceRows = await this.prisma.$queryRaw<Array<{
      deckCardId: string;
      primaryCardId: string;
      zhCardId: string;
      zhName: string;
      zhWebCardId: string;
      zhImageUrl: string | null;
      minPrice: number;
      maxPrice: number;
      currency: string;
      latestFetchedAt: Date;
    }>>`
      SELECT
        jp_c.id                          AS "deckCardId",
        jp_c."primaryCardId"             AS "primaryCardId",
        zh_c.id                          AS "zhCardId",
        zh_c.name                        AS "zhName",
        zh_c."webCardId"                 AS "zhWebCardId",
        zh_c."imageUrl"                  AS "zhImageUrl",
        MIN(cp.price)                    AS "minPrice",
        MAX(cp.price)                    AS "maxPrice",
        cp.currency                      AS "currency",
        MAX(cp."fetchedAt")              AS "latestFetchedAt"
      FROM cards jp_c
      JOIN cards zh_c
        ON zh_c."primaryCardId" = jp_c."primaryCardId"
        AND zh_c.language = 'ZH_TW'
      JOIN card_prices cp
        ON cp."cardId" = zh_c.id
        AND cp.price > 0
        AND cp."fetchedAt" >= ${ninetyDaysAgo}
      WHERE jp_c.id = ANY(${cardIds})
      GROUP BY jp_c.id, jp_c."primaryCardId", zh_c.id, zh_c.name, zh_c."webCardId", zh_c."imageUrl", cp.currency
      ORDER BY MIN(cp.price) ASC
    `;

    // Build a map: deckCardId (JP card id) → best price row (lowest price wins for "budget" variant)
    // We also need per-primaryCard min/max across ALL variants for the deck totals.
    const perCardMap = new Map<string, typeof priceRows[0]>();
    const primaryMinMap = new Map<string, number>();
    const primaryMaxMap = new Map<string, number>();
    let currency = 'HKD';

    for (const row of priceRows) {
      currency = row.currency;
      // Per deck card: pick the ZH card with the lowest price (budget variant)
      if (!perCardMap.has(row.deckCardId)) {
        perCardMap.set(row.deckCardId, row);
      }
      // Per primaryCard: track global min/max across all ZH variants
      const curMin = primaryMinMap.get(row.primaryCardId);
      const curMax = primaryMaxMap.get(row.primaryCardId);
      const rowMin = Number(row.minPrice);
      const rowMax = Number(row.maxPrice);
      if (curMin === undefined || rowMin < curMin) primaryMinMap.set(row.primaryCardId, rowMin);
      if (curMax === undefined || rowMax > curMax) primaryMaxMap.set(row.primaryCardId, rowMax);
    }

    // Annotate each deck card
    for (const deckCard of deckCards) {
      const row = perCardMap.get(deckCard.cardId);
      if (!row) continue;

      const minPrice = Number(row.minPrice);
      const maxPrice = Number(row.maxPrice);

      // Attach Chinese card identity for UI display
      if (!deckCard.card.zhName) {
        deckCard.card.zhName = row.zhName;
        deckCard.card.zhWebCardId = row.zhWebCardId;
        deckCard.card.zhImageUrl = row.zhImageUrl;
      }

      // Exact price for this ZH variant (lowest available)
      deckCard.zhPricing = {
        lowest: minPrice,
        highest: maxPrice,
        currency: row.currency,
        lastUpdated: row.latestFetchedAt,
      };

      // Rarity variant range for same primaryCard
      const primaryId = deckCard.card?.primaryCardId ?? row.primaryCardId;
      if (primaryMinMap.has(primaryId)) {
        deckCard.zhVariantPricing = {
          lowestRarity: primaryMinMap.get(primaryId)!,
          highestRarity: primaryMaxMap.get(primaryId)!,
          currency: row.currency,
        };
      }
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
        zhBudgetTotal += deckCard.zhVariantPricing.lowestRarity * qty;
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

