import { IsArray, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class JapaneseCardDto {
  @ApiProperty({ example: 'jp47009' })
  @IsNotEmpty()
  webCardId: string;

  @ApiProperty({ example: 'キャタピー' })
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'sv9' })
  @IsNotEmpty()
  expansionCode: string;

  @ApiProperty({ example: '001', required: false })
  cardNumber?: string;

  @ApiProperty({ example: '001/100', required: false })
  collectorNumber?: string;

  @ApiProperty({ example: 'ポケモン', required: false })
  supertype?: string;

  @ApiProperty({ example: ['たねポケモン'], required: false, isArray: true })
  subtypes?: string[];

  @ApiProperty({ example: 'たね', required: false })
  evolutionStage?: string;

  @ApiProperty({ example: 'VMAX', required: false })
  ruleBox?: string;

  @ApiProperty({ example: '40', required: false })
  hp?: string;

  @ApiProperty({ example: ['GRASS'], required: false, isArray: true })
  types?: string[];

  @ApiProperty({ example: ['GRASS'], required: false, isArray: true })
  pokemonTypes?: string[];

  @ApiProperty({ required: false })
  abilities?: any[];

  @ApiProperty({ required: false })
  attacks?: any[];

  @ApiProperty({ required: false, isArray: true })
  rules?: string[];

  @ApiProperty({ required: false })
  flavorText?: string;

  @ApiProperty({ required: false })
  artist?: string;

  @ApiProperty({ example: 'C', required: false })
  rarity?: string;

  @ApiProperty({ example: 'G', required: false })
  regulationMark?: string;

  @ApiProperty({ required: false })
  imageUrl?: string;

  @ApiProperty({ required: false })
  imageUrlHiRes?: string;

  @ApiProperty({ required: false })
  variantType?: string;

  @ApiProperty({ required: false })
  language?: string;

  @ApiProperty({ required: false })
  region?: string;

  @ApiProperty({ required: false })
  sourceUrl?: string;

  @ApiProperty({ required: false })
  scrapedAt?: string;

  @ApiProperty({ required: false })
  pokedexNumber?: number;

  @ApiProperty({ required: false })
  weakness?: any;

  @ApiProperty({ required: false })
  retreatCost?: number;
}

export class ImportJapaneseCardsDto {
  @ApiProperty({ type: [JapaneseCardDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JapaneseCardDto)
  cards: JapaneseCardDto[];
}
