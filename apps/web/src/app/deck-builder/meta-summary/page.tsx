'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface TopCard {
  name: string;
  imageUrl: string;
  supertype: string;
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
  key1Image: string | null;
  key2Image: string | null;
  keyItemName: string | null;
  keyItemImage: string | null;
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
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ['deck-meta-summary', region, sinceDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (region) params.append('region', region);
      if (sinceDate) params.append('sinceDate', sinceDate);
      params.append('limit', '25');
      const res = await fetch(
        `/api/v1/tournaments/meta/deck-summary?${params}`,
      );
      if (!res.ok) throw new Error('Failed to fetch meta summary');
      return (await res.json()) as DeckMetaSummary;
    },
  });

  const goToArchetype = (archetypeName: string) => {
    const params = new URLSearchParams({ name: archetypeName });
    if (region) params.append('region', region);
    if (sinceDate) params.append('sinceDate', sinceDate);
    router.push(`/deck-builder/archetypes?${params}`);
  };

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
                <option key={r.value} value={r.value}>{r.label}</option>
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
                <option key={p.label} value={p.value}>{p.label}</option>
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
            {/* Deck Statistics */}
            {data.deckStats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <StatCard label="Total Decks" value={data.deckStats.totalDecks.toLocaleString()} />
                <StatCard label="Avg Pokémon" value={data.deckStats.avgPokemon.toFixed(1)} />
                <StatCard label="Avg Trainer" value={data.deckStats.avgTrainer.toFixed(1)} />
                <StatCard label="Avg Energy" value={data.deckStats.avgEnergy.toFixed(1)} />
                <StatCard label="Total Cards/Deck" value={data.deckStats.avgCardsTotal.toFixed(1)} />
              </div>
            )}

            {/* Archetypes — full width grid */}
            <div className="bg-slate-700 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">Deck Archetypes</h2>
                  <p className="text-slate-400 text-xs mt-1">
                    Named by key Pokémon (EX priority + evolution stage). Click to browse all decks.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (region) params.append('region', region);
                    if (sinceDate) params.append('sinceDate', sinceDate);
                    router.push(`/deck-builder/archetypes?${params}`);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition flex-shrink-0"
                >
                  Browse All →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {data.archetypes.map((arch, idx) => (
                  <button
                    key={arch.archetypeName}
                    onClick={() => goToArchetype(arch.archetypeName)}
                    className="bg-slate-600 rounded-lg p-3 hover:bg-slate-500 transition text-left group"
                  >
                    {/* Card images row */}
                    <div className="flex items-end gap-1.5 mb-3 h-20">
                      {arch.key1Image && (
                        <div className="relative flex-shrink-0">
                          <Image
                            src={arch.key1Image}
                            alt={arch.archetypeName}
                            width={54}
                            height={76}
                            className="rounded border border-slate-400 shadow-lg group-hover:scale-105 transition-transform"
                          />
                        </div>
                      )}
                      {arch.key2Image && (
                        <div className="relative flex-shrink-0 -ml-3">
                          <Image
                            src={arch.key2Image}
                            alt=""
                            width={50}
                            height={70}
                            className="rounded border border-slate-500 opacity-90"
                          />
                        </div>
                      )}
                      {arch.keyItemImage && (
                        <div className="relative flex-shrink-0 ml-auto self-end">
                          <Image
                            src={arch.keyItemImage}
                            alt={arch.keyItemName ?? ''}
                            width={44}
                            height={62}
                            className="rounded border border-yellow-500/60 opacity-90"
                            title={arch.keyItemName ?? ''}
                          />
                          <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[9px] font-bold px-1 rounded">ACE</span>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex justify-between items-start gap-1">
                      <h3 className="text-white font-bold text-xs leading-tight line-clamp-2 flex-1">
                        #{idx + 1} {arch.archetypeName}
                      </h3>
                      <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-full text-[10px] flex-shrink-0 font-medium">
                        {arch.deckCount}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[10px] mt-0.5">
                      Avg place: {arch.avgPlacement.toFixed(1)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Type Distribution */}
              <div className="bg-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Pokémon Type Meta</h2>
                <div className="space-y-3">
                  {data.typeDistribution.map((type) => (
                    <div key={type.pokemonType} className="bg-slate-600 rounded p-4 hover:bg-slate-500 transition">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-white font-bold">{type.pokemonType}</h3>
                          <p className="text-slate-300 text-sm">
                            {type.deckCount} decks • Avg placement: {type.avgPlacement}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-400">{type.winRatePercent}%</div>
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

              {/* Top Cards */}
              <div className="bg-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4">Top 25 Cards by Usage</h2>
                <div className="overflow-y-auto max-h-[600px]">
                  <table className="w-full">
                    <thead className="border-b border-slate-600 sticky top-0 bg-slate-700">
                      <tr className="text-slate-300 text-sm">
                        <th className="text-left py-2 px-2">Card Name</th>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-center py-2 px-2">Freq</th>
                        <th className="text-center py-2 px-2">Decks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-600">
                      {data.topCards.map((card, idx) => (
                        <tr key={card.name} className="hover:bg-slate-600 transition text-white text-sm">
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono text-xs w-5">#{idx + 1}</span>
                              {card.imageUrl && (
                                <Image
                                  src={card.imageUrl}
                                  alt={card.name}
                                  width={36}
                                  height={50}
                                  className="rounded border border-slate-500 flex-shrink-0"
                                />
                              )}
                              <span className="font-medium text-xs leading-tight">{card.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-slate-300 text-xs">{card.supertype}</td>
                          <td className="py-2 px-2 text-center">
                            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                              {card.frequency}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center text-slate-300 text-xs">
                            {card.deckCount}
                            <div className="text-slate-400 text-[10px]">
                              {((card.deckCount / (data.deckStats?.totalDecks ?? 1)) * 100).toFixed(1)}%
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
    <div className="bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg p-4 border border-slate-500">
      <p className="text-slate-300 text-xs font-medium mb-1">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
}

