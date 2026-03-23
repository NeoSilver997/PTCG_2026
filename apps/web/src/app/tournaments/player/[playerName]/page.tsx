'use client';

import { use, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerDeck {
  placement: number;
  tournamentId: string;
  tournamentName: string;
  tournamentDate: string;
  region: string;
  deckCode: string | null;
  archetypeName: string;
  key1Image: string | null;
  key2Image: string | null;
  pts: number;
}

interface PlayerDeckData {
  playerName: string;
  totalPoints: number;
  tournamentsPlayed: number;
  bestPlacement: number;
  wins: number;
  decks: PlayerDeck[];
}

type SortKey = 'date' | 'placement' | 'pts';
type SortDir = 'asc' | 'desc';

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIONS = [
  { value: '', label: 'All' },
  { value: 'JP', label: '🇯🇵 JP' },
  { value: 'HK', label: '🇭🇰 HK' },
  { value: 'EN', label: '🇺🇸 EN' },
];

const REGION_BADGE: Record<string, string> = {
  JP: 'bg-red-900/60 text-red-300 border-red-700',
  HK: 'bg-blue-900/60 text-blue-300 border-blue-700',
  EN: 'bg-green-900/60 text-green-300 border-green-700',
};

function getPresets() {
  const now = new Date();
  const minus = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return iso ? iso.slice(0, 10) : '';
}

function placementBadge(placement: number) {
  const cls =
    placement === 1 ? 'bg-yellow-500 text-yellow-950' :
    placement === 2 ? 'bg-slate-300 text-slate-900' :
    placement === 3 ? 'bg-amber-600 text-white' :
    placement <= 8  ? 'bg-slate-600 text-white' :
                     'bg-slate-700 text-slate-300';
  return (
    <span className={`inline-block px-2 py-0.5 rounded font-bold text-sm ${cls}`}>
      #{placement}
    </span>
  );
}

function StatChip({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-700/60 rounded-lg px-4 py-2 min-w-[5.5rem]">
      <span className="text-slate-400 text-[11px] uppercase tracking-wide font-medium">{label}</span>
      <span className="text-white font-bold text-xl leading-tight">{value}</span>
      {sub && <span className="text-slate-500 text-[10px]">{sub}</span>}
    </div>
  );
}

function SortHeader({
  label, sortKey, current, dir, onClick,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition ${
        active ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
      {active && <span className="opacity-70">{dir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlayerDetailPage({ params }: { params: Promise<{ playerName: string }> }) {
  const { playerName } = use(params);
  const decoded = decodeURIComponent(playerName);

  const [region, setRegion] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const presets = getPresets();

  const { data, isLoading, error } = useQuery<PlayerDeckData>({
    queryKey: ['player-decks', decoded, region, sinceDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (region) params.set('region', region);
      if (sinceDate) params.set('sinceDate', sinceDate);
      const qs = params.toString();
      const res = await apiClient.get<PlayerDeckData>(
        `/tournaments/player/${encodeURIComponent(decoded)}${qs ? `?${qs}` : ''}`,
      );
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'placement' ? 'asc' : 'desc');
    }
  }

  const sortedDecks = useMemo(() => {
    if (!data?.decks) return [];
    return [...data.decks].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp = new Date(a.tournamentDate).getTime() - new Date(b.tournamentDate).getTime();
      } else if (sortKey === 'placement') {
        cmp = a.placement - b.placement;
      } else if (sortKey === 'pts') {
        cmp = a.pts - b.pts;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [data?.decks, sortKey, sortDir]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-5">
          <Link href="/tournaments/leaderboard" className="text-slate-400 hover:text-slate-200 text-sm transition mb-2 inline-block">
            ← Leaderboard
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-white break-all">
            🎮 {decoded}
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Tournament deck history</p>

          {/* Stats */}
          {data && (
            <div className="flex flex-wrap gap-3 mt-4">
              <StatChip label="Points" value={`${data.totalPoints}pt`} />
              <StatChip label="Events" value={data.tournamentsPlayed} sub="with decks" />
              <StatChip label="Best" value={`#${data.bestPlacement}`} />
              <StatChip label="Wins" value={data.wins} sub="1st place" />
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-3 bg-slate-800/60 rounded-lg px-4 py-3">
          <div className="flex gap-1.5 flex-wrap">
            {REGIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setRegion(value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  region === value ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-600 hidden sm:block" />

          <select
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm hover:bg-slate-600 transition"
          >
            {presets.map((p) => (
              <option key={p.label} value={p.value}>{p.label}</option>
            ))}
          </select>

          <input
            type="date"
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm hover:bg-slate-600 transition"
          />

          {sinceDate && (
            <button onClick={() => setSinceDate('')} className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded text-sm transition">
              ✕ Clear
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center items-center h-64">
            <div className="text-white text-lg animate-pulse">Loading player history...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded mb-6">
            Error loading player data. Make sure the API server is running.
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && data && data.decks.length === 0 && (
          <div className="text-center text-slate-400 py-20 text-lg">
            No tournament data found for <strong className="text-white">{decoded}</strong>.
          </div>
        )}

        {/* Table */}
        {sortedDecks.length > 0 && (
          <div className="overflow-x-auto rounded-lg">
            <div className="min-w-[680px]">

              {/* Header */}
              <div className="grid grid-cols-[48px_88px_1fr_52px_80px_64px_80px] gap-x-3 px-3 py-2 border-b border-slate-700">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">#</div>
                <SortHeader label="Date" sortKey="date" current={sortKey} dir={sortDir} onClick={handleSort} />
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Tournament</div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Rgn</div>
                <SortHeader label="Place" sortKey="placement" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Pts" sortKey="pts" current={sortKey} dir={sortDir} onClick={handleSort} />
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Deck</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-700/40">
                {sortedDecks.map((deck, i) => (
                  <div
                    key={`${deck.tournamentId}-${deck.placement}-${i}`}
                    className={`grid grid-cols-[48px_88px_1fr_52px_80px_64px_80px] gap-x-3 px-3 py-2.5 items-center transition ${
                      deck.placement === 1 ? 'bg-amber-900/10 border-l-2 border-amber-500/40' : 'hover:bg-slate-800/60'
                    }`}
                  >
                    {/* Row number */}
                    <div className="text-slate-500 text-sm text-center">{i + 1}</div>

                    {/* Date */}
                    <div className="text-slate-300 text-sm tabular-nums">{formatDate(deck.tournamentDate)}</div>

                    {/* Tournament name */}
                    <div className="min-w-0">
                      <Link
                        href={`/tournaments/${deck.tournamentId}`}
                        className="text-slate-200 hover:text-blue-400 transition text-sm truncate block"
                        title={deck.tournamentName}
                      >
                        {deck.tournamentName}
                      </Link>
                    </div>

                    {/* Region */}
                    <div>
                      <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${REGION_BADGE[deck.region] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                        {deck.region}
                      </span>
                    </div>

                    {/* Placement */}
                    <div>{placementBadge(deck.placement)}</div>

                    {/* Points */}
                    <div className="text-center">
                      {deck.pts > 0
                        ? <span className="text-yellow-400 font-bold">{deck.pts}<span className="text-slate-500 text-[10px] ml-0.5">pt</span></span>
                        : <span className="text-slate-600">—</span>}
                    </div>

                    {/* Deck */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex -space-x-2 flex-shrink-0">
                        {deck.key1Image ? (
                          <div className="relative w-8 h-[2.9rem] rounded overflow-hidden shadow border border-slate-600">
                            <Image src={deck.key1Image} alt={deck.archetypeName} fill className="object-cover" sizes="32px" />
                          </div>
                        ) : null}
                        {deck.key2Image ? (
                          <div className="relative w-8 h-[2.9rem] rounded overflow-hidden shadow border border-slate-600">
                            <Image src={deck.key2Image} alt="" fill className="object-cover" sizes="32px" />
                          </div>
                        ) : (!deck.key1Image && (
                          <div className="w-8 h-[2.9rem] rounded bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-500 text-xs">?</div>
                        ))}
                      </div>
                      {deck.deckCode && (
                        <Link
                          href={`/deck-builder/event/${deck.deckCode}`}
                          title={`View deck: ${deck.archetypeName}`}
                          className="text-slate-500 hover:text-blue-400 transition text-sm leading-none flex-shrink-0"
                        >
                          📋
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {sortedDecks.length > 0 && (
          <p className="text-center text-slate-600 text-xs mt-6">
            {sortedDecks.length} results · Points: 1st=20 · 2nd=10 · 3rd=5 · 4th=3 · 5–8=2 · 9–16=1
          </p>
        )}
      </div>
    </div>
  );
}
