import { IsOptional, IsString, IsArray, IsEnum, IsNumber, IsBoolean, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Supertype, Subtype, Rarity, VariantType, EvolutionStage, RuleBox, PokemonType } from '@ptcg/database';

export class AbilityDto {
  @ApiProperty({ example: 'Psychic Embrace' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'ABILITY' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ example: 'As often as you like...' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({ example: 'As often as you like...' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class AttackDto {
  @ApiProperty({ example: 'Miracle Force' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: ['超', '超', '無'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cost?: string[];

  @ApiProperty({ example: '190' })
  @IsOptional()
  @IsString()
  damage?: string;

  @ApiProperty({ example: 'This Pokémon recovers...' })
  @IsOptional()
  @IsString()
  effect?: string;

  @ApiProperty({ example: 'This Pokémon recovers...' })
  @IsOptional()
  @IsString()
  text?: string;
}

export class UpdateCardDto {
  @ApiProperty({ example: 'Gardevoir ex' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'POKEMON', enum: Supertype })
  @IsOptional()
  @IsEnum(Supertype)
  supertype?: Supertype;

  @ApiProperty({ example: ['EX'], enum: Subtype, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(Subtype, { each: true })
  subtypes?: Subtype[];

  @ApiProperty({ example: 310 })
  @IsOptional()
  @IsNumber()
  hp?: number;

  @ApiProperty({ example: ['PSYCHIC'], enum: PokemonType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(PokemonType, { each: true })
  types?: PokemonType[];

  @ApiProperty({ example: 'EX', enum: RuleBox })
  @IsOptional()
  @IsEnum(RuleBox)
  ruleBox?: RuleBox;

  @ApiProperty({ example: 'COMMON', enum: Rarity })
  @IsOptional()
  @IsEnum(Rarity)
  rarity?: Rarity;

  @ApiProperty({ example: 'NORMAL', enum: VariantType })
  @IsOptional()
  @IsEnum(VariantType)
  variantType?: VariantType;

  @ApiProperty({ example: 'STAGE_2', enum: EvolutionStage })
  @IsOptional()
  @IsEnum(EvolutionStage)
  evolutionStage?: EvolutionStage;

  @ApiProperty({ example: 'Kirlia' })
  @IsOptional()
  @IsString()
  evolvesFrom?: string;

  @ApiProperty({ example: 'Gallade, Gardevoir ex' })
  @IsOptional()
  @IsString()
  evolvesTo?: string;

  @ApiProperty({ example: 'Artist Name' })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiProperty({ example: 'G' })
  @IsOptional()
  @IsString()
  regulationMark?: string;

  @ApiProperty({ example: 'https://...' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: 'https://...' })
  @IsOptional()
  @IsString()
  imageUrlHiRes?: string;

  @ApiProperty({ example: 'https://...' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiProperty({ example: 'Flavor text here' })
  @IsOptional()
  @IsString()
  flavorText?: string;

  @ApiProperty({ example: 'Card effect text' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({ example: ['Rule 1', 'Rule 2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rules?: string[];

  @ApiProperty({ type: [AbilityDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbilityDto)
  abilities?: AbilityDto[];

  @ApiProperty({ type: [AttackDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttackDto)
  attacks?: AttackDto[];
}