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
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { DecksService } from './decks.service';
import { CreateDeckDto, DeckCardInputDto } from './dto/create-deck.dto';
import { FindAllDecksDto } from './dto/find-all-decks.dto';

@ApiTags('decks')
@Controller('decks')
export class DecksController {
  constructor(private readonly decksService: DecksService) {}

  @Get()
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'List decks' })
  findAll(@Query() query: FindAllDecksDto) {
    return this.decksService.findAll(query);
  }

  @Get(':id')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get deck with all cards' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string) {
    return this.decksService.findOne(id);
  }

  @Post()
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Create a deck' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDeckDto) {
    return this.decksService.create(dto);
  }

  @Post(':id/cards')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Add/update cards in a deck' })
  addCards(@Param('id') id: string, @Body() cards: DeckCardInputDto[]) {
    return this.decksService.addCards(id, cards);
  }

  @Delete(':id/cards/:cardId')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Remove a card from a deck' })
  @HttpCode(HttpStatus.OK)
  removeCard(@Param('id') id: string, @Param('cardId') cardId: string) {
    return this.decksService.removeCard(id, cardId);
  }

  @Delete(':id')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Delete a deck' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.decksService.remove(id);
  }
}
