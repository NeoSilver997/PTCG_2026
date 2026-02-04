export type LanguageCode = 'ja-JP' | 'zh-TW' | 'en-US';
export type Region = 'HK' | 'JP' | 'EN';
export type UserRole = 'GUEST' | 'USER' | 'ADMIN';
export type ScraperStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
export type VariantType = 'NORMAL' | 'REVERSE_HOLO' | 'HOLO' | 'FULL_ART' | 'SECRET_RARE' | 'PROMO';
export type RuleBox = 'EX' | 'GX' | 'V' | 'VMAX' | 'VSTAR' | 'RADIANT';
export type TournamentType = 'CHAMPIONSHIP' | 'REGIONAL' | 'SPECIAL_EVENT' | 'STORE_TOURNAMENT' | 'ONLINE_EVENT';
export type DeckArchetype = 'AGGRO' | 'CONTROL' | 'COMBO' | 'MIDRANGE' | 'TOOLBOX' | 'OTHER';
export * from './storage.types';
export type PriceSource = 'YUYU_TEI' | 'HARERUYA' | 'CARDMARKET' | 'TCGPLAYER' | 'OTHER';
export interface PaginationMeta {
    total: number;
    skip: number;
    take: number;
    hasMore: boolean;
}
export interface ApiResponse<T> {
    data: T;
    meta?: PaginationMeta;
}
export interface ApiError {
    statusCode: number;
    message: string;
    error: string;
    timestamp: string;
    path: string;
}
export interface CardAbility {
    name: string;
    text: string;
    type?: string;
}
export interface CardAttack {
    name: string;
    cost: string[];
    damage?: string;
    text?: string;
}
export interface CardSearchParams {
    query?: string;
    language?: LanguageCode;
    supertype?: string;
    types?: string[];
    rarity?: string;
    expansionId?: string;
    skip?: number;
    take?: number;
}
export interface CollectionStats {
    totalCards: number;
    uniqueCards: number;
    byRarity: Record<string, number>;
    byType: Record<string, number>;
    completionPercentage: number;
}
export interface ScraperError {
    cardId?: string;
    url?: string;
    error: string;
    timestamp: string;
}
export interface ScraperJobResult {
    jobId: string;
    source: Region;
    status: ScraperStatus;
    successCount: number;
    failureCount: number;
    duration?: number;
    errors?: ScraperError[];
}
export interface TournamentSearchParams {
    type?: TournamentType;
    region?: Region;
    dateFrom?: string;
    dateTo?: string;
    playerName?: string;
    skip?: number;
    take?: number;
}
export interface TournamentResultDTO {
    id: string;
    tournamentName: string;
    playerName: string;
    placement: number;
    deckName?: string;
    deckArchetype?: DeckArchetype;
    date: string;
}
export interface MetaGameStats {
    totalDecks: number;
    archetypeBreakdown: Record<DeckArchetype, number>;
    topCards: Array<{
        cardId: string;
        cardName: string;
        usage: number;
    }>;
}
export interface DeckCardItem {
    cardId: string;
    cardName: string;
    quantity: number;
    supertype?: string;
}
export interface DeckDTO {
    id: string;
    name: string;
    description?: string;
    archetype?: DeckArchetype;
    format?: string;
    cards: DeckCardItem[];
    totalCards: number;
    isValid: boolean;
}
export interface DeckValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}
export interface CardPriceDTO {
    source: PriceSource;
    price: number;
    currency: string;
    condition?: string;
    inStock: boolean;
    fetchedAt: string;
}
export interface PriceComparisonDTO {
    cardId: string;
    cardName: string;
    prices: CardPriceDTO[];
    lowestPrice: number;
    highestPrice: number;
    averagePrice: number;
}
export interface PriceHistoryPoint {
    date: string;
    price: number;
    source: PriceSource;
}
export interface PriceAlertDTO {
    cardId: string;
    targetPrice: number;
    currency: string;
    notifyEmail?: string;
}
export interface ScraperError {
    cardId?: string;
    url?: string;
    error: string;
    timestamp: string;
}
export interface ScraperJobResult {
    jobId: string;
    source: Region;
    status: ScraperStatus;
    successCount: number;
    failureCount: number;
    duration?: number;
    errors?: ScraperError[];
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface UserPayload {
    userId: string;
    email: string;
    role: UserRole;
}
