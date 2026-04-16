import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertPriceDto {
  @ApiProperty({ description: 'The card webCardId' })
  @IsString()
  webCardId: string;

  @ApiProperty({ enum: ['YUYU_TEI', 'HARERUYA', 'CARDMARKET', 'TCGPLAYER', 'OTHER', 'USER'] })
  @IsEnum(['YUYU_TEI', 'HARERUYA', 'CARDMARKET', 'TCGPLAYER', 'OTHER', 'USER'])
  source: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ default: 'JPY' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ description: 'Card condition (NM, LP, MP, HP, etc.)' })
  @IsOptional()
  @IsString()
  condition?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  inStock?: boolean = true;

  @ApiPropertyOptional({ description: 'Stock quantity (number of units available)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockQty?: number;
}
