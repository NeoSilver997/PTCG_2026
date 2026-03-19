'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

interface Card {
  id: string;
  webCardId: string;
  name: string;
  imageUrl?: string;
  supertype?: string;
  subtype?: string;
  types?: string[];
  rarity?: string;
}

interface DeckCard {
  cardId: string;
  quantity: number;
  card: Card;
}

interface Deck {
  id: string;
  name: string;
  description?: string;
  archetype?: string;
  cards: DeckCard[];
}

const ARCHETYPES = ['AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'TOOLBOX', 'OTHER'];
const SUPERTYPES = ['', 'POKEMON', 'TRAINER', 'ENERGY'];

function DeckBuilderInner() {
  const searchParams = useSearchParams();
  const deckId = searchParams.get('deckId');
  const queryClient = useQueryClient();

  // Deck state
  const [deckName, setDeckName] = useState('New Deck');
  const [deckArchetype, setDeckArchetype] = useState('');
  const [deckCards, setDeckCards] = useState<Map<string, DeckCard>>(new Map());
  const [savedDeckId, setSavedDeckId] = useState<string | null>(deckId);

  // Card search state
  const [cardSearch, setCardSearch] = useState('');
  const [supertype, setSupertype] = useState('');
  const [cardPage, setCardPage] = useState(0);

  const cardTake = 20;

  // Load existing deck if deckId provided
  const { data: deckData } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => apiClient.get(`/decks/${deckId}`),
    enabled: !!deckId,
  });

  useEffect(() => {
    const deck: Deck | undefined = deckData?.data;
    if (!deck) return;
    setDeckName(deck.name);
    setDeckArchetype(deck.archetype ?? '');
    const map = new Map<string, DeckCard>();
    for (const dc of deck.cards) {
      map.set(dc.card.webCardId, dc);
    }
    setDeckCards(map);
    setSavedDeckId(deck.id);
  }, [deckData]);

  // Card search
  const { data: cardsData, isLoading: cardsLoading } = useQuery({
    queryKey: ['cards-search', cardSearch, supertype, cardPage],
    queryFn: () =>
      apiClient.get('/cards', {
        params: {
          ...(cardSearch && { search: cardSearch }),
          ...(supertype && { supertype }),
          skip: cardPage * cardTake,
          take: cardTake,
        },
      }),
  });

  const cards: Card[] = cardsData?.data?.data ?? [];
  const totalCards: number = cardsData?.data?.meta?.total ?? 0;
  const totalCardPages = Math.ceil(totalCards / cardTake);

  // Save deck mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const cardPayload = Array.from(deckCards.values()).map((dc) => ({
        cardId: dc.card.webCardId,
        quantity: dc.quantity,
      }));

      if (savedDeckId) {
        // Update cards
        return apiClient.post(`/decks/${savedDeckId}/cards`, cardPayload);
      } else {
        const res = await apiClient.post('/decks', {
          name: deckName,
          archetype: deckArchetype || undefined,
          cards: cardPayload,
        });
        setSavedDeckId(res.data.id);
        return res;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      alert('Deck saved!');
    },
  });

  const totalCount = Array.from(deckCards.values()).reduce((s, dc) => s + dc.quantity, 0);

  const addCard = useCallback((card: Card) => {
    setDeckCards((prev) => {
      const next = new Map(prev);
      const existing = next.get(card.webCardId);
      if (existing) {
        if (existing.quantity < 4) {
          next.set(card.webCardId, { ...existing, quantity: existing.quantity + 1 });
        }
      } else {
        next.set(card.webCardId, { cardId: card.webCardId, quantity: 1, card });
      }
      return next;
    });
  }, []);

  const removeCard = useCallback((webCardId: string) => {
    setDeckCards((prev) => {
      const next = new Map(prev);
      const existing = next.get(webCardId);
      if (!existing) return prev;
      if (existing.quantity > 1) {
        next.set(webCardId, { ...existing, quantity: existing.quantity - 1 });
      } else {
        next.delete(webCardId);
      }
      return next;
    });
  }, []);

  const deckCardsSorted = Array.from(deckCards.values()).sort((a, b) => {
    const order = ['POKEMON', 'TRAINER', 'ENERGY'];
    return (
      (order.indexOf(a.card.supertype ?? '') - order.indexOf(b.card.supertype ?? '')) ||
      a.card.name.localeCompare(b.card.name)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-indigo-700 to-purple-600 text-white p-6">
        <h1 className="text-3xl font-bold">Deck Builder</h1>
        <p className="text-indigo-200 mt-1">Build and save your 60-card decks</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 flex gap-4 h-[calc(100vh-140px)]">
        {/* Left: Card Search */}
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-3 border-b space-y-2">
            <input
              type="text"
              placeholder="Search cards..."
              value={cardSearch}
              onChange={(e) => { setCardSearch(e.target.value); setCardPage(0); }}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <select
                value={supertype}
                onChange={(e) => { setSupertype(e.target.value); setCardPage(0); }}
                className="border rounded-md px-2 py-1.5 text-sm flex-1"
              >
                {SUPERTYPES.map((s) => (
                  <option key={s} value={s}>{s || 'All Types'}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400 self-center">{totalCards} cards</span>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {cardsLoading && <p className="text-center py-8 text-gray-400">Loading...</p>}
            {cards.map((card) => (
              <div
                key={card.webCardId}
                className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
                onClick={() => addCard(card)}
              >
                {card.imageUrl && (
                  <img src={card.imageUrl} alt={card.name} className="w-10 h-14 object-contain rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{card.name}</p>
                  <p className="text-xs text-gray-400">{card.supertype} · {card.rarity}</p>
                </div>
                <button className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-semibold hover:bg-indigo-200">
                  +
                </button>
              </div>
            ))}
          </div>

          {/* Card pagination */}
          {totalCardPages > 1 && (
            <div className="flex justify-between items-center p-2 border-t text-xs">
              <button onClick={() => setCardPage((p) => Math.max(0, p - 1))} disabled={cardPage === 0} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">←</button>
              <span className="text-gray-500">{cardPage + 1}/{totalCardPages}</span>
              <button onClick={() => setCardPage((p) => Math.min(totalCardPages - 1, p + 1))} disabled={cardPage >= totalCardPages - 1} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">→</button>
            </div>
          )}
        </div>

        {/* Right: Deck */}
        <div className="w-80 flex flex-col bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-3 border-b space-y-2">
            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full border rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Deck name"
            />
            <select
              value={deckArchetype}
              onChange={(e) => setDeckArchetype(e.target.value)}
              className="w-full border rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">No Archetype</option>
              {ARCHETYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${totalCount === 60 ? 'text-green-600' : totalCount > 60 ? 'text-red-600' : 'text-gray-700'}`}>
                {totalCount}/60 cards
              </span>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || deckCards.size === 0}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-40"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Deck'}
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {deckCardsSorted.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Click cards to add them</p>
            )}
            {deckCardsSorted.map((dc) => (
              <div key={dc.card.webCardId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 border-b border-gray-50">
                <span className="text-sm font-bold text-indigo-700 w-4 shrink-0">{dc.quantity}×</span>
                <span className="text-sm text-gray-800 flex-1 truncate">{dc.card.name}</span>
                <button onClick={() => addCard(dc.card)} className="text-green-600 hover:text-green-800 text-sm px-1">+</button>
                <button onClick={() => removeCard(dc.card.webCardId)} className="text-red-400 hover:text-red-600 text-sm px-1">−</button>
              </div>
            ))}
          </div>

          <div className="p-2 border-t">
            <Link href="/deck-studio" className="block text-center text-xs text-indigo-600 hover:underline">
              View all saved decks →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeckBuilderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>}>
      <DeckBuilderInner />
    </Suspense>
  );
}
