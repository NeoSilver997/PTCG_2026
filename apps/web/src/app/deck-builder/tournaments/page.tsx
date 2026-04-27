'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Calendar, PenSquare, Search, Sword, Users, Trophy } from 'lucide-react';
import apiClient from '@/lib/api-client';

interface Tournament {
  id: string;
  eventId: string;
  name: string;
  type: string;
  date: string;
  location?: string;
  playerCount?: number;
  _count?: { results: number };
}

const TYPE_LABELS: Record<string, string> = {
  CHAMPIONSHIP: 'Championship',
  REGIONAL: 'Regional',
  SPECIAL_EVENT: 'Special Event',
  STORE_TOURNAMENT: 'Store Tournament',
  ONLINE_EVENT: 'Online Event',
};

export default function DeckBuilderTournamentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const take = 30;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deck-builder-tournaments', searchTerm, page],
    queryFn: () =>
      apiClient.get('/tournaments', {
        params: {
          ...(searchTerm.trim() && { search: searchTerm.trim() }),
          skip: page * take,
          take,
        },
      }),
  });

  const tournaments: Tournament[] = data?.data?.data ?? [];
  const total: number = data?.data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / take));

  const totalPlayers = tournaments.reduce((sum, tournament) => sum + (tournament.playerCount ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <PenSquare className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Deck Builder</h1>
                <p className="text-sm text-gray-600">Tournament deck references</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <Link
                href="/deck-builder/tournaments/summary"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium w-full sm:w-auto"
              >
                <Trophy className="h-4 w-4" />
                <span>Tournament Summary</span>
              </Link>
              <Link
                href="/cards"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium w-full sm:w-auto"
              >
                <Search className="h-4 w-4" />
                <span>Card Search</span>
              </Link>
              <Link
                href="/deck-studio"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm font-medium w-full sm:w-auto"
              >
                <Sword className="h-4 w-4" />
                <span>Deck Studio</span>
              </Link>
              <div className="text-sm text-gray-500">
                {total} events
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100">Total Events</p>
                <p className="text-2xl font-bold">{total}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-200" />
            </div>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100">Total Players</p>
                <p className="text-2xl font-bold">{totalPlayers}</p>
              </div>
              <Users className="h-8 w-8 text-green-200" />
            </div>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100">Current Page</p>
                <p className="text-2xl font-bold">{page + 1}/{totalPages}</p>
              </div>
              <Calendar className="h-8 w-8 text-purple-200" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tournaments or location"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setPage(0); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-sm text-gray-500">Showing {tournaments.length} results</div>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Loading tournaments...</p>}
        {isError && <p className="text-sm text-red-500">Failed to load tournaments.</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <div
              key={tournament.eventId || tournament.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{tournament.name}</h3>
                    <p className="text-xs text-gray-500">Event ID: {tournament.eventId}</p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
                    {TYPE_LABELS[tournament.type] ?? tournament.type}
                  </span>
                </div>
                  <div className="text-sm text-gray-600 space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Date</span>
                      <span className="font-medium">{new Date(tournament.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Location</span>
                      <span className="font-medium">{tournament.location || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Players</span>
                      <span className="font-medium">{tournament.playerCount ?? '-'}</span>
                    </div>
                  </div>
                </div>
              <div className="p-5 bg-gray-50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Results</span>
                  <span className="font-semibold text-gray-900">{tournament._count?.results ?? 0}</span>
                </div>
              </div>
              <div className="p-4 border-t border-gray-100">
                <Link
                  href={`/deck-builder/tournaments/${tournament.eventId}`}
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  Open Tournament Decks
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Prev
          </button>
          <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
          <button
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-40"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
