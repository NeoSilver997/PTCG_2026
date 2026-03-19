import { Module } from '@nestjs/common';
import { ScrapersController } from './scrapers.controller';
import { ScrapersService } from './scrapers.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [ScrapersController],
  providers: [ScrapersService, PrismaService],
  exports: [ScrapersService],
})
export class ScrapersModule {}
