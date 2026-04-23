'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

/* ---- Types ---- */
interface TopCardMini {
  name: string;
  zhName?: string | null;
  imageUrl: string | null;
  supertype: string;
  quantity: number;
}

interface ArchetypeDeck {
  deckId: string;
  deckCode: string | null;
  placement: number;
  playerName: string;
  tournamentName: string;
  tournamentDate: string;
  eventId: string;
  key1Image: string | null;
  key2Image: string | null;
  topCards: TopCardMini[];
  pokemonCount: number;
  trainerCount: number;
  itemCount: number;
  energyCount: number;
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

/* ---- Card Detail Modal ---- */
function CardDetailModal({ card, onClose }: { card: TopCardMini; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const supertypeColor =
    card.supertype === 'POKEMON' ? 'bg-emerald-600' :
    card.supertype === 'TRAINER' ? 'bg-blue-600' : 'bg-orange-600';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl p-5 max-w-xs w-full mx-4 shadow-2xl border border-slate-600"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-white font-bold text-base leading-tight flex-1 pr-2">{card.zhName ?? card.name}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none flex-shrink-0"
          >
            ✕
          </button>
        </div>
        {card.imageUrl && (
          <div className="flex justify-center mb-4">
            <Image
              src={card.imageUrl}
              alt={card.zhName ?? card.name}
              width={220}
              height={308}
              className="rounded-xl shadow-lg"
              unoptimized
            />
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold text-white ${supertypeColor}`}>
            {card.supertype}
          </span>
          <span className="bg-slate-700 text-slate-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            ×{card.quantity} copies
          </span>
        </div>
        <div className="mt-3">
          <Link
            href={`/cards?name=${encodeURIComponent(card.zhName ?? card.name)}&supertype=${card.supertype === 'POKEMON' ? 'POKEMON' : ''}`}
            className="w-full block text-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors"
            onClick={onClose}
          >
            在卡牌庫搜尋 →
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ---- Card Thumbnail with hover zoom ---- */
function CardThumb({ card, onCardClick }: { card: TopCardMini; onCardClick: (c: TopCardMini) => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onCardClick(card); }}
    >
      {/* Thumbnail */}
      <div className="relative cursor-pointer">
        {card.imageUrl ? (
          <Image
            src={card.imageUrl}
            alt={card.zhName ?? card.name}
            width={36}
            height={50}
            className="rounded border border-slate-600 hover:border-white transition-colors"
            unoptimized
          />
        ) : (
          <div className="w-9 h-[50px] rounded border border-slate-600 hover:border-white transition-colors bg-slate-700 flex items-center justify-center">
            <span className="text-slate-400 text-[7px] text-center leading-tight px-0.5 break-all">{card.zhName ?? card.name}</span>
          </div>
        )}
        {/* Quantity badge */}
        <span className="absolute -top-1 -right-1 bg-slate-900 border border-slate-600 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none">
          {card.quantity}
        </span>
      </div>

      {/* Hover tooltip: bigger card */}
      {hovered && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none">
          <div className="bg-slate-900 rounded-xl p-1.5 shadow-2xl border border-slate-500">
            {card.imageUrl ? (
              <Image
                src={card.imageUrl}
                alt={card.zhName ?? card.name}
                width={130}
                height={182}
                className="rounded-lg"
                unoptimized
              />
            ) : (
              <div className="w-[130px] h-[182px] rounded-lg bg-slate-700 flex items-center justify-center">
                <span className="text-slate-300 text-xs text-center px-2 leading-snug">{card.zhName ?? card.name}</span>
              </div>
            )}
            <p className="text-white text-[10px] font-semibold text-center mt-1 max-w-[130px] leading-tight">
              {card.zhName ?? card.name}
            </p>
          </div>
          {/* Arrow */}
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-500 rotate-45 -mt-1" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Deck Row ---- */
function DeckRow({ deck, onCardClick }: { deck: ArchetypeDeck; onCardClick: (c: TopCardMini) => void }) {
  const router = useRouter();
  const date = deck.tournamentDate ? deck.tournamentDate.slice(0, 10) : '';
  const href = deck.deckCode
    ? `/deck-builder/event/${deck.deckCode}`
    : `/deck-builder?deckId=${deck.deckId}&mode=view`;
  const cardsToShow = deck.topCards;

  return (
    <div className="bg-slate-700/80 rounded-lg overflow-hidden border border-slate-600/50 hover:border-slate-500 transition-colors">
      {/* Info row — click to navigate */}
      <div
        className="flex items-center gap-2.5 p-2.5 cursor-pointer hover:bg-slate-600/40 transition-colors"
        onClick={() => router.push(href)}
      >
        {/* Placement badge */}
        <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${placementClass(deck.placement)}`}>
          #{deck.placement}
        </div>

        {/* Key pokemon images */}
        <div className="flex items-end gap-0.5 flex-shrink-0">
          {deck.key1Image && (
            <Image src={deck.key1Image} alt="" width={40} height={56} className="rounded border border-slate-500" />
          )}
          {deck.key2Image && (
            <Image src={deck.key2Image} alt="" width={34} height={48} className="rounded border border-slate-600 opacity-85 -ml-2" />
          )}
        </div>

        {/* Player + tournament info */}
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{deck.playerName}</p>
          <p className="text-slate-400 text-xs truncate">{deck.tournamentName}</p>
          <p className="text-slate-500 text-[10px]">{date}</p>
        </div>

        {/* Count chips */}
        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end max-w-[80px]">
          {deck.pokemonCount > 0 && (
            <span className="bg-emerald-800/80 text-emerald-200 text-[9px] font-bold px-1.5 py-0.5 rounded" title="Pokémon">
              P·{deck.pokemonCount}
            </span>
          )}
          {deck.trainerCount > 0 && (
            <span className="bg-blue-800/80 text-blue-200 text-[9px] font-bold px-1.5 py-0.5 rounded" title="Trainer">
              T·{deck.trainerCount}
            </span>
          )}
          {deck.itemCount > 0 && (
            <span className="bg-slate-500/80 text-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded" title="Item">
              I·{deck.itemCount}
            </span>
          )}
          {deck.energyCount > 0 && (
            <span className="bg-orange-800/80 text-orange-200 text-[9px] font-bold px-1.5 py-0.5 rounded" title="Energy">
              E·{deck.energyCount}
            </span>
          )}
        </div>
      </div>

      {/* Card thumbnails — click opens popup, does NOT navigate */}
      {cardsToShow.length > 0 && (
        <div className="flex items-center gap-0.5 px-2.5 pb-2.5 overflow-x-auto scrollbar-hide">
          {cardsToShow.slice(0, 12).map((card, i) => (
            <CardThumb key={i} card={card} onCardClick={onCardClick} />
          ))}
        </div>
      )}
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
  const [modalCard, setModalCard] = useState<TopCardMini | null>(null);
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

  const handleCardClick = useCallback((card: TopCardMini) => setModalCard(card), []);

  /* Fetch archetype list (always shown as sidebar / picker) */
  const { data: summaryData } = useQuery({
    queryKey: ['deck-meta-summary', region, sinceDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (region) params.region = region;
      if (sinceDate) params.sinceDate = sinceDate;
      params.limit = '30';
      const { data } = await apiClient.get<DeckMetaSummary>('/tournaments/meta/deck-summary', { params });
      return data;
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
      const params: Record<string, string | number> = { archetypeName: selectedName };
      if (region) params.region = region;
      if (sinceDate) params.sinceDate = sinceDate;
      params.skip = skip;
      params.take = TAKE;
      const { data } = await apiClient.get<ArchetypeDecksResponse>('/tournaments/meta/archetype-decks', { params });
      return data;
    },
    enabled: !!selectedName,
  });

  const archetypes = summaryData?.archetypes ?? [];
  const selectedArch = archetypes.find(a => a.archetypeName === selectedName) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      {/* Card detail modal */}
      {modalCard && (
        <CardDetailModal card={modalCard} onClose={() => setModalCard(null)} />
      )}

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
                    Error loading decks. Make sure the API is running on port 4200.
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
                        <DeckRow key={deck.deckId} deck={deck} onCardClick={handleCardClick} />
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
