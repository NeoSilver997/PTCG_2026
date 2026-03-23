import {
  Controller,
  Get,
  Post,
  Put,
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

  /* ── Pokémon role overrides — MUST be declared BEFORE generic :id routes ── */

  @Get('roles/lookup')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Lookup last-used roles for a set of cards across all decks (for cross-deck presets)' })
  lookupCardRoles(@Query('cards') cards: string) {
    const cardIds = (cards ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.decksService.lookupCardRoles(cardIds);
  }

  @Get('code/:deckCode/roles')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get all Pokémon role overrides for an event deck' })
  getRoles(@Param('deckCode') deckCode: string) {
    return this.decksService.getRolesForDeck(deckCode);
  }

  @Put('code/:deckCode/roles/:cardId')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Upsert a Pokémon role override for one card in an event deck' })
  upsertRole(
    @Param('deckCode') deckCode: string,
    @Param('cardId') cardId: string,
    @Body('role') role: string,
  ) {
    return this.decksService.upsertRole(deckCode, cardId, role);
  }

  @Delete('code/:deckCode/roles/:cardId')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Clear a Pokémon role override (reverts to heuristic)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  clearRole(
    @Param('deckCode') deckCode: string,
    @Param('cardId') cardId: string,
  ) {
    return this.decksService.clearRole(deckCode, cardId);
  }

  @Get('code/:deckCode')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get deck by original deck code' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOneByCode(@Param('deckCode') deckCode: string) {
    return this.decksService.findOneByCode(deckCode);
  }

  /* ── General deck CRUD ──────────────────────────────────────── */

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
