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

  const tournaments: Tournament[] = data?.data?.data ?? [];
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