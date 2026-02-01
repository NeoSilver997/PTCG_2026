import { IsOptional, IsString, IsInt, Min, Max, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { LanguageCode } from '@ptcg/database';

export class FindAllCardsDto {
  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiProperty({ required: false, example: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 50;

  // Sorting
  @ApiProperty({ required: false, enum: ['name', 'hp', 'createdAt', 'updatedAt', 'rarity', 'supertype'] })
  @IsOptional()
  @IsIn(['name', 'hp', 'createdAt', 'updatedAt', 'rarity', 'supertype'])
  sortBy?: string;

  @ApiProperty({ required: false, enum: ['asc', 'desc'], example: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  // Existing filters
  @ApiProperty({ required: false, example: 'JA_JP' })
  @IsOptional()
  @IsString()
  language?: LanguageCode;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  expansionCode?: string;

  @ApiProperty({ required: false, example: 'ピカチュウ' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, example: 'POKEMON' })
  @IsOptional()
  @IsString()
  supertype?: string;

  @ApiProperty({ required: false, example: 'GRASS' })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiProperty({ required: false, example: 'COMMON' })
  @IsOptional()
  @IsString()
  rarity?: string;

  // New advanced filters
  @ApiProperty({ required: false, example: 'BASIC' })
  @IsOptional()
  @IsString()
  subtypes?: string;

  @ApiProperty({ required: false, example: 'V' })
  @IsOptional()
  @IsString()
  ruleBox?: string;

  @ApiProperty({ required: false, example: 'HOLO' })
  @IsOptional()
  @IsString()
  variantType?: string;

  @ApiProperty({ required: false, example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minHp?: number;

  @ApiProperty({ required: false, example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxHp?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiProperty({ required: false, example: 'H' })
  @IsOptional()
  @IsString()
  regulationMark?: string;

  @ApiProperty({ required: false, type: Boolean })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasAbilities?: boolean;

  @ApiProperty({ required: false, type: Boolean })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hasAttacks?: boolean;
}
