import { Module } from '@nestjs/common';
import { DecksController } from './decks.controller';
import { DecksService } from './decks.service';
import { DeckPriceCacheService } from './deck-price-cache.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [DecksController],
  providers: [DecksService, DeckPriceCacheService, PrismaService],
  exports: [DecksService, DeckPriceCacheService],
})
export class DecksModule {}
