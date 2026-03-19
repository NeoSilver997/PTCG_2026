import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, ValidateNested, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeckCardInputDto {
  @ApiProperty()
  @IsString()
  cardId: string;

  @ApiProperty({ minimum: 1, maximum: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  quantity: number;
}

export class CreateDeckDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'TOOLBOX', 'OTHER'] })
  @IsOptional()
  @IsEnum(['AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'TOOLBOX', 'OTHER'])
  archetype?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isPublic?: boolean = false;

  @ApiPropertyOptional({ type: [DeckCardInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeckCardInputDto)
  cards?: DeckCardInputDto[];
}
