'use client';

/**
 * Shared deck-view components used by both:
 *   - /deck-builder?deckId=...&mode=view
 *   - /deck-builder/event/:deckCode
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { X, ExternalLink, Copy } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

/* ─── Types ─────────────────────────────────────────────────────── */

export interface AttackData {
  name: string;
  damage: string;
  cost: string[];
  text?: string;
}

export interface DeckCardDetail {
  webCardId: string;
  name: string;
  imageUrl?: string | null;
  supertype?: string | null;
  subtypes?: string[];
  types?: string[];
  rarity?: string | null;
  hp?: number | null;
  attacks?: AttackData[] | null;
  evolutionStage?: string | null;
  /** Resolved canonical webCardId for primary-card-based linking (Pokémon only). */
  canonicalWebCardId?: string | null;
}

export interface DeckCardEntry {
  quantity: number;
  card: DeckCardDetail;
}

export type SectionKey =
  | 'pokemon-main'
  | 'pokemon-support'
  | 'pokemon-evolution'
  | 'supporter'
  | 'item'
  | 'ace'
  | 'tool'
  | 'stadium'
  | 'basic-energy'
  | 'special-energy';

export type PokemonRole = 'pokemon-main' | 'pokemon-support' | 'pokemon-evolution';

/* ─── Constants ──────────────────────────────────────────────────── */

export const SECTION_ORDER: SectionKey[] = [
  'pokemon-main',
  'pokemon-support',
  'pokemon-evolution',
  'supporter',
  'item',
  'ace',
  'tool',
  'stadium',
  'basic-energy',
  'special-energy',
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  'pokemon-main': '主力寶可夢',
  'pokemon-support': '輔助寶可夢',
  'pokemon-evolution': '進化鏈寶可夢',
  supporter: 'Supporter',
  item: 'Item',
  ace: 'ACE SPEC',
  tool: 'Pokémon Tool',
  stadium: 'Stadium',
  'basic-energy': 'Basic Energy',
  'special-energy': 'Special Energy',
};

export const SECTION_COLORS: Record<SectionKey, string> = {
  'pokemon-main': 'bg-emerald-600',
  'pokemon-support': 'bg-teal-600',
  'pokemon-evolution': 'bg-violet-600',
  supporter: 'bg-blue-600',
  item: 'bg-slate-500',
  ace: 'bg-yellow-500',
  tool: 'bg-purple-600',
  stadium: 'bg-cyan-700',
  'basic-energy': 'bg-orange-600',
  'special-energy': 'bg-pink-600',
};

/* ─── Helpers ────────────────────────────────────────────────────── */

export function maxDamage(attacks: AttackData[] | null | undefined): number {
  if (!attacks?.length) return 0;
  return Math.max(
    ...attacks.map((a) => parseInt(String(a.damage || '0').replace(/[^0-9]/g, ''), 10) || 0),
  );
}

/**
 * Heuristic: A Pokémon is a "main attacker" if it appears in high quantity
 * (≥3 copies — the deck centres on it) or has very high HP (≥ 200 — EX/V-class).
 * Everything else is treated as a support / tech Pokémon.
 */
export function isMainPokemon(entry: DeckCardEntry): boolean {
  return entry.quantity >= 3 || (entry.card.hp ?? 0) >= 200;
}

export function getSectionKey(entry: DeckCardEntry): SectionKey {
  const { supertype, subtypes = [], rarity } = entry.card;
  if (supertype === 'POKEMON') {
    return isMainPokemon(entry) ? 'pokemon-main' : 'pokemon-support';
  }
  if (supertype === 'ENERGY') {
    return subtypes.includes('BASIC_ENERGY') ? 'basic-energy' : 'special-energy';
  }
  // TRAINER
  if (rarity === 'ACE_SPEC_RARE' || rarity === 'ACE_SPEC') return 'ace';
  if (subtypes.includes('SUPPORTER')) return 'supporter';
  if (subtypes.includes('ITEM')) return 'item';
  if (subtypes.includes('TOOL')) return 'tool';
  if (subtypes.includes('STADIUM')) return 'stadium';
  return 'item';
}

