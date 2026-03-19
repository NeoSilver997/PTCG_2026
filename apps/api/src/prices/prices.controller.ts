import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { PricesService } from './prices.service';
import { UpsertPriceDto } from './dto/upsert-price.dto';

@ApiTags('prices')
@Controller('prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get('movers')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get top price movers in the last 7 days' })
  @ApiQuery({ name: 'take', required: false, type: Number })
  getTopMovers(@Query('take') take?: string) {
    return this.pricesService.getTopMovers(take ? parseInt(take, 10) : 20);
  }

  @Get(':webCardId')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get current prices for a card' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  findByCard(@Param('webCardId') webCardId: string) {
    return this.pricesService.findByCard(webCardId);
  }

  @Get(':webCardId/history')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get price history for a card' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getHistory(@Param('webCardId') webCardId: string, @Query('days') days?: string) {
    return this.pricesService.getHistory(webCardId, days ? parseInt(days, 10) : 30);
  }

  @Post()
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Upsert a card price' })
  @HttpCode(HttpStatus.OK)
  upsert(@Body() dto: UpsertPriceDto) {
    return this.pricesService.upsertPrice(dto);
  }
}
