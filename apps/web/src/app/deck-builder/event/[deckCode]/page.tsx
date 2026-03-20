'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import apiClient from '@/lib/api-client';

interface DeckCardData {
  cardId: string;
  cardName: string;
  cardCode?: string;
  quantity: number;
  imageUrl?: string;
}

interface DeckResponse {
  id: string;
  name: string;
  deckCode?: string;
  deckData?: DeckCardData[];
  cards?: Array<{
    quantity: number;
    card: {
      webCardId: string;
      name: string;
      imageUrl?: string;
    };
  }>;
}

export default function DeckBuilderEventDeckPage({ params }: { params: Promise<{ deckCode: string }> }) {
  const { deckCode } = use(params);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deck-by-code', deckCode],
    queryFn: async () => {
      try {
        const response = await apiClient.get<DeckResponse>(`/decks/code/${deckCode}`);
        return response.data;
      } catch {
        // Fallback for stale API instances that do not expose /decks/code/:deckCode yet.
        const mapRes = await fetch('/deck-code-map.json');
        if (!mapRes.ok) {
          throw new Error('Deck code map not found');
        }
        const codeMap = (await mapRes.json()) as Array<{ deckCode: string; id: string }>;
        const found = codeMap.find((entry) => entry.deckCode === deckCode);
        if (!found) {
          throw new Error(`Deck code ${deckCode} not found in map`);
        }
        const byId = await apiClient.get<DeckResponse>(`/decks/${found.id}`);
        return {
          ...byId.data,
          deckCode,
        };
      }
    },
  });

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading deck...</div>;
  }

  if (isError || !data) {
    return (
      <div className="p-6">
        <p className="text-red-500 mb-3">Deck not found.</p>
        <Link href="/deck-builder/tournaments" className="text-blue-600 hover:underline">Back to tournaments</Link>
      </div>
    );
  }

  const deckCards = data.deckData && data.deckData.length > 0
    ? data.deckData
    : (data.cards ?? []).map((c) => ({
        cardId: c.card.webCardId,
        cardName: c.card.name,
        quantity: c.quantity,
        imageUrl: c.card.imageUrl,
      }));
  const totalCards = deckCards.reduce((sum, card) => sum + card.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link href="/deck-builder/tournaments" className="text-sm text-blue-600 hover:underline">Back to tournaments</Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{data.name}</h1>
        <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-3">
          <span>Original Deck ID: {data.deckCode || deckCode}</span>
          <span>Total Cards: {totalCards}</span>
          <span>Unique: {deckCards.length}</span>
        </div>

        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-4">Deck List</h2>
          {deckCards.length === 0 ? (
            <p className="text-sm text-gray-500">No deck data available.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {deckCards.map((card, index) => (
                <div key={`${card.cardId}-${index}`} className="border rounded-md p-2 bg-gray-50">
                  <div className="relative w-full h-28 bg-gray-200 rounded overflow-hidden">
                    {card.imageUrl ? (
                      <Image
                        src={card.imageUrl}
                        alt={card.cardName}
                        fill
                        sizes="180px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <p className="text-xs font-medium mt-2 line-clamp-2">{card.cardName}</p>
                  <p className="text-xs text-gray-500 mt-1">x{card.quantity}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
