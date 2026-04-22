import { IsEnum, IsOptional, IsInt, IsString, Min, Max, IsBoolean, IsNumber } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum JobType {
  TOURNAMENT_EVENTS   = 'TOURNAMENT_EVENTS',
  JP_CARDS            = 'JP_CARDS',
  HK_CARDS            = 'HK_CARDS',
  EN_CARDS            = 'EN_CARDS',
  CARD_IMPORT         = 'CARD_IMPORT',
  MARKET_PRICES       = 'MARKET_PRICES',
  SEED_TOURNAMENTS    = 'SEED_TOURNAMENTS',
  RESYNC_DECKS        = 'RESYNC_DECKS',
  REMAP_DECKS         = 'REMAP_DECKS',
  REMOVE_DUPLICATES   = 'REMOVE_DUPLICATES',
  PROMO_RARITY        = 'PROMO_RARITY',
  POPULATE_EFFECTS    = 'POPULATE_EFFECTS',
  POKEMON_SPECIES     = 'POKEMON_SPECIES',
  MAP_HK_TO_JP        = 'MAP_HK_TO_JP',
  REFRESH_DECK_META   = 'REFRESH_DECK_META',
}

const boolTransform = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateScraperJobDto {

  // ── Job type ─────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: JobType, default: JobType.TOURNAMENT_EVENTS })
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType = JobType.TOURNAMENT_EVENTS;

  // ── Tournament Events (jpevents_scraper.py) ─────────────────────
  @ApiPropertyOptional({ default: 'JP', description: 'Region for events (JP/HK/EN) or job-type label for non-event jobs' })
  @IsOptional()
  @IsString()
  source?: string = 'JP';

  @ApiPropertyOptional({ default: 50, description: '--skip-recent' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  skipRecentCount?: number = 50;

  @ApiPropertyOptional({ default: 50, description: '--max-events' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  maxEvents?: number = 50;

  @ApiPropertyOptional({ default: false, description: '--force-reimport' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  forceReimport?: boolean = false;

  @ApiPropertyOptional({ default: false, description: '--reload-info' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  reloadInfo?: boolean = false;

  // ── Card Scrapers (jp / hk / en_card_scraper.py) ────────────────
  @ApiPropertyOptional({ description: '--id-range start' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idRangeStart?: number;

  @ApiPropertyOptional({ description: '--id-range count' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50000)
  idRangeCount?: number;

  @ApiPropertyOptional({ description: '--ids comma-separated card IDs' })
  @IsOptional()
  @IsString()
  cardIds?: string;

  @ApiPropertyOptional({ default: false, description: '--cache-html' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  cacheHtml?: boolean = false;

  @ApiPropertyOptional({ default: false, description: '--cache-only' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  cacheOnly?: boolean = false;

  @ApiPropertyOptional({ default: false, description: '--refresh-cache' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  refreshCache?: boolean = false;

  @ApiPropertyOptional({ default: 1, description: '--threads 1-20' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  threads?: number = 1;

  @ApiPropertyOptional({ default: 2.0, description: '--min-request-interval (JP only)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(10)
  minRequestInterval?: number = 2.0;

  @ApiPropertyOptional({ description: '--expansions sv8,sv9 (JP only)' })
  @IsOptional()
  @IsString()
  expansions?: string;

  @ApiPropertyOptional({ default: false, description: '--compact-json (JP only)' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  compactJson?: boolean = false;

  @ApiPropertyOptional({ default: false, description: '--quiet' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  quiet?: boolean = false;

  @ApiPropertyOptional({ description: '--html-cache-dir (HK only)' })
  @IsOptional()
  @IsString()
  htmlCacheDir?: string;

  @ApiPropertyOptional({ description: '--output custom file path' })
  @IsOptional()
  @IsString()
  outputFile?: string;

  // ── Card Import Direct (import-cards-direct.ts) ─────────────────
  @ApiPropertyOptional({ description: 'baseDir positional arg (default: data/cards)' })
  @IsOptional()
  @IsString()
  baseDir?: string;

  @ApiPropertyOptional({ description: 'regionOrPattern positional arg (japan/english/hongkong/china)' })
  @IsOptional()
  @IsString()
  regionOrPattern?: string;

  // ── Shared: dry-run / verbose ────────────────────────────────────
  @ApiPropertyOptional({ default: false, description: '--dry-run' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  dryRun?: boolean = false;

  @ApiPropertyOptional({ default: false, description: '--verbose' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  verbose?: boolean = false;

  // ── Market Prices (import-market-prices.ts) ──────────────────────
  @ApiPropertyOptional({ description: '--file= path to a single market-prices.json' })
  @IsOptional()
  @IsString()
  marketFile?: string;

  @ApiPropertyOptional({ description: '--dir= directory containing market-prices-*.json files' })
  @IsOptional()
  @IsString()
  marketDir?: string;

  // ── Deck Maintenance ─────────────────────────────────────────────
  @ApiPropertyOptional({ description: '--limit= max decks (resync)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  processLimit?: number;

  @ApiPropertyOptional({ default: false, description: '--empty-only: only decks with deckData but 0 DeckCards' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  emptyOnly?: boolean;

  @ApiPropertyOptional({ description: '--report-file= (resync)' })
  @IsOptional()
  @IsString()
  reportFile?: string;

  @ApiPropertyOptional({ description: '--deck-id= UUID (remap)' })
  @IsOptional()
  @IsString()
  deckId?: string;

  // ── Seed Tournaments (seed-tournaments.ts) ───────────────────────
  @ApiPropertyOptional({ default: false, description: '--all' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  seedAll?: boolean = false;

  @ApiPropertyOptional({ description: '--event-id= single event' })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ default: false, description: '--refresh-existing' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  refreshExisting?: boolean = false;

  @ApiPropertyOptional({ description: '--source-root= path to event_data' })
  @IsOptional()
  @IsString()
  sourceRoot?: string;

  @ApiPropertyOptional({ description: '--limit= for seed-tournaments' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  seedLimit?: number;

  // ── Deck Meta Refresh (refresh-deck-meta.ts) ─────────────────────
  @ApiPropertyOptional({ default: false, description: '--all: refresh all decks, not just those missing archetype name' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  refreshAll?: boolean;

  @ApiPropertyOptional({ default: false, description: '--refresh-prices: also update cachedBudgetMin/Max after computing names' })
  @IsOptional()
  @Transform(boolTransform)
  @IsBoolean()
  refreshPrices?: boolean;
}

