'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

/* ---- Types ---- */
interface TopCardMini {
  name: string;
  imageUrl: string | null;
  supertype: string;
  quantity: number;
}

interface ArchetypeDeck {
  deckId: string;
  placement: number;
  playerName: string;
  tournamentName: string;
  tournamentDate: string;
  eventId: string;
  key1Image: string | null;
  key2Image: string | null;
  topCards: TopCardMini[];
}

interface ArchetypeDecksResponse {
  archetypeName: string;
  total: number;
  skip: number;
  take: number;
  decks: ArchetypeDeck[];
}

interface ArchetypeSummary {
  archetypeName: string;
  deckCount: number;
  avgPlacement: number;
  key1Image: string | null;
  key2Image: string | null;
  keyItemName: string | null;
  keyItemImage: string | null;
}

interface DeckMetaSummary {
  archetypes: ArchetypeSummary[];
  deckStats: { totalDecks: number } | null;
}

/* ---- Constants ---- */
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

const PLACEMENT_COLORS = [
  'bg-yellow-500 text-black',
  'bg-slate-300 text-black',
  'bg-amber-600 text-white',
];

function placementClass(placement: number) {
  if (placement <= 1) return PLACEMENT_COLORS[0];
  if (placement <= 2) return PLACEMENT_COLORS[1];
  if (placement <= 3) return PLACEMENT_COLORS[2];
  return 'bg-slate-600 text-white';
}

