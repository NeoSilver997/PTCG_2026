'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';

interface TopCard {
  cardId: string;
  name: string;
  imageUrl: string;
  supertype: string;
  subtypes: string[];
  frequency: number;
  deckCount: number;
}

interface TypeDistribution {
  pokemonType: string;
  deckCount: number;
  avgPlacement: number;
  winRatePercent: number;
}

interface DeckStats {
  totalDecks: number;
  avgPokemon: number;
  avgTrainer: number;
  avgEnergy: number;
  avgCardsTotal: number;
}

interface Archetype {
  archetypeName: string;
  deckCount: number;
  avgPlacement: number;
  keyImage: string | null;
}

interface DeckMetaSummary {
  region: string;
  sinceDate: string | null;
  topCards: TopCard[];
  typeDistribution: TypeDistribution[];
  deckStats: DeckStats | null;
  archetypes: Archetype[];
}

const REGIONS = [
  { value: '', label: 'All Regions' },
  { value: 'JP', label: 'Japan (JP)' },
  { value: 'HK', label: 'Hong Kong (HK)' },
  { value: 'EN', label: 'English (EN)' },
];

// Approximate JP SV-series expansion launch dates (used in getPresets below)

function getPresets() {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const minus = (days: number) => { const d = new Date(now); d.setDate(d.getDate() - days); return fmt(d); };
  return [
    { label: 'All Time', value: '' },
    { label: 'Last 30 days', value: minus(30) },
    { label: 'Last 90 days', value: minus(90) },
    { label: 'SV9A era (~Mar 2025)', value: '2025-03-21' },
    { label: 'SV9 era (~Jan 2025)', value: '2025-01-17' },
    { label: 'SV8A era (~Oct 2024)', value: '2024-10-18' },
    { label: 'SV8 era (~Jul 2024)', value: '2024-07-19' },
  ];
}

export default function DeckMetaSummaryPage() {
  const [region, setRegion] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const presets = getPresets();

  const { data, isLoading, error } = useQuery({
    queryKey: ['deck-meta-summary', region, sinceDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (region) params.append('region', region);
      if (sinceDate) params.append('sinceDate', sinceDate);
      params.append('limit', '25');
      const res = await fetch(
        `http://localhost:4000/api/v1/tournaments/meta/deck-summary?${params}`,
      );
      if (!res.ok) throw new Error('Failed to fetch meta summary');
      return (await res.json()) as DeckMetaSummary;
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Deck Meta Summary</h1>
          <p className="text-slate-300">
            Analyze popular Pokemon TCG deck archetypes, top cards, and meta statistics
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-slate-300 font-medium text-sm">Region:</label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white hover:bg-slate-600 transition text-sm"
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-300 font-medium text-sm">Format:</label>
            <select
              value={sinceDate}
              onChange={(e) => setSinceDate(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white hover:bg-slate-600 transition text-sm"
            >
              {presets.map((p) => (
                <option key={p.label} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-300 font-medium text-sm">Custom since:</label>
            <input
              type="date"
              value={sinceDate}
              onChange={(e) => setSinceDate(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white hover:bg-slate-600 transition text-sm"
            />
          </div>
          {sinceDate && (
            <button
              onClick={() => setSinceDate('')}
              className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded text-sm transition"
            >
              Clear date
            </button>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center items-center h-64">
            <div className="text-white text-xl">Loading meta data...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded mb-6">
            Error loading meta summary. Make sure the API server is running on port 4000.
          </div>
        )}

        {data && (
          <>
            {/* Deck Statistics Cards */}
            {data.deckStats && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                <StatCard
                  label="Total Decks"
                  value={data.deckStats.totalDecks.toLocaleString()}
                />
                <StatCard
                  label="Avg Pokemon"
                  value={data.deckStats.avgPokemon.toFixed(1)}
                />
                <StatCard
                  label="Avg Trainer"
                  value={data.deckStats.avgTrainer.toFixed(1)}
                />
                <StatCard
                  label="Avg Energy"
                  value={data.deckStats.avgEnergy.toFixed(1)}
                />
                <StatCard
                  label="Total Cards/Deck"
                  value={data.deckStats.avgCardsTotal.toFixed(1)}
                />
              </div>
            )}

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Type Distribution */}
              <div className="bg-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Pokemon Type Meta</h2>
                <div className="space-y-3">
                  {data.typeDistribution.map((type) => (
                    <div
                      key={type.pokemonType}
                      className="bg-slate-600 rounded p-4 hover:bg-slate-500 transition"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-white font-bold">{type.pokemonType}</h3>
                          <p className="text-slate-300 text-sm">
                            {type.deckCount} decks • Avg placement: {type.avgPlacement}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-400">
                            {type.winRatePercent}%
                          </div>
                          <p className="text-slate-300 text-xs">Win Rate</p>
                        </div>
                      </div>
                      <div className="w-full bg-slate-700 rounded h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-cyan-400 h-2 rounded"
                          style={{ width: `${Math.min(type.winRatePercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Archetypes */}
              <div className="bg-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Deck Archetypes</h2>
                <p className="text-slate-400 text-xs mb-4">
                  Named by key Pokémon: highest evolution + ex priority (≥2 copies)
                </p>
                <div className="space-y-3">
                  {data.archetypes.map((arch, idx) => (
                    <div
                      key={arch.archetypeName}
                      className="bg-slate-600 rounded p-3 hover:bg-slate-500 transition"
                    >
                      <div className="flex items-center gap-3">
                        {arch.keyImage && (
                          <Image
                            src={arch.keyImage}
                            alt={arch.archetypeName}
                            width={36}
                            height={50}
                            className="rounded border border-slate-500 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="text-white font-bold text-sm truncate">
                              #{idx + 1} {arch.archetypeName}
                            </h3>
                            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs flex-shrink-0">
                              {arch.deckCount} decks
                            </span>
                          </div>
                          <p className="text-slate-300 text-xs mt-0.5">
                            Avg placement: {arch.avgPlacement.toFixed(1)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Cards */}
            <div className="mt-8 bg-slate-700 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-white mb-4">Top 25 Cards by Usage</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-600">
                    <tr className="text-slate-300 text-sm">
                      <th className="text-left py-2 px-3">Card Name</th>
                      <th className="text-left py-2 px-3">Type</th>
                      <th className="text-center py-2 px-3">Frequency</th>
                      <th className="text-center py-2 px-3">In Decks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-600">
                    {data.topCards.map((card, idx) => (
                      <tr
                        key={card.cardId}
                        className="hover:bg-slate-600 transition text-white text-sm"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400 font-mono text-xs">
                              #{idx + 1}
                            </span>
                            {card.imageUrl && (
                              <Image
                                src={card.imageUrl}
                                alt={card.name}
                                width={40}
                                height={56}
                                className="rounded border border-slate-500"
                              />
                            )}
                            <span className="font-medium">{card.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {card.supertype}
                          {card.subtypes?.length > 0 && (
                            <div className="text-xs text-slate-400">
                              {card.subtypes.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="bg-blue-600 text-white px-3 py-1 rounded-full font-bold">
                            {card.frequency}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {card.deckCount}
                          <div className="text-xs text-slate-400">
                            {((card.deckCount / (data.deckStats?.totalDecks ?? 1)) * 100).toFixed(
                              1,
                            )}
                            %
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg p-6 border border-slate-500">
      <p className="text-slate-300 text-sm font-medium mb-2">{label}</p>
      <p className="text-white text-3xl font-bold">{value}</p>
    </div>
  );
}
