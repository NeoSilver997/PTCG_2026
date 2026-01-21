/**
 * Storage-related type definitions
 */

export enum StorageRegion {
  HK = 'hk',
  JP = 'jp',
  EN = 'en',
}

export enum ImageType {
  FULL = 'full',
  THUMBNAIL = 'thumbnail',
}

export interface ImageStorageOptions {
  webCardId: string;
  region: StorageRegion;
  expansionCode?: string;
  type: ImageType;
}

export interface ImageDownloadResult {
  success: boolean;
  webCardId: string;
  path?: string;
  thumbnailPath?: string;
  error?: string;
  fileSize?: number;
}

export interface HTMLStorageOptions {
  region: StorageRegion;
  type: 'card' | 'event' | 'expansion';
  identifier: string; // webCardId for cards, eventId for events, etc.
  content: string;
}

export interface EventDataFile {
  eventId: string;
  name: string;
  date: string;
  location: string;
  type: 'CHAMPIONSHIP' | 'REGIONAL' | 'SPECIAL';
  participants: number;
  topDecks?: TournamentDeckData[];
  scrapedAt: string;
  sourceUrl?: string;
}

export interface TournamentDeckData {
  placement: number;
  playerName: string;
  deckType: string;
  deckList?: DeckCardEntry[];
}

export interface DeckCardEntry {
  cardId: string;
  cardName?: string;
  quantity: number;
  category: 'POKEMON' | 'TRAINER' | 'ENERGY';
}

export interface DeckFileData {
  deckId: string;
  name: string;
  type: 'CONTROL' | 'AGGRO' | 'COMBO' | 'MIDRANGE' | 'TOOLBOX';
  format: 'STANDARD' | 'EXPANDED';
  cards: DeckCardEntry[];
  metadata: {
    totalCards: number;
    pokemonCount: number;
    trainerCount: number;
    energyCount: number;
    createdAt?: string;
    updatedAt?: string;
  };
  source?: {
    type: 'tournament' | 'user';
    eventId?: string;
    userId?: string;
    placement?: number;
  };
}

export interface PriceSnapshotData {
  date: string;
  prices: Array<{
    cardId: string;
    webCardId: string;
    source: string;
    price: number;
    currency: string;
    condition?: string;
    variant?: string;
  }>;
}

export interface CardPriceHistory {
  cardId: string;
  webCardId: string;
  history: Array<{
    date: string;
    price: number;
    source: string;
    currency: string;
  }>;
}

export interface StorageStats {
  totalImages: number;
  totalThumbnails: number;
  totalHTMLFiles: number;
  totalEvents: number;
  totalDecks: number;
  totalStorageSize: number; // in bytes
  lastUpdated: string;
}
