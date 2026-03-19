import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum Region {
  HK = 'HK',
  JP = 'JP',
  EN = 'EN',
}

export enum TournamentType {
  CHAMPIONSHIP = 'CHAMPIONSHIP',
  REGIONAL = 'REGIONAL',
  SPECIAL_EVENT = 'SPECIAL_EVENT',
  STORE_TOURNAMENT = 'STORE_TOURNAMENT',
  ONLINE_EVENT = 'ONLINE_EVENT',
}

export class FindAllTournamentsDto {
  @ApiPropertyOptional({ enum: Region })
  @IsOptional()
  @IsEnum(Region)
  region?: Region;

  @ApiPropertyOptional({ enum: TournamentType })
  @IsOptional()
  @IsEnum(TournamentType)
  type?: TournamentType;

  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Search by tournament name or location' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;
}
