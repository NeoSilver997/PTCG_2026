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
  cachedArchetypeName?: string;
  cachedAceName?: string;
  cards: { quantity: number; card: { webCardId: string; name: string; zhName?: string; rarity?: string; imageUrl?: string; supertype?: string; types?: string[] } }[];
}

interface TournamentResult {
  id: string;
  placement: number;
  playerName: string;
  deckName?: string;
  deckArchetype?: string;
  deck?: DeckResult;
}

// Type → Tailwind bg gradient classes for archetype badge background
const TYPE_ARCHETYPE_BG: Record<string, string> = {
  GRASS:     'bg-gradient-to-r from-green-500 to-green-400 text-white',
  FIRE:      'bg-gradient-to-r from-red-500 to-orange-400 text-white',
  WATER:     'bg-gradient-to-r from-blue-500 to-cyan-400 text-white',
  LIGHTNING: 'bg-gradient-to-r from-yellow-400 to-amber-300 text-yellow-900',
  FIGHTING:  'bg-gradient-to-r from-orange-600 to-orange-400 text-white',
  PSYCHIC:   'bg-gradient-to-r from-purple-500 to-pink-400 text-white',
  DARK:      'bg-gradient-to-r from-gray-700 to-gray-500 text-white',
  METAL:     'bg-gradient-to-r from-slate-500 to-slate-400 text-white',
  COLORLESS: 'bg-gradient-to-r from-gray-400 to-gray-300 text-gray-800',
};

const ARCHETYPE_COLORS: Record<string, string> = {
  AGGRO: 'bg-red-100 text-red-700', CONTROL: 'bg-blue-100 text-blue-700',
  COMBO: 'bg-purple-100 text-purple-700', MIDRANGE: 'bg-yellow-100 text-yellow-700',
  TOOLBOX: 'bg-green-100 text-green-700', OTHER: 'bg-gray-100 text-gray-600',
  '未知': 'bg-gray-100 text-gray-500',
  '其他': 'bg-gray-100 text-gray-600',
};

// ARCHETYPE_INFER_MAP removed — archetype names now come exclusively from:
// 1. DB cached names (cachedArchetypeName written by deck-builder page on visit)
// 2. DB zhName on the top-quantity Pokémon ex card (linked via primaryCardId)

// These JP cards should NOT be treated as archetypes (draw engines, ubiquitous supports)
const NOT_ARCHETYPE_FRAGMENTS = [
  'キチキギスex', 'ラティアスex', 'ニャースex', 'リーリエのピッピex', 'ノコッチex', 'ゲノセクトex',
];

