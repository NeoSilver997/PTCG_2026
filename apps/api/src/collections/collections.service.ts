import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpsertCollectionItemDto } from './dto/upsert-collection-item.dto';

const DEFAULT_COLLECTION_NAME = 'My Collection';

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(private prisma: PrismaService) {}

  private async getOrCreateCollection(userId: string) {
    let collection = await this.prisma.collection.findUnique({
      where: { userId_name: { userId, name: DEFAULT_COLLECTION_NAME } },
    });

    if (!collection) {
      collection = await this.prisma.collection.create({
        data: { userId, name: DEFAULT_COLLECTION_NAME },
      });
      this.logger.log(`Created default collection for user ${userId}`);
    }

    return collection;
  }

  async getItems(userId: string, skip = 0, take = 50) {
    const collection = await this.getOrCreateCollection(userId);

    const [items, total] = await Promise.all([
      this.prisma.collectionItem.findMany({
        where: { collectionId: collection.id },
        skip,
        take,
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
            },
          },
        },
        orderBy: { card: { name: 'asc' } },
      }),
      this.prisma.collectionItem.count({ where: { collectionId: collection.id } }),
    ]);

    return { data: items, meta: { total, skip, take, collectionId: collection.id } };
  }

  async upsertItem(userId: string, dto: UpsertCollectionItemDto) {
    const collection = await this.getOrCreateCollection(userId);

    // Resolve card by webCardId
    const card = await this.prisma.card.findUnique({
      where: { webCardId: dto.cardId },
      select: { id: true },
    });

    if (!card) throw new NotFoundException(`Card ${dto.cardId} not found`);

    if (dto.quantity === 0) {
      // Remove from collection
      await this.prisma.collectionItem.deleteMany({
        where: { collectionId: collection.id, cardId: card.id },
      });
      return { removed: true };
    }

    const item = await this.prisma.collectionItem.upsert({
      where: { collectionId_cardId: { collectionId: collection.id, cardId: card.id } },
      create: {
        collectionId: collection.id,
        cardId: card.id,
        quantity: dto.quantity,
        condition: dto.condition,
        notes: dto.notes,
      },
      update: {
        quantity: dto.quantity,
        condition: dto.condition,
        notes: dto.notes,
      },
    });

    return item;
  }

  async removeItem(userId: string, cardId: string) {
    const collection = await this.getOrCreateCollection(userId);

    const card = await this.prisma.card.findUnique({
      where: { webCardId: cardId },
      select: { id: true },
    });

    if (!card) throw new NotFoundException(`Card ${cardId} not found`);

    await this.prisma.collectionItem.deleteMany({
      where: { collectionId: collection.id, cardId: card.id },
    });
  }
}
