'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface DeckInfo {
  id: string;
  deckCode?: string;
  deckData?: Array<{ cardId: string; cardName: string; quantity: number; imageUrl?: string }>;
}

interface TournamentResult {
  id: string;
  placement: number;
  playerName: string;
  deckName?: string;
  deck?: DeckInfo;
}

interface TournamentDetail {
  id: string;
  eventId: string;
  name: string;
  date: string;
  location?: string;
  region: string;
  results: TournamentResult[];
}

export default function DeckBuilderTournamentByEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deck-builder-tournament-event', eventId],
    queryFn: async () => {
      try {
        const response = await apiClient.get<TournamentDetail>(`/tournaments/event/${eventId}`);
        return response.data;
      } catch {
        // Fallback for stale API instances that do not expose /tournaments/event/:eventId yet.
        const take = 100;
        let skip = 0;
        let foundId: string | null = null;
        while (foundId === null) {
          const listRes = await apiClient.get<{ data: Array<{ id: string; eventId: string }>; meta: { total: number } }>('/tournaments', {
            params: { skip, take },
          });
          const page = listRes.data?.data ?? [];
          const match = page.find((t) => t.eventId === eventId);
          if (match) {
            foundId = match.id;
            break;
          }
          skip += take;
          if (skip >= (listRes.data?.meta?.total ?? 0) || page.length === 0) {
            break;
          }
        }

        if (!foundId) {
          throw new Error(`Event ${eventId} not found`);
        }

        const byId = await apiClient.get<TournamentDetail>(`/tournaments/${foundId}`);
        return byId.data;
      }
    },
  });

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading tournament...</div>;
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <p className="text-red-500 mb-3">Tournament not found.</p>
        <Link href="/deck-builder/tournaments" className="text-blue-600 hover:underline">Back to tournaments</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link href="/deck-builder/tournaments" className="text-sm text-blue-600 hover:underline">Back to tournaments</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{data.name}</h1>
        <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-3">
          <span>Event ID: {data.eventId}</span>
          <span>Date: {new Date(data.date).toLocaleDateString()}</span>
          <span>Region: {data.region}</span>
          {data.location && <span>Location: {data.location}</span>}
        </div>

        <div className="mt-6 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-900">Results ({data.results.length})</h2>
          </div>
          <div className="divide-y">
            {data.results.map((result) => (
              <div key={result.id} className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">#{result.placement} {result.playerName}</p>
                  {result.deckName && <p className="text-sm text-gray-500">{result.deckName}</p>}
                </div>
                {result.deck?.deckCode ? (
                  <Link
                    href={`/deck-builder/event/${result.deck.deckCode}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Open Deck {result.deck.deckCode}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-400">No deck</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
