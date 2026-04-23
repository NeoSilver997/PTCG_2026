'use client';

import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

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

  // Mutation to reload deck names
  const reloadDeckNamesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/scraper-jobs', {
        type: 'REFRESH_DECK_META',
        refreshAll: true,
        dryRun: false,
      });
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate and refetch the tournament data after a delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['deck-builder-tournament-event', eventId] });
      }, 5000); // Wait 5 seconds for the job to complete
      alert(`Deck names reload started! Job ID: ${data.id}. Please wait a few seconds and refresh the page.`);
    },
    onError: (error) => {
      console.error('Failed to reload deck names:', error);
      alert('Failed to reload deck names. Check console for details.');
    },
  });

  // Function to export tournament to markdown
  const exportToMarkdown = () => {
    if (!data) return;

    const deckNameCounts = new Map<string, number>();
    const deckNames: string[] = [];

    data.results.forEach((result) => {
      if (result.deckName) {
        deckNameCounts.set(result.deckName, (deckNameCounts.get(result.deckName) || 0) + 1);
        deckNames.push(result.deckName);
      }
    });

    const uniqueDeckNames = Array.from(deckNameCounts.entries())
      .sort((a, b) => b[1] - a[1]); // Sort by frequency

    let markdown = `# ${data.name}\n\n`;
    markdown += `**Event ID:** ${data.eventId}\n`;
    markdown += `**Date:** ${new Date(data.date).toLocaleDateString()}\n`;
    markdown += `**Region:** ${data.region}\n`;
    if (data.location) markdown += `**Location:** ${data.location}\n`;
    markdown += `**Total Results:** ${data.results.length}\n\n`;

    markdown += `## Results\n\n`;
    data.results.forEach((result) => {
      markdown += `${result.placement}. **${result.playerName}**`;
      if (result.deckName) {
        markdown += ` - ${result.deckName}`;
      }
      if (result.deck?.deckCode) {
        markdown += ` ([View Deck](${window.location.origin}/deck-builder/event/${result.deck.deckCode}))`;
      }
      markdown += `\n`;
    });

    markdown += `\n## Deck Name Summary\n\n`;
    markdown += `### Unique Deck Names (${uniqueDeckNames.length})\n\n`;
    uniqueDeckNames.forEach(([name, count]) => {
      markdown += `- ${name} (${count} ${count === 1 ? 'deck' : 'decks'})\n`;
    });

    markdown += `\n### All Deck Names\n\n`;
    deckNames.forEach((name) => {
      markdown += `- ${name}\n`;
    });

    // Create and download the markdown file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.name.replace(/[^a-zA-Z0-9]/g, '_')}_tournament.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={exportToMarkdown}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Export to Markdown
          </button>
          <button
            onClick={() => reloadDeckNamesMutation.mutate()}
            disabled={reloadDeckNamesMutation.isPending}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reloadDeckNamesMutation.isPending ? 'Reloading...' : 'Reload Deck Names'}
          </button>
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
