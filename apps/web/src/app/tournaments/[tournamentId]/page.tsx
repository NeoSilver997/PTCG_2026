'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import apiClient from '@/lib/api-client';

interface DeckCardData {
  cardId: string;
  cardName: string;
  cardCode: string;
  quantity: number;
  imageUrl: string;
}

interface DeckResult {
  id: string;
  deckCode?: string;
  deckData?: DeckCardData[];
  cards: { quantity: number; card: { webCardId: string; name: string; imageUrl?: string; supertype?: string } }[];
}

interface TournamentResult {
  id: string;
  placement: number;
  playerName: string;
  deckName?: string;
  deckArchetype?: string;
  deck?: DeckResult;
}

const ARCHETYPE_COLORS: Record<string, string> = {
  AGGRO: 'bg-red-100 text-red-700', CONTROL: 'bg-blue-100 text-blue-700',
  COMBO: 'bg-purple-100 text-purple-700', MIDRANGE: 'bg-yellow-100 text-yellow-700',
  TOOLBOX: 'bg-green-100 text-green-700', OTHER: 'bg-gray-100 text-gray-600',
  // Inferred archetypes
  'Drapart': 'bg-violet-100 text-violet-700',
  'Ogerpon': 'bg-green-100 text-green-700',
  'Team Rocket': 'bg-red-100 text-red-700',
  'M.Lucario': 'bg-yellow-100 text-yellow-700',
  'Takeruraiko': 'bg-blue-100 text-blue-700',
  'Nyarth ex': 'bg-orange-100 text-orange-700',
  'Rock Lock': 'bg-stone-100 text-stone-700',
  'Terapagos': 'bg-teal-100 text-teal-700',
  'Noctowl': 'bg-indigo-100 text-indigo-700',
  'Unknown': 'bg-gray-100 text-gray-500',
};

// Client-side archetype inference from deck Pokemon card names
const ARCHETYPE_INFER_MAP: Array<[string, string]> = [
  ['ドラパルトex', 'Drapart'],
  ['ロケット団のドンカラス', 'Team Rocket'],
  ['ロケット団のミュウツーex', 'Team Rocket'],
  ['ロケット団のワナイダー', 'Team Rocket'],
  ['ロケット団のポリゴン2', 'Team Rocket'],
  ['メガルカリオex', 'M.Lucario'],
  ['タケルライコex', 'Takeruraiko'],
  ['テラパゴスex', 'Terapagos'],
  ['オーガポン みどりのめんex', 'Ogerpon'],
  ['オーガポン いどのめんex', 'Ogerpon'],
  ['オーガポン', 'Ogerpon'],
  ['イワパレス', 'Rock Lock'],
  ['ニャースex', 'Nyarth ex'],
  ['ヨルノズク', 'Noctowl'],
  ['メガアブソルex', 'M.Absol'],
];

const ENERGY_TYPE_MAP: Array<[string, string]> = [
  ['基本草エネルギー', 'GRASS'],
  ['基本炎エネルギー', 'FIRE'],
  ['基本水エネルギー', 'WATER'],
  ['基本雷エネルギー', 'LIGHTNING'],
  ['基本闘エネルギー', 'FIGHTING'],
  ['基本超エネルギー', 'PSYCHIC'],
  ['基本悪エネルギー', 'DARK'],
  ['基本鋼エネルギー', 'METAL'],
  ['ロケット団エネルギー', 'DARK'],
  ['イグニッションエネルギー', 'FIRE'],
  ['ロック闘エネルギー', 'FIGHTING'],
  ['ミストエネルギー', 'WATER'],
];

const WEAKNESS_OF: Record<string, string> = {
  GRASS: 'FIRE', FIRE: 'WATER', WATER: 'LIGHTNING',
  LIGHTNING: 'FIGHTING', FIGHTING: 'PSYCHIC', PSYCHIC: 'DARK',
  DARK: 'FIGHTING', METAL: 'FIRE', COLORLESS: 'FIGHTING',
};

const TYPE_ICON: Record<string, string> = {
  GRASS: '🌿', FIRE: '🔥', WATER: '💧', LIGHTNING: '⚡',
  FIGHTING: '👊', PSYCHIC: '🔮', DARK: '🌑', METAL: '⚙️', COLORLESS: '⭕',
};

const TYPE_COLOR: Record<string, string> = {
  GRASS: 'bg-green-400', FIRE: 'bg-red-400', WATER: 'bg-blue-400',
  LIGHTNING: 'bg-yellow-400', FIGHTING: 'bg-orange-400', PSYCHIC: 'bg-purple-400',
  DARK: 'bg-gray-600', METAL: 'bg-slate-400', COLORLESS: 'bg-gray-300',
};

const PLACEMENT_BADGE: Record<number, string> = {
  1: 'bg-yellow-400 text-yellow-900', 2: 'bg-gray-300 text-gray-800', 3: 'bg-orange-300 text-orange-900',
};

const PLACEMENT_LABEL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function TournamentDetailPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = use(params);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => apiClient.get(`/tournaments/${tournamentId}`),
  });

  const tournament = data?.data;

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">Loading tournament...</div>
  );

  if (error || !tournament) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-500 mb-4">Tournament not found or failed to load.</p>
        <Link href="/tournaments" className="text-blue-600 hover:underline">← Back to Tournaments</Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-700 to-blue-600 text-white p-6">
        <Link href="/tournaments" className="text-purple-200 hover:text-white text-sm mb-2 block">← Tournaments</Link>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <div className="flex flex-wrap gap-3 mt-2 text-sm text-purple-200">
          <span>📅 {new Date(tournament.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          {tournament.location && <span>📍 {tournament.location}</span>}
          {tournament.playerCount && <span>👥 {tournament.playerCount} players</span>}
          <span className="bg-white/20 px-2 py-0.5 rounded">{tournament.region}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Archetype summary */}
        {tournament.results?.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Archetype Breakdown</h2>
            <ArchetypeChart results={tournament.results} />
          </div>
        )}

        {/* Weakness summary */}
        {tournament.results?.some((r: TournamentResult) => r.deck && getDeckCards(r.deck).length > 0) && (
          <WeaknessSummary results={tournament.results} />
        )}

        {/* Deck stats summary */}
        {tournament.results?.some((r: TournamentResult) => r.deck && getDeckCards(r.deck).length > 0) && (
          <DeckSummaryStats results={tournament.results} />
        )}

        {/* Results — 2-column grid, deck always visible */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Results ({tournament.results?.length ?? 0})</h2>
            <span className="text-xs text-gray-400">{tournament.results?.filter((r: TournamentResult) => r.deck).length ?? 0} decks available</span>
          </div>
          {tournament.results?.length === 0 && (
            <p className="text-gray-400 text-center py-8">No results recorded.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tournament.results?.map((result: TournamentResult) => {
              const inferredArch = (result.deckArchetype && result.deckArchetype !== 'UNKNOWN')
                ? result.deckArchetype
                : (result.deck ? inferArchetype(result.deck) : undefined);
              return (
              <div key={result.id} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
                <div className="flex items-center gap-3 p-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${PLACEMENT_BADGE[result.placement] ?? 'bg-gray-100 text-gray-600'}`}>
                    {PLACEMENT_LABEL[result.placement] ?? result.placement}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{result.playerName}</p>
                    {result.deckName && <p className="text-xs text-gray-500 truncate">{result.deckName}</p>}
                  </div>
                  {inferredArch && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${ARCHETYPE_COLORS[inferredArch] ?? 'bg-gray-100 text-gray-600'}`}>
                      {inferredArch}
                    </span>
                  )}
                  {result.deck?.deckCode && (
                    <Link
                      href={`/deck-builder/event/${result.deck.deckCode}`}
                      className="text-xs text-blue-600 hover:text-blue-800 shrink-0 px-2 py-1 bg-blue-50 rounded transition-colors"
                    >
                      View →
                    </Link>
                  )}
                </div>
                {result.deck && <DeckPanel deck={result.deck} />}
              </div>
            );})}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDeckCards(deck: DeckResult): DeckCardData[] {
  if (deck.deckData && deck.deckData.length > 0) {
    return deck.deckData;
  }
  return (deck.cards ?? []).map((c) => ({
    cardId: c.card.webCardId,
    cardName: c.card.name,
    cardCode: c.card.webCardId,
    quantity: c.quantity,
    imageUrl: c.card.imageUrl ?? '',
  }));
}

function inferArchetype(deck: DeckResult): string {
  const deckCards = deck.cards ?? [];
  const pokemonNames = deckCards
    .filter(c => c.card.supertype === 'POKEMON')
    .map(c => c.card.name);
  // Also check deckData card names (used when deckData is populated)
  const allNames = getDeckCards(deck).map(c => c.cardName);
  const names = [...new Set([...pokemonNames, ...allNames])];
  for (const [fragment, arch] of ARCHETYPE_INFER_MAP) {
    if (names.some(n => n.includes(fragment))) return arch;
  }
  return 'Other';
}

function getDeckType(deck: DeckResult): string {
  const cards = getDeckCards(deck);
  const energyCounts: Record<string, number> = {};
  for (const card of cards) {
    for (const [fragment, type] of ENERGY_TYPE_MAP) {
      if (card.cardName.includes(fragment)) {
        energyCounts[type] = (energyCounts[type] ?? 0) + card.quantity;
        break;
      }
    }
  }
  const sorted = Object.entries(energyCounts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? 'COLORLESS';
}

  function DeckDetailView({ deck, onClose }: { deck: DeckResult; onClose: () => void }) {
  const cards = getDeckCards(deck);

    const totalCards = cards.reduce((sum, c) => sum + c.quantity, 0);
    const totalUnique = cards.length;

    const pokemonCount = (deck.cards ?? [])
      .filter((c) => c.card.supertype === 'POKEMON')
      .reduce((sum, c) => sum + c.quantity, 0);
    const trainerCount = (deck.cards ?? [])
      .filter((c) => c.card.supertype === 'TRAINER')
      .reduce((sum, c) => sum + c.quantity, 0);
    const energyCount = (deck.cards ?? [])
      .filter((c) => c.card.supertype === 'ENERGY')
      .reduce((sum, c) => sum + c.quantity, 0);

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Deck Summary & Card Detail</h3>
            <p className="text-xs text-gray-500 mt-1">Deck Code: {deck.deckCode ?? '-'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 border-b bg-gray-50">
          <StatCard label="Total Cards" value={totalCards} />
          <StatCard label="Unique Cards" value={totalUnique} />
          <StatCard label="Pokemon" value={pokemonCount} />
          <StatCard label="Trainer" value={trainerCount} />
          <StatCard label="Energy" value={energyCount} />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="text-left px-3 py-2">Card</th>
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Qty</th>
              </tr>
            </thead>
            <tbody>
              {[...cards]
                .sort((a, b) => b.quantity - a.quantity || a.cardName.localeCompare(b.cardName))
                .map((card, idx) => (
                  <tr key={`${card.cardId}-${idx}`} className="border-t">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="relative w-8 h-11 rounded overflow-hidden bg-gray-200 shrink-0">
                          {card.imageUrl ? (
                            <Image
                              src={card.imageUrl}
                              alt={card.cardName}
                              fill
                              sizes="32px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : null}
                        </div>
                        <span className="text-gray-900">{card.cardName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{card.cardCode || card.cardId}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">x{card.quantity}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function StatCard({ label, value }: { label: string; value: number }) {
    return (
      <div className="bg-white border rounded p-3">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
      </div>
    );
  }

function DeckPanel({ deck }: { deck: DeckResult }) {
  const cards = getDeckCards(deck);
  const sorted = [...cards].sort((a, b) => b.quantity - a.quantity);
  const total = cards.reduce((s, c) => s + c.quantity, 0);
  const deckCards = deck.cards ?? [];
  const pokemonCount = deckCards.filter(c => c.card.supertype === 'POKEMON').reduce((s, c) => s + c.quantity, 0);
  const trainerCount = deckCards.filter(c => c.card.supertype === 'TRAINER').reduce((s, c) => s + c.quantity, 0);
  const energyCount = deckCards.filter(c => c.card.supertype === 'ENERGY').reduce((s, c) => s + c.quantity, 0);
  const viewHref = deck.deckCode ? `/deck-builder/event/${deck.deckCode}` : null;

  return (
    <div className="bg-slate-800/95 border-t border-slate-600 px-3 py-3">
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-slate-400 text-[10px]">{total} cards · {cards.length} types</span>
        {deck.deckCode && (
          <a
            href={`https://www.pokemon-card.com/deck/confirm.html/deckID/${deck.deckCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] bg-slate-700 text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded transition-colors"
          >
            {deck.deckCode} ↗
          </a>
        )}
        {pokemonCount > 0 && <span className="bg-emerald-800/80 text-emerald-200 text-[9px] font-bold px-1.5 py-0.5 rounded">P·{pokemonCount}</span>}
        {trainerCount > 0 && <span className="bg-blue-800/80 text-blue-200 text-[9px] font-bold px-1.5 py-0.5 rounded">T·{trainerCount}</span>}
        {energyCount > 0 && <span className="bg-orange-800/80 text-orange-200 text-[9px] font-bold px-1.5 py-0.5 rounded">E·{energyCount}</span>}
        {viewHref && (
          <Link href={viewHref} className="ml-auto text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
            View →
          </Link>
        )}
      </div>
      {sorted.length > 0 ? (
        <div className="flex items-center gap-0.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {sorted.map((c, i) => (
            <CardThumbnail key={`${c.cardId}-${i}`} card={c} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic">No card data available.</p>
      )}
    </div>
  );
}

function CardThumbnail({ card }: { card: DeckCardData }) {
  const [imgError, setImgError] = useState(false);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative flex-shrink-0 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative w-9 h-[50px] rounded border border-slate-600 bg-slate-700 overflow-hidden">
        {card.imageUrl && !imgError ? (
          <Image
            src={card.imageUrl}
            alt={card.cardName}
            fill
            sizes="36px"
            className="object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[7px] text-slate-400 text-center px-0.5 leading-tight">{card.cardName}</div>
        )}
        {card.quantity > 1 && (
          <span className="absolute -top-1 -right-1 bg-slate-900 border border-slate-600 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none">
            {card.quantity}
          </span>
        )}
      </div>
      {hovered && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none">
          <div className="bg-slate-900 rounded-xl p-1.5 shadow-2xl border border-slate-500">
            {card.imageUrl && !imgError ? (
              <Image src={card.imageUrl} alt={card.cardName} width={100} height={140} className="rounded-lg" unoptimized />
            ) : (
              <div className="w-[100px] h-[140px] rounded-lg bg-slate-700 flex items-center justify-center">
                <span className="text-slate-300 text-xs text-center px-2">{card.cardName}</span>
              </div>
            )}
            <p className="text-white text-[10px] font-semibold text-center mt-1 max-w-[100px] leading-tight">{card.cardName}</p>
            <p className="text-slate-400 text-[9px] text-center">{card.cardCode} ×{card.quantity}</p>
          </div>
          <div className="flex justify-center"><div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-500 rotate-45 -mt-1" /></div>
        </div>
      )}
    </div>
  );
}

function DeckSummaryStats({ results }: { results: TournamentResult[] }) {
  const decksWithData = results.filter((r) => r.deck && getDeckCards(r.deck).length > 0);
  const totalDecks = decksWithData.length;
  if (totalDecks === 0) return null;

  // Count most popular cards across all decks
  const cardFreq: Record<string, { name: string; count: number; imageUrl: string }> = {};
  for (const r of decksWithData) {
    for (const c of getDeckCards(r.deck!)) {
      if (!cardFreq[c.cardId]) cardFreq[c.cardId] = { name: c.cardName, count: 0, imageUrl: c.imageUrl };
      cardFreq[c.cardId].count++;
    }
  }
  const top = Object.entries(cardFreq).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Deck Insights <span className="text-sm font-normal text-gray-400">({totalDecks} decks)</span></h2>
      <p className="text-sm text-gray-600 mb-3">Most popular cards across all decks:</p>
      <div className="flex flex-wrap gap-4">
        {top.map(([id, c]) => (
          <div key={id} className="flex flex-col items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-2 min-w-[80px]">
            {c.imageUrl && (
              <div className="relative w-16 h-[90px] rounded-lg overflow-hidden bg-gray-200 shadow-sm shrink-0">
                <Image src={c.imageUrl} alt={c.name} fill sizes="64px" className="object-cover" unoptimized />
              </div>
            )}
            <div className="text-center">
              <p className="text-xs font-medium text-gray-800 leading-tight max-w-[80px] line-clamp-2">{c.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">In {c.count}/{totalDecks}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArchetypeChart({ results }: { results: TournamentResult[] }) {
  const BAR_COLORS: Record<string, string> = {
    AGGRO: 'bg-red-400', CONTROL: 'bg-blue-400', COMBO: 'bg-purple-400',
    MIDRANGE: 'bg-yellow-400', TOOLBOX: 'bg-green-400', OTHER: 'bg-gray-400', UNKNOWN: 'bg-slate-300',
    'Drapart': 'bg-violet-400', 'Ogerpon': 'bg-green-500', 'Team Rocket': 'bg-red-500',
    'M.Lucario': 'bg-yellow-500', 'Takeruraiko': 'bg-blue-500', 'Nyarth ex': 'bg-orange-400',
    'Rock Lock': 'bg-stone-400', 'Terapagos': 'bg-teal-400', 'Noctowl': 'bg-indigo-400',
    'M.Absol': 'bg-pink-400', 'Unknown': 'bg-slate-300', 'Other': 'bg-gray-400',
  };

  // Group results by inferred archetype
  const groupedDecks: Record<string, TournamentResult[]> = {};
  for (const r of results) {
    const raw = r.deckArchetype;
    const k = (!raw || raw === 'UNKNOWN')
      ? (r.deck ? inferArchetype(r.deck) : 'Unknown')
      : raw;
    if (!groupedDecks[k]) groupedDecks[k] = [];
    groupedDecks[k].push(r);
  }

  const sorted = Object.entries(groupedDecks).sort((a, b) => b[1].length - a[1].length);
  const total = results.length;

  // For each archetype, find top 4 Pokemon card images by frequency
  function getRepCards(arcResults: TournamentResult[]): { name: string; imageUrl: string }[] {
    const freq: Record<string, { name: string; imageUrl: string; count: number }> = {};
    for (const r of arcResults) {
      if (!r.deck) continue;
      const pokemonCards = (r.deck.cards ?? []).filter(c => c.card.supertype === 'POKEMON');
      for (const c of pokemonCards) {
        const id = c.card.webCardId;
        if (!freq[id]) freq[id] = { name: c.card.name, imageUrl: c.card.imageUrl ?? '', count: 0 };
        freq[id].count++;
      }
    }
    return Object.values(freq)
      .filter(c => c.imageUrl)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
      {sorted.map(([arch, arcResults]) => {
        const count = arcResults.length;
        const repCards = getRepCards(arcResults);
        return (
          <div key={arch} className="flex items-center gap-3 min-h-[64px]">
            {/* Card images: up to 4 stacked slightly */}
            <div className="flex items-center shrink-0" style={{ width: 120 }}>
              {repCards.length > 0 ? (
                <div className="flex gap-0.5">
                  {repCards.map((card, i) => (
                    <div key={i} className="relative" style={{ width: 28 }}>
                      <div className="relative w-7 h-10 rounded overflow-hidden bg-gray-100 border border-gray-200 shadow-sm">
                        <Image
                          src={card.imageUrl}
                          alt={card.name}
                          fill
                          sizes="28px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-7 h-10 rounded bg-gray-100 border border-gray-200" />
              )}
            </div>
            {/* Archetype label */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 w-28 text-center ${ARCHETYPE_COLORS[arch] ?? 'bg-gray-100 text-gray-600'}`}>
              {arch}
            </span>
            {/* Bar */}
            <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${BAR_COLORS[arch] ?? 'bg-gray-400'}`}
                style={{ width: `${Math.max(2, (count / total) * 100)}%` }}
              />
            </div>
            {/* Count */}
            <span className="text-xs text-gray-600 shrink-0 w-20 text-right">
              {count} ({Math.round((count / total) * 100)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WeaknessSummary({ results }: { results: TournamentResult[] }) {
  const decksWithData = results.filter(r => r.deck && getDeckCards(r.deck).length > 0);
  if (decksWithData.length === 0) return null;

  const typeCounts: Record<string, number> = {};
  for (const r of decksWithData) {
    const type = getDeckType(r.deck!);
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  const weaknessCounts: Record<string, number> = {};
  for (const [type, count] of Object.entries(typeCounts)) {
    const weakness = WEAKNESS_OF[type];
    if (weakness) weaknessCounts[weakness] = (weaknessCounts[weakness] ?? 0) + count;
  }

  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const sortedWeaknesses = Object.entries(weaknessCounts).sort((a, b) => b[1] - a[1]);
  const total = decksWithData.length;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Weakness Summary</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Deck Types in Field</p>
          <div className="space-y-2">
            {sortedTypes.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-base leading-none">{TYPE_ICON[type] ?? '?'}</span>
                <span className="w-24 font-medium text-gray-700">{type}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${TYPE_COLOR[type] ?? 'bg-gray-400'}`} style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="text-gray-500 text-xs w-14 text-right">{count}/{total}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Best Attack Types vs. Field</p>
          <div className="space-y-2">
            {sortedWeaknesses.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-base leading-none">{TYPE_ICON[type] ?? '?'}</span>
                <span className="w-24 font-medium text-gray-700">{type}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${TYPE_COLOR[type] ?? 'bg-orange-400'}`} style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="text-gray-500 text-xs w-20 text-right">×{count} decks</span>
              </div>
            ))}
          </div>
          {sortedWeaknesses.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              {TYPE_ICON[sortedWeaknesses[0][0]]} <span className="font-medium text-gray-600">{sortedWeaknesses[0][0]}</span> attacks are effective against {sortedWeaknesses[0][1]} of {total} decks in this tournament.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}