/* ---- Deck Row ---- */
function DeckRow({ deck }: { deck: ArchetypeDeck }) {
  const date = deck.tournamentDate ? deck.tournamentDate.slice(0, 10) : '';
  return (
    <div className="bg-slate-700 rounded-lg p-3 flex items-start gap-3 hover:bg-slate-600 transition">
      {/* Placement badge */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${placementClass(deck.placement)}`}>
        #{deck.placement}
      </div>

      {/* Key pokemon images */}
      <div className="flex items-end gap-1 flex-shrink-0">
        {deck.key1Image && (
          <Image src={deck.key1Image} alt="" width={46} height={64} className="rounded border border-slate-500" />
        )}
        {deck.key2Image && (
          <Image src={deck.key2Image} alt="" width={40} height={56} className="rounded border border-slate-600 opacity-85 -ml-2" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-sm truncate">{deck.playerName}</p>
        <p className="text-slate-400 text-xs truncate">{deck.tournamentName}</p>
        <p className="text-slate-500 text-xs">{date}</p>
      </div>

      {/* Top card images */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {deck.topCards.slice(0, 6).filter(c => c.imageUrl).map((card, i) => (
          <Image
            key={i}
            src={card.imageUrl!}
            alt={card.name}
            width={36}
            height={50}
            className="rounded border border-slate-600 hover:scale-110 transition-transform"
            title={card.name}
          />
        ))}
      </div>
    </div>
  );
}

/* ---- Archetype Card (header in "focused" view) ---- */
function ArchetypeHeader({ arch, total }: { arch: ArchetypeSummary; total: number }) {
  return (
    <div className="flex items-center gap-4 bg-slate-800 rounded-xl p-4 mb-4 border border-slate-600">
      <div className="flex items-end gap-1.5">
        {arch.key1Image && (
          <Image src={arch.key1Image} alt={arch.archetypeName} width={68} height={95} className="rounded border border-slate-400 shadow-lg" />
        )}
        {arch.key2Image && (
          <Image src={arch.key2Image} alt="" width={58} height={81} className="rounded border border-slate-500 opacity-90 -ml-4" />
        )}
        {arch.keyItemImage && (
          <div className="relative ml-1 self-end">
            <Image src={arch.keyItemImage} alt={arch.keyItemName ?? ''} width={50} height={70} className="rounded border border-yellow-500/70" title={arch.keyItemName ?? ''} />
            <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[9px] font-bold px-1 rounded">ACE</span>
          </div>
        )}
      </div>
      <div>
        <h2 className="text-white text-xl font-bold">{arch.archetypeName}</h2>
        <div className="flex gap-4 mt-1">
          <span className="text-slate-300 text-sm">{arch.deckCount} decks in dataset</span>
          <span className="text-slate-300 text-sm">Avg place: {arch.avgPlacement.toFixed(1)}</span>
          {arch.keyItemName && (
            <span className="text-yellow-400 text-sm">ACE: {arch.keyItemName}</span>
          )}
        </div>
        <p className="text-slate-400 text-xs mt-1">Showing {total} filtered decks</p>
      </div>
    </div>
  );
}

/* ---- Main inner component (needs searchParams) ---- */
function ArchetypesPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const presets = getPresets();

  /* Initial state from query params */
  const initialName = searchParams.get('name') ?? '';
  const initialRegion = searchParams.get('region') ?? '';
  const initialSinceDate = searchParams.get('sinceDate') ?? '';

  const [selectedName, setSelectedName] = useState(initialName);
  const [region, setRegion] = useState(initialRegion);
  const [sinceDate, setSinceDate] = useState(initialSinceDate);
  const [skip, setSkip] = useState(0);
  const TAKE = 30;

  /* Reset pagination when filters change */
  useEffect(() => { setSkip(0); }, [selectedName, region, sinceDate]);

  /* Sync URL when a specific archetype is selected */
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedName) params.set('name', selectedName);
    if (region) params.set('region', region);
    if (sinceDate) params.set('sinceDate', sinceDate);
    const search = params.toString();
    router.replace(`/deck-builder/archetypes${search ? `?${search}` : ''}`, { scroll: false });
  }, [selectedName, region, sinceDate, router]);

  /* Fetch archetype list (always shown as sidebar / picker) */
  const { data: summaryData } = useQuery({
    queryKey: ['deck-meta-summary', region, sinceDate],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (region) p.append('region', region);
      if (sinceDate) p.append('sinceDate', sinceDate);
      p.append('limit', '30');
      const res = await fetch(`http://localhost:4000/api/v1/tournaments/meta/deck-summary?${p}`);
      if (!res.ok) throw new Error('Failed');
      return (await res.json()) as DeckMetaSummary;
    },
  });

  /* Fetch decks for selected archetype */
  const {
    data: deckData,
    isLoading: deckLoading,
    error: deckError,
  } = useQuery({
    queryKey: ['archetype-decks', selectedName, region, sinceDate, skip],
    queryFn: async () => {
      if (!selectedName) return null;
      const p = new URLSearchParams({ archetypeName: selectedName });
      if (region) p.append('region', region);
      if (sinceDate) p.append('sinceDate', sinceDate);
      p.append('skip', String(skip));
      p.append('take', String(TAKE));
      const res = await fetch(`http://localhost:4000/api/v1/tournaments/meta/archetype-decks?${p}`);
      if (!res.ok) throw new Error('Failed to fetch archetype decks');
      return (await res.json()) as ArchetypeDecksResponse;
    },
    enabled: !!selectedName,
  });

  const archetypes = summaryData?.archetypes ?? [];
  const selectedArch = archetypes.find(a => a.archetypeName === selectedName) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link href="/deck-builder/meta-summary" className="text-slate-400 hover:text-white text-sm transition">
            ← Meta Summary
          </Link>
          <h1 className="text-3xl font-bold text-white flex-1">Archetype Browser</h1>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select value={region} onChange={e => setRegion(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm hover:bg-slate-600 transition">
              {REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={sinceDate} onChange={e => setSinceDate(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm hover:bg-slate-600 transition">
              {presets.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
            </select>
            <input type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm hover:bg-slate-600 transition" />
            {sinceDate && (
              <button onClick={() => setSinceDate('')}
                className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded text-sm transition">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Two-pane layout */}
        <div className="flex gap-6">
          {/* Left: archetype list */}
          <div className="w-64 flex-shrink-0">
            <h2 className="text-slate-300 font-semibold text-sm mb-3 uppercase tracking-wide">
              Archetypes ({archetypes.length})
            </h2>
            <div className="space-y-1.5 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
              {archetypes.map((arch, idx) => (
                <button
                  key={arch.archetypeName}
                  onClick={() => setSelectedName(arch.archetypeName)}
                  className={`w-full rounded-lg p-2.5 text-left transition flex items-center gap-2
                    ${selectedName === arch.archetypeName
                      ? 'bg-blue-600 border border-blue-400'
                      : 'bg-slate-700 hover:bg-slate-600 border border-transparent'
                    }`}
                >
                  <div className="flex items-end gap-0.5 flex-shrink-0">
                    {arch.key1Image
                      ? <Image src={arch.key1Image} alt="" width={32} height={45} className="rounded" />
                      : <div className="w-8 h-11 bg-slate-600 rounded" />}
                    {arch.key2Image && (
                      <Image src={arch.key2Image} alt="" width={26} height={36} className="rounded opacity-80 -ml-2" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-semibold truncate">
                      #{idx + 1} {arch.archetypeName}
                    </p>
                    <p className="text-slate-400 text-[10px]">{arch.deckCount} decks</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: main content */}
          <div className="flex-1 min-w-0">
            {!selectedName && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <p className="text-lg mb-2">Select an archetype from the list</p>
                <p className="text-sm">Browse all tournament decks for any archetype</p>
              </div>
            )}

            {selectedName && (
              <>
                {/* Archetype header */}
                {selectedArch && (
                  <ArchetypeHeader arch={selectedArch} total={deckData?.total ?? 0} />
                )}

                {/* Error */}
                {deckError && (
                  <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
                    Error loading decks. Make sure the API is running on port 4000.
                  </div>
                )}

                {/* Loading */}
                {deckLoading && (
                  <div className="flex justify-center items-center h-40 text-slate-300">Loading decks…</div>
                )}

                {/* Deck list */}
                {deckData && !deckLoading && (
                  <>
                    <div className="space-y-2 mb-4">
                      {deckData.decks.map(deck => (
                        <DeckRow key={deck.deckId} deck={deck} />
                      ))}
                      {deckData.decks.length === 0 && (
                        <p className="text-slate-400 text-center py-8">No decks found for this filter combination.</p>
                      )}
                    </div>

                    {/* Pagination */}
                    {deckData.total > TAKE && (
                      <div className="flex items-center justify-between mt-4">
                        <button
                          onClick={() => setSkip(Math.max(0, skip - TAKE))}
                          disabled={skip === 0}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded transition text-sm"
                        >
                          ← Previous
                        </button>
                        <span className="text-slate-400 text-sm">
                          {skip + 1}–{Math.min(skip + TAKE, deckData.total)} of {deckData.total}
                        </span>
                        <button
                          onClick={() => setSkip(skip + TAKE)}
                          disabled={skip + TAKE >= deckData.total}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded transition text-sm"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Export: wrapped in Suspense for useSearchParams ---- */
export default function ArchetypesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-white">
        Loading…
      </div>
    }>
      <ArchetypesPageInner />
    </Suspense>
  );
}