export function sortSection(entries: DeckCardEntry[], section: SectionKey): DeckCardEntry[] {
  return [...entries].sort((a, b) => {
    if (section === 'pokemon-main' || section === 'pokemon-support' || section === 'pokemon-evolution') {
      const hpDiff = (b.card.hp ?? 0) - (a.card.hp ?? 0);
      if (hpDiff !== 0) return hpDiff;
      return maxDamage(b.card.attacks) - maxDamage(a.card.attacks);
    }
    return b.quantity - a.quantity || (a.card.name ?? '').localeCompare(b.card.name ?? '');
  });
}

/* ─── Deck Summary ───────────────────────────────────────────────── */

export function DeckSummary({ entries }: { entries: DeckCardEntry[] }) {
  const pokemon = entries.filter((e) => e.card.supertype === 'POKEMON');

  const highestHp = pokemon.reduce<DeckCardEntry | null>((best, e) => {
    if (!best || (e.card.hp ?? 0) > (best.card.hp ?? 0)) return e;
    return best;
  }, null);

  const highestDmg = pokemon.reduce<{ entry: DeckCardEntry; dmg: number } | null>((best, e) => {
    const dmg = maxDamage(e.card.attacks);
    if (!best || dmg > best.dmg) return { entry: e, dmg };
    return best;
  }, null);

  const pokQty = pokemon.reduce((s, e) => s + e.quantity, 0);
  const trnQty = entries
    .filter((e) => e.card.supertype === 'TRAINER')
    .reduce((s, e) => s + e.quantity, 0);
  const enrQty = entries
    .filter((e) => e.card.supertype === 'ENERGY')
    .reduce((s, e) => s + e.quantity, 0);
  const mainQty = pokemon.filter(isMainPokemon).reduce((s, e) => s + e.quantity, 0);
  const suppQty = pokemon.filter((e) => !isMainPokemon(e)).reduce((s, e) => s + e.quantity, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Total breakdown */}
      <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-600 text-center">
        <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-1">構成</div>
        <div className="flex justify-center gap-2 flex-wrap">
          <div>
            <div className="text-emerald-400 font-bold text-lg leading-tight">{pokQty}</div>
            <div className="text-slate-500 text-[9px]">寶可夢</div>
          </div>
          <div className="text-slate-600 self-center text-xs">·</div>
          <div>
            <div className="text-blue-400 font-bold text-lg leading-tight">{trnQty}</div>
            <div className="text-slate-500 text-[9px]">訓練家</div>
          </div>
          <div className="text-slate-600 self-center text-xs">·</div>
          <div>
            <div className="text-orange-400 font-bold text-lg leading-tight">{enrQty}</div>
            <div className="text-slate-500 text-[9px]">能量</div>
          </div>
        </div>
      </div>

      {/* Highest HP */}
      <div className="bg-slate-800/60 rounded-lg p-3 border border-red-900/40 text-center">
        <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-1">最高 HP</div>
        {highestHp ? (
          <>
            <div className="text-red-400 font-bold text-xl">{highestHp.card.hp}</div>
            <div className="text-slate-300 text-[10px] truncate mt-0.5">{highestHp.card.name}</div>
          </>
        ) : (
          <div className="text-slate-500 text-sm">—</div>
        )}
      </div>

      {/* Highest Damage */}
      <div className="bg-slate-800/60 rounded-lg p-3 border border-orange-900/40 text-center">
        <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-1">最高傷害</div>
        {highestDmg && highestDmg.dmg > 0 ? (
          <>
            <div className="text-orange-400 font-bold text-xl">{highestDmg.dmg}</div>
            <div className="text-slate-300 text-[10px] truncate mt-0.5">{highestDmg.entry.card.name}</div>
          </>
        ) : (
          <div className="text-slate-500 text-sm">—</div>
        )}
      </div>

      {/* Main vs Support Pokémon */}
      <div className="bg-slate-800/60 rounded-lg p-3 border border-emerald-900/40 text-center">
        <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-1">主力 / 輔助</div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-emerald-400 font-bold text-xl">{mainQty}</span>
          <span className="text-slate-600 text-sm">/</span>
          <span className="text-teal-400 font-bold text-xl">{suppQty}</span>
        </div>
        <div className="text-slate-500 text-[9px] mt-0.5">Main / Support</div>
      </div>
    </div>
  );
}

