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
                evolutionStage: true,
                primaryCardId: true,
                language: true,
              },
            },
          },
          orderBy: [{ card: { supertype: 'asc' } }],
        },
      },
    });

    if (!deck) {
      throw new NotFoundException(`Deck ${id} not found`);
    }

    await this.hydrateDeckExtras(deck);
    await this.resolveCanonicalWebCardIds(deck);

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

