import { IsOptional, IsEnum, IsString, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum Region { HK = 'HK', JP = 'JP', EN = 'EN' }

export enum TournamentType {
  CHAMPIONSHIP = 'CHAMPIONSHIP', REGIONAL = 'REGIONAL',
  SPECIAL_EVENT = 'SPECIAL_EVENT', STORE_TOURNAMENT = 'STORE_TOURNAMENT', ONLINE_EVENT = 'ONLINE_EVENT',
}

export enum SortBy { DATE = 'date', PLAYERS = 'playerCount' }
export enum SortOrder { ASC = 'asc', DESC = 'desc' }

export class FindAllTournamentsDto {
  @ApiPropertyOptional({ enum: Region }) @IsOptional() @IsEnum(Region) region?: Region;
  @ApiPropertyOptional({ enum: TournamentType }) @IsOptional() @IsEnum(TournamentType) type?: TournamentType;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional({ enum: SortBy }) @IsOptional() @IsEnum(SortBy) sortBy?: SortBy;
  @ApiPropertyOptional({ enum: SortOrder }) @IsOptional() @IsEnum(SortOrder) sortOrder?: SortOrder;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number = 0;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number = 50;
}