/* ─── Card Detail Modal ──────────────────────────────────────────── */

export function CardDetailModal({
  entry,
  onClose,
}: {
  entry: DeckCardEntry;
  onClose: () => void;
}) {
  const { card } = entry;
  const topDmg = maxDamage(card.attacks);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex-1 min-w-0 pr-2">
            <h2 className="text-white font-bold text-base leading-tight">{card.name}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {(card.hp ?? 0) > 0 && (
                <span className="text-red-400 text-xs font-bold">HP {card.hp}</span>
              )}
              {topDmg > 0 && (
                <span className="text-orange-400 text-xs font-bold">⚔ {topDmg}</span>
              )}
              {card.rarity && (
                <span className="text-slate-400 text-[10px]">{card.rarity.replace(/_/g, ' ')}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex gap-4 p-4">
          {/* Card image */}
          <div className="relative w-32 flex-shrink-0 rounded-lg overflow-hidden bg-slate-700"
            style={{ aspectRatio: '2.5 / 3.5' }}>
            {card.imageUrl ? (
              <Image
                src={card.imageUrl}
                alt={card.name}
                fill
                sizes="128px"
                className="object-contain"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs text-center px-2">
                {card.name}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Attacks */}
            {card.attacks && card.attacks.length > 0 && (
              <div>
                <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-1.5">Attacks</div>
                {card.attacks.map((atk, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-white text-xs font-semibold truncate">{atk.name}</span>
                      {atk.damage && (
                        <span className="text-orange-400 text-xs font-bold flex-shrink-0">{atk.damage}</span>
                      )}
                    </div>
                    {atk.text && (
                      <p className="text-slate-400 text-[10px] leading-tight mt-0.5 line-clamp-3">
                        {atk.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Meta */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              {card.evolutionStage && (
                <>
                  <span className="text-slate-500">Stage</span>
                  <span className="text-slate-200">{card.evolutionStage}</span>
                </>
              )}
              {card.types && card.types.length > 0 && (
                <>
                  <span className="text-slate-500">Type</span>
                  <span className="text-slate-200">{card.types.join(', ')}</span>
                </>
              )}
              <span className="text-slate-500">量</span>
              <span className="text-slate-200">×{entry.quantity}</span>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-700">
              <Link
                href={`/cards/${card.supertype === 'POKEMON' ? (card.canonicalWebCardId ?? card.webCardId) : card.webCardId}`}
                target="_blank"
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                查看完整卡牌資料
              </Link>
              <span className="text-slate-600 font-mono text-[10px]">{card.webCardId}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Copy Deck Modal ────────────────────────────────────────────── */

export function CopyDeckModal({
  deckName,
  entries,
  onClose,
}: {
  deckName: string;
  entries: DeckCardEntry[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState(`${deckName} (Copy)`);
  const [newDeckId, setNewDeckId] = useState<string | null>(null);

  const copyMutation = useMutation({
    mutationFn: async () => {
      const cards = entries.map((e) => ({
        cardId: e.card.webCardId,
        quantity: e.quantity,
      }));
      const res = await apiClient.post('/decks', {
        name: newName.trim() || `${deckName} (Copy)`,
        cards,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setNewDeckId(data.id);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={copyMutation.isPending ? undefined : onClose}
    >
      <div
        className="bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-white font-bold">複製牌組</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {newDeckId ? (
            /* Success state */
            <div className="text-center space-y-3">
              <div className="text-4xl">✅</div>
              <div className="text-white font-semibold">牌組已複製！</div>
              <p className="text-slate-400 text-sm">「{newName}」已加入你的牌組</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition"
                >
                  關閉
                </button>
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/deck-builder?deckId=${newDeckId}&mode=view`);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition"
                >
                  查看我的牌組 →
                </button>
              </div>
            </div>
          ) : (
            /* Input state */
            <>
              <div>
                <label className="block text-slate-300 text-sm mb-1.5">牌組名稱</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
                  placeholder="輸入牌組名稱..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newName.trim()) copyMutation.mutate();
                  }}
                />
              </div>
              <div className="text-slate-400 text-xs">
                共 {entries.reduce((s, e) => s + e.quantity, 0)} 張卡牌
              </div>
              {copyMutation.isError && (
                <div className="text-red-400 text-xs">複製失敗，請稍後再試。</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition"
                >
                  取消
                </button>
                <button
                  onClick={() => copyMutation.mutate()}
                  disabled={copyMutation.isPending || !newName.trim()}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
                >
                  {copyMutation.isPending ? (
                    <>
                      <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                      複製中…
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      複製牌組
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Card Tile ──────────────────────────────────────────────────── */

const ROLE_LABELS: Record<PokemonRole, string> = {
  'pokemon-main': '主力',
  'pokemon-support': '輔助',
  'pokemon-evolution': '進化鏈',
};

export function CardTile({
  entry,
  section,
  onClick,
  onRoleChange,
}: {
  entry: DeckCardEntry;
  section: SectionKey;
  onClick?: (entry: DeckCardEntry) => void;
  onRoleChange?: (webCardId: string, role: PokemonRole) => void;
}) {
  const isPokemon = section === 'pokemon-main' || section === 'pokemon-support' || section === 'pokemon-evolution';
  const dmg = isPokemon ? maxDamage(entry.card.attacks) : 0;
  const colorClass = SECTION_COLORS[section] ?? 'bg-slate-600';

  return (
    <div
      className="relative cursor-pointer group"
      onClick={() => onClick?.(entry)}
    >
      <div className="relative w-full aspect-[2.5/3.5] bg-slate-700 rounded-lg overflow-hidden border border-slate-600 group-hover:border-slate-300 transition-all duration-150 group-hover:shadow-lg group-hover:shadow-black/50">
        {entry.card.imageUrl ? (
          <Image
            src={entry.card.imageUrl}
            alt={entry.card.name}
            fill
            sizes="160px"
            className="object-contain group-hover:scale-105 transition-transform duration-200"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-[10px] text-center px-1 leading-tight">
            {entry.card.name}
          </div>
        )}
        {/* Hover hint overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-150 flex items-end justify-center pb-1">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-black/70 rounded-full px-2 py-0.5 text-white text-[9px] font-semibold">
            詳細
          </span>
        </div>
      </div>

      {/* Quantity badge */}
      <div className={`absolute top-1 right-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md ${colorClass}`}>
        ×{entry.quantity}
      </div>
      {/* HP badge (Pokémon) */}
      {isPokemon && (entry.card.hp ?? 0) > 0 && (
        <div className="absolute top-1 left-1 bg-red-700/90 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow">
          {entry.card.hp}
        </div>
      )}
      {/* Max damage badge (Pokémon) */}
      {dmg > 0 && (
        <div className="absolute bottom-6 right-1 bg-orange-700/90 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow">
          {dmg}
        </div>
      )}
      <p className="text-slate-300 text-[10px] mt-0.5 text-center line-clamp-1 leading-tight group-hover:text-white transition-colors">
        {entry.card.name}
      </p>
      {/* Role override buttons — Pokémon only, shown when wired up */}
      {onRoleChange && isPokemon && (
        <div className="flex gap-0.5 mt-0.5">
          {(['pokemon-main', 'pokemon-support', 'pokemon-evolution'] as PokemonRole[]).map((role) => (
            <button
              key={role}
              onClick={(e) => { e.stopPropagation(); onRoleChange(entry.card.canonicalWebCardId ?? entry.card.webCardId, role); }}
              className={`flex-1 text-[8px] py-0.5 rounded transition-colors ${
                section === role
                  ? 'bg-indigo-500 text-white font-bold'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Deck Section ───────────────────────────────────────────────── */

export function DeckSection({
  section,
  entries,
  onCardClick,
  onRoleChange,
}: {
  section: SectionKey;
  entries: DeckCardEntry[];
  onCardClick?: (entry: DeckCardEntry) => void;
  onRoleChange?: (webCardId: string, role: PokemonRole) => void;
}) {
  if (entries.length === 0) return null;
  const qty = entries.reduce((s, e) => s + e.quantity, 0);
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${SECTION_COLORS[section] ?? 'bg-slate-600'}`}>
          {SECTION_LABELS[section]}
        </span>
        <span className="text-slate-400 text-xs">
          {entries.length} 種 · {qty} 張
        </span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
        {sortSection(entries, section).map((e) => (
          <CardTile key={e.card.webCardId} entry={e} section={section} onClick={onCardClick} onRoleChange={onRoleChange} />
        ))}
      </div>
    </div>
  );
}

/* ─── Paired Pokémon Section (main + evolution in same row) ─────── */

export function PairedPokemonSection({
  sectionA,
  sectionB,
  entriesA,
  entriesB,
  onCardClick,
  onRoleChange,
}: {
  sectionA: SectionKey;
  sectionB: SectionKey;
  entriesA: DeckCardEntry[];
  entriesB: DeckCardEntry[];
  onCardClick?: (entry: DeckCardEntry) => void;
  onRoleChange?: (canonicalKey: string, role: PokemonRole) => void;
}) {
  if (!entriesA.length && !entriesB.length) return null;
  const hasBoth = entriesA.length > 0 && entriesB.length > 0;
  // Narrower cols when side-by-side, full cols when solo
  const colsA = hasBoth
    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2'
    : 'grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2';
  const colsB = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2';

  const renderSide = (section: SectionKey, entries: DeckCardEntry[], cols: string) => {
    if (!entries.length) return null;
    const qty = entries.reduce((s, e) => s + e.quantity, 0);
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${SECTION_COLORS[section] ?? 'bg-slate-600'}`}>
            {SECTION_LABELS[section]}
          </span>
          <span className="text-slate-400 text-xs">{entries.length} 種 · {qty} 張</span>
        </div>
        <div className={cols}>
          {sortSection(entries, section).map((e) => (
            <CardTile key={e.card.webCardId} entry={e} section={section} onClick={onCardClick} onRoleChange={onRoleChange} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mb-6 flex gap-4">
      {renderSide(sectionA, entriesA, colsA)}
      {hasBoth && <div className="w-px bg-slate-700 self-stretch" />}
      {renderSide(sectionB, entriesB, colsB)}
    </div>
  );
}

/* ─── Paired Section ─────────────────────────────────────────────── */

export function PairedSection({
  sectionA,
  sectionB,
  entriesA,
  entriesB,
  onCardClick,
}: {
  sectionA: SectionKey;
  sectionB: SectionKey;
  entriesA: DeckCardEntry[];
  entriesB: DeckCardEntry[];
  onCardClick?: (entry: DeckCardEntry) => void;
}) {
  if (!entriesA.length && !entriesB.length) return null;
  const colsClass = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2';
  return (
    <div className="mb-6 flex gap-4">
      {entriesA.length > 0 && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${SECTION_COLORS[sectionA] ?? 'bg-slate-600'}`}>
              {SECTION_LABELS[sectionA]}
            </span>
            <span className="text-slate-400 text-xs">
              {entriesA.length} 種 · {entriesA.reduce((s, e) => s + e.quantity, 0)} 張
            </span>
          </div>
          <div className={colsClass}>
            {sortSection(entriesA, sectionA).map((e) => (
              <CardTile key={e.card.webCardId} entry={e} section={sectionA} onClick={onCardClick} />
            ))}
          </div>
        </div>
      )}
      {entriesA.length > 0 && entriesB.length > 0 && (
        <div className="w-px bg-slate-700 self-stretch" />
      )}
      {entriesB.length > 0 && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${SECTION_COLORS[sectionB] ?? 'bg-slate-600'}`}>
              {SECTION_LABELS[sectionB]}
            </span>
            <span className="text-slate-400 text-xs">
              {entriesB.length} 種 · {entriesB.reduce((s, e) => s + e.quantity, 0)} 張
            </span>
          </div>
          <div className={colsClass}>
            {sortSection(entriesB, sectionB).map((e) => (
              <CardTile key={e.card.webCardId} entry={e} section={sectionB} onClick={onCardClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
