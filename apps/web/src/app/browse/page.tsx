'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navbar } from '@/components/navbar';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, LayoutGrid } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface BrowseCard {
  id: string;
  webCardId: string;
  name: string;
  imageUrl?: string;
  rarity?: string;
  types?: string[];
  hp?: number;
  supertype?: string;
  language?: string;
}

interface BrowseFilters {
  name: string;
  supertype: string;
  types: string;
  rarity: string;
  language: string;
  expansionCode: string;
  regulationMark: string;
}

const INITIAL_FILTERS: BrowseFilters = {
  name: '',
  supertype: '',
  types: '',
  rarity: '',
  language: '',
  expansionCode: '',
  regulationMark: '',
};

// ── Constants ──────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'bg-gray-500',
  UNCOMMON: 'bg-green-500',
  RARE: 'bg-blue-500',
  DOUBLE_RARE: 'bg-purple-500',
  ULTRA_RARE: 'bg-purple-700',
  ILLUSTRATION_RARE: 'bg-yellow-500',
  SPECIAL_ILLUSTRATION_RARE: 'bg-pink-500',
  HYPER_RARE: 'bg-red-500',
  ACE_SPEC_RARE: 'bg-orange-500',
  PROMO: 'bg-sky-500',
};

const RARITY_SHORT: Record<string, string> = {
  COMMON: 'C',
  UNCOMMON: 'U',
  RARE: 'R',
  DOUBLE_RARE: 'RR',
  ULTRA_RARE: 'UR',
  ILLUSTRATION_RARE: 'IR',
  SPECIAL_ILLUSTRATION_RARE: 'SR',
  HYPER_RARE: 'HR',
  ACE_SPEC_RARE: 'ACE',
  PROMO: 'P',
};

const TYPE_COLORS: Record<string, string> = {
  COLORLESS: 'bg-gray-300 text-gray-700',
  DARKNESS: 'bg-gray-800 text-white',
  DRAGON: 'bg-purple-600 text-white',
  FAIRY: 'bg-pink-400 text-white',
  FIGHTING: 'bg-orange-600 text-white',
  FIRE: 'bg-red-500 text-white',
  GRASS: 'bg-green-500 text-white',
  LIGHTNING: 'bg-yellow-400 text-gray-900',
  METAL: 'bg-gray-500 text-white',
  PSYCHIC: 'bg-purple-500 text-white',
  WATER: 'bg-blue-500 text-white',
};

const GRID_CLASSES = {
  normal: {
    small: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4',
    medium: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6',
    large: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-8',
  },
  cardOnly: {
    small: 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-2',
    medium: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3',
    large: 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4',
  },
};

const PAGE_SIZE = 60;

