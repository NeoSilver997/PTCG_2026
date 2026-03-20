'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import apiClient from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────────
type CategoryKey = 'all' | 'pokemon' | 'supporter' | 'item' | 'stadium' | 'tool' | 'energy';

interface WeeklyTopCard {
  name: string;
  imageUrl: string | null;
  supertype: string;
  subtypes: string[];
  webCardId?: string;
  weeklyUsage: [number, number, number, number]; // week 0=oldest → 3=newest
  totalUsage: number;
}

interface TopCardsPeriodData {
  cards: WeeklyTopCard[];
  weekLabels: [string, string, string, string];
  periodStart: string;
  periodEnd: string;
}

interface RawDeckCard {
  quantity: number;
  card: {
    name?: string;
    supertype?: string;
    subtypes?: string[];
    imageUrl?: string;
    webCardId?: string;
  };
}

interface RawDeck {
  id?: string;
  cards?: RawDeckCard[];
}

// ── Constants ──────────────────────────────────────────────────────────────────
const REGIONS = ['', 'HK', 'JP', 'EN'] as const;

const CATEGORIES: Array<{ key: CategoryKey; label: string; activeClass: string }> = [
  { key: 'all',       label: 'All Cards',  activeClass: 'bg-gray-700 text-white' },
  { key: 'pokemon',   label: '⚡ Pokémon',  activeClass: 'bg-emerald-600 text-white' },
  { key: 'supporter', label: '🤝 Supporter', activeClass: 'bg-blue-600 text-white' },
  { key: 'item',      label: '🎒 Item',     activeClass: 'bg-indigo-600 text-white' },
  { key: 'stadium',   label: '🏟 Stadium',  activeClass: 'bg-amber-600 text-white' },
  { key: 'tool',      label: '🔧 Tool',     activeClass: 'bg-rose-600 text-white' },
  { key: 'energy',    label: '🔋 Energy',   activeClass: 'bg-orange-600 text-white' },
];

const WEEK_BAR_COLORS = ['bg-slate-300', 'bg-blue-300', 'bg-blue-400', 'bg-blue-500'] as const;

// ── Data helpers ───────────────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function matchesCategory(supertype: string, subtypes: string[], cat: CategoryKey): boolean {
  switch (cat) {
    case 'all':       return true;
    case 'pokemon':   return supertype === 'POKEMON';
    case 'supporter': return supertype === 'TRAINER' && subtypes.includes('SUPPORTER');
    case 'item':      return supertype === 'TRAINER' && subtypes.includes('ITEM');
    case 'stadium':   return supertype === 'TRAINER' && subtypes.includes('STADIUM');
    case 'tool':      return supertype === 'TRAINER' && subtypes.includes('TOOL');
    case 'energy':    return supertype === 'ENERGY';
    default:          return true;
  }
}

async function buildWeeklyTopCards(
  region: string,
  category: CategoryKey,
  periodEndStr: string,
): Promise<TopCardsPeriodData> {
  const periodEnd = new Date(periodEndStr);
  periodEnd.setHours(23, 59, 59, 999);
  const periodStart = new Date(periodEnd.getTime() - 28 * 24 * 60 * 60 * 1000);

  // Build week labels: oldest → newest
  const weekLabels = Array.from({ length: 4 }, (_, i) =>
    fmtWeekLabel(new Date(periodStart.getTime() + i * 7 * 24 * 60 * 60 * 1000)),
  ) as [string, string, string, string];

  // Fetch tournaments in date range (max 100)
  const listRes = await apiClient.get('/tournaments', {
    params: {
      ...(region && { region }),
      dateFrom: toDateStr(periodStart),
      dateTo: toDateStr(periodEnd),
      take: 100,
      skip: 0,
      sortBy: 'date',
      sortOrder: 'desc',
    },
  });

  const tournaments: Array<{ id: string; date: string }> = listRes.data?.data ?? [];
  if (tournaments.length === 0) {
    return { cards: [], weekLabels, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
  }

  // Fetch tournament details in chunks of 8
  const deckRefs: Array<{ weekIdx: number; deckId: string }> = [];
  for (let i = 0; i < tournaments.length; i += 8) {
    const chunk = tournaments.slice(i, i + 8);
    const details = await Promise.all(
      chunk.map(async (t) => {
        try {
          const res = await apiClient.get(`/tournaments/${t.id}`);
          return { date: t.date, data: res.data };
        } catch { return null; }
      }),
    );
    for (const item of details) {
      if (!item) continue;
      const tDate = new Date(item.date);
      const diffDays = (periodEnd.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 0 || diffDays >= 28) continue;
      const weekIdx = 3 - Math.floor(diffDays / 7); // 3=newest, 0=oldest
      for (const result of (item.data?.results ?? []) as Array<{ deck?: { id?: string } }>) {
        if (result.deck?.id) deckRefs.push({ weekIdx, deckId: result.deck.id });
      }
    }
  }

  if (deckRefs.length === 0) {
    return { cards: [], weekLabels, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
  }

  // Fetch unique decks in chunks of 8
  const uniqueDeckIds = Array.from(new Set(deckRefs.map((r) => r.deckId)));
  const deckMap = new Map<string, RawDeck>();
  for (let i = 0; i < uniqueDeckIds.length; i += 8) {
    const chunk = uniqueDeckIds.slice(i, i + 8);
    const deckData = await Promise.all(
      chunk.map(async (id) => {
        try {
          const res = await apiClient.get(`/decks/${id}`);
          return { id, data: res.data as RawDeck };
        } catch { return null; }
      }),
    );
    for (const d of deckData) {
      if (d?.data) deckMap.set(d.id, d.data);
    }
  }

  // Accumulate weekly card usage
  const cardMap = new Map<string, {
    name: string; imageUrl: string | null; supertype: string;
    subtypes: string[]; webCardId?: string;
    weeklyUsage: [number, number, number, number];
  }>();

  for (const ref of deckRefs) {
    const deck = deckMap.get(ref.deckId);
    if (!deck) continue;
    for (const dc of deck.cards ?? []) {
      const c = dc.card;
      if (!c?.name) continue;
      const supertype = c.supertype ?? '';
      const subtypes = c.subtypes ?? [];
      if (!matchesCategory(supertype, subtypes, category)) continue;

      let entry = cardMap.get(c.name);
      if (!entry) {
        entry = {
          name: c.name,
          imageUrl: c.imageUrl ?? null,
          supertype,
          subtypes,
          webCardId: c.webCardId,
          weeklyUsage: [0, 0, 0, 0],
        };
        cardMap.set(c.name, entry);
      }
      entry.weeklyUsage[ref.weekIdx] += dc.quantity ?? 0;
    }
  }

  // Sort by total usage, top 30
  const cards: WeeklyTopCard[] = Array.from(cardMap.values())
    .map((c) => ({ ...c, totalUsage: c.weeklyUsage.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.totalUsage - a.totalUsage)
    .slice(0, 30);

  return { cards, weekLabels, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
}

// ── MiniTrendBar ──────────────────────────────────────────────────────────────
function MiniTrendBar({
  weeklyUsage,
  maxUsage,
}: {
  weeklyUsage: [number, number, number, number];
  maxUsage: number;
}) {
  const max = maxUsage || 1;
  return (
    <div className="flex items-end gap-0.5 h-5">
      {weeklyUsage.map((v, i) => (
        <div
          key={i}
          className={`w-2.5 rounded-sm ${WEEK_BAR_COLORS[i]}`}
          style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
          title={`Week ${i + 1}: ${v}`}
        />
      ))}
    </div>
  );
}

// ── TrendChart (in modal) ─────────────────────────────────────────────────────
function TrendChart({
  weeklyUsage,
  weekLabels,
  maxUsage,
}: {
  weeklyUsage: [number, number, number, number];
  weekLabels: [string, string, string, string];
  maxUsage: number;
}) {
  const max = maxUsage || 1;
  return (
    <div>
      <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-2">4-week trend</p>
      <div className="flex items-end gap-2" style={{ height: 72 }}>
        {weeklyUsage.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[10px] text-slate-300 font-semibold">{v > 0 ? v : ''}</span>
            <div
              className={`w-full rounded-sm ${WEEK_BAR_COLORS[i]}`}
              style={{ height: `${Math.max(3, (v / max) * 52)}px` }}
            />
            <span className="text-[9px] text-slate-500 truncate w-full text-center">{weekLabels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Card Modal ────────────────────────────────────────────────────────────────
function CardModal({
  card,
  weekLabels,
  maxUsage,
  onClose,
}: {
  card: WeeklyTopCard;
  weekLabels: [string, string, string, string];
  maxUsage: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const supertypeColor =
    card.supertype === 'POKEMON' ? 'bg-emerald-600' :
    card.supertype === 'ENERGY'  ? 'bg-orange-600'  : 'bg-blue-600';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl border border-slate-600"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-bold text-lg leading-tight">{card.name}</h3>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${supertypeColor}`}>
                {card.supertype}
              </span>
              {card.subtypes.map((st) => (
                <span key={st} className="bg-slate-600 text-slate-300 px-2 py-0.5 rounded-full text-[10px]">{st}</span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none ml-3 shrink-0 mt-0.5">
            ✕
          </button>
        </div>

        {/* Body: image + stats */}
        <div className="flex gap-4">
          {card.imageUrl ? (
            <div
              className="relative shrink-0 w-[110px] rounded-xl overflow-hidden shadow-lg border border-slate-600"
              style={{ aspectRatio: '2.5/3.5' }}
            >
              <Image src={card.imageUrl} alt={card.name} fill sizes="110px" className="object-cover" unoptimized />
            </div>
          ) : (
            <div
              className="shrink-0 w-[110px] rounded-xl bg-slate-700 flex items-center justify-center border border-slate-600"
              style={{ aspectRatio: '2.5/3.5' }}
            >
              <span className="text-slate-500 text-2xl">?</span>
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Usage total */}
            <div className="bg-slate-700/50 rounded-lg px-3 py-2">
              <p className="text-slate-400 text-[10px] uppercase tracking-wider">Total (4 wks)</p>
              <p className="text-white text-xl font-bold">{card.totalUsage.toLocaleString()}</p>
              <p className="text-slate-400 text-[10px]">tournament uses</p>
            </div>

            {/* Trend chart */}
            <TrendChart weeklyUsage={card.weeklyUsage} weekLabels={weekLabels} maxUsage={maxUsage} />
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-4 pt-3 border-t border-slate-700 flex gap-2">
          {card.webCardId && (
            <Link
              href={`/cards/${card.webCardId}`}
              className="flex-1 text-center bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors"
              onClick={onClose}
            >
              View Card Page →
            </Link>
          )}
          <Link
            href={`/cards?name=${encodeURIComponent(card.name)}`}
            className="flex-1 text-center bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold py-2.5 rounded-lg transition-colors"
            onClick={onClose}
          >
            Search Cards →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Rank badge ────────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[11px] font-black text-yellow-500">🥇</span>;
  if (rank === 2) return <span className="text-[11px] font-black text-slate-400">🥈</span>;
  if (rank === 3) return <span className="text-[11px] font-black text-amber-600">🥉</span>;
  return <span className="text-[10px] font-bold text-gray-300 font-mono">{rank}</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TopCardsPage() {
  const today = toDateStr(new Date());
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState<CategoryKey>('pokemon');
  const [periodEnd, setPeriodEnd] = useState(today);
  const [selectedCard, setSelectedCard] = useState<WeeklyTopCard | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament-top-cards-weekly', region, category, periodEnd],
    queryFn: () => buildWeeklyTopCards(region, category, periodEnd),
    staleTime: 5 * 60 * 1000,
  });

  const cardMaxWeekly = data?.cards
    ? Math.max(1, ...data.cards.flatMap((c) => c.weeklyUsage))
    : 1;

  const periodRange = data
    ? `${new Date(data.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(data.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-blue-600 text-white px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <Link href="/tournaments" className="text-purple-200 hover:text-white text-sm transition-colors block mb-2">
            ← Tournaments
          </Link>
          <h1 className="text-3xl font-bold">⚡ Top Cards · Meta Trend</h1>
          <p className="text-purple-200 mt-1">
            Top 30 tournament-used cards with 4-week usage trends
            {periodRange && <> · <span className="text-white font-medium">{periodRange}</span></>}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          {/* Date picker */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-gray-600 font-medium shrink-0">Period end date:</span>
            <input
              type="date"
              value={periodEnd}
              max={today}
              onChange={(e) => setPeriodEnd(e.target.value || today)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-xs text-gray-400">← shows 4 weeks back from this date</span>
            {periodEnd !== today && (
              <button
                onClick={() => setPeriodEnd(today)}
                className="text-xs text-purple-600 hover:underline font-medium"
              >
                Reset to today
              </button>
            )}
          </div>

          {/* Region tabs */}
          <div className="flex gap-2 flex-wrap">
            {REGIONS.map((r) => (
              <button
                key={r || 'all'}
                onClick={() => setRegion(r)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  region === r
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r || 'All Regions'}
              </button>
            ))}
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(({ key, label, activeClass }) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  category === key
                    ? `${activeClass} shadow-sm`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Week legend */}
        {data && data.cards.length > 0 && (
          <div className="flex items-center gap-4 mb-3 px-1">
            <span className="text-xs text-gray-500 font-medium">Bars (oldest → newest):</span>
            {data.weekLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${WEEK_BAR_COLORS[i]}`} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="bg-white rounded-xl shadow-sm p-10 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-gray-600 font-medium">Building meta trend data...</p>
            <p className="text-gray-400 text-sm mt-1">Fetching tournament results · decks · card usage</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center text-red-500">
            Failed to load tournament data. Please try again.
          </div>
        )}

        {/* No data */}
        {!isLoading && !error && data?.cards.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-gray-600 font-medium">No data found for this period</p>
            <p className="text-gray-400 text-sm mt-1">
              Try selecting a different end date or a different region / category.
            </p>
          </div>
        )}

        {/* Top 30 grid */}
        {!isLoading && !error && data && data.cards.length > 0 && (
          <>
            <p className="text-xs text-gray-400 mb-3 px-0.5">
              Showing top {data.cards.length} cards · click any card to view details
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {data.cards.map((card, idx) => (
                <button
                  key={`${card.name}-${idx}`}
                  onClick={() => setSelectedCard(card)}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 hover:border-purple-300 hover:shadow-md transition-all text-left p-2.5 group flex flex-col gap-2"
                >
                  {/* Rank + name */}
                  <div className="flex items-start gap-1.5">
                    <div className="shrink-0 w-5 flex justify-end pt-0.5">
                      <RankBadge rank={idx + 1} />
                    </div>
                    <p className="text-[11px] font-semibold text-gray-800 leading-tight group-hover:text-purple-700 transition-colors line-clamp-2 flex-1">
                      {card.name}
                    </p>
                  </div>

                  {/* Card image */}
                  <div className="flex justify-center">
                    {card.imageUrl ? (
                      <div
                        className="relative w-full max-w-[90px] rounded-lg overflow-hidden bg-gray-100 border border-gray-200 group-hover:shadow-md transition-shadow mx-auto"
                        style={{ aspectRatio: '2.5/3.5' }}
                      >
                        <Image
                          src={card.imageUrl}
                          alt={card.name}
                          fill
                          sizes="90px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div
                        className="w-full max-w-[90px] rounded-lg bg-gray-100 flex items-center justify-center border border-gray-200 mx-auto"
                        style={{ aspectRatio: '2.5/3.5' }}
                      >
                        <span className="text-gray-400 text-sm">?</span>
                      </div>
                    )}
                  </div>

                  {/* Usage + trend */}
                  <div className="flex items-end justify-between gap-2 px-0.5">
                    <p className="text-[10px] text-gray-500">
                      <span className="font-bold text-gray-700 text-xs">{card.totalUsage.toLocaleString()}</span>
                      {' uses'}
                    </p>
                    <MiniTrendBar weeklyUsage={card.weeklyUsage} maxUsage={cardMaxWeekly} />
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Card popup modal */}
      {selectedCard && data && (
        <CardModal
          card={selectedCard}
          weekLabels={data.weekLabels}
          maxUsage={cardMaxWeekly}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
