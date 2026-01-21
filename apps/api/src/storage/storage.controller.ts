import {
  Controller,
  Get,
  Param,
  Res,
  HttpStatus,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../common/services/storage.service';
import { StorageRegion, ImageType } from '@ptcg/shared-types';
import * as fs from 'fs/promises';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Get card image
   * GET /api/v1/storage/cards/:webCardId/image?region=hk&type=full
   */
  @Get('cards/:webCardId/image')
  async getCardImage(
    @Param('webCardId') webCardId: string,
    @Query('region') region: StorageRegion = StorageRegion.HK,
    @Query('type') type: ImageType = ImageType.FULL,
    @Res() res: Response,
  ): Promise<void> {
    const imagePath = await this.storageService.getCardImagePath(
      webCardId,
      region,
      type,
    );

    if (!imagePath) {
      throw new NotFoundException(`Image not found for card ${webCardId}`);
    }

    try {
      const imageBuffer = await fs.readFile(imagePath);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      res.status(HttpStatus.OK).send(imageBuffer);
    } catch (error) {
      throw new NotFoundException(`Failed to read image for card ${webCardId}`);
    }
  }

  /**
   * Get card thumbnail
   * GET /api/v1/storage/cards/:webCardId/thumbnail?region=hk
   */
  @Get('cards/:webCardId/thumbnail')
  async getCardThumbnail(
    @Param('webCardId') webCardId: string,
    @Query('region') region: StorageRegion = StorageRegion.HK,
    @Res() res: Response,
  ): Promise<void> {
    return this.getCardImage(webCardId, region, ImageType.THUMBNAIL, res);
  }

  /**
   * Get storage statistics
   * GET /api/v1/storage/stats
   */
  @Get('stats')
  async getStorageStats() {
    return this.storageService.getStorageStats();
  }

  /**
   * Get event data
   * GET /api/v1/storage/events/:eventId?processed=true
   */
  @Get('events/:eventId')
  async getEventData(
    @Param('eventId') eventId: string,
    @Query('processed') processed: boolean = true,
  ) {
    const data = await this.storageService.getEventData(eventId, processed);

    if (!data) {
      throw new NotFoundException(`Event data not found for ${eventId}`);
    }

    return data;
  }

  /**
   * Get deck data
   * GET /api/v1/storage/decks/:deckId?category=tournament
   */
  @Get('decks/:deckId')
  async getDeckData(
    @Param('deckId') deckId: string,
    @Query('category') category: 'tournament' | 'user' | 'meta' = 'tournament',
    @Query('userId') userId?: string,
  ) {
    const data = await this.storageService.getDeckData(
      deckId,
      category,
      userId,
    );

    if (!data) {
      throw new NotFoundException(`Deck data not found for ${deckId}`);
    }

    return data;
  }
}