// ACE SPEC trainer cards: JP name fragment → ZH display name (fallback only)
const ACE_SPEC_JP_MAP: Array<[string, string]> = [
  ['マキシマムベルト', '極限腰帶'],
  ['プライムキャッチャー', '頂尖捕捉器'],
  ['テラスタルオーブ', '太晶球'],
  ['マスターボール', '大師球'],
  ['ライムのコスプレそうち', '萊姆的戲服裝置'],
  ['スターバース', '星誕生'],
  ['はかせのロールプレイ', '博士的角色扮演'],
  ['ハンディチップ', '手持晶片'],
  ['VIPパス', 'VIP通行證'],
  ['アンフェアスタンプ', '不公印章'],
  ['ヒーローマント', '英雄斗篷'],
  ['ネオアッパーエネルギー', '新衝天能量'],
  ['シークレットボックス', '秘密箱'],
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

const TYPE_ZH: Record<string, string> = {
  GRASS: '草', FIRE: '火', WATER: '水', LIGHTNING: '雷',
  FIGHTING: '格鬥', PSYCHIC: '超能', DARK: '惡', METAL: '鋼', COLORLESS: '無色', DRAGON: '龍',
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
        <Link href="/tournaments" className="text-purple-200 hover:text-white text-sm mb-2 block">← 比賽列表</Link>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <div className="flex flex-wrap gap-3 mt-2 text-sm text-purple-200">
          <span>📅 {new Date(tournament.date).toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          {tournament.location && <span>📍 {tournament.location}</span>}
          {tournament.playerCount && <span>👥 {tournament.playerCount} 人</span>}
          <span className="bg-white/20 px-2 py-0.5 rounded">{tournament.region}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Archetype summary */}
        {tournament.results?.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">強勢分佈</h2>
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
            <h2 className="text-lg font-semibold text-gray-800">成績排名 ({tournament.results?.length ?? 0})</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{tournament.results?.filter((r: TournamentResult) => r.deck).length ?? 0} decks available</span>
              <ExportMarkdownButton tournament={tournament} />
            </div>
          </div>
          {tournament.results?.length === 0 && (
            <p className="text-gray-400 text-center py-8">No results recorded.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tournament.results?.map((result: TournamentResult) => {
              const inferredArch = (result.deckArchetype && result.deckArchetype !== 'UNKNOWN')
                ? result.deckArchetype
                : (result.deck ? inferArchetype(result.deck) : undefined);
              const archParts = result.deck ? inferArchetypeParts(result.deck) : null;
              const mainType = result.deck ? getMainAttackerType(result.deck) : 'COLORLESS';
              const archBg = TYPE_ARCHETYPE_BG[mainType] ?? 'bg-gray-200 text-gray-700';
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
                    <div className="flex flex-col items-end shrink-0 gap-0.5 max-w-[130px]">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${archBg}`}>
                        {inferredArch}
                      </span>
                      {archParts?.support && archParts.support !== inferredArch && (
                        <span className="text-[9px] text-gray-400 leading-tight">+ {archParts.support}</span>
                      )}
                      {archParts?.ace && (
                        <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded leading-tight font-medium">
                          ACE·{archParts.ace}
                        </span>
                      )}
                    </div>
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
  // Priority 0: cached name written by deck-builder page (most accurate — uses full role logic)
  if (deck.cachedArchetypeName) return deck.cachedArchetypeName;

  const deckCards = deck.cards ?? [];

  // Priority 1: DB-linked zhName on highest-quantity non-support ex Pokémon
  // This wins when HK↔JP primaryCard linkage is available (most S/SV series)
  const NOT_SUPPORT = ['キチキギスex', 'ラティアスex', 'ニャースex', 'リーリエのピッピex', 'ノコッチex', 'ゲノセクトex'];
  const sortedPokemon = [...deckCards]
    .filter(c => c.card.supertype === 'POKEMON')
    .sort((a, b) => b.quantity - a.quantity);
  const topExWithZh = sortedPokemon.find(c =>
    c.card.name.includes('ex') &&
    c.card.zhName &&
    !NOT_SUPPORT.some(f => c.card.name.includes(f))
  );
  if (topExWithZh) return topExWithZh.card.zhName!;

  // Priority 2 removed — no hardcoded JP→ZH map

  // Priority 3: highest-quantity ex Pokémon JP name (better than "其他")
  const topEx = sortedPokemon.find(c =>
    c.card.name.includes('ex') &&
    !NOT_SUPPORT.some(f => c.card.name.includes(f))
  );
  if (topEx) return topEx.card.name; // Show JP name — at least not "其他"

  return '其他';
}

/** Returns the composite archetype label: 主攻 + 輔助(抽卡) + ACE
 *  Uses zhName from API (linked ZH_TW card) when available, otherwise falls back to jp→zh map. */
function inferArchetypeParts(deck: DeckResult): { main: string; support?: string; ace?: string } {
  const deckCards = deck.cards ?? [];
  const deckCardData = getDeckCards(deck);
  const main = inferArchetype(deck);

  // Draw support: look for POKEMON with known JP fragments that are NOT archetype cards
  const DRAW_SUPPORT_JP_FRAGS = ['リーリエのピッピex', 'ノコッチex', 'ゲノセクトex'];
  let support: string | undefined;
  for (const jpFrag of DRAW_SUPPORT_JP_FRAGS) {
    const dbMatch = deckCards.find(c => c.card.supertype === 'POKEMON' && c.card.name.includes(jpFrag));
    if (dbMatch) { support = dbMatch.card.zhName ?? dbMatch.card.name; break; }
    if (deckCardData.some(c => c.cardName.includes(jpFrag))) { support = jpFrag; break; }
  }

  // ACE SPEC: first try cachedAceName, then DB rarity flag, then name-based lookup
  let ace: string | undefined;
  if (deck.cachedAceName) {
    ace = deck.cachedAceName;
  } else {
  const aceDbCard = deckCards.find(c => c.card.rarity === 'ACE_SPEC_RARE' || c.card.rarity === 'ACE_SPEC');
  if (aceDbCard) {
    ace = aceDbCard.card.zhName ?? (() => {
      for (const [jpFrag, zhFallback] of ACE_SPEC_JP_MAP) {
        if (aceDbCard.card.name.includes(jpFrag)) return zhFallback;
      }
      return aceDbCard.card.name;
    })();
  } else {
    for (const [jpFrag, zhFallback] of ACE_SPEC_JP_MAP) {
      if (deckCardData.some(c => c.cardName.includes(jpFrag))) { ace = zhFallback; break; }
    }
  }
  }

  return { main, support, ace };
}

function getMainAttackerType(deck: DeckResult): string {
  const pokemonCards = (deck.cards ?? [])
    .filter(c => c.card.supertype === 'POKEMON' && c.card.types && c.card.types.length > 0)
    .sort((a, b) => b.quantity - a.quantity);
  // Prefer ex Pokémon with highest quantity, skip known support Pokémon
  const NOT_ARCHETYPE_FRAGS = ['キチキギスex', 'ラティアスex', 'ニャースex', 'リーリエのピッピex', 'ノコッチex', 'ゲノセクトex'];
  const mainAttacker = pokemonCards.find(c =>
    !NOT_ARCHETYPE_FRAGS.some(f => c.card.name.includes(f))
  );
  return mainAttacker?.card.types?.[0] ?? 'COLORLESS';
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
      {viewHref && (
        <div className="mt-2 pt-1.5 border-t border-slate-700 flex justify-end">
          <Link href={viewHref} className="text-[11px] text-blue-400 hover:text-blue-200 transition-colors font-medium px-2.5 py-1 bg-slate-700/60 rounded">
            查看完整牌組 →
          </Link>
        </div>
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
      <div className="relative w-12 h-[67px] rounded border border-slate-600 bg-slate-700 overflow-hidden">
        {card.imageUrl && !imgError ? (
          <Image
            src={card.imageUrl}
            alt={card.cardName}
            fill
            sizes="48px"
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

  // Build frequency maps per supertype using deck.cards (has zhName + supertype)
  type CardStat = { name: string; count: number; imageUrl: string; totalQty: number };
  const trainerFreq: Record<string, CardStat> = {};
  const pokemonFreq: Record<string, CardStat> = {};

  for (const r of decksWithData) {
    const deck = r.deck!;
    for (const c of (deck.cards ?? [])) {
      if (c.card.supertype !== 'TRAINER' && c.card.supertype !== 'POKEMON') continue;
      const displayName = c.card.zhName ?? c.card.name;
      const key = displayName; // dedupe by display name
      const imageUrl = c.card.imageUrl ?? '';
      const freq = c.card.supertype === 'TRAINER' ? trainerFreq : pokemonFreq;
      if (!freq[key]) freq[key] = { name: displayName, count: 0, imageUrl, totalQty: 0 };
      freq[key].count++;
      freq[key].totalQty += c.quantity;
    }
  }

  const topTrainers = Object.entries(trainerFreq).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  const topPokemon = Object.entries(pokemonFreq).sort((a, b) => b[1].count - a[1].count).slice(0, 10);

  function CardGrid({ entries }: { entries: [string, CardStat][] }) {
    return (
      <div className="flex flex-wrap gap-3">
        {entries.map(([id, c]) => (
          <div key={id} className="flex flex-col items-center gap-1 bg-gray-50 rounded-lg px-2 py-2 min-w-[72px] max-w-[80px]">
            {c.imageUrl && (
              <div className="relative w-14 h-[80px] rounded-lg overflow-hidden bg-gray-200 shadow-sm shrink-0">
                <Image src={c.imageUrl} alt={c.name} fill sizes="56px" className="object-cover" unoptimized />
              </div>
            )}
            <div className="text-center">
              <p className="text-[11px] font-medium text-gray-800 leading-tight line-clamp-2">{c.name}</p>
              <p className="text-[10px] text-blue-600 mt-0.5 font-semibold">{c.count}/{totalDecks} 套</p>
              <p className="text-[10px] text-gray-400">均 {(c.totalQty / c.count).toFixed(1)} 張</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-5">
      <h2 className="text-lg font-semibold text-gray-800">熱門用牌 <span className="text-sm font-normal text-gray-400">({totalDecks} 副卡組)</span></h2>
      {topTrainers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">訓練家 · Top {topTrainers.length}</p>
          <CardGrid entries={topTrainers} />
        </div>
      )}
      {topPokemon.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">寶可夢 · Top {topPokemon.length}</p>
          <CardGrid entries={topPokemon} />
        </div>
      )}
    </div>
  );
}

function ArchetypeCardThumb({ card }: { card: { name: string; imageUrl: string } }) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative w-[42px] h-[59px] rounded overflow-hidden bg-gray-100 border border-gray-200 shadow-sm cursor-pointer">
        {card.imageUrl && !imgError ? (
          <Image
            src={card.imageUrl}
            alt={card.name}
            fill
            sizes="42px"
            className="object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[7px] text-gray-400 text-center px-0.5 leading-tight">{card.name}</div>
        )}
      </div>
      {hovered && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none">
          <div className="bg-slate-900 rounded-xl p-1.5 shadow-2xl border border-slate-500">
            {card.imageUrl && !imgError ? (
              <Image src={card.imageUrl} alt={card.name} width={110} height={154} className="rounded-lg" unoptimized />
            ) : (
              <div className="w-[110px] h-[154px] rounded-lg bg-slate-700 flex items-center justify-center">
                <span className="text-slate-300 text-xs text-center px-2">{card.name}</span>
              </div>
            )}
            <p className="text-white text-[10px] font-semibold text-center mt-1 max-w-[110px] leading-tight">{card.name}</p>
          </div>
          <div className="flex justify-center"><div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-500 rotate-45 -mt-1" /></div>
        </div>
      )}
    </div>
  );
}

function ArchetypeChart({ results }: { results: TournamentResult[] }) {
  const BAR_COLORS: Record<string, string> = {
    AGGRO: 'bg-red-400', CONTROL: 'bg-blue-400', COMBO: 'bg-purple-400',
    MIDRANGE: 'bg-yellow-400', TOOLBOX: 'bg-green-400', OTHER: 'bg-gray-400', UNKNOWN: 'bg-slate-300',
    '幽靈拖龍ex': 'bg-violet-400', '翁固拉蓬': 'bg-green-500', '火箭隊': 'bg-red-500',
    '超級路卡利歐ex': 'bg-yellow-500', '猛雷鼓ex': 'bg-blue-500', '喵喵ex': 'bg-orange-400',
    '日月石': 'bg-stone-400', '帝拉帕鬼ex': 'bg-teal-400', '夜黑鴞': 'bg-indigo-400',
    '超級絕對魔獸ex': 'bg-pink-400', '竹蘭的烈咬陸鯊ex': 'bg-amber-600', '瑪俐的長毛巨魔ex': 'bg-purple-500',
    '胡地': 'bg-cyan-500', '呆呆王': 'bg-blue-300', '未知': 'bg-slate-300', '其他': 'bg-gray-400',
  };

  // Group results by inferred archetype
  const groupedDecks: Record<string, TournamentResult[]> = {};
  for (const r of results) {
    const raw = r.deckArchetype;
    const k = (!raw || raw === 'UNKNOWN')
      ? (r.deck ? inferArchetype(r.deck) : '未知')
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

  const placementLabel = (p: number) =>
    p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `${p}位`;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 space-y-4">
      {sorted.map(([arch, arcResults]) => {
        const count = arcResults.length;
        const repCards = getRepCards(arcResults);
        const topPlacements = [...arcResults]
          .sort((a, b) => a.placement - b.placement)
          .slice(0, 5);
        return (
          <div key={arch} className="space-y-1.5">
            <div className="flex items-center gap-3 min-h-[64px]">
              {/* Card images: up to 4 with hover tooltip */}
              <div className="flex items-end gap-0.5 shrink-0" style={{ width: 180 }}>
                {repCards.length > 0 ? (
                  repCards.map((card, i) => (
                    <ArchetypeCardThumb key={i} card={card} />
                  ))
                ) : (
                  <div className="w-[42px] h-[59px] rounded bg-gray-100 border border-gray-200" />
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
            {/* Ranking badges */}
            <div className="flex items-center gap-1.5 pl-[186px]">
              {topPlacements.map((r) => (
                <span
                  key={r.id}
                  className="text-[10px] bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 leading-none"
                  title={r.playerName}
                >
                  {placementLabel(r.placement)} {r.playerName}
                </span>
              ))}
            </div>
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
      <h2 className="text-lg font-semibold text-gray-800 mb-4">弱點分析</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">場上套牌屬性</p>
          <div className="space-y-2">
            {sortedTypes.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-base leading-none">{TYPE_ICON[type] ?? '?'}</span>
                <span className="w-16 font-medium text-gray-700">{TYPE_ZH[type] ?? type}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${TYPE_COLOR[type] ?? 'bg-gray-400'}`} style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="text-gray-500 text-xs w-14 text-right">{count}/{total}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">最佳攻擊屬性</p>
          <div className="space-y-2">
            {sortedWeaknesses.map(([type, count]) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-base leading-none">{TYPE_ICON[type] ?? '?'}</span>
                <span className="w-16 font-medium text-gray-700">{TYPE_ZH[type] ?? type}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${TYPE_COLOR[type] ?? 'bg-orange-400'}`} style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="text-gray-500 text-xs w-20 text-right">×{count} 套</span>
              </div>
            ))}
          </div>
          {sortedWeaknesses.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              {TYPE_ICON[sortedWeaknesses[0][0]]} <span className="font-medium text-gray-600">{TYPE_ZH[sortedWeaknesses[0][0]] ?? sortedWeaknesses[0][0]}</span> 屬性攻擊對本場 {sortedWeaknesses[0][1]}/{total} 套牌有效。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown export helper
// ---------------------------------------------------------------------------
function buildMarkdown(tournament: any): string {
  const date = new Date(tournament.date).toLocaleDateString('zh-HK', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const region = tournament.region ?? '';
  const count = tournament.playerCount ? `${tournament.playerCount}人` : '';

  const lines: string[] = [];
  lines.push(`# ${tournament.name}`);
  lines.push(`📅 ${date}${count ? ` | 👥 ${count}` : ''}${region ? ` | ${region}` : ''}`);
  lines.push('');

  // Archetype distribution
  const results: TournamentResult[] = tournament.results ?? [];
  if (results.length > 0) {
    const archCounts: Record<string, number> = {};
    for (const r of results) {
      const arch = (r.deckArchetype && r.deckArchetype !== 'UNKNOWN')
        ? r.deckArchetype
        : (r.deck ? inferArchetype(r.deck) : '未知');
      archCounts[arch] = (archCounts[arch] ?? 0) + 1;
    }
    const total = results.length;
    const sorted = Object.entries(archCounts).sort((a, b) => b[1] - a[1]);
    lines.push('## 強勢分佈');
    lines.push('| 套牌 | 數量 | % |');
    lines.push('|------|------|---|');
    for (const [arch, cnt] of sorted) {
      lines.push(`| ${arch} | ${cnt} | ${Math.round((cnt / total) * 100)}% |`);
    }
    lines.push('');
  }

  // Results table
  if (results.length > 0) {
    lines.push('## 成績排名');
    lines.push('| 排名 | 玩家 | 套牌 | ACE SPEC |');
    lines.push('|------|------|------|----------|');
    const sorted = [...results].sort((a, b) => a.placement - b.placement);
    for (const r of sorted) {
      const place = r.placement === 1 ? '🥇' : r.placement === 2 ? '🥈' : r.placement === 3 ? '🥉' : `${r.placement}`;
      const arch = (r.deckArchetype && r.deckArchetype !== 'UNKNOWN')
        ? r.deckArchetype
        : (r.deck ? inferArchetype(r.deck) : '-');
      const parts = r.deck ? inferArchetypeParts(r.deck) : null;
      const ace = parts?.ace ?? '-';
      lines.push(`| ${place} | ${r.playerName} | ${arch} | ${ace} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function ExportMarkdownButton({ tournament }: { tournament: any }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const md = buildMarkdown(tournament);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: open in new tab as text
      const blob = new Blob([md], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
    >
      {copied ? '✅ 已複製!' : '📋 複製為Markdown'}
    </button>
  );
}