'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

const REGIONS = ['', 'HK', 'JP', 'EN'] as const;
const TYPES = ['', 'CHAMPIONSHIP', 'REGIONAL', 'SPECIAL_EVENT', 'STORE_TOURNAMENT', 'ONLINE_EVENT'] as const;
const TYPE_LABELS: Record<string, string> = {
  CHAMPIONSHIP: 'Championship', REGIONAL: 'Regional', SPECIAL_EVENT: 'Special Event',
  STORE_TOURNAMENT: 'Store Tournament', ONLINE_EVENT: 'Online Event',
};
const REGION_COLORS: Record<string, string> = {
  HK: 'bg-red-100 text-red-700', JP: 'bg-blue-100 text-blue-700', EN: 'bg-green-100 text-green-700',
};
const TYPE_ICONS: Record<string, string> = {
  CHAMPIONSHIP: '🏆', REGIONAL: '🌍', SPECIAL_EVENT: '⭐', STORE_TOURNAMENT: '🏪', ONLINE_EVENT: '💻',
};

interface Tournament {
  id: string; eventId: string; name: string; type: string; date: string;
  location?: string; region: string; playerCount?: number; ageGroup?: string;
  _count: { results: number };
}

interface TrendRow {
  periodStart: string;
  periodEnd: string;
  totalCards: number;
  pokemon: number;
  trainer: number;
  item: number;
  stadium: number;
  tools: number;
}

interface TopCard {
  name: string;
  usage: number;
}

interface TopCardsByCategory {
  pokemon: TopCard[];
  trainer: TopCard[];
  item: TopCard[];
  stadium: TopCard[];
  tools: TopCard[];
}

interface TournamentDetailForTrend {
  date: string;
  results?: Array<{
    deck?: {
      id: string;
    };
  }>;
}

interface DeckDetailForTrend {
  id: string;
  cards?: Array<{
    quantity: number;
    card: {
      name?: string;
      supertype?: string;
      subtypes?: string[];
    };
  }>;
}

interface TournamentDeckRef {
  date: string;
  deckId: string;
}

