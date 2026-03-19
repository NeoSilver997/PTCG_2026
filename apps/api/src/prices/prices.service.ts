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
      select: { id: true, name: true, webCardId: true },
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

  async getTopMovers(take = 20) {
    // Cards with biggest price change in last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const history = await this.prisma.priceHistory.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Look up cards by id for all unique cardIds
    const uniqueCardIds = [...new Set(history.map((h) => h.cardId))];
    const cards = await this.prisma.card.findMany({
      where: { id: { in: uniqueCardIds } },
      select: { id: true, webCardId: true, name: true, imageUrl: true },
    });
    const cardMap = new Map(cards.map((c) => [c.id, c]));

    // Group by card+source, compute % change
    const groups = new Map<string, { first: number; last: number; card: any; source: string }>();

    for (const h of history) {
      const key = `${h.cardId}__${h.source}`;
      const card = cardMap.get(h.cardId);
      if (!groups.has(key)) {
        groups.set(key, { first: h.price, last: h.price, card, source: h.source });
      } else {
        groups.get(key)!.last = h.price;
      }
    }

    return Array.from(groups.values())
      .map((g) => ({
        card: g.card,
        source: g.source,
        firstPrice: g.first,
        lastPrice: g.last,
        changePct: g.first > 0 ? ((g.last - g.first) / g.first) * 100 : 0,
      }))
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, take);
  }
}