// ── Page ──────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const router = useRouter();
  const [viewSize, setViewSize] = useState<'small' | 'medium' | 'large'>('small');
  const [cardOnlyView, setCardOnlyView] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const filterHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState(0);
  const [allCards, setAllCards] = useState<BrowseCard[]>([]);
  const [filters, setFilters] = useState<BrowseFilters>(INITIAL_FILTERS);

  // Auto-hiding sidebar — 5 s of inactivity
  const resetHideTimer = useCallback(() => {
    if (filterHideTimerRef.current) clearTimeout(filterHideTimerRef.current);
    setFiltersVisible(true);
    filterHideTimerRef.current = setTimeout(() => setFiltersVisible(false), 5000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    document.addEventListener('mousemove', resetHideTimer);
    document.addEventListener('keypress', resetHideTimer);
    document.addEventListener('click', resetHideTimer);
    return () => {
      if (filterHideTimerRef.current) clearTimeout(filterHideTimerRef.current);
      document.removeEventListener('mousemove', resetHideTimer);
      document.removeEventListener('keypress', resetHideTimer);
      document.removeEventListener('click', resetHideTimer);
    };
  }, [resetHideTimer]);

  const buildParams = useCallback(
    (skip: number) => {
      const params = new URLSearchParams();
      (Object.entries(filters) as [string, string][]).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      params.append('take', String(PAGE_SIZE));
      params.append('skip', String(skip));
      params.append('sortBy', 'expansionReleaseDate');
      params.append('sortOrder', 'desc');
      return params.toString();
    },
    [filters],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['browse-cards', filters, page],
    queryFn: () =>
      apiClient.get(`/cards?${buildParams(page * PAGE_SIZE)}`).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  // Reset accumulated list when filters change
  useEffect(() => {
    setPage(0);
    setAllCards([]);
  }, [filters]);

  // Accumulate pages for load-more
  useEffect(() => {
    if (!data?.data) return;
    if (page === 0) {
      setAllCards(data.data);
    } else {
      setAllCards((prev) => [...prev, ...data.data]);
    }
  }, [data, page]);

  const handleFilterChange = (key: keyof BrowseFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const hasMore = data?.pagination?.hasMore ?? false;
  const total = data?.pagination?.total ?? 0;
  const hasActiveFilter = Object.values(filters).some((v) => v !== '');

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* ── Sticky Top Toolbar ─────────────────────────────────────────── */}
      <div className="sticky top-16 z-30 bg-white border-b shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">

          {/* Filter panel toggle */}
          <button
            onClick={() => setFiltersVisible((v) => !v)}
            className={`p-2 rounded-lg border transition-colors ${
              filtersVisible
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
            title="篩選器"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          {/* Name search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="搜尋卡牌名稱..."
              value={filters.name}
              onChange={(e) => handleFilterChange('name', e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Result counter */}
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {isLoading && page === 0 ? '載入中…' : `${allCards.length} / ${total} 張`}
          </span>

          <div className="flex-1" />

          {/* S / M / L size */}
          <div className="flex items-center gap-1">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setViewSize(size)}
                className={`w-8 h-8 text-xs font-bold rounded-lg transition-colors ${
                  viewSize === size
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
              </button>
            ))}
          </div>

          {/* Card-only toggle */}
          <button
            onClick={() => setCardOnlyView((v) => !v)}
            className={`p-2 rounded-lg border transition-colors ${
              cardOnlyView
                ? 'bg-purple-500 text-white border-purple-500'
                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
            }`}
            title="純圖片模式"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body (sidebar + grid) ──────────────────────────────────────── */}
      <div className="max-w-[1920px] mx-auto px-4 py-4 flex gap-4 items-start">

        {/* Filter Sidebar */}
        <aside
          className={`flex-shrink-0 transition-all duration-300 overflow-hidden ${
            filtersVisible ? 'w-60 opacity-100' : 'w-0 opacity-0'
          }`}
        >
          <div className="w-60 bg-white rounded-lg shadow-md border p-3 sticky top-32 space-y-3">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide pb-1 border-b">
              篩選器
            </div>

            <FilterSelect
              label="卡牌類型"
              value={filters.supertype}
              onChange={(v) => handleFilterChange('supertype', v)}
              options={[
                { value: '', label: '全部' },
                { value: 'POKEMON', label: '寶可夢' },
                { value: 'TRAINER', label: '訓練家' },
                { value: 'ENERGY', label: '能量' },
              ]}
            />

            <FilterSelect
              label="屬性"
              value={filters.types}
              onChange={(v) => handleFilterChange('types', v)}
              options={[
                { value: '', label: '全部' },
                { value: 'GRASS', label: '🌿 草' },
                { value: 'FIRE', label: '🔥 火' },
                { value: 'WATER', label: '💧 水' },
                { value: 'LIGHTNING', label: '⚡ 電' },
                { value: 'PSYCHIC', label: '🔮 超能力' },
                { value: 'FIGHTING', label: '👊 格鬥' },
                { value: 'DARKNESS', label: '🌑 惡' },
                { value: 'METAL', label: '⚙ 鋼' },
                { value: 'DRAGON', label: '🐉 龍' },
                { value: 'COLORLESS', label: '⬜ 無色' },
              ]}
            />

            <FilterSelect
              label="稀有度"
              value={filters.rarity}
              onChange={(v) => handleFilterChange('rarity', v)}
              options={[
                { value: '', label: '全部' },
                { value: 'COMMON', label: 'Common' },
                { value: 'UNCOMMON', label: 'Uncommon' },
                { value: 'RARE', label: 'Rare' },
                { value: 'DOUBLE_RARE', label: 'Double Rare' },
                { value: 'ILLUSTRATION_RARE', label: 'Illustration Rare' },
                { value: 'SPECIAL_ILLUSTRATION_RARE', label: 'Special IR' },
                { value: 'ULTRA_RARE', label: 'Ultra Rare' },
                { value: 'HYPER_RARE', label: 'Hyper Rare' },
                { value: 'ACE_SPEC_RARE', label: 'ACE SPEC' },
                { value: 'PROMO', label: 'Promo' },
              ]}
            />

            <FilterSelect
              label="語言"
              value={filters.language}
              onChange={(v) => handleFilterChange('language', v)}
              options={[
                { value: '', label: '全部' },
                { value: 'JA_JP', label: '🇯🇵 日文' },
                { value: 'ZH_HK', label: '🇭🇰 中文(港)' },
                { value: 'EN_US', label: '🇺🇸 英文' },
              ]}
            />

            <div>
              <label className="block text-xs text-gray-600 mb-1">系列代碼</label>
              <input
                type="text"
                placeholder="sv9, sv10..."
                value={filters.expansionCode}
                onChange={(e) => handleFilterChange('expansionCode', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">規制標章</label>
              <input
                type="text"
                placeholder="F, G, H..."
                value={filters.regulationMark}
                onChange={(e) => handleFilterChange('regulationMark', e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {hasActiveFilter && (
              <button
                onClick={() => setFilters(INITIAL_FILTERS)}
                className="w-full py-1.5 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                清除所有篩選
              </button>
            )}
          </div>
        </aside>

        {/* ── Main card grid ─────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          {isLoading && page === 0 ? (
            <SkeletonGrid size={viewSize} cardOnly={cardOnlyView} />
          ) : allCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <div className="text-gray-500 text-lg font-medium">找不到卡牌</div>
              <div className="text-gray-400 text-sm mt-2">請調整篩選條件</div>
            </div>
          ) : (
            <>
              <div className={GRID_CLASSES[cardOnlyView ? 'cardOnly' : 'normal'][viewSize]}>
                {allCards.map((card) => (
                  <CardTile
                    key={card.id}
                    card={card}
                    cardOnlyView={cardOnlyView}
                    viewSize={viewSize}
                    onClick={() => router.push(`/cards/${card.webCardId}`)}
                  />
                ))}
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="flex justify-center mt-10 mb-4">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={isFetching}
                    className="px-8 py-3 bg-blue-500 text-white text-sm font-semibold rounded-xl hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                  >
                    {isFetching
                      ? '載入中…'
                      : `載入更多 (還有 ${total - allCards.length} 張)`}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Card Tile ──────────────────────────────────────────────────────────────

interface CardTileProps {
  card: BrowseCard;
  cardOnlyView: boolean;
  viewSize: 'small' | 'medium' | 'large';
  onClick: () => void;
}

function CardTile({ card, cardOnlyView, viewSize, onClick }: CardTileProps) {
  const rarityColor = card.rarity ? (RARITY_COLORS[card.rarity] ?? 'bg-gray-400') : undefined;
  const rarityShort = card.rarity ? (RARITY_SHORT[card.rarity] ?? card.rarity[0]) : undefined;
  const mainType = Array.isArray(card.types) ? card.types[0] : card.types;
  const typeStyle = mainType ? (TYPE_COLORS[mainType] ?? 'bg-gray-300 text-gray-700') : undefined;

  if (cardOnlyView) {
    return (
      <div onClick={onClick} className="relative cursor-pointer group">
        <div
          className={`aspect-[5/7] bg-gray-100 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 ${
            viewSize === 'small'
              ? 'min-h-[90px]'
              : viewSize === 'large'
              ? 'min-h-[200px]'
              : 'min-h-[130px]'
          }`}
        >
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs select-none">
              🃏
            </div>
          )}
          {rarityColor && (
            <div
              className={`absolute top-1 right-1 ${rarityColor} text-white px-1 py-0.5 rounded text-[9px] font-bold leading-none shadow`}
            >
              {rarityShort}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer border border-gray-200 overflow-hidden group"
    >
      <div className="aspect-[5/7] bg-gray-100 relative overflow-hidden">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300 select-none">
            <div className="text-4xl">🃏</div>
            <div className="text-xs">No Image</div>
          </div>
        )}
        {rarityColor && (
          <div
            className={`absolute top-2 right-2 ${rarityColor} text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-md`}
          >
            {rarityShort}
          </div>
        )}
      </div>

      <div className="px-3 py-2 pb-3">
        <h3
          className="font-semibold text-gray-900 text-sm leading-tight truncate"
          title={card.name}
        >
          {card.name}
        </h3>
        <div className="flex items-center justify-between mt-1.5">
          {card.hp ? (
            <span className="text-xs font-bold text-red-600">HP {card.hp}</span>
          ) : (
            <span />
          )}
          {typeStyle && mainType && (
            <div
              className={`${typeStyle} w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0`}
            >
              {mainType[0]}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter Select ──────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Skeleton Grid ──────────────────────────────────────────────────────────

function SkeletonGrid({
  size,
  cardOnly,
}: {
  size: 'small' | 'medium' | 'large';
  cardOnly: boolean;
}) {
  return (
    <div className={GRID_CLASSES[cardOnly ? 'cardOnly' : 'normal'][size]}>
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow overflow-hidden animate-pulse">
          <div className="aspect-[5/7] bg-gray-200" />
          {!cardOnly && (
            <div className="p-3 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
