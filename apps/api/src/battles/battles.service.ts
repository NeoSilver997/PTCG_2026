import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BattleLogParser } from './battle-log-parser';
import { CreateBattleLogDto } from './dto/create-battle-log.dto';
import { BattleLogQueryDto } from './dto/battle-log-query.dto';
import { BattleLogDTO } from '@ptcg/shared-types';

@Injectable()
export class BattlesService {
  private readonly logger = new Logger(BattlesService.name);

  constructor(
    private prisma: PrismaService,
    private parser: BattleLogParser,
  ) {}

  async create(createDto: CreateBattleLogDto): Promise<BattleLogDTO> {
    this.logger.log('Parsing battle log...');
    
    // Parse the raw log and extract deck lists
    const { metadata, actions, player1Deck, player2Deck } = await this.parser.parseLogText(createDto.rawLog);
    
    // Create battle log in database
    const battleLog = await this.prisma.battleLog.create({
      data: {
        matchTitle: `${metadata.player1Name} vs ${metadata.player2Name}`,
        player1Name: metadata.player1Name,
        player2Name: metadata.player2Name,
        player1Deck: player1Deck as any,
        player2Deck: player2Deck as any,
        winnerName: metadata.winnerName,
        turnCount: metadata.turnCount,
        actions: actions as any,
        rawLog: createDto.rawLog,
        tournamentResultId: createDto.tournamentResultId,
      },
    });
    
    this.logger.log(`Created battle log: ${battleLog.id} with ${player1Deck.length} and ${player2Deck.length} unique cards`);
    
    return this.toDTO(battleLog);
  }

  async findAll(query: BattleLogQueryDto): Promise<{ data: BattleLogDTO[]; total: number }> {
    const where: any = {};
    
    if (query.player1Name) {
      where.player1Name = { contains: query.player1Name, mode: 'insensitive' };
    }
    
    if (query.player2Name) {
      where.player2Name = { contains: query.player2Name, mode: 'insensitive' };
    }
    
    if (query.playerName) {
      where.OR = [
        { player1Name: { contains: query.playerName, mode: 'insensitive' } },
        { player2Name: { contains: query.playerName, mode: 'insensitive' } },
      ];
    }
    
    if (query.tournamentId) {
      where.tournamentResult = {
        tournamentId: query.tournamentId,
      };
    }
    
    const [battleLogs, total] = await Promise.all([
      this.prisma.battleLog.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.battleLog.count({ where }),
    ]);
    
    return {
      data: battleLogs.map((log) => this.toDTO(log)),
      total,
    };
  }

  async findOne(id: string): Promise<BattleLogDTO> {
    const battleLog = await this.prisma.battleLog.findUnique({
      where: { id },
    });
    
    if (!battleLog) {
      throw new NotFoundException(`Battle log with ID ${id} not found`);
    }
    
    return this.toDTO(battleLog);
  }

  async findByTournament(tournamentId: string): Promise<BattleLogDTO[]> {
    const battleLogs = await this.prisma.battleLog.findMany({
      where: {
        tournamentResult: {
          tournamentId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    return battleLogs.map((log) => this.toDTO(log));
  }

  async remove(id: string): Promise<void> {
    await this.prisma.battleLog.delete({
      where: { id },
    });
  }

  private toDTO(battleLog: any): BattleLogDTO {
    return {
      id: battleLog.id,
      matchTitle: battleLog.matchTitle,
      player1Name: battleLog.player1Name,
      player2Name: battleLog.player2Name,
      player1Deck: battleLog.player1Deck as any,
      player2Deck: battleLog.player2Deck as any,
      winnerName: battleLog.winnerName,
      turnCount: battleLog.turnCount,
      durationSeconds: battleLog.durationSeconds,
      actions: battleLog.actions as any,
      createdAt: battleLog.createdAt.toISOString(),
      updatedAt: battleLog.updatedAt.toISOString(),
      tournamentResultId: battleLog.tournamentResultId,
    };
  }
}
