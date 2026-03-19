import { Module } from '@nestjs/common';
import { DecksController } from './decks.controller';
import { DecksService } from './decks.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [DecksController],
  providers: [DecksService, PrismaService],
  exports: [DecksService],
})
export class DecksModule {}
