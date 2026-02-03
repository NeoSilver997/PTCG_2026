import { 
  Controller, 
  Post, 
  Get, 
  Patch,
  Body, 
  Param, 
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CardsService } from './cards.service';
import { ImportJapaneseCardsDto } from './dto/import-japanese-cards.dto';
import { FindAllCardsDto } from './dto/find-all-cards.dto';
import { LanguageCode } from '@ptcg/database';
import * as fs from 'fs';

@ApiTags('cards')
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post('import/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch import Japanese cards from JSON' })
  @ApiResponse({ status: 200, description: 'Cards imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async importJapaneseCards(@Body() dto: ImportJapaneseCardsDto) {
    const logData = {
      timestamp: new Date().toISOString(),
      count: dto.cards.length,
      firstCard: dto.cards[0]
    };
    fs.appendFileSync('c:/temp/api-debug.log', JSON.stringify(logData, null, 2) + '\n---\n');
    return await this.cardsService.importJapaneseCards(dto.cards);
  }

  @Post('import/file')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import Japanese cards from JSON file upload' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'File uploaded and processed' })
  async importFromFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      const cards = JSON.parse(file.buffer.toString('utf-8'));
      
      if (!Array.isArray(cards)) {
        throw new BadRequestException('File must contain an array of cards');
      }

      return await this.cardsService.importJapaneseCards(cards);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new BadRequestException('Invalid JSON file');
      }
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get cards with pagination, filters, and sorting' })
  @ApiResponse({ status: 200, description: 'Returns paginated cards' })
  async getCards(@Query() query: FindAllCardsDto) {
    return await this.cardsService.getCards(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get card by ID' })
  @ApiResponse({ status: 200, description: 'Returns card details' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async getCardById(@Param('id') id: string) {
    return await this.cardsService.getCardById(id);
  }

  @Get('web/:webCardId')
  @ApiOperation({ summary: 'Get card by webCardId (e.g., jp47009)' })
  @ApiResponse({ status: 200, description: 'Returns card details' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async getCardByWebCardId(@Param('webCardId') webCardId: string) {
    return await this.cardsService.getCardByWebCardId(webCardId);
  }

  @Patch('web/:webCardId/evolution')
  @ApiOperation({ summary: 'Update card evolution information' })
  @ApiResponse({ status: 200, description: 'Evolution information updated successfully' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async updateEvolution(
    @Param('webCardId') webCardId: string,
    @Body() dto: { evolvesFrom?: string; evolvesTo?: string }
  ) {
    return await this.cardsService.updateEvolution(webCardId, dto);
  }

  @Patch('web/:webCardId')
  @ApiOperation({ summary: 'Update card information (admin)' })
  @ApiResponse({ status: 200, description: 'Card updated successfully' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async updateCard(
    @Param('webCardId') webCardId: string,
    @Body() updateData: any
  ) {
    return await this.cardsService.updateCard(webCardId, updateData);
  }
}
