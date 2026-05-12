import { 
  Controller, 
  Post, 
  Get, 
  Put,
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
import { UpdateCardDto } from './dto/update-card.dto';
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

  @Get('stats')
  @ApiOperation({ summary: 'Get card count stats by language, supertype, and expansion' })
  @ApiResponse({ status: 200, description: 'Card statistics' })
  async getCardStats() {
    return await this.cardsService.getCardStats();
  }

  @Get('species-summary')
  @ApiOperation({ summary: 'Get all Pokémon species with latest ZH card image, card counts by language, and evolution chain info' })
  @ApiResponse({ status: 200, description: 'Species summary data' })
  async getSpeciesSummary() {
    return await this.cardsService.getSpeciesSummary();
  }

  @Get('effect-keywords')
  @ApiOperation({ summary: 'Get all active effect highlight keywords for the card detail UI' })
  @ApiResponse({ status: 200, description: 'List of active effect keywords' })
  async getEffectKeywords() {
    return await this.cardsService.getEffectKeywords();
  }

  @Get('effect-tags')
  @ApiOperation({ summary: 'Get all distinct effect tags and special effect tags with counts from DB' })
  @ApiResponse({ status: 200, description: 'Array of { tag, count, isSpecial }' })
  async getEffectTags() {
    return await this.cardsService.getEffectTags();
  }

  @Get('admin/missing-effects')
  @ApiOperation({ summary: 'Get PrimaryCards missing effectTags or tier, with sample cards' })
  @ApiResponse({ status: 200, description: 'Missing effects stats and samples' })
  async getMissingEffects() {
    return await this.cardsService.getMissingEffects();
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

  @Get('web/:webCardId/related-decks')
  @ApiOperation({ summary: 'Get related tournament decks for a card (weekly trend + top 10)' })
  @ApiResponse({ status: 200, description: 'Related decks data' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async getRelatedDecks(@Param('webCardId') webCardId: string) {
    return await this.cardsService.getRelatedDecks(webCardId);
  }

  @Get('web/:webCardId/related')
  @ApiOperation({ summary: 'Get related cards for a card (bidirectional)' })
  @ApiResponse({ status: 200, description: 'Related cards list' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async getRelatedCards(@Param('webCardId') webCardId: string) {
    return await this.cardsService.getRelatedCards(webCardId);
  }

  @Put('web/:webCardId/related')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set related cards for a card (full replace)' })
  @ApiResponse({ status: 200, description: 'Related cards updated' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  async setRelatedCards(
    @Param('webCardId') webCardId: string,
    @Body() body: { relations: Array<{ webCardId: string; relationType?: string; note?: string }> },
  ) {
    return await this.cardsService.setRelatedCards(webCardId, body.relations ?? []);
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
  ): Promise<any> {
    return await this.cardsService.updateEvolution(webCardId, dto);
  }

  @Patch('web/:webCardId')
  @ApiOperation({ summary: 'Update card by webCardId' })
  @ApiResponse({ status: 200, description: 'Card updated successfully' })
  @ApiResponse({ status: 404, description: 'Card not found' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  async updateCard(
    @Param('webCardId') webCardId: string,
    @Body() dto: UpdateCardDto
  ): Promise<any> {
    return await this.cardsService.updateCard(webCardId, dto);
  }

  @Post('primary-cards/merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge two PrimaryCards: move all cards from source to target, delete source' })
  @ApiResponse({ status: 200, description: 'Merge successful' })
  @ApiResponse({ status: 400, description: 'Invalid request / same IDs' })
  @ApiResponse({ status: 404, description: 'PrimaryCard not found' })
  async mergePrimaryCards(
    @Body() body: { sourceId: string; targetId: string },
  ): Promise<any> {
    return await this.cardsService.mergePrimaryCards(body.sourceId, body.targetId);
  }
}
