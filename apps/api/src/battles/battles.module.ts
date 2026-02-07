import { Module } from '@nestjs/common';
import { BattlesController } from './battles.controller';
import { BattlesService } from './battles.service';
import { BattleLogParser } from './battle-log-parser';
import { PrismaService } from '../common/prisma.service';

@Module({
  controllers: [BattlesController],
  providers: [BattlesService, BattleLogParser, PrismaService],
  exports: [BattlesService],
})
export class BattlesModule {}
