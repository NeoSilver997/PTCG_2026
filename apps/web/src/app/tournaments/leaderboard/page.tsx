'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LastDeck {
  placement: number;
  tournamentId: string | null;
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

interface LeaderboardData {
  players: PlayerEntry[];
  totalDays: number;
  totalEvents: number;
}

type DeckCountOption = 5 | 10 | 15 | 'best';

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

const DECK_COUNT_OPTIONS: Array<{ value: DeckCountOption; label: string }> = [
  { value: 5,      label: 'Last 5' },
  { value: 10,     label: 'Last 10' },
  { value: 15,     label: 'Last 15' },
  { value: 'best', label: '🏆 Best' },
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

function getDecksToShow(player: PlayerEntry, mode: DeckCountOption): LastDeck[] {
  if (mode === 'best') {
    return [...player.lastDecks]
      .sort((a, b) => a.placement - b.placement ||
        new Date(b.tournamentDate).getTime() - new Date(a.tournamentDate).getTime())
      .slice(0, 3);
  }
  return player.lastDecks.slice(0, mode);
}

function rankBadge(rank: number) {
  if (rank === 1) return <span className="text-2xl leading-none">🥇</span>;
  if (rank === 2) return <span className="text-2xl leading-none">🥈</span>;
  if (rank === 3) return <span className="text-2xl leading-none">🥉</span>;
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

  const cardImages = (
    <div className="flex -space-x-3 flex-shrink-0">
      {deck.key1Image ? (
        <div className="relative w-9 h-[3.25rem] rounded overflow-hidden shadow border border-slate-600">
          <Image src={deck.key1Image} alt={deck.archetypeName} fill className="object-cover" sizes="36px" />
        </div>
      ) : null}
      {deck.key2Image ? (
        <div className="relative w-9 h-[3.25rem] rounded overflow-hidden shadow border border-slate-600">
          <Image src={deck.key2Image} alt="" fill className="object-cover" sizes="36px" />
        </div>
      ) : null}
      {!hasImages && (
        <div className="w-9 h-[3.25rem] rounded bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-500 text-xs">?</div>
      )}
    </div>
  );

  return (
    <div className="relative flex flex-col items-center gap-0.5 group flex-shrink-0">
      {/* Card images → tournament detail page */}
      {deck.tournamentId ? (
        <Link href={`/tournaments/${deck.tournamentId}`} title={`${deck.tournamentName} · ${formatDate(deck.tournamentDate)}`}>
          {cardImages}
        </Link>
      ) : (
        cardImages
      )}

      {/* Bottom row: placement + deck link */}
      <div className="flex items-center gap-1">
        {placementBadge(deck.placement)}
        {deck.deckCode && (
          <Link
            href={`/deck-builder/event/${deck.deckCode}`}
            title="View deck list"
            className="text-slate-500 hover:text-blue-400 transition text-[10px] leading-none"
          >
            📋
          </Link>
        )}
      </div>

      {/* Hover tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover:block pointer-events-none">
        <div className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white whitespace-nowrap shadow-xl">
          <div className="font-semibold">{deck.archetypeName}</div>
          <div className="text-slate-400 truncate max-w-[14rem]">{deck.tournamentName}</div>
          <div className="text-slate-500">{formatDate(deck.tournamentDate)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Stat Chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-700/60 rounded-lg px-4 py-2 min-w-[6rem]">
      <span className="text-slate-400 text-[11px] uppercase tracking-wide font-medium">{label}</span>
      <span className="text-white font-bold text-xl leading-tight">{value}</span>
      {sub && <span className="text-slate-500 text-[10px]">{sub}</span>}
    </div>
  );
}

// ── Column template (shared between header and rows) ─────────────────────────
const COL = 'grid-cols-[2.75rem_180px_72px_88px_68px_68px_1fr]';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [region, setRegion] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const [deckCount, setDeckCount] = useState<DeckCountOption>(5);
  const presets = getPresets();

  const { data, isLoading, error } = useQuery<LeaderboardData>({
    queryKey: ['player-leaderboard', region, sinceDate],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (region) params.set('region', region);
      if (sinceDate) params.set('sinceDate', sinceDate);
      const res = await apiClient.get<LeaderboardData>(`/tournaments/leaderboard?${params}`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const players = data?.players ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-5">
          <Link href="/tournaments" className="text-slate-400 hover:text-slate-200 text-sm transition mb-2 inline-block">
            ← Tournaments
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">🏆 Player Leaderboard</h1>
              <p className="text-slate-400 mt-1 text-sm">Top 50 players ranked by tournament points</p>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {POINTS_LEGEND.map(({ label, pts, color }) => (
                <span key={label} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-white ${color}`}>
                  {label} <span className="opacity-80">= {pts}pt</span>
                </span>
              ))}
            </div>
          </div>

          {/* Stats row */}
          {data && (
            <div className="flex flex-wrap gap-3 mt-4">
              <StatChip label="Players" value={players.length} sub="ranked" />
              <StatChip label="Events" value={data.totalEvents} sub="with decks" />
              <StatChip label="Event Days" value={data.totalDays} sub="unique days" />
              {players[0] && (
                <StatChip label="Top Score" value={`${players[0].totalPoints}pt`} sub={players[0].playerName} />
              )}
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

          <div className="h-5 w-px bg-slate-600 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm font-medium">Show decks:</span>
            <div className="flex gap-1">
              {DECK_COUNT_OPTIONS.map(({ value, label }) => (
                <button
                  key={String(value)}
                  onClick={() => setDeckCount(value)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition ${
                    deckCount === value ? 'bg-emerald-600 text-white shadow' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
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
        {!isLoading && !error && data && players.length === 0 && (
          <div className="text-center text-slate-400 py-20 text-lg">
            No tournament data found for the selected filters.
          </div>
        )}

        {/* Table */}
        {players.length > 0 && (
          <div className="overflow-x-auto rounded-lg">
            <div className="min-w-[860px]">

              {/* Header */}
              <div className={`grid ${COL} gap-x-3 px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-700`}>
                <div className="text-center">#</div>
                <div>Player</div>
                <div className="text-center">Points</div>
                <div className="text-center">Events</div>
                <div className="text-center">Best</div>
                <div className="text-center">Wins</div>
                <div className="pl-1">
                  {deckCount === 'best' ? 'Best Decks (Top 3)' : `Last ${deckCount} Decks`}
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-700/40">
                {players.map((player) => {
                  const decks = getDecksToShow(player, deckCount);
                  return (
                    <div
                      key={player.playerName}
                      className={`grid ${COL} gap-x-3 px-3 py-2.5 items-center transition ${
                        player.rank <= 3
                          ? 'bg-amber-900/10 border-l-2 border-amber-500/40'
                          : 'hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Rank */}
                      <div className="flex justify-center">{rankBadge(player.rank)}</div>

                      {/* Player */}
                      <div className="min-w-0">
                        <Link
                          href={`/tournaments/player/${encodeURIComponent(player.playerName)}`}
                          className="font-semibold text-white text-sm truncate block hover:text-blue-400 transition"
                        >
                          {player.playerName}
                        </Link>
                      </div>

                      {/* Points */}
                      <div className="text-center">
                        <span className="text-yellow-400 font-bold">{player.totalPoints}</span>
                        <span className="text-slate-500 text-[10px] ml-0.5">pt</span>
                      </div>

                      {/* Events played */}
                      <div className="text-center text-slate-300 text-sm">{player.tournamentsPlayed}</div>

                      {/* Best placement */}
                      <div className="flex justify-center">{placementBadge(player.bestPlacement)}</div>

                      {/* Wins */}
                      <div className="text-center text-sm">
                        {player.wins > 0
                          ? <span className="text-yellow-400 font-semibold">×{player.wins}</span>
                          : <span className="text-slate-600">—</span>
                        }
                      </div>

                      {/* Decks */}
                      <div className="flex gap-2.5 flex-wrap pl-1 min-w-0">
                        {decks.length > 0
                          ? decks.map((deck, i) => <DeckThumbnail key={i} deck={deck} />)
                          : <span className="text-slate-600 text-xs self-center">No data</span>
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {players.length > 0 && (
          <p className="text-center text-slate-600 text-xs mt-6">
            Points: 1st=20 · 2nd=10 · 3rd=5 · 4th=3 · 5–8=2 · 9–16=1 &nbsp;|&nbsp; Only results with linked decks counted &nbsp;|&nbsp; 📋 = view deck list
          </p>
        )}
      </div>
    </div>
  );
}
