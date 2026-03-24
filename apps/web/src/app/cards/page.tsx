'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardGrid } from '@/components/card-grid';
import { FilterPanel } from '@/components/filter-panel';
import apiClient from '@/lib/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const DEFAULT_EXPANSION_CODES = 'm4,m3,m2a,m1l,m1s,sv11w,sv11b,sv10';
const TAKE = 50;

const DEFAULT_FILTERS = {
  name: '',
  supertype: '',
  types: '',
  rarity: '',
  language: '',
  sortBy: 'expansionReleaseDate',
  sortOrder: 'desc',
  webCardId: '',
  subtypes: '',
  variantType: '',
  minHp: '',
  maxHp: '',
  artist: '',
  regulationMark: '',
  expansionCode: DEFAULT_EXPANSION_CODES,
  hasAbilities: '',
  hasAttackText: '',
};

function getInitialFilters() {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('cardFilters');
      if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
    } catch {}
  }
  return { ...DEFAULT_FILTERS };
}

const LANG_LABEL: Record<string, string> = {
  JA_JP: '🇯🇵 Japan',
  ZH_HK: '🇭🇰 HK',
  EN_US: '🇺🇸 EN',
  ZH_TW: '🇹🇼 TW',
};
const SUPERTYPE_COLOR: Record<string, string> = {
  POKEMON: 'bg-emerald-500/20 text-emerald-300 border-emerald-600',
  TRAINER: 'bg-blue-500/20 text-blue-300 border-blue-600',
  ENERGY:  'bg-orange-500/20 text-orange-300 border-orange-600',
};

interface CardStats {
  total: number;
  byLanguage: Array<{ language: string; count: number }>;
  bySupertype: Array<{ supertype: string; count: number }>;
  byExpansion: Array<{ code: string; nameEn: string; count: number }>;
}

export default function CardsPage() {
  const router = useRouter();
  const [showStats, setShowStats] = useState(true);
  const [filters, setFilters] = useState<typeof DEFAULT_FILTERS>(getInitialFilters);
  const [skip, setSkip] = useState(0);

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cardFilters', JSON.stringify(filters));
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
        {/* Stats summary banner */}
        {stats && showStats && (
          <div className="mb-5 bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-800">🃏 卡牌資料庫</span>
                <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-2.5 py-0.5 rounded-full">
                  {stats.total.toLocaleString()} 張卡牌
                </span>
              </div>
              <button onClick={() => setShowStats(false)} className="text-gray-400 hover:text-gray-600 text-xs">關閉</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* By language */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">語言</div>
                <div className="flex flex-wrap gap-1.5">
                  {stats.byLanguage.map(({ language, count }) => (
                    <button
                      key={language}
                      onClick={() => { setFilters((f) => ({ ...f, language: f.language === language ? '' : language })); setSkip(0); }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm border transition ${
                        filters.language === language
                          ? 'bg-blue-600 text-white border-blue-600 shadow'
                          : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-blue-400'
                      }`}
                    >
                      {LANG_LABEL[language] ?? language}
                      <span className="text-[11px] opacity-70">{count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* By supertype */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">卡牌類型</div>
                <div className="flex flex-wrap gap-1.5">
                  {stats.bySupertype.map(({ supertype, count }) => (
                    <button
                      key={supertype}
                      onClick={() => { setFilters((f) => ({ ...f, supertype: f.supertype === supertype ? '' : supertype })); setSkip(0); }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm border transition ${
                        filters.supertype === supertype
                          ? 'ring-2 ring-offset-1 ring-blue-500 ' + (SUPERTYPE_COLOR[supertype] ?? 'bg-gray-100 text-gray-700 border-gray-300')
                          : (SUPERTYPE_COLOR[supertype] ?? 'bg-gray-50 text-gray-700 border-gray-300') + ' hover:opacity-80'
                      }`}
                    >
                      {supertype}
                      <span className="text-[11px] opacity-70">{count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* By expansion */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">套裝 (前 30)</div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {stats.byExpansion.map(({ code, nameEn, count }) => (
                    <button
                      key={code}
                      onClick={() => {
                        setFilters((f) => {
                          const active = (f.expansionCode || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
                          const lcode = code.toLowerCase();
                          const updated = active.includes(lcode) ? active.filter(c => c !== lcode) : [...active, lcode];
                          return { ...f, expansionCode: updated.join(',') };
                        });
                        setSkip(0);
                      }}
                      title={nameEn}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
                        (filters.expansionCode || '').split(',').some(c => c.trim().toLowerCase() === code.toLowerCase())
                          ? 'bg-purple-600 text-white border-purple-600 shadow'
                          : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-purple-400'
                      }`}
                    >
                      {code}
                      <span className="opacity-70">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!showStats && (
          <button onClick={() => setShowStats(true)} className="mb-4 text-sm text-blue-600 hover:underline">
            顯示統計資訊
          </button>
        )}

        <div className="mb-6">
          <FilterPanel filters={filters} onFilterChange={updateFilters} />
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
                  <span>顯示 {skip + 1}–{Math.min(skip + data.data.length, totalCards)} / {totalCards} 張</span>
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
                <CardGrid cards={data.data} onCardClick={handleCardClick} />
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
