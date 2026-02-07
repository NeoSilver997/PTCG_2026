import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BattlesService } from './battles.service';
import { CreateBattleLogDto } from './dto/create-battle-log.dto';
import { BattleLogQueryDto } from './dto/battle-log-query.dto';

@ApiTags('battles')
@Controller('battles')
export class BattlesController {
  constructor(private readonly battlesService: BattlesService) {}

  @Post()
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @ApiOperation({ summary: 'Create a new battle log from raw text' })
  @ApiResponse({ status: 201, description: 'Battle log created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async create(@Body() createDto: CreateBattleLogDto) {
    return this.battlesService.create(createDto);
  }

  @Get()
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get all battle logs with optional filters' })
  @ApiResponse({ status: 200, description: 'Returns paginated battle logs' })
  async findAll(@Query() query: BattleLogQueryDto) {
    const { data, total } = await this.battlesService.findAll(query);
    return {
      data,
      meta: {
        total,
        skip: query.skip || 0,
        take: query.take || 50,
        hasMore: (query.skip || 0) + data.length < total,
      },
    };
  }

  @Get('tournament/:tournamentId')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get all battle logs for a tournament' })
  @ApiResponse({ status: 200, description: 'Returns battle logs for tournament' })
  async findByTournament(@Param('tournamentId') tournamentId: string) {
    return this.battlesService.findByTournament(tournamentId);
  }

  @Get(':id')
  @Throttle({ long: { limit: 100, ttl: 60000 } })
  @ApiOperation({ summary: 'Get a battle log by ID' })
  @ApiResponse({ status: 200, description: 'Returns battle log details' })
  @ApiResponse({ status: 404, description: 'Battle log not found' })
  async findOne(@Param('id') id: string) {
    return this.battlesService.findOne(id);
  }

  @Delete(':id')
  @Throttle({ medium: { limit: 20, ttl: 10000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a battle log' })
  @ApiResponse({ status: 204, description: 'Battle log deleted successfully' })
  @ApiResponse({ status: 404, description: 'Battle log not found' })
  async remove(@Param('id') id: string) {
    await this.battlesService.remove(id);
  }
}
