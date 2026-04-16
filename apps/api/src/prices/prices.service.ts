import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpsertPriceDto } from './dto/upsert-price.dto';

@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);

  constructor(private prisma: PrismaService) {}

  async findByCard(webCardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { webCardId },
      select: { id: true, name: true, webCardId: true, imageUrl: true, regulationMark: true, supertype: true, rarity: true },
    });

    if (!card) throw new NotFoundException(`Card ${webCardId} not found`);

    const since28 = new Date();
    since28.setDate(since28.getDate() - 28);

    const [prices, history] = await Promise.all([
      this.prisma.cardPrice.findMany({
        where: { cardId: card.id },
        orderBy: { fetchedAt: 'desc' },
      }),
      this.prisma.priceHistory.findMany({
        where: { cardId: card.id, date: { gte: since28 } },
        orderBy: { date: 'asc' },
      }),
    ]);

    return { card, prices, history };
  }

  async upsertPrice(dto: UpsertPriceDto) {
    const card = await this.prisma.card.findUnique({
      where: { webCardId: dto.webCardId },
      select: { id: true },
    });

    if (!card) throw new NotFoundException(`Card ${dto.webCardId} not found`);

    const condition = dto.condition ?? 'NM';
    const existing = await this.prisma.cardPrice.findFirst({
      where: { cardId: card.id, source: dto.source as any, condition },
    });

    const price = existing
      ? await this.prisma.cardPrice.update({
          where: { id: existing.id },
          data: {
            price: dto.price,
            currency: dto.currency,
            inStock: dto.inStock ?? true,
            stockQty: dto.stockQty ?? null,
            fetchedAt: new Date(),
          },
        })
      : await this.prisma.cardPrice.create({
          data: {
            cardId: card.id,
            source: dto.source as any,
            price: dto.price,
            currency: dto.currency,
            condition,
            inStock: dto.inStock ?? true,
            stockQty: dto.stockQty ?? null,
            fetchedAt: new Date(),
          },
        });

    // Record price history
    await this.prisma.priceHistory.create({
      data: {
        cardId: card.id,
        source: dto.source as any,
        price: dto.price,
        currency: dto.currency,
        inStock: dto.inStock ?? true,
        stockQty: dto.stockQty ?? null,
        date: new Date(),
      },
    });

    this.logger.log(`Upserted price for ${dto.webCardId}: ${dto.price} ${dto.currency}`);
    return price;
  }

  async getHistory(webCardId: string, days = 28) {
    const card = await this.prisma.card.findUnique({
      where: { webCardId },
      select: { id: true },
    });

    if (!card) throw new NotFoundException(`Card ${webCardId} not found`);

    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.priceHistory.findMany({
      where: { cardId: card.id, date: { gte: since } },
      orderBy: { date: 'asc' },
      take: 200,
    });
  }

  async listRecent(
    take = 50,
    skip = 0,
    sortBy: 'price' | 'fetchedAt' = 'fetchedAt',
    sortDir: 'asc' | 'desc' = 'desc',
    nameFilter?: string,
    inStock?: boolean,
    minPrice?: number,
    regulationMarks?: string[],
  ) {
    const where: any = {};
    const cardWhere: any = {};
    if (nameFilter) {
      cardWhere.name = { contains: nameFilter, mode: 'insensitive' };
    }
    if (regulationMarks && regulationMarks.length > 0) {
      cardWhere.regulationMark = { in: regulationMarks };
    }
    if (Object.keys(cardWhere).length > 0) {
      where.card = cardWhere;
    }
    if (inStock !== undefined) {
      where.inStock = inStock;
    }
    if (minPrice !== undefined && minPrice > 0) {
      where.price = { gte: minPrice };
    }
    // Always exclude ¥999/HKD999 out-of-stock placeholder prices
    where.NOT = { AND: [{ price: 999 }, { inStock: false }] };

    const orderBy: any =
      sortBy === 'price' ? { price: sortDir } : { fetchedAt: sortDir };

    const [rows, total] = await Promise.all([
      this.prisma.cardPrice.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          source: true,
          price: true,
          currency: true,
          condition: true,
          inStock: true,
          stockQty: true,
          fetchedAt: true,
          card: {
            select: {
              id: true,
              webCardId: true,
              name: true,
              imageUrl: true,
              regulationMark: true,
            },
          },
        },
      }),
      this.prisma.cardPrice.count({ where }),
    ]);

    return { data: rows, total, skip, take };
  }

  async getTopMovers(
    take = 300,
    minChangePct?: number,
    maxChangePct?: number,
    days = 28,
    supertype?: string,
    pokemonType?: string,
    sortBy: 'change' | 'price' = 'price',
    regulationMarks?: string[],
  ) {
    // Compute the start of the window
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Build optional card pre-filter for supertype / pokemonType / regulationMark
    const cardTypeWhere: Record<string, any> = {};
    if (supertype) cardTypeWhere['supertype'] = supertype;
    if (pokemonType) cardTypeWhere['types'] = { has: pokemonType };
    if (regulationMarks && regulationMarks.length > 0) cardTypeWhere['regulationMark'] = { in: regulationMarks };
    let preFilterIds: string[] | undefined;
    if (supertype || pokemonType || (regulationMarks && regulationMarks.length > 0)) {
      const filtered = await this.prisma.card.findMany({
        where: cardTypeWhere,
        select: { id: true },
      });
      preFilterIds = filtered.map((c) => c.id);
      if (preFilterIds.length === 0) return [];
    }

    // Get first recorded price per card+source within the date window
    const earliest = await this.prisma.priceHistory.findMany({
      distinct: ['cardId', 'source'],
      where: {
        date: { gte: since },
        ...(preFilterIds ? { cardId: { in: preFilterIds } } : {}),
      },
      orderBy: [{ cardId: 'asc' }, { source: 'asc' }, { date: 'asc' }],
      select: { cardId: true, source: true, price: true, date: true },
    });

    // Use CardPrice as the current (authoritative) price to avoid stale/wrong history entries
    // Exclude 999 out-of-stock placeholder prices
    const currentPrices = await this.prisma.cardPrice.findMany({
      where: { NOT: { AND: [{ price: 999 }, { inStock: false }] } },
      select: { cardId: true, source: true, price: true, fetchedAt: true, inStock: true },
    });
    const currentMap = new Map<string, { price: number; date: Date }>();
    for (const r of currentPrices) currentMap.set(`${r.cardId}__${r.source}`, { price: r.price, date: r.fetchedAt });

    const uniqueCardIds = [...new Set(earliest.map((h) => h.cardId))];
    const cards = await this.prisma.card.findMany({
      where: { id: { in: uniqueCardIds } },
      select: { id: true, webCardId: true, name: true, imageUrl: true, supertype: true, types: true, regulationMark: true },
    });
    const cardMap = new Map(cards.map((c) => [c.id, c]));

    return earliest
      .map((e) => {
        const key = `${e.cardId}__${e.source}`;
        const current = currentMap.get(key);
        if (!current || e.price === current.price) return null;
        const changePct = e.price > 0 ? ((current.price - e.price) / e.price) * 100 : 0;
        if (Math.abs(changePct) <= 0.1) return null;
        if (minChangePct !== undefined && changePct < minChangePct) return null;
        if (maxChangePct !== undefined && changePct > maxChangePct) return null;
        return {
          card: cardMap.get(e.cardId),
          source: e.source,
          firstPrice: e.price,
          lastPrice: current.price,
          firstDate: e.date,
          lastDate: current.date,
          changePct,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) =>
        sortBy === 'price'
          ? b.lastPrice - a.lastPrice
          : Math.abs(b.changePct) - Math.abs(a.changePct)
      )
      .slice(0, take);
  }

  async getStockChanges(days = 14, regulationMarks?: string[]) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const placeholder = { NOT: { AND: [{ price: 999 }, { inStock: false }] } };
    const cardSelect = {
      id: true, webCardId: true, name: true, imageUrl: true, regulationMark: true,
    };

    // Build regulation mark filter on the card relation
    const cardWhere = regulationMarks && regulationMarks.length > 0
      ? { card: { regulationMark: { in: regulationMarks } } }
      : {};

    const [outOfStock, recentlyInStock] = await Promise.all([
      // All currently out-of-stock entries (excluding 999 placeholders), sorted by fetchedAt desc
      this.prisma.cardPrice.findMany({
        where: { inStock: false, ...placeholder, ...cardWhere },
        orderBy: { fetchedAt: 'desc' },
        take: 300,
        select: {
          id: true, source: true, price: true, currency: true, inStock: true, stockQty: true, fetchedAt: true,
          card: { select: cardSelect },
        },
      }),
      // Cards that came back in stock recently
      this.prisma.cardPrice.findMany({
        where: { inStock: true, fetchedAt: { gte: since }, ...cardWhere },
        orderBy: { fetchedAt: 'desc' },
        take: 200,
        select: {
          id: true, source: true, price: true, currency: true, inStock: true, stockQty: true, fetchedAt: true,
          card: { select: cardSelect },
        },
      }),
    ]);

    return { outOfStock, recentlyInStock, days };
  }
}
