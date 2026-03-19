import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CollectionsService } from './collections.service';
import { UpsertCollectionItemDto } from './dto/upsert-collection-item.dto';

// Placeholder until auth is complete — all requests use 'default' user
const DEFAULT_USER_ID = 'default';

@ApiTags('inventory')
@Controller('inventory')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get current user inventory' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  getItems(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.collectionsService.getItems(
      DEFAULT_USER_ID,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Post()
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Add or update a card in inventory (quantity 0 = remove)' })
  @HttpCode(HttpStatus.OK)
  upsert(@Body() dto: UpsertCollectionItemDto) {
    return this.collectionsService.upsertItem(DEFAULT_USER_ID, dto);
  }

  @Delete(':cardId')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Remove a card from inventory' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('cardId') cardId: string) {
    return this.collectionsService.removeItem(DEFAULT_USER_ID, cardId);
  }
}