export default function TournamentsPage() {
  const [region, setRegion] = useState('');
  const [type, setType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(0); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const take = 30;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tournaments', region, type, search, dateFrom, dateTo, sortBy, sortOrder, page],
    queryFn: () => apiClient.get('/tournaments', {
      params: {
        ...(region && { region }), ...(type && { type }), ...(search && { search }),
        ...(dateFrom && { dateFrom }), ...(dateTo && { dateTo }),
        ...(sortBy && { sortBy }), ...(sortOrder && { sortOrder }),
        skip: page * take, take,
      },
    }),
  });

  const { data: trendData, isLoading: trendLoading } = useQuery({
    queryKey: ['tournaments-card-usage-trend', region],
    queryFn: async () => {
      try {
        return await apiClient.get('/tournaments/trends/card-usage', {
          params: {
            periods: 10,
            ...(region && { region }),
          },
        });
      } catch {
        const fallbackRows = await buildTrendFallback(region || undefined);
        return { data: { data: fallbackRows } };
      }
    },
  });

  const { data: topCardsData, isLoading: topCardsLoading } = useQuery({
    queryKey: ['tournaments-top-cards-by-category', region],
    queryFn: () => buildTopCardsByCategory(region || undefined),
  });

  const tournaments: Tournament[] = data?.data?.data ?? [];
  const trendRows: TrendRow[] = trendData?.data?.data ?? [];
  const total: number = data?.data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / take);
  const hasFilters = region || type || search || dateFrom || dateTo;

  const clearAll = () => {
    setRegion(''); setType(''); setSearchInput(''); setSearch('');
    setDateFrom(''); setDateTo(''); setSortBy('date'); setSortOrder('desc'); setPage(0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-blue-600 text-white px-6 py-8">
        <h1 className="text-3xl font-bold">Tournaments</h1>
        <p className="text-purple-200 mt-1 text-lg">
          {isLoading ? 'Loading...' : <><span className="font-bold text-white">{total.toLocaleString()}</span> events found</>}
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <CardUsageTrendSection
          rows={trendRows}
          loading={trendLoading}
          topCards={topCardsData}
          topCardsLoading={topCardsLoading}
        />

        {/* Filter panel */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          {/* Search + sort row */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search name or location..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => { const [s, o] = e.target.value.split(':'); setSortBy(s); setSortOrder(o); setPage(0); }}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="date:desc">Date ↓ (Newest)</option>
              <option value="date:asc">Date ↑ (Oldest)</option>
              <option value="playerCount:desc">Players ↓</option>
              <option value="playerCount:asc">Players ↑</option>
            </select>
            {hasFilters && (
              <button onClick={clearAll} className="text-sm text-gray-400 hover:text-red-500 transition-colors px-2">✕ Clear all</button>
            )}
          </div>

          {/* Region tabs */}
          <div className="flex gap-2 flex-wrap">
            {REGIONS.map((r) => (
              <button
                key={r || 'all'}
                onClick={() => { setRegion(r); setPage(0); }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  region === r
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r || 'All Regions'}
              </button>
            ))}
            <div className="w-px bg-gray-200 mx-1 self-stretch" />
            {TYPES.map((t) => (
              <button
                key={t || 'all'}
                onClick={() => { setType(t); setPage(0); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  type === t
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t ? `${TYPE_ICONS[t]} ${TYPE_LABELS[t]}` : 'All Types'}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm text-gray-500 shrink-0">Date range:</span>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }} className="text-xs text-gray-400 hover:text-red-500">✕</button>
            )}
          </div>
        </div>

        {/* Results grid */}
        {isLoading && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-1" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        )}
        {error && <div className="mt-8 text-center text-red-500 py-12">Failed to load tournaments.</div>}
        {!isLoading && !error && tournaments.length === 0 && (
          <div className="mt-12 text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-gray-500 text-lg font-medium">No tournaments found</p>
            <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
            {hasFilters && <button onClick={clearAll} className="mt-4 text-purple-600 hover:underline text-sm">Clear all filters</button>}
          </div>
        )}

        {!isLoading && !error && tournaments.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournaments.map((t) => (
              <Link key={t.id} href={`/tournaments/${t.id}`}
                className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-all border border-gray-100 hover:border-purple-200 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight flex-1 group-hover:text-purple-700 transition-colors">{t.name}</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${REGION_COLORS[t.region] ?? 'bg-gray-100 text-gray-600'}`}>{t.region}</span>
                </div>
                {t.type && (
                  <p className="text-xs text-purple-600 mt-1 font-medium">{TYPE_ICONS[t.type]} {TYPE_LABELS[t.type] ?? t.type}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  📅 {new Date(t.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
                {t.location && <p className="text-xs text-gray-400 mt-0.5 truncate">📍 {t.location}</p>}
                <div className="flex gap-3 mt-2 text-xs text-gray-500 border-t pt-2">
                  {t.playerCount ? <span>👥 {t.playerCount}</span> : null}
                  {t._count?.results > 0 && <span>📋 {t._count.results} results</span>}
                  {t.ageGroup && <span>🏷 {t.ageGroup}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-8">
            <button onClick={() => setPage(0)} disabled={page === 0}
              className="px-3 py-2 rounded-lg border text-sm disabled:opacity-30 hover:bg-gray-100">«</button>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="px-4 py-2 rounded-lg border text-sm disabled:opacity-30 hover:bg-gray-100">← Prev</button>
            <span className="px-4 py-2 text-sm text-gray-600 bg-white border rounded-lg">
              {page + 1} / {totalPages}
            </span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-lg border text-sm disabled:opacity-30 hover:bg-gray-100">Next →</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
              className="px-3 py-2 rounded-lg border text-sm disabled:opacity-30 hover:bg-gray-100">»</button>
          </div>
        )}
      </div>
    </div>
  );
}

async function fetchTournamentDeckRefs(region?: string): Promise<TournamentDeckRef[]> {
  const listRes = await apiClient.get('/tournaments', {
    params: {
      ...(region && { region }),
      take: 60,
      skip: 0,
      sortBy: 'date',
      sortOrder: 'desc',
    },
  });

  const tournaments: Array<{ id: string }> = listRes.data?.data ?? [];
  if (tournaments.length === 0) return [];

  const chunks: Array<Array<{ id: string }>> = [];
  for (let i = 0; i < tournaments.length; i += 8) {
    chunks.push(tournaments.slice(i, i + 8));
  }

  const details: TournamentDetailForTrend[] = [];
  for (const chunk of chunks) {
    const chunkResult = await Promise.all(
      chunk.map(async (t) => {
        try {
          const res = await apiClient.get(`/tournaments/${t.id}`);
          return res.data as TournamentDetailForTrend;
        } catch {
          return null;
        }
      }),
    );
    details.push(...chunkResult.filter((x): x is TournamentDetailForTrend => !!x));
  }

  const refs: TournamentDeckRef[] = [];
  for (const tournament of details) {
    for (const result of tournament.results ?? []) {
      if (result.deck?.id) refs.push({ date: tournament.date, deckId: result.deck.id });
    }
  }
  return refs;
}

async function fetchDeckMapByIds(deckIds: string[]): Promise<Map<string, DeckDetailForTrend>> {
  const uniqueDeckIds = Array.from(new Set(deckIds));
  const deckMap = new Map<string, DeckDetailForTrend>();
  for (let i = 0; i < uniqueDeckIds.length; i += 8) {
    const chunk = uniqueDeckIds.slice(i, i + 8);
    const deckChunk = await Promise.all(
      chunk.map(async (deckId) => {
        try {
          const res = await apiClient.get(`/decks/${deckId}`);
          return res.data as DeckDetailForTrend;
        } catch {
          return null;
        }
      }),
    );
    for (const deck of deckChunk) {
      if (deck?.id) deckMap.set(deck.id, deck);
    }
  }
  return deckMap;
}

async function buildTrendFallback(region?: string): Promise<TrendRow[]> {
  const tournamentDeckRefs = await fetchTournamentDeckRefs(region);

  const deckMap = await fetchDeckMapByIds(tournamentDeckRefs.map((r) => r.deckId));

  const bucketMap = new Map<number, TrendRow>();
  const bucketMs = 14 * 24 * 60 * 60 * 1000;

  for (const ref of tournamentDeckRefs) {
    const dateMs = new Date(ref.date).getTime();
    const bucketStartMs = Math.floor(dateMs / bucketMs) * bucketMs;
    const bucketEndMs = bucketStartMs + (13 * 24 * 60 * 60 * 1000);

    if (!bucketMap.has(bucketStartMs)) {
      bucketMap.set(bucketStartMs, {
        periodStart: new Date(bucketStartMs).toISOString(),
        periodEnd: new Date(bucketEndMs).toISOString(),
        totalCards: 0,
        pokemon: 0,
        trainer: 0,
        item: 0,
        stadium: 0,
        tools: 0,
      });
    }

    const bucket = bucketMap.get(bucketStartMs)!;
    const deck = deckMap.get(ref.deckId);
    if (!deck) continue;

    for (const deckCard of deck.cards ?? []) {
      const qty = deckCard.quantity ?? 0;
      const supertype = deckCard.card?.supertype ?? '';
      const subtypes = deckCard.card?.subtypes ?? [];

      bucket.totalCards += qty;
      if (supertype === 'POKEMON') bucket.pokemon += qty;
      if (supertype === 'TRAINER') bucket.trainer += qty;
      if (supertype === 'TRAINER' && subtypes.includes('ITEM')) bucket.item += qty;
      if (supertype === 'TRAINER' && subtypes.includes('STADIUM')) bucket.stadium += qty;
      if (supertype === 'TRAINER' && subtypes.includes('TOOL')) bucket.tools += qty;
    }
  }

  return Array.from(bucketMap.values())
    .sort((a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime())
    .slice(-10);
}

async function buildTopCardsByCategory(region?: string): Promise<TopCardsByCategory> {
  const refs = await fetchTournamentDeckRefs(region);
  const bucketMs = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const latestBucketStart = Math.floor(now / bucketMs) * bucketMs;
  const previousBucketStart = latestBucketStart - bucketMs;
  const allowedBuckets = new Set([latestBucketStart, previousBucketStart]);

  const recentRefs = refs.filter((r) => {
    const start = Math.floor(new Date(r.date).getTime() / bucketMs) * bucketMs;
    return allowedBuckets.has(start);
  });

  const deckMap = await fetchDeckMapByIds(recentRefs.map((r) => r.deckId));

  const groups: Record<string, Record<string, number>> = {
    pokemon: {},
    trainer: {},
    item: {},
    stadium: {},
    tools: {},
  };

  for (const ref of recentRefs) {
    const deck = deckMap.get(ref.deckId);
    if (!deck) continue;
    for (const dc of deck.cards ?? []) {
      const q = dc.quantity ?? 0;
      const name = dc.card?.name || 'Unknown';
      const supertype = dc.card?.supertype ?? '';
      const subtypes = dc.card?.subtypes ?? [];

      if (supertype === 'POKEMON') {
        groups.pokemon[name] = (groups.pokemon[name] ?? 0) + q;
      }
      if (supertype === 'TRAINER') {
        groups.trainer[name] = (groups.trainer[name] ?? 0) + q;
      }
      if (supertype === 'TRAINER' && subtypes.includes('ITEM')) {
        groups.item[name] = (groups.item[name] ?? 0) + q;
      }
      if (supertype === 'TRAINER' && subtypes.includes('STADIUM')) {
        groups.stadium[name] = (groups.stadium[name] ?? 0) + q;
      }
      if (supertype === 'TRAINER' && subtypes.includes('TOOL')) {
        groups.tools[name] = (groups.tools[name] ?? 0) + q;
      }
    }
  }

  const top5 = (obj: Record<string, number>): TopCard[] =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, usage]) => ({ name, usage }));

  return {
    pokemon: top5(groups.pokemon),
    trainer: top5(groups.trainer),
    item: top5(groups.item),
    stadium: top5(groups.stadium),
    tools: top5(groups.tools),
  };
}

function CardUsageTrendSection({
  rows,
  loading,
  topCards,
  topCardsLoading,
}: {
  rows: TrendRow[];
  loading: boolean;
  topCards?: TopCardsByCategory;
  topCardsLoading: boolean;
}) {
  if (loading) {
    return (
      <div className="mb-4 bg-white rounded-xl shadow-sm p-4">
        <p className="text-sm text-gray-500">Loading 2-week card usage trend...</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="mb-4 bg-white rounded-xl shadow-sm p-4">
        <p className="text-sm text-gray-500">No trend data available yet.</p>
      </div>
    );
  }

  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;

  const categories: Array<{ key: keyof TopCardsByCategory; label: string }> = [
    { key: 'pokemon', label: 'Pokemon' },
    { key: 'trainer', label: 'Trainer' },
    { key: 'item', label: 'Item' },
    { key: 'stadium', label: 'Stadium' },
    { key: 'tools', label: 'Tools' },
  ];

  const maxTotal = Math.max(...rows.map((r) => r.totalCards), 1);

  return (
    <div className="mb-4 bg-white rounded-xl shadow-sm p-4 border border-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-900">Card Usage Trend (Every 2 Weeks)</h2>
        <span className="text-xs text-gray-500">
          Latest window: {new Date(last.periodStart).toLocaleDateString()} - {new Date(last.periodEnd).toLocaleDateString()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {categories.map((cat) => {
          const items = topCards?.[cat.key] ?? [];
          return (
            <div key={cat.key} className="rounded-lg border border-gray-100 p-3">
              <p className="text-xs text-gray-500 mb-2">Top 5 {cat.label}</p>
              {topCardsLoading ? (
                <p className="text-xs text-gray-400">Loading...</p>
              ) : items.length === 0 ? (
                <p className="text-xs text-gray-400">No data</p>
              ) : (
                <div className="space-y-1">
                  {items.map((it, idx) => (
                    <div key={`${it.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-700 truncate">{idx + 1}. {it.name}</span>
                      <span className="text-gray-500 shrink-0">{it.usage.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Total card usage per 2-week bucket</p>
        <div className="flex items-end gap-1 h-24">
          {rows.map((r) => {
            const height = Math.max(8, Math.round((r.totalCards / maxTotal) * 96));
            return (
              <div key={r.periodStart} className="flex-1 flex flex-col items-center justify-end">
                <div
                  className="w-full max-w-[24px] bg-gradient-to-t from-indigo-500 to-violet-400 rounded-t"
                  style={{ height }}
                  title={`${new Date(r.periodStart).toLocaleDateString()} - ${new Date(r.periodEnd).toLocaleDateString()}: ${r.totalCards.toLocaleString()}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}