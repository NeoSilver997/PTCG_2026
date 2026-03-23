'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LastDeck {
  placement: number;
  tournamentName: string;
  tournamentDate: string;
  eventId: string | null;
  deckCode: string | null;
  archetypeName: string;
  key1Image: string | null;
  key2Image: string | null;
}

interface PlayerEntry {
  rank: number;
  playerName: string;
  totalPoints: number;
  tournamentsPlayed: number;
  bestPlacement: number;
  wins: number;
  lastDecks: LastDeck[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIONS = [
  { value: '', label: 'All Regions' },
  { value: 'JP', label: '🇯🇵 Japan' },
  { value: 'HK', label: '🇭🇰 Hong Kong' },
  { value: 'EN', label: '🇺🇸 English' },
];

const POINTS_LEGEND = [
  { label: '1st', pts: 20, color: 'bg-yellow-500' },
  { label: '2nd', pts: 10, color: 'bg-slate-400' },
  { label: '3rd', pts: 5,  color: 'bg-amber-600' },
  { label: '4th', pts: 3,  color: 'bg-slate-500' },
  { label: '5–8', pts: 2,  color: 'bg-slate-600' },
  { label: '9–16', pts: 1, color: 'bg-slate-700' },
];

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

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-600 text-slate-200 font-bold text-sm">
      {rank}
    </span>
  );
}

function placementBadge(placement: number) {
  const cls =
    placement === 1 ? 'bg-yellow-500 text-yellow-950' :
    placement === 2 ? 'bg-slate-300 text-slate-900' :
    placement === 3 ? 'bg-amber-600 text-white' :
    placement <= 8  ? 'bg-slate-600 text-white' :
                     'bg-slate-700 text-slate-300';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>
      #{placement}
    </span>
  );
}

function formatDate(iso: string) {
  return iso ? iso.slice(0, 10) : '';
}

// ── DeckThumbnail ─────────────────────────────────────────────────────────────

