import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTournamentDto {
  @ApiProperty({ description: 'Unique event ID from source website' })
  @IsString()
  eventId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: ['CHAMPIONSHIP', 'REGIONAL', 'SPECIAL_EVENT', 'STORE_TOURNAMENT', 'ONLINE_EVENT'] })
  @IsOptional()
  @IsEnum(['CHAMPIONSHIP', 'REGIONAL', 'SPECIAL_EVENT', 'STORE_TOURNAMENT', 'ONLINE_EVENT'])
  type?: string;

  @ApiProperty({ description: 'Event date (ISO 8601)' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: ['HK', 'JP', 'EN'] })
  @IsOptional()
  @IsEnum(['HK', 'JP', 'EN'])
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  playerCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ageGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  sourceUrl?: string;
}
