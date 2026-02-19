import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  price?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  releaseDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  code?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  productType?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  link?: string | null;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  include?: string | null;

  @IsOptional()
  @IsBoolean()
  cardOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  beginnerFlag?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === null ? null : String(value))
  @IsString()
  storesAvailable?: string | null;
}