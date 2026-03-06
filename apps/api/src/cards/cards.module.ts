import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller';
import { CardsVlController } from './cards-vl.controller';
import { CardsService } from './cards.service';
import { QwenVlService } from './qwen-vl.service';
import { PrismaService } from '../common/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [CardsController, CardsVlController],
  providers: [CardsService, QwenVlService, PrismaService],
  exports: [CardsService, QwenVlService],
})
export class CardsModule {}
