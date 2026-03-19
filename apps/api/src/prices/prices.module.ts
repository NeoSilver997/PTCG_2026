import { Module } from '@nestjs/common';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [PricesController],
  providers: [PricesService, PrismaService],
  exports: [PricesService],
})
export class PricesModule {}
