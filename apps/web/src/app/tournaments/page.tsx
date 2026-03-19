'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

const REGIONS = ['', 'HK', 'JP', 'EN'];
const TYPES = [
  '',
  'CHAMPIONSHIP',
  'REGIONAL',
  'SPECIAL_EVENT',
  'STORE_TOURNAMENT',
  'ONLINE_EVENT',
];

const TYPE_LABELS: Record<string, string> = {
  CHAMPIONSHIP: 'Championship',
  REGIONAL: 'Regional',
  SPECIAL_EVENT: 'Special Event',
  STORE_TOURNAMENT: 'Store Tournament',
  ONLINE_EVENT: 'Online Event',
};

const REGION_COLORS: Record<string, string> = {
  HK: 'bg-red-100 text-red-700',
  JP: 'bg-blue-100 text-blue-700',
  EN: 'bg-green-100 text-green-700',
};

interface Tournament {
  id: string;
  eventId: string;
  name: string;
  type: string;
  date: string;
  location?: string;
  region: string;
  playerCount?: number;
  ageGroup?: string;
  _count: { results: number };
}

export default function TournamentsPage() {
  const [region, setRegion] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const take = 30;

  const { data, isLoading, error } = useQuery({
    queryKey: ['tournaments', region, type, search, page],
    queryFn: () =>
      apiClient.get('/tournaments', {
        params: {
          ...(region && { region }),
          ...(type && { type }),
          ...(search && { search }),
          skip: page * take,
          take,
        },
      }),
  });

  const tournaments: Tournament[] = data?.data?.data ?? [];
  const total: number = data?.data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-700 to-blue-600 text-white p-6">
        <h1 className="text-3xl font-bold">Tournaments</h1>
        <p className="text-purple-200 mt-1">{total.toLocaleString()} events found</p>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search name or location..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="border rounded-md px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={region}
            onChange={(e) => { setRegion(e.target.value); setPage(0); }}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r || 'All Regions'}</option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(0); }}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t ? TYPE_LABELS[t] : 'All Types'}</option>
            ))}
          </select>
          {(region || type || search) && (
            <button
              onClick={() => { setRegion(''); setType(''); setSearch(''); setPage(0); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results */}
        {isLoading && (
          <div className="mt-8 text-center text-gray-500">Loading tournaments...</div>
        )}
        {error && (
          <div className="mt-8 text-center text-red-500">Failed to load tournaments.</div>
        )}
        {!isLoading && !error && tournaments.length === 0 && (
          <div className="mt-8 text-center text-gray-400">No tournaments found.</div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow border border-gray-100"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight flex-1">{t.name}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${REGION_COLORS[t.region] ?? 'bg-gray-100 text-gray-600'}`}>
                  {t.region}
                </span>
              </div>
              {t.type && (
                <p className="text-xs text-purple-600 mt-1 font-medium">{TYPE_LABELS[t.type] ?? t.type}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {new Date(t.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </p>
              {t.location && <p className="text-xs text-gray-400 mt-0.5">📍 {t.location}</p>}
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                {t.playerCount && <span>👥 {t.playerCount} players</span>}
                {t._count?.results > 0 && <span>📋 {t._count.results} results</span>}
                {t.ageGroup && <span>🏷 {t.ageGroup}</span>}
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-md border text-sm disabled:opacity-40 hover:bg-gray-100"
            >
              ← Prev
            </button>
            <span className="px-4 py-2 text-sm text-gray-600">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-md border text-sm disabled:opacity-40 hover:bg-gray-100"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
