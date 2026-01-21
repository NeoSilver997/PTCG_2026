import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as sharp from 'sharp';
import axios from 'axios';
import {
  ImageStorageOptions,
  ImageDownloadResult,
  HTMLStorageOptions,
  StorageRegion,
  ImageType,
  EventDataFile,
  DeckFileData,
  PriceSnapshotData,
  CardPriceHistory,
  StorageStats,
} from '@ptcg/shared-types';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly dataRoot: string;
  private readonly thumbnailSize = { width: 200, height: 280 };

  constructor() {
    // Root data directory
    this.dataRoot = path.join(process.cwd(), '..', '..', 'data');
  }

  /**
   * Download and store card image
   */
  async downloadCardImage(
    imageUrl: string,
    options: ImageStorageOptions,
  ): Promise<ImageDownloadResult> {
    const { webCardId, region, expansionCode, type } = options;

    try {
      // Download image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const imageBuffer = Buffer.from(response.data);

      // Determine storage path
      let basePath: string;
      if (type === ImageType.FULL) {
        basePath = path.join(
          this.dataRoot,
          'images',
          'cards',
          region,
          expansionCode || '',
        );
      } else {
        basePath = path.join(this.dataRoot, 'images', 'thumbnails', region);
      }

      // Ensure directory exists
      await fs.mkdir(basePath, { recursive: true });

      // Save full-size image
      const fullPath = path.join(basePath, `${webCardId}.png`);
      await fs.writeFile(fullPath, imageBuffer);

      const stats = await fs.stat(fullPath);
      this.logger.log(
        `Downloaded image for ${webCardId} (${stats.size} bytes)`,
      );

      let thumbnailPath: string | undefined;

      // Generate thumbnail if this is a full-size image
      if (type === ImageType.FULL) {
        thumbnailPath = await this.generateThumbnail(
          imageBuffer,
          webCardId,
          region,
        );
      }

      return {
        success: true,
        webCardId,
        path: fullPath,
        thumbnailPath,
        fileSize: stats.size,
      };
    } catch (error) {
      this.logger.error(
        `Failed to download image for ${webCardId}: ${error.message}`,
      );
      return {
        success: false,
        webCardId,
        error: error.message,
      };
    }
  }

  /**
   * Generate thumbnail from image buffer
   */
  private async generateThumbnail(
    imageBuffer: Buffer,
    webCardId: string,
    region: StorageRegion,
  ): Promise<string> {
    const thumbnailDir = path.join(
      this.dataRoot,
      'images',
      'thumbnails',
      region,
    );
    await fs.mkdir(thumbnailDir, { recursive: true });

    const thumbnailPath = path.join(thumbnailDir, `${webCardId}.png`);

    await sharp(imageBuffer)
      .resize(this.thumbnailSize.width, this.thumbnailSize.height, {
        fit: 'cover',
      })
      .png({ quality: 80 })
      .toFile(thumbnailPath);

    this.logger.log(`Generated thumbnail for ${webCardId}`);
    return thumbnailPath;
  }

  /**
   * Get card image path
   */
  async getCardImagePath(
    webCardId: string,
    region: StorageRegion,
    type: ImageType = ImageType.FULL,
  ): Promise<string | null> {
    const baseDir =
      type === ImageType.FULL
        ? path.join(this.dataRoot, 'images', 'cards', region)
        : path.join(this.dataRoot, 'images', 'thumbnails', region);

    // Search for the image file (could be in expansion subdirectories)
    try {
      const files = await this.findFileRecursive(baseDir, `${webCardId}.png`);
      return files.length > 0 ? files[0] : null;
    } catch (error) {
      this.logger.warn(`Image not found for ${webCardId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Store HTML archive
   */
  async storeHTML(options: HTMLStorageOptions): Promise<string> {
    const { region, type, identifier, content } = options;

    let basePath: string;
    if (type === 'card') {
      basePath = path.join(this.dataRoot, 'html', 'cards', region);
    } else if (type === 'event') {
      basePath = path.join(this.dataRoot, 'html', 'events');
    } else {
      basePath = path.join(this.dataRoot, 'html', 'expansions', region);
    }

    await fs.mkdir(basePath, { recursive: true });

    const filename = `${identifier}.html`;
    const filePath = path.join(basePath, filename);

    await fs.writeFile(filePath, content, 'utf-8');
    this.logger.log(`Stored HTML for ${identifier}`);

    return filePath;
  }

  /**
   * Store event data
   */
  async storeEventData(
    eventData: EventDataFile,
    processed: boolean = false,
  ): Promise<string> {
    const subdir = processed ? 'processed' : 'raw';
    const basePath = path.join(this.dataRoot, 'events', subdir);
    await fs.mkdir(basePath, { recursive: true });

    const filename = `${eventData.eventId}.json`;
    const filePath = path.join(basePath, filename);

    await fs.writeFile(filePath, JSON.stringify(eventData, null, 2), 'utf-8');
    this.logger.log(`Stored event data for ${eventData.eventId}`);

    return filePath;
  }

  /**
   * Store deck data
   */
  async storeDeckData(
    deckData: DeckFileData,
    category: 'tournament' | 'user' | 'meta',
    userId?: string,
  ): Promise<string> {
    let basePath: string;
    if (category === 'user' && userId) {
      basePath = path.join(this.dataRoot, 'decks', 'user', userId);
    } else {
      basePath = path.join(this.dataRoot, 'decks', category);
    }

    await fs.mkdir(basePath, { recursive: true });

    const filename = `${deckData.deckId}.json`;
    const filePath = path.join(basePath, filename);

    await fs.writeFile(filePath, JSON.stringify(deckData, null, 2), 'utf-8');
    this.logger.log(`Stored deck data for ${deckData.deckId}`);

    return filePath;
  }

  /**
   * Store price snapshot
   */
  async storePriceSnapshot(snapshot: PriceSnapshotData): Promise<string> {
    const basePath = path.join(this.dataRoot, 'prices', 'snapshots');
    await fs.mkdir(basePath, { recursive: true });

    const filename = `${snapshot.date}.json`;
    const filePath = path.join(basePath, filename);

    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    this.logger.log(`Stored price snapshot for ${snapshot.date}`);

    return filePath;
  }

  /**
   * Store card price history
   */
  async storeCardPriceHistory(history: CardPriceHistory): Promise<string> {
    const basePath = path.join(
      this.dataRoot,
      'prices',
      'history',
      history.cardId,
    );
    await fs.mkdir(basePath, { recursive: true });

    const filename = `${history.webCardId}.json`;
    const filePath = path.join(basePath, filename);

    await fs.writeFile(filePath, JSON.stringify(history, null, 2), 'utf-8');
    this.logger.log(`Stored price history for ${history.webCardId}`);

    return filePath;
  }

  /**
   * Get event data
   */
  async getEventData(
    eventId: string,
    processed: boolean = true,
  ): Promise<EventDataFile | null> {
    const subdir = processed ? 'processed' : 'raw';
    const filePath = path.join(
      this.dataRoot,
      'events',
      subdir,
      `${eventId}.json`,
    );

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as EventDataFile;
    } catch (error) {
      this.logger.warn(`Event data not found for ${eventId}`);
      return null;
    }
  }

  /**
   * Get deck data
   */
  async getDeckData(
    deckId: string,
    category: 'tournament' | 'user' | 'meta',
    userId?: string,
  ): Promise<DeckFileData | null> {
    let basePath: string;
    if (category === 'user' && userId) {
      basePath = path.join(this.dataRoot, 'decks', 'user', userId);
    } else {
      basePath = path.join(this.dataRoot, 'decks', category);
    }

    const filePath = path.join(basePath, `${deckId}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as DeckFileData;
    } catch (error) {
      this.logger.warn(`Deck data not found for ${deckId}`);
      return null;
    }
  }

  /**
   * Clean up old HTML archives (older than 30 days)
   */
  async cleanupOldHTMLArchives(): Promise<number> {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    const htmlDirs = [
      path.join(this.dataRoot, 'html', 'cards', 'hk'),
      path.join(this.dataRoot, 'html', 'cards', 'jp'),
      path.join(this.dataRoot, 'html', 'cards', 'en'),
      path.join(this.dataRoot, 'html', 'events'),
    ];

    for (const dir of htmlDirs) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (!file.endsWith('.html')) continue;

          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtimeMs < thirtyDaysAgo) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to clean up ${dir}: ${error.message}`);
      }
    }

    this.logger.log(`Cleaned up ${deletedCount} old HTML files`);
    return deletedCount;
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    const stats: StorageStats = {
      totalImages: 0,
      totalThumbnails: 0,
      totalHTMLFiles: 0,
      totalEvents: 0,
      totalDecks: 0,
      totalStorageSize: 0,
      lastUpdated: new Date().toISOString(),
    };

    // Count images
    stats.totalImages = await this.countFiles(
      path.join(this.dataRoot, 'images', 'cards'),
      '.png',
    );
    stats.totalThumbnails = await this.countFiles(
      path.join(this.dataRoot, 'images', 'thumbnails'),
      '.png',
    );

    // Count HTML files
    stats.totalHTMLFiles = await this.countFiles(
      path.join(this.dataRoot, 'html'),
      '.html',
    );

    // Count events
    stats.totalEvents =
      (await this.countFiles(
        path.join(this.dataRoot, 'events', 'processed'),
        '.json',
      )) +
      (await this.countFiles(
        path.join(this.dataRoot, 'events', 'raw'),
        '.json',
      ));

    // Count decks
    stats.totalDecks = await this.countFiles(
      path.join(this.dataRoot, 'decks'),
      '.json',
    );

    // Calculate total size
    stats.totalStorageSize = await this.calculateDirectorySize(this.dataRoot);

    return stats;
  }

  /**
   * Helper: Find file recursively
   */
  private async findFileRecursive(
    dir: string,
    filename: string,
  ): Promise<string[]> {
    const results: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subResults = await this.findFileRecursive(fullPath, filename);
          results.push(...subResults);
        } else if (entry.name === filename) {
          results.push(fullPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist or no permission
    }

    return results;
  }

  /**
   * Helper: Count files with extension
   */
  private async countFiles(dir: string, extension: string): Promise<number> {
    let count = 0;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          count += await this.countFiles(fullPath, extension);
        } else if (entry.name.endsWith(extension)) {
          count++;
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }

    return count;
  }

  /**
   * Helper: Calculate directory size
   */
  private async calculateDirectorySize(dir: string): Promise<number> {
    let size = 0;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          size += await this.calculateDirectorySize(fullPath);
        } else {
          const stats = await fs.stat(fullPath);
          size += stats.size;
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }

    return size;
  }
}
