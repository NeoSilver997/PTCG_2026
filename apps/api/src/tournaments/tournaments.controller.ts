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
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TournamentsService } from './tournaments.service';
import { FindAllTournamentsDto } from './dto/find-all-tournaments.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';

@ApiTags('tournaments')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get()
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'List all tournaments with filters' })
  @ApiResponse({ status: 200, description: 'Paginated tournament list' })
  findAll(@Query() query: FindAllTournamentsDto) {
    return this.tournamentsService.findAll(query);
  }

  @Get('trends/card-usage')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get 2-week card usage trend by category' })
  @ApiResponse({ status: 200, description: 'Card usage trend summary' })
  getCardUsageTrend(
    @Query('periods') periods?: string,
    @Query('region') region?: string,
  ) {
    return this.tournamentsService.getCardUsageTrend(periods, region);
  }

  @Get('meta/deck-summary')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get deck meta-analysis with archetypes and top cards' })
  @ApiResponse({ status: 200, description: 'Deck meta-summary with archetypes' })
  getDeckMetaSummary(
    @Query('region') region?: string,
    @Query('limit') limit?: string,
    @Query('sinceDate') sinceDate?: string,
  ) {
    return this.tournamentsService.getDeckMetaSummary(region, limit, sinceDate);
  }

  @Get('event/:eventId')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get tournament by external event ID with results and decks' })
  @ApiResponse({ status: 200, description: 'Tournament detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findByEventId(@Param('eventId') eventId: string): Promise<any> {
    return this.tournamentsService.findByEventId(eventId);
  }

  @Get(':id')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get tournament with all results and decks' })
  @ApiResponse({ status: 200, description: 'Tournament detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string): Promise<any> {
    return this.tournamentsService.findOne(id);
  }

  @Post()
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Create a tournament' })
  @ApiResponse({ status: 201, description: 'Tournament created' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(dto);
  }

  @Post('batch')
  @Throttle({ medium: { limit: 5, ttl: 10000 } })
  @ApiOperation({ summary: 'Batch upsert tournaments (used by scraper)' })
  @ApiResponse({ status: 201, description: 'Batch result' })
  @HttpCode(HttpStatus.CREATED)
  upsertMany(@Body() dto: CreateTournamentDto[]) {
    return this.tournamentsService.upsertMany(dto);
  }
}
