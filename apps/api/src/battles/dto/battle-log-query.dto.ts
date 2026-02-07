import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class BattleLogQueryDto {
  @ApiProperty({ required: false, description: 'Player 1 name filter' })
  @IsOptional()
  @IsString()
  player1Name?: string;

  @ApiProperty({ required: false, description: 'Player 2 name filter' })
  @IsOptional()
  @IsString()
  player2Name?: string;

  @ApiProperty({ required: false, description: 'Search either player name' })
  @IsOptional()
  @IsString()
  playerName?: string;

  @ApiProperty({ required: false, description: 'Tournament ID filter' })
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiProperty({ required: false, default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiProperty({ required: false, default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;
}
