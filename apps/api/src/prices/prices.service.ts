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
      select: { id: true, name: true, webCardId: true, imageUrl: true },
    });

    if (!card) throw new NotFoundException(`Card ${webCardId} not found`);

    const prices = await this.prisma.cardPrice.findMany({
      where: { cardId: card.id },
      orderBy: { fetchedAt: 'desc' },
    });

    return { card, prices };
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
        date: new Date(),
      },
    });

    this.logger.log(`Upserted price for ${dto.webCardId}: ${dto.price} ${dto.currency}`);
    return price;
  }

  async getHistory(webCardId: string, days = 30) {
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
  ) {
    const where: any = {};
    if (nameFilter) {
      where.card = { name: { contains: nameFilter, mode: 'insensitive' } };
    }
    if (inStock !== undefined) {
      where.inStock = inStock;
    }
    if (minPrice !== undefined && minPrice > 0) {
      where.price = { gte: minPrice };
    }

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
          fetchedAt: true,
          card: {
            select: { id: true, webCardId: true, name: true, imageUrl: true },
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
    days = 90,
    supertype?: string,
    pokemonType?: string,
    sortBy: 'change' | 'price' = 'price',
  ) {
    // Compute the start of the window
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Build optional card pre-filter for supertype / pokemonType
    const cardTypeWhere: Record<string, any> = {};
    if (supertype) cardTypeWhere['supertype'] = supertype;
    if (pokemonType) cardTypeWhere['types'] = { has: pokemonType };
    let preFilterIds: string[] | undefined;
    if (supertype || pokemonType) {
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
    const currentPrices = await this.prisma.cardPrice.findMany({
      select: { cardId: true, source: true, price: true, fetchedAt: true },
    });
    const currentMap = new Map<string, { price: number; date: Date }>();
    for (const r of currentPrices) currentMap.set(`${r.cardId}__${r.source}`, { price: r.price, date: r.fetchedAt });

    const uniqueCardIds = [...new Set(earliest.map((h) => h.cardId))];
    const cards = await this.prisma.card.findMany({
      where: { id: { in: uniqueCardIds } },
      select: { id: true, webCardId: true, name: true, imageUrl: true, supertype: true, types: true },
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
}
