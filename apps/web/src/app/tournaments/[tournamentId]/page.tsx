'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface PageProps {
  params: Promise<{ tournamentId: string }>;
}

const ARCHETYPE_COLORS: Record<string, string> = {
  AGGRO: 'bg-red-100 text-red-700',
  CONTROL: 'bg-blue-100 text-blue-700',
  COMBO: 'bg-purple-100 text-purple-700',
  MIDRANGE: 'bg-yellow-100 text-yellow-700',
  TOOLBOX: 'bg-green-100 text-green-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

const PLACEMENT_BADGE: Record<number, string> = {
  1: 'bg-yellow-400 text-yellow-900',
  2: 'bg-gray-300 text-gray-800',
  3: 'bg-orange-300 text-orange-900',
};

export default function TournamentDetailPage({ params }: PageProps) {
  const { tournamentId } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => apiClient.get(`/tournaments/${tournamentId}`),
  });

  const tournament = data?.data;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading tournament...
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Tournament not found or failed to load.</p>
          <Link href="/tournaments" className="text-blue-600 hover:underline">← Back to Tournaments</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-700 to-blue-600 text-white p-6">
        <Link href="/tournaments" className="text-purple-200 hover:text-white text-sm mb-2 block">
          ← Tournaments
        </Link>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <div className="flex flex-wrap gap-3 mt-2 text-sm text-purple-200">
          <span>📅 {new Date(tournament.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          {tournament.location && <span>📍 {tournament.location}</span>}
          {tournament.playerCount && <span>👥 {tournament.playerCount} players</span>}
          <span className="bg-white/20 px-2 py-0.5 rounded">{tournament.region}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Meta summary */}
        {tournament.results?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Archetype Breakdown</h2>
            <ArchetypeChart results={tournament.results} />
          </div>
        )}

        {/* Results table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800">
              Results ({tournament.results?.length ?? 0})
            </h2>
          </div>
          {tournament.results?.length === 0 && (
            <p className="text-gray-400 text-center py-8">No results recorded.</p>
          )}
          <div className="divide-y">
            {tournament.results?.map((result: any) => (
              <div key={result.id} className="flex items-center gap-4 p-4 hover:bg-gray-50">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${PLACEMENT_BADGE[result.placement] ?? 'bg-gray-100 text-gray-600'}`}>
                  {result.placement}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{result.playerName}</p>
                  {result.deckName && (
                    <p className="text-sm text-gray-500">{result.deckName}</p>
                  )}
                </div>
                {result.deckArchetype && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ARCHETYPE_COLORS[result.deckArchetype] ?? 'bg-gray-100 text-gray-600'}`}>
                    {result.deckArchetype}
                  </span>
                )}
                {result.deck && (
                  <Link
                    href={`/deck-builder?deckId=${result.deck.id}`}
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    View Deck →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchetypeChart({ results }: { results: any[] }) {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const arch = r.deckArchetype ?? 'UNKNOWN';
    counts[arch] = (counts[arch] ?? 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = results.length;

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map(([arch, count]) => (
        <div key={arch} className={`px-3 py-1.5 rounded-full text-sm font-medium ${ARCHETYPE_COLORS[arch] ?? 'bg-gray-100 text-gray-600'}`}>
          {arch} · {count} ({Math.round((count / total) * 100)}%)
        </div>
      ))}
    </div>
  );
}
