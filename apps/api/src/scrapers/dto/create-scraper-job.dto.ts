import { IsEnum, IsOptional, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScraperJobDto {
  @ApiProperty({ enum: ['HK', 'JP', 'EN'], description: 'Region to scrape' })
  @IsEnum(['HK', 'JP', 'EN'])
  source: string;

  @ApiPropertyOptional({ default: 50, description: 'How many recent events to skip (already scraped)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  skipRecentCount?: number = 50;

  @ApiPropertyOptional({ default: false, description: 'Force re-import of already-imported events' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  forceReimport?: boolean = false;
}
