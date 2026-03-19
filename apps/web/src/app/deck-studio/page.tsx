'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

const ARCHETYPE_COLORS: Record<string, string> = {
  AGGRO: 'bg-red-100 text-red-700',
  CONTROL: 'bg-blue-100 text-blue-700',
  COMBO: 'bg-purple-100 text-purple-700',
  MIDRANGE: 'bg-yellow-100 text-yellow-700',
  TOOLBOX: 'bg-green-100 text-green-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

interface Deck {
  id: string;
  name: string;
  description?: string;
  archetype?: string;
  format?: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { cards: number };
}

export default function DeckStudioPage() {
  const [search, setSearch] = useState('');
  const [selectedArchetype, setSelectedArchetype] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['decks', search, selectedArchetype],
    queryFn: () =>
      apiClient.get('/decks', {
        params: {
          ...(search && { search }),
          ...(selectedArchetype && { archetype: selectedArchetype }),
          take: 100,
        },
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/decks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const decks: Deck[] = data?.data?.data ?? [];
  const total: number = data?.data?.meta?.total ?? 0;
  const validDecks = decks.filter((d) => d._count.cards === 60).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-purple-700 to-indigo-600 text-white p-6">
        <h1 className="text-3xl font-bold">Deck Studio</h1>
        <p className="text-purple-200 mt-1">Manage and review your saved decks</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-purple-700">{total}</p>
            <p className="text-sm text-gray-500 mt-1">Total Decks</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{validDecks}</p>
            <p className="text-sm text-gray-500 mt-1">60-Card Decks</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{total - validDecks}</p>
            <p className="text-sm text-gray-500 mt-1">In Progress</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-center">
            <Link
              href="/deck-builder"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              + New Deck
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search decks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <select
            value={selectedArchetype}
            onChange={(e) => setSelectedArchetype(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="">All Archetypes</option>
            {['AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'TOOLBOX', 'OTHER'].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {isLoading && <p className="text-center text-gray-400 py-8">Loading decks...</p>}

        {!isLoading && decks.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-4">No decks yet.</p>
            <Link
              href="/deck-builder"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              Build Your First Deck
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <div key={deck.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">{deck.name}</h3>
                  {deck.archetype && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ARCHETYPE_COLORS[deck.archetype] ?? 'bg-gray-100 text-gray-600'}`}>
                      {deck.archetype}
                    </span>
                  )}
                </div>
                {deck.description && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{deck.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span className={`font-semibold ${deck._count.cards === 60 ? 'text-green-600' : 'text-orange-500'}`}>
                    {deck._count.cards}/60 cards
                  </span>
                  {deck.format && <span>· {deck.format}</span>}
                  {deck.isPublic && <span className="text-blue-500">· Public</span>}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Updated {new Date(deck.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex border-t">
                <Link
                  href={`/deck-builder?deckId=${deck.id}`}
                  className="flex-1 text-center py-2 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
                >
                  Edit
                </Link>
                <div className="w-px bg-gray-100" />
                <button
                  onClick={() => {
                    if (confirm(`Delete "${deck.name}"?`)) {
                      deleteMutation.mutate(deck.id);
                    }
                  }}
                  className="flex-1 py-2 text-xs text-red-400 hover:bg-red-50 transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
