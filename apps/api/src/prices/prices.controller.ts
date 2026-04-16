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

  @Get()
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'List cards with prices (paginated)' })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['price', 'fetchedAt'] })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'name', required: false, type: String })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean })
  @ApiQuery({ name: 'minPrice', required: false, type: Number, description: 'Hide prices below this value' })
  @ApiQuery({ name: 'regulationMarks', required: false, type: String, description: 'Comma-separated regulation marks e.g. H,I,J' })
  listRecent(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('name') name?: string,
    @Query('inStock') inStock?: string,
    @Query('minPrice') minPrice?: string,
    @Query('regulationMarks') regulationMarks?: string,
  ) {
    const validSortBy = sortBy === 'price' ? 'price' : 'fetchedAt';
    const validSortDir = sortDir === 'asc' ? 'asc' : 'desc';
    const inStockFilter =
      inStock === 'true' ? true : inStock === 'false' ? false : undefined;
    const minPriceFilter = minPrice ? parseFloat(minPrice) : undefined;
    const regulationMarksFilter = regulationMarks
      ? regulationMarks.split(',').map((m) => m.trim()).filter(Boolean)
      : undefined;
    return this.pricesService.listRecent(
      take ? parseInt(take, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
      validSortBy,
      validSortDir,
      name || undefined,
      inStockFilter,
      minPriceFilter,
      regulationMarksFilter,
    );
  }

  @Get('movers')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get top price movers within a date window' })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'minChangePct', required: false, type: Number, description: 'Min % change (e.g. 100 = over +100%)' })
  @ApiQuery({ name: 'maxChangePct', required: false, type: Number, description: 'Max % change (e.g. -100 = below -100%)' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Look-back window in days (default 28)' })
  @ApiQuery({ name: 'supertype', required: false, type: String, description: 'Filter by card supertype: POKEMON, TRAINER, ENERGY' })
  @ApiQuery({ name: 'pokemonType', required: false, type: String, description: 'Filter by Pokemon type: FIRE, WATER, etc.' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['change', 'price'], description: 'Sort by change% (default) or current price' })
  @ApiQuery({ name: 'regulationMarks', required: false, type: String, description: 'Comma-separated regulation marks e.g. H,I,J' })
  getTopMovers(
    @Query('take') take?: string,
    @Query('minChangePct') minChangePct?: string,
    @Query('maxChangePct') maxChangePct?: string,
    @Query('days') days?: string,
    @Query('supertype') supertype?: string,
    @Query('pokemonType') pokemonType?: string,
    @Query('sortBy') sortBy?: string,
    @Query('regulationMarks') regulationMarks?: string,
  ) {
    const regulationMarksFilter = regulationMarks
      ? regulationMarks.split(',').map((m) => m.trim()).filter(Boolean)
      : undefined;
    return this.pricesService.getTopMovers(
      take ? parseInt(take, 10) : 300,
      minChangePct !== undefined ? parseFloat(minChangePct) : undefined,
      maxChangePct !== undefined ? parseFloat(maxChangePct) : undefined,
      days ? parseInt(days, 10) : 28,
      supertype || undefined,
      pokemonType || undefined,
      sortBy === 'price' ? 'price' : 'change',
      regulationMarksFilter,
    );
  }

  @Get('stock-changes')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get out-of-stock cards and recently restocked cards' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Days window for recently restocked (default 14)' })
  @ApiQuery({ name: 'regulationMarks', required: false, type: String, description: 'Comma-separated regulation marks e.g. H,I,J' })
  getStockChanges(@Query('days') days?: string, @Query('regulationMarks') regulationMarks?: string) {
    const regulationMarksFilter = regulationMarks
      ? regulationMarks.split(',').map((m) => m.trim()).filter(Boolean)
      : undefined;
    return this.pricesService.getStockChanges(days ? parseInt(days, 10) : 14, regulationMarksFilter);
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
