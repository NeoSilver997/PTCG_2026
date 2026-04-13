'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardGrid } from '@/components/card-grid';
import { FilterPanel } from '@/components/filter-panel';
import apiClient from '@/lib/api-client';
import { useRouter, useSearchParams } from 'next/navigation';

const DEFAULT_EXPANSION_CODES = 'm4,m3,m2a,m2,m1s,m1l,mc,m,sv11w,sv11b,sv10,sv9,sv9a,sv8,sv8a,sv7,sv6a,sv6,sv5a,sv5k,sv5m,sv';
const FILTER_VERSION = '4';
const TAKE = 120;

const DEFAULT_FILTERS = {
  name: '',
  supertype: '',
  types: '',
  rarity: '',
  language: '',
  sortBy: 'webCardId',
  sortOrder: 'desc',
  webCardId: '',
  subtypes: '',
  variantType: '',
  minHp: '',
  maxHp: '',
  artist: '',
  regulationMark: 'H,I,J',
  expansionCode: DEFAULT_EXPANSION_CODES,
  hasAbilities: '',
  hasAttackText: '',
  effectTag: '',
  cardTier: '',
};

function getInitialFilters() {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('cardFilters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.__version === FILTER_VERSION) {
          const { __version, ...rest } = parsed;
          return { ...DEFAULT_FILTERS, ...rest };
        }
      }
    } catch {}
  }
  return { ...DEFAULT_FILTERS };
}



interface CardStats {
  total: number;
  byLanguage: Array<{ language: string; count: number }>;
  bySupertype: Array<{ supertype: string; count: number }>;
  byExpansion: Array<{ code: string; nameEn: string; count: number }>;
}

function CardsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<typeof DEFAULT_FILTERS>(getInitialFilters);
  const [skip, setSkip] = useState(0);
  const [hideDuplicates, setHideDuplicates] = useState(false);

  // Derive URL params so the effect dependency is stable scalars (re-runs on client-side navigation)
  const urlEffectTag = searchParams.get('effectTag');
  const urlCardTier = searchParams.get('cardTier');

  // Apply URL params each time they change (covers both initial load and client-side navigation)
  useEffect(() => {
    if (urlEffectTag || urlCardTier) {
      setFilters(prev => ({
        ...prev,
        ...(urlEffectTag ? { effectTag: urlEffectTag, regulationMark: '', expansionCode: '' } : {}),
        ...(urlCardTier ? { cardTier: urlCardTier } : {}),
      }));
      setSkip(0);
    }
  }, [urlEffectTag, urlCardTier]);

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cardFilters', JSON.stringify({ ...filters, __version: FILTER_VERSION }));
  }, [filters]);

  const updateFilters = (newFilters: typeof DEFAULT_FILTERS) => {
    setFilters(newFilters);
    setSkip(0);
  };

  const { data: stats } = useQuery<CardStats>({
    queryKey: ['card-stats'],
    queryFn: async () => {
      const res = await apiClient.get<CardStats>('/cards/stats');
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['cards', filters, skip],
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add filters to query params
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          params.append(key, value);
        }
      });

      params.append('take', String(TAKE));
      params.append('skip', String(skip));

      const response = await apiClient.get(`/cards?${params.toString()}`);
      return response.data;
    },
  });

  // Deduplicate by primaryCardId when toggled (client-side, keeps first per sort order)
  const displayCards: any[] = (() => {
    const raw: any[] = data?.data ?? [];
    if (!hideDuplicates) return raw;
    const seen = new Set<string>();
    return raw.filter((card: any) => {
      const key = card.primaryCardId;
      if (!key) return true; // no primaryCard — always show
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const totalCards: number = data?.pagination?.total ?? 0;
  const totalPages = Math.ceil(totalCards / TAKE);
  const currentPage = Math.floor(skip / TAKE) + 1;

  const handleCardClick = (card: any) => {
    router.push(`/cards/${card.webCardId}`);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">載入失敗</h1>
            <p className="text-gray-600">無法載入卡牌資料。請稍後再試。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <FilterPanel filters={filters} onFilterChange={updateFilters} stats={stats} />
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-lg text-gray-600">載入中...</div>
          </div>
        ) : (
          <div>
            {data?.data && data.data.length > 0 ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
                  <div className="flex items-center gap-3">
                    <span>顯示 {skip + 1}–{Math.min(skip + data.data.length, totalCards)} / {totalCards} 張</span>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hideDuplicates}
                        onChange={e => setHideDuplicates(e.target.checked)}
                        className="w-3.5 h-3.5 accent-blue-600"
                      />
                      <span className="text-xs text-gray-600">隱藏重複卡</span>
                      {hideDuplicates && (
                        <span className="text-xs text-blue-600">({displayCards.length} 張)</span>
                      )}
                    </label>
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSkip(Math.max(0, skip - TAKE))} disabled={skip === 0}
                        className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-xs">上一頁</button>
                      <span className="text-xs">第 {currentPage} / {totalPages} 頁</span>
                      <button onClick={() => setSkip(skip + TAKE)} disabled={skip + TAKE >= totalCards}
                        className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-xs">下一頁</button>
                    </div>
                  )}
                </div>
                <CardGrid cards={displayCards} onCardClick={handleCardClick} />
                {totalPages > 1 && (
                  <div className="mt-6 flex justify-center items-center gap-3">
                    <button onClick={() => setSkip(Math.max(0, skip - TAKE))} disabled={skip === 0}
                      className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 text-sm">上一頁</button>
                    <span className="text-sm text-gray-700">第 {currentPage} / {totalPages} 頁</span>
                    <button onClick={() => setSkip(skip + TAKE)} disabled={skip + TAKE >= totalCards}
                      className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 text-sm">下一頁</button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-lg text-gray-600">沒有找到卡牌</div>
                <p className="text-sm text-gray-500 mt-2">請調整篩選條件或檢查資料庫連線</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CardsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <CardsPageInner />
    </Suspense>
  );
}
