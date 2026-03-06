import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsArray, IsEnum, Min, Max } from 'class-validator';
import { PokemonType, Supertype, Subtype, EvolutionStage, Rarity, LanguageCode } from '@prisma/client';

/**
 * 卡牌提取结果 DTO
 * 对应 Qwen-VL 模型提取的 JSON 输出
 */
export class CardExtractionDto {
  @ApiProperty({ description: '卡牌名称', example: 'リザードン ex' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'HP', example: 270, required: false })
  @IsOptional()
  @IsInt()
  hp?: number;

  @ApiProperty({ description: '属性（单个）', example: 'FIRE', required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ description: '属性列表', example: ['FIRE'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];

  @ApiProperty({ description: '子类型', example: 'Stage 2', required: false })
  @IsOptional()
  @IsString()
  subtype?: string;

  @ApiProperty({ description: '子类型列表', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subtypes?: string[];

  @ApiProperty({ description: '超类型', example: 'POKEMON', required: false })
  @IsOptional()
  @IsEnum(Supertype)
  supertype?: Supertype;

  @ApiProperty({ description: '能力列表', required: false })
  @IsOptional()
  @IsArray()
  abilities?: AbilityDto[];

  @ApiProperty({ description: '攻击列表', required: false })
  @IsOptional()
  @IsArray()
  attacks?: AttackDto[];

  @ApiProperty({ description: '弱点', required: false })
  @IsOptional()
  weakness?: WeaknessResistanceDto;

  @ApiProperty({ description: '抵抗力', required: false })
  @IsOptional()
  resistance?: WeaknessResistanceDto;

  @ApiProperty({ description: '撤退费用', example: ['COLORLESS', 'COLORLESS'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  retreatCost?: string[];

  @ApiProperty({ description: '系列代码', example: 'sv1a', required: false })
  @IsOptional()
  @IsString()
  setCode?: string;

  @ApiProperty({ description: '卡牌编号', example: '025', required: false })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiProperty({ description: '稀有度', example: 'DOUBLE_RARE', required: false })
  @IsOptional()
  @IsEnum(Rarity)
  rarity?: Rarity;

  @ApiProperty({ description: '画师', example: '5ban Graphics', required: false })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiProperty({ description: '进化阶段', required: false })
  @IsOptional()
  @IsEnum(EvolutionStage)
  evolutionStage?: EvolutionStage;

  @ApiProperty({ description: '进化自', required: false })
  @IsOptional()
  @IsString()
  evolvesFrom?: string;

  @ApiProperty({ description: '进化后', required: false })
  @IsOptional()
  @IsString()
  evolvesTo?: string;

  @ApiProperty({ description: ' flavor 文本', required: false })
  @IsOptional()
  @IsString()
  flavorText?: string;
}

/**
 * 能力 DTO
 */
export class AbilityDto {
  @ApiProperty({ description: '能力名称', example: 'ようがんポケモン' })
  @IsString()
  name: string;

  @ApiProperty({ description: '能力效果', example: 'このポケモンは、バトル場に出したターンに、相手のポケモンにワザを使うことができる。' })
  @IsString()
  effect: string;

  @ApiProperty({ description: '能力类型（特性/等等）', required: false })
  @IsOptional()
  @IsString()
  type?: string;
}

/**
 * 攻击 DTO
 */
export class AttackDto {
  @ApiProperty({ description: '攻击名称', example: 'かえんほうしゃ' })
  @IsString()
  name: string;

  @ApiProperty({ description: '能量费用', example: ['FIRE', 'FIRE', 'COLORLESS'] })
  @IsArray()
  @IsString({ each: true })
  cost: string[];

  @ApiProperty({ description: '伤害', example: '120' })
  @IsString()
  damage: string;

  @ApiProperty({ description: '攻击效果', required: false })
  @IsOptional()
  @IsString()
  effect?: string;
}

/**
 * 弱点/抵抗力 DTO
 */
export class WeaknessResistanceDto {
  @ApiProperty({ description: '属性', example: 'WATER' })
  @IsString()
  type: string;

  @ApiProperty({ description: '倍率/值', example: '×2' })
  @IsString()
  value: string;
}

/**
 * 提取响应 DTO
 */
export class ExtractionResponseDto {
  @ApiProperty({ description: '是否成功', example: true })
  success: boolean;

  @ApiProperty({ description: '提取的数据', required: false })
  data?: CardExtractionDto;

  @ApiProperty({ description: '置信度分数', example: 0.92 })
  confidence: number;

  @ApiProperty({ description: '推理时间（毫秒）', example: 850 })
  inference_time_ms: number;

  @ApiProperty({ description: '警告信息', required: false })
  warnings?: string[];

  @ApiProperty({ description: '错误信息', required: false })
  error?: string;
}

/**
 * 批量提取请求 DTO
 */
export class BatchExtractionRequestDto {
  @ApiProperty({ description: 'Base64 编码的图像列表' })
  @IsArray()
  @IsString({ each: true })
  images: string[];

  @ApiPropertyOptional({ description: '语言', example: 'en-US', default: 'en-US' })
  @IsOptional()
  @IsString()
  language?: string;
}

/**
 * 批量提取响应 DTO
 */
export class BatchExtractionResponseDto {
  @ApiProperty({ description: '是否成功' })
  success: boolean;

  @ApiProperty({ description: '提取结果列表', type: [ExtractionResponseDto] })
  results: ExtractionResponseDto[];

  @ApiProperty({ description: '总耗时（毫秒）' })
  total_time_ms: number;
}

/**
 * 低置信度标记 DTO
 */
export class LowConfidenceFlagDto {
  @ApiProperty({ description: '字段名称' })
  field: string;

  @ApiProperty({ description: '提取的值' })
  extractedValue: string;

  @ApiProperty({ description: '置信度分数' })
  confidence: number;

  @ApiProperty({ description: '建议操作', example: 'manual_review' })
  suggestedAction: string;
}
