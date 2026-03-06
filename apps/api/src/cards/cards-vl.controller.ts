import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CardsService } from './cards.service';
import { QwenVlService } from './qwen-vl.service';
import {
  ExtractionResponseDto,
  BatchExtractionRequestDto,
  BatchExtractionResponseDto,
} from './dto/card-extraction.dto';
import { UpdateCardDto } from './dto/update-card.dto';

/**
 * Qwen-VL 卡牌提取控制器
 * 
 * 提供基于视觉语言模型的卡牌图像文本提取功能
 */
@ApiTags('cards/vl')
@Controller('cards/vl')
export class CardsVlController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly qwenVlService: QwenVlService,
  ) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  @ApiOperation({ 
    summary: '从卡牌图像提取信息',
    description: '使用 Qwen-VL 模型从上传的卡牌图像中提取文本信息，返回结构化 JSON 数据'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: '卡牌图像文件（JPG/PNG）',
        },
        language: {
          type: 'string',
          enum: ['ja-JP', 'zh-HK', 'en-US'],
          default: 'en-US',
          description: '期望的输出语言',
        },
        autoSave: {
          type: 'boolean',
          default: false,
          description: '是否自动保存到数据库',
        },
      },
    },
  })
  @ApiQuery({
    name: 'language',
    required: false,
    enum: ['ja-JP', 'zh-HK', 'en-US'],
    description: '期望的输出语言',
  })
  @ApiQuery({
    name: 'autoSave',
    required: false,
    type: Boolean,
    description: '是否自动保存到数据库',
  })
  @ApiResponse({ 
    status: 200, 
    description: '提取成功',
    type: ExtractionResponseDto,
  })
  @ApiResponse({ status: 400, description: '无效的图像文件' })
  @ApiResponse({ status: 503, description: '推理服务不可用' })
  async extractFromImage(
    @UploadedFile() image: Express.Multer.File,
    @Query('language') language: string = 'en-US',
    @Query('autoSave') autoSave: boolean = false,
  ): Promise<ExtractionResponseDto> {
    // 验证文件
    if (!image) {
      throw new BadRequestException('请上传图像文件');
    }

    if (!image.mimetype.startsWith('image/')) {
      throw new BadRequestException('必须是图像文件');
    }

    // 限制文件大小（10MB）
    const maxSize = 10 * 1024 * 1024;
    if (image.size > maxSize) {
      throw new BadRequestException(`图像文件过大，最大 ${maxSize / 1024 / 1024}MB`);
    }

    try {
      // 调用 Qwen-VL 服务提取
      const result = await this.qwenVlService.extractFromImage(
        image.buffer,
        language,
      );

      // 如果启用自动保存且提取成功
      if (autoSave && result.success && result.data) {
        try {
          await this.saveExtractionToDatabase(result.data, language);
        } catch (saveError) {
          this.cardsService['logger'].warn(
            `自动保存提取结果失败：${saveError.message}`,
          );
          result.warnings = result.warnings || [];
          result.warnings.push(`保存到数据库失败：${saveError.message}`);
        }
      }

      return result;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new ServiceUnavailableException('推理服务不可用，请稍后重试');
      }
      throw error;
    }
  }

  @Post('extract/base64')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '从 Base64 图像提取卡牌信息',
    description: '接受 Base64 编码的图像数据进行提取'
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['imageBase64'],
      properties: {
        imageBase64: {
          type: 'string',
          description: 'Base64 编码的图像数据',
        },
        language: {
          type: 'string',
          enum: ['ja-JP', 'zh-HK', 'en-US'],
          default: 'en-US',
        },
      },
    },
  })
  @ApiResponse({ 
    status: 200, 
    description: '提取成功',
    type: ExtractionResponseDto,
  })
  async extractFromBase64(
    @Body('imageBase64') imageBase64: string,
    @Body('language') language: string = 'en-US',
  ): Promise<ExtractionResponseDto> {
    if (!imageBase64) {
      throw new BadRequestException('请提供 Base64 图像数据');
    }

    // 解码 Base64
    let imageBuffer: Buffer;
    try {
      // 处理可能的 data URL 前缀
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    } catch (error) {
      throw new BadRequestException('无效的 Base64 图像数据');
    }

    return await this.qwenVlService.extractFromImage(imageBuffer, language);
  }

  @Post('extract/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '批量提取卡牌信息',
    description: '批量处理多张卡牌图像，最大支持 10 张'
  })
  @ApiBody({ type: BatchExtractionRequestDto })
  @ApiResponse({ 
    status: 200, 
    description: '批量提取成功',
    type: BatchExtractionResponseDto,
  })
  async batchExtract(
    @Body() request: BatchExtractionRequestDto,
  ): Promise<BatchExtractionResponseDto> {
    if (!request.images || request.images.length === 0) {
      throw new BadRequestException('请提供图像列表');
    }

    if (request.images.length > 10) {
      throw new BadRequestException('单次最多处理 10 张图像');
    }

    const language = request.language || 'en-US';
    const imageBuffers = request.images.map((base64) => {
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      return Buffer.from(base64Data, 'base64');
    });

    const { results, totalTimeMs } = await this.qwenVlService.batchExtract(
      imageBuffers,
      language,
    );

    return {
      success: true,
      results,
      totalTimeMs,
    };
  }

  @Get('health')
  @ApiOperation({ summary: '检查 Qwen-VL 推理服务健康状态' })
  @ApiResponse({ 
    status: 200, 
    description: '健康状态',
    schema: {
      type: 'object',
      properties: {
        healthy: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    return await this.qwenVlService.healthCheck();
  }

  @Post('save-extraction')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '保存提取结果到数据库' })
  @ApiBody({ type: UpdateCardDto })
  @ApiQuery({
    name: 'language',
    required: true,
    enum: ['ja-JP', 'zh-HK', 'en-US'],
  })
  @ApiResponse({ status: 201, description: '保存成功' })
  @ApiResponse({ status: 400, description: '数据验证失败' })
  async saveExtraction(
    @Body() extractionData: UpdateCardDto,
    @Query('language') language: string,
  ) {
    // 验证必要字段
    if (!extractionData.name) {
      throw new BadRequestException('卡牌名称为必填字段');
    }

    // 保存到数据库
    return await this.cardsService.createWithExtraction(extractionData, language);
  }

  /**
   * 将提取结果保存到数据库
   */
  private async saveExtractionToDatabase(
    extraction: any,
    language: string,
  ): Promise<any> {
    // 转换提取结果为 Card 创建数据
    const cardData: any = {
      name: extraction.name,
      hp: extraction.hp,
      supertype: this.mapSupertype(extraction.supertype),
      subtypes: extraction.subtypes || [],
      types: extraction.types || [],
      abilities: extraction.abilities || [],
      attacks: extraction.attacks || [],
      rarity: extraction.rarity,
      artist: extraction.artist,
      cardNumber: extraction.cardNumber,
      evolutionStage: extraction.evolutionStage,
      evolvesFrom: extraction.evolvesFrom,
      flavorText: extraction.flavorText,
    };

    // 调用服务保存
    return await this.cardsService.createFromExtraction(cardData, language);
  }

  /**
   * 映射超类型
   */
  private mapSupertype(supertype?: string): string | null {
    if (!supertype) return null;

    const mapping: Record<string, string> = {
      'POKEMON': 'POKEMON',
      'Pokemon': 'POKEMON',
      'TRAINER': 'TRAINER',
      'Trainer': 'TRAINER',
      'ENERGY': 'ENERGY',
      'Energy': 'ENERGY',
    };

    return mapping[supertype] || supertype;
  }
}
