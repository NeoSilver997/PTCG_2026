import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateDeckDto } from './dto/create-deck.dto';
import { FindAllDecksDto } from './dto/find-all-decks.dto';

const BASIC_ENERGY_SUBTYPES = ['BASIC_ENERGY'];

@Injectable()
export class DecksService {
  private readonly logger = new Logger(DecksService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: FindAllDecksDto) {
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

  async findOne(id: string) {
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

    return deck;
  }

  async findOneByCode(deckCode: string) {
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

  async create(dto: CreateDeckDto) {
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

  async addCards(deckId: string, cards: { cardId: string; quantity: number }[]) {
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

  async removeCard(deckId: string, webCardId: string) {
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
}