function DeckThumbnail({ deck }: { deck: LastDeck }) {
  const hasImages = deck.key1Image || deck.key2Image;
  const inner = (
    <div className="relative flex flex-col items-center gap-1 group cursor-pointer">
      {/* Card images */}
      <div className="flex -space-x-4">
        {deck.key1Image && (
          <div className="relative w-10 h-14 rounded overflow-hidden shadow-md border border-slate-600 flex-shrink-0">
            <Image src={deck.key1Image} alt={deck.archetypeName} fill className="object-cover" sizes="40px" />
          </div>
        )}
        {deck.key2Image && (
          <div className="relative w-10 h-14 rounded overflow-hidden shadow-md border border-slate-600 flex-shrink-0">
            <Image src={deck.key2Image} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )}
        {!hasImages && (
          <div className="w-10 h-14 rounded bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-500 text-xs">
            ?
          </div>
        )}
      </div>
      {/* Placement badge */}
      <div className="flex items-center gap-1">
        {placementBadge(deck.placement)}
      </div>
      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block pointer-events-none">
        <div className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white whitespace-nowrap shadow-xl">
          <div className="font-semibold">{deck.archetypeName}</div>
          <div className="text-slate-400">{deck.tournamentName}</div>
          <div className="text-slate-500">{formatDate(deck.tournamentDate)}</div>
        </div>
      </div>
    </div>
  );

  if (deck.eventId) {
    return (
      <Link href={`/tournaments/event/${deck.eventId}`} className="hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [region, setRegion] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const presets = getPresets();

  const { data, isLoading, error } = useQuery<PlayerEntry[]>({
    queryKey: ['player-leaderboard', region, sinceDate],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (region) params.set('region', region);
      if (sinceDate) params.set('sinceDate', sinceDate);
      const res = await apiClient.get<PlayerEntry[]>(`/tournaments/leaderboard?${params}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/tournaments" className="text-slate-400 hover:text-slate-200 text-sm transition">
                ← Tournaments
              </Link>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">🏆 Player Leaderboard</h1>
            <p className="text-slate-400 mt-1">Top 50 players ranked by tournament points · last 5 decks shown</p>
          </div>

          {/* Points legend */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {POINTS_LEGEND.map(({ label, pts, color }) => (
              <span key={label} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-white ${color}`}>
                {label} <span className="opacity-75">= {pts}pt</span>
              </span>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3 bg-slate-800/60 rounded-lg px-4 py-3">
          {/* Region pills */}
          <div className="flex gap-1.5">
            {REGIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setRegion(value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  region === value
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-slate-600 hidden sm:block" />

          {/* Date preset */}
          <select
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm hover:bg-slate-600 transition"
          >
            {presets.map((p) => (
              <option key={p.label} value={p.value}>{p.label}</option>
            ))}
          </select>

          {/* Custom date */}
          <input
            type="date"
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value)}
            className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm hover:bg-slate-600 transition"
          />

          {sinceDate && (
            <button
              onClick={() => setSinceDate('')}
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded text-sm transition"
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center items-center h-64">
            <div className="text-white text-xl animate-pulse">Loading leaderboard...</div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded mb-6">
            Error loading leaderboard. Make sure the API server is running on port 4000.
          </div>
        )}

        {/* Empty */}
        {data && data.length === 0 && (
          <div className="text-center text-slate-400 py-20 text-lg">
            No tournament data found for the selected filters.
          </div>
        )}

        {/* Leaderboard table */}
        {data && data.length > 0 && (
          <div className="space-y-2">
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-[3rem_1fr_5rem_6rem_5rem_5rem_auto] gap-4 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <div>#</div>
              <div>Player</div>
              <div className="text-center">Points</div>
              <div className="text-center">Tournaments</div>
              <div className="text-center">Best</div>
              <div className="text-center">🏆 Wins</div>
              <div>Last 5 Decks</div>
            </div>

            {data.map((player) => (
              <div
                key={player.playerName}
                className={`rounded-lg border transition ${
                  player.rank <= 3
                    ? 'border-amber-700/40 bg-slate-800/80'
                    : 'border-slate-700/50 bg-slate-800/50 hover:bg-slate-800/80'
                }`}
              >
                {/* Mobile layout */}
                <div className="md:hidden p-3">
                  <div className="flex items-center gap-3 mb-3">
                    {rankBadge(player.rank)}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-base truncate">{player.playerName}</div>
                      <div className="flex gap-3 text-xs text-slate-400 mt-0.5">
                        <span><span className="text-yellow-400 font-bold">{player.totalPoints}pt</span></span>
                        <span>{player.tournamentsPlayed} events</span>
                        <span>Best #{player.bestPlacement}</span>
                        {player.wins > 0 && <span>🏆 ×{player.wins}</span>}
                      </div>
                    </div>
                  </div>
                  {player.lastDecks.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {player.lastDecks.map((deck, i) => (
                        <DeckThumbnail key={i} deck={deck} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Desktop layout */}
                <div className="hidden md:grid grid-cols-[3rem_1fr_5rem_6rem_5rem_5rem_auto] gap-4 items-center px-4 py-3">
                  <div className="flex justify-center">{rankBadge(player.rank)}</div>

                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{player.playerName}</div>
                  </div>

                  <div className="text-center">
                    <span className="text-yellow-400 font-bold text-lg">{player.totalPoints}</span>
                    <span className="text-slate-500 text-xs ml-0.5">pt</span>
                  </div>

                  <div className="text-center text-slate-300 text-sm">
                    {player.tournamentsPlayed}
                  </div>

                  <div className="text-center">
                    {placementBadge(player.bestPlacement)}
                  </div>

                  <div className="text-center text-slate-300 text-sm">
                    {player.wins > 0 ? (
                      <span className="text-yellow-400 font-semibold">×{player.wins}</span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </div>

                  <div className="flex gap-3">
                    {player.lastDecks.length > 0
                      ? player.lastDecks.map((deck, i) => (
                          <DeckThumbnail key={i} deck={deck} />
                        ))
                      : <span className="text-slate-600 text-sm self-center">No deck data</span>
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        {data && data.length > 0 && (
          <p className="text-center text-slate-600 text-xs mt-8">
            Points: 1st=20 · 2nd=10 · 3rd=5 · 4th=3 · 5–8=2 · 9–16=1 &nbsp;|&nbsp; Only results with linked decks count
          </p>
        )}
      </div>
    </div>
  );
}
