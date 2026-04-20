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

export interface AbilityData {
  name: string;
  text?: string;
  type?: string;
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
  abilities?: AbilityData[] | null;
  weaknesses?: Array<{ type: string; value: string }> | null;
  resistances?: Array<{ type: string; value: string }> | null;
  retreatCost?: number | null;
  evolutionStage?: string | null;
  /** Resolved canonical webCardId for primary-card-based linking (Pokémon only). */
  canonicalWebCardId?: string | null;
  /** Primary card UUID – preferred key for role storage across language variants. */
  primaryCardId?: string | null;
  /** Chinese (ZH_TW) variant fields resolved by the API */
  zhName?: string | null;
  zhWebCardId?: string | null;
  zhImageUrl?: string | null;
}

export interface DeckCardEntry {
  quantity: number;
  card: DeckCardDetail;
  zhPricing?: { lowest: number; highest: number; currency: string; lastUpdated?: string } | null;
  zhVariantPricing?: { lowestRarity: number; highestRarity: number; currency: string } | null;
  /** Up to 3 price tiers: [cheapest, mid, most expensive] ZH_TW variants */
  zhTiers?: Array<{ variantType: string; rarity: string | null; imageUrl: string | null; price: number; currency: string; inStock: boolean }> | null;
  /** User-saved purchase price (source: USER) — overrides min price display */
  userPrice?: number | null;
}

export type SectionKey =
  | 'pokemon-main'
  | 'pokemon-secondary'
  | 'pokemon-support'
  | 'pokemon-evolution'
  | 'supporter'
  | 'item'
  | 'ace'
  | 'tool'
  | 'stadium'
  | 'basic-energy'
  | 'special-energy';

export type PokemonRole = 'pokemon-main' | 'pokemon-secondary' | 'pokemon-support' | 'pokemon-evolution';

/* ─── Constants ──────────────────────────────────────────────────── */

export const SECTION_ORDER: SectionKey[] = [
  'pokemon-main',
  'pokemon-secondary',
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
  'pokemon-main': '主攻寶可夢',
  'pokemon-secondary': '副攻寶可夢',
  'pokemon-support': '輔助寶可夢',
  'pokemon-evolution': '進化鏈寶可夢',
  supporter: '支援者',
  item: '物品',
  ace: 'ACE SPEC',
  tool: '寶可夢道具',
  stadium: '競技場',
  'basic-energy': '基本能量',
  'special-energy': '特殊能量',
};

export const SECTION_COLORS: Record<SectionKey, string> = {
  'pokemon-main': 'bg-emerald-600',
  'pokemon-secondary': 'bg-lime-600',
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

/** Non-main Pokémon with any ability are treated as support/utility rather than secondary attackers. */
function hasSupportAbility(entry: DeckCardEntry): boolean {
  return !!(entry.card.abilities && entry.card.abilities.length > 0);
}

export function getSectionKey(entry: DeckCardEntry): SectionKey {
  const { supertype, subtypes = [], rarity } = entry.card;
  if (supertype === 'POKEMON') {
    if (isMainPokemon(entry)) return 'pokemon-main';
    if (hasSupportAbility(entry)) return 'pokemon-support';
    return 'pokemon-secondary';
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
    // Primary sort: quantity descending (most copies first = highest usage in this deck)
    const qDiff = b.quantity - a.quantity;
    if (qDiff !== 0) return qDiff;
    // Secondary sort for Pokémon: HP desc → max damage desc
    if (section === 'pokemon-main' || section === 'pokemon-support' || section === 'pokemon-evolution') {
      const hpDiff = (b.card.hp ?? 0) - (a.card.hp ?? 0);
      if (hpDiff !== 0) return hpDiff;
      return maxDamage(b.card.attacks) - maxDamage(a.card.attacks);
    }
    return (a.card.name ?? '').localeCompare(b.card.name ?? '');
  });
}

/* ─── Deck Summary ───────────────────────────────────────────────── */

export function DeckSummary({ entries, pricing, priceBreakdownHref }: { 
  entries: DeckCardEntry[];
  priceBreakdownHref?: string;
  pricing?: {
    currency?: string;
    zh?: { lowestTotal: number; highestTotal: number; budgetTotal: number; premiumTotal: number; currency: string };
    // legacy fields kept for backwards compat
    lowestTotal?: number;
    highestTotal?: number;
  };
}) {
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

      {/* Deck Pricing */}
      {pricing?.zh && (pricing.zh.lowestTotal > 0 || pricing.zh.budgetTotal > 0) && (() => {
        const zh = pricing.zh!;
        // Recalculate budget using user prices where saved, falling back to server value per card.
        // Only recompute if at least one entry has a userPrice set.
        const hasUserPrices = entries.some((e) => e.userPrice != null);
        let low: number;
        if (hasUserPrices) {
          low = entries.reduce((sum, e) => {
            if (!e.zhVariantPricing && !e.zhPricing && !isBasicEnergy(e)) return sum;
            const base = isBasicEnergy(e) ? 1 : (e.zhVariantPricing?.lowestRarity ?? e.zhPricing?.lowest ?? 0);
            return sum + (e.userPrice ?? base) * e.quantity;
          }, 0);
        } else {
          low = zh.budgetTotal || zh.lowestTotal || 0;
        }
        const high = zh.premiumTotal || zh.highestTotal || 0;
        return (
          <div className="bg-slate-800/60 rounded-lg p-3 border border-yellow-900/40 text-center">
            <div className="text-slate-400 text-[10px] uppercase tracking-wide mb-1">港幣價格</div>
            <div className="text-sm font-bold leading-tight">
              <span className={`${hasUserPrices ? 'text-blue-400' : 'text-green-400'}`}>HK${low.toLocaleString()}</span>
              <span className="text-slate-500 mx-1">–</span>
              <span className="text-red-400">HK${high.toLocaleString()}</span>
            </div>
            {priceBreakdownHref && (
              <a href={priceBreakdownHref} className="text-blue-400 text-[9px] underline inline-flex items-center gap-0.5 mt-1 hover:text-blue-300 transition-colors">
                詳細價格 <ExternalLink size={8} />
              </a>
            )}
          </div>
        );
      })()}

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

/* ─── Effects Summary ───────────────────────────────────────────────── */

export function EffectsSummary({ entries }: { entries: DeckCardEntry[] }) {
  const pokemonCards = entries.filter(e => e.card.supertype === 'POKEMON' && e.card.abilities);

  // Extract and count abilities
  const abilityCounts = new Map<string, number>();
  const abilityCards = new Map<string, string[]>(); // ability -> [card names]

  for (const entry of pokemonCards) {
    if (entry.card.abilities) {
      for (const ability of entry.card.abilities) {
        const abilityName = ability.name;
        abilityCounts.set(abilityName, (abilityCounts.get(abilityName) || 0) + entry.quantity);
        
        if (!abilityCards.has(abilityName)) {
          abilityCards.set(abilityName, []);
        }
        abilityCards.get(abilityName)!.push(entry.card.zhName ?? entry.card.name);
      }
    }
  }

  // Sort by frequency
  const sortedAbilities = Array.from(abilityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8); // Top 8 abilities

  if (sortedAbilities.length === 0) {
    return (
      <div className="text-slate-400 text-sm text-center py-4">
        沒有特殊能力
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {sortedAbilities.map(([abilityName, count]) => (
        <div key={abilityName} className="bg-slate-800/60 rounded-lg p-3 border border-slate-600">
          <div className="text-purple-400 font-bold text-sm mb-1">{abilityName}</div>
          <div className="text-slate-300 text-xs mb-2">{count} 張卡牌</div>
          <div className="text-slate-400 text-[10px] leading-tight">
            {abilityCards.get(abilityName)?.slice(0, 2).join(', ')}
            {abilityCards.get(abilityName) && abilityCards.get(abilityName)!.length > 2 && '...'}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Weakness Summary ─────────────────────────────────────────── */

const WEAKNESS_TYPE_CONFIG: Record<string, { label: string; emoji: string; bgColor: string; textColor: string }> = {
  FIRE:      { label: '火',   emoji: '🔥', bgColor: 'bg-red-500',    textColor: 'text-red-400' },
  WATER:     { label: '水',   emoji: '💧', bgColor: 'bg-blue-500',   textColor: 'text-blue-400' },
  LIGHTNING: { label: '雷',   emoji: '⚡', bgColor: 'bg-yellow-400', textColor: 'text-yellow-400' },
  GRASS:     { label: '草',   emoji: '🌿', bgColor: 'bg-green-500',  textColor: 'text-green-400' },
  FIGHTING:  { label: '格鬥', emoji: '👊', bgColor: 'bg-orange-600', textColor: 'text-orange-400' },
  PSYCHIC:   { label: '超能', emoji: '🔮', bgColor: 'bg-purple-500', textColor: 'text-purple-400' },
  DARKNESS:  { label: '惡',   emoji: '🌑', bgColor: 'bg-gray-600',   textColor: 'text-gray-400' },
  METAL:     { label: '鋼',   emoji: '⚙️', bgColor: 'bg-gray-500',   textColor: 'text-gray-400' },
  DRAGON:    { label: '龍',   emoji: '🐉', bgColor: 'bg-purple-600', textColor: 'text-purple-400' },
  FAIRY:     { label: '妖精', emoji: '✨', bgColor: 'bg-pink-400',   textColor: 'text-pink-400' },
  COLORLESS: { label: '無色', emoji: '⬜', bgColor: 'bg-gray-400',   textColor: 'text-gray-400' },
};

export function WeaknessSummary({ entries }: { entries: DeckCardEntry[] }) {
  const pokemonEntries = entries.filter(e => e.card.supertype === 'POKEMON');
  const totalPokemon = pokemonEntries.length;

  if (totalPokemon === 0) {
    return <div className="text-slate-400 text-sm text-center py-4">無弱點資料</div>;
  }

  const weaknessCounts = new Map<string, { value: string; count: number }>();
  let noWeaknessCount = 0;

  for (const entry of pokemonEntries) {
    const ws = entry.card.weaknesses;
    if (!ws || !Array.isArray(ws) || ws.length === 0) {
      noWeaknessCount += 1;
      continue;
    }
    for (const w of ws) {
      if (!w?.type) continue;
      const existing = weaknessCounts.get(w.type);
      if (existing) {
        existing.count += 1;
      } else {
        weaknessCounts.set(w.type, { value: w.value, count: 1 });
      }
    }
  }

  const sorted = Array.from(weaknessCounts.entries()).sort((a, b) => b[1].count - a[1].count);
  const maxCount = Math.max(sorted[0]?.[1].count ?? 0, noWeaknessCount, 1);

  if (sorted.length === 0 && noWeaknessCount === 0) {
    return <div className="text-slate-400 text-sm text-center py-4">無弱點資料</div>;
  }

  return (
    <div className="space-y-2">
      {sorted.map(([type, { value, count }]) => {
        const cfg = WEAKNESS_TYPE_CONFIG[type] ?? { label: type, emoji: '?', bgColor: 'bg-slate-500', textColor: 'text-slate-400' };
        const pct = Math.round((count / totalPokemon) * 100);
        const barPct = Math.round((count / maxCount) * 100);
        return (
          <div key={type} className="flex items-center gap-2">
            <div className={`w-14 text-right text-xs font-medium ${cfg.textColor} shrink-0`}>
              {cfg.emoji} {cfg.label}
            </div>
            <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div className={`h-full ${cfg.bgColor} rounded-full transition-all`} style={{ width: `${barPct}%` }} />
            </div>
            <div className="text-slate-300 text-xs w-24 text-right shrink-0">
              {count}/{totalPokemon} 種 ({pct}%)
            </div>
          </div>
        );
      })}

      {noWeaknessCount > 0 && (
        <>
          {sorted.length > 0 && <div className="border-t border-dashed border-slate-600 my-1" />}
          <div className="flex items-center gap-2">
            <div className="w-14 text-right text-xs font-medium text-purple-400 shrink-0">
              🐉 龍
            </div>
            <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-purple-600 rounded-full transition-all"
                style={{ width: `${Math.round((noWeaknessCount / maxCount) * 100)}%` }}
              />
            </div>
            <div className="text-slate-300 text-xs w-24 text-right shrink-0">
              {noWeaknessCount}/{totalPokemon} 種 無弱點
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Deck Price Breakdown Table ────────────────────────────────── */

const RARITY_SHORT: Record<string, string> = {
  COMMON: 'C', UNCOMMON: 'U', RARE: 'R', DOUBLE_RARE: 'RR',
  ULTRA_RARE: 'SR', ILLUSTRATION_RARE: 'AR', SPECIAL_ILLUSTRATION_RARE: 'SAR',
  HYPER_RARE: 'UR', PROMO: 'P', ACE_SPEC: 'ACE', AMAZING_RARE: 'AR',
  SHINY_RARE: 'SHR',
};

// Type order for price breakdown: Pokemon first, then Trainer, then Energy
const TYPE_ORDER: Record<string, number> = { POKEMON: 0, TRAINER: 1, ENERGY: 2 };

function isBasicEnergy(entry: DeckCardEntry): boolean {
  const card = entry.card;
  if (card.supertype !== 'ENERGY') return false;
  if (card.subtypes?.some((s) => s === 'BASIC_ENERGY' || s === 'BASIC')) return true;
  const name = card.zhName ?? card.name ?? '';
  return /基本/.test(name);
}

export function DeckPriceBreakdown({ entries }: { entries: DeckCardEntry[] }) {
  const [priceOverrides, setPriceOverrides] = useState<Map<string, number>>(
    () => new Map(entries.filter((e) => e.userPrice != null).map((e) => [e.card.webCardId, e.userPrice!]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);

  const allRows = entries.filter((e) => e.zhPricing || e.zhVariantPricing || e.zhTiers?.length || isBasicEnergy(e) || !!e.card.zhWebCardId);

  if (allRows.length === 0) {
    return <div className="text-slate-400 text-sm text-center py-6">無定價資料</div>;
  }

  const sorted = [...allRows].sort((a, b) => {
    const typeA = TYPE_ORDER[a.card.supertype ?? ''] ?? 3;
    const typeB = TYPE_ORDER[b.card.supertype ?? ''] ?? 3;
    if (typeA !== typeB) return typeA - typeB;
    const aMax = a.zhVariantPricing?.highestRarity ?? a.zhPricing?.highest ?? 0;
    const bMax = b.zhVariantPricing?.highestRarity ?? b.zhPricing?.highest ?? 0;
    return bMax - aMax;
  });

  const getMinPrice = (e: DeckCardEntry): number => {
    const override = priceOverrides.get(e.card.webCardId);
    if (override !== undefined) return override;
    if (isBasicEnergy(e)) return 1;
    return e.zhVariantPricing?.lowestRarity ?? e.zhPricing?.lowest ?? 0;
  };

  const budgetTotal = allRows.reduce((s, e) => s + getMinPrice(e) * e.quantity, 0);
  const premiumTotal = allRows.reduce((s, e) => {
    const max = isBasicEnergy(e) ? 1 : (e.zhVariantPricing?.highestRarity ?? e.zhPricing?.highest ?? 0);
    return s + max * e.quantity;
  }, 0);

  const handleSavePrices = async () => {
    if (priceOverrides.size === 0) return;
    setIsSaving(true);
    setSaveResult(null);

    // Build a lookup: JP webCardId → DeckCardEntry
    const entryMap = new Map(sorted.map((e) => [e.card.webCardId, e]));

    const requests = Array.from(priceOverrides.entries()).map(([jpWebCardId, price]) => {
      const entry = entryMap.get(jpWebCardId);
      const zhWebCardId = entry?.card.zhWebCardId;
      if (!zhWebCardId) return null;
      return apiClient.post('/prices', {
        webCardId: zhWebCardId,
        source: 'USER',
        price,
        currency: 'HKD',
      });
    }).filter(Boolean);

    if (requests.length === 0) {
      setIsSaving(false);
      setSaveResult({ ok: false, message: '找不到對應的中文卡牌 ID' });
      return;
    }

    try {
      await Promise.all(requests);
      setSaveResult({ ok: true, message: `已儲存 ${requests.length} 張卡牌的買價` });
    } catch {
      setSaveResult({ ok: false, message: '儲存失敗，請稍後再試' });
    } finally {
      setIsSaving(false);
    }
  };

  const TIER_LABELS = ['普通', '稀有', 'SR'];
  const TIER_COLORS = ['text-slate-300', 'text-blue-300', 'text-yellow-300'];

  const maxTiers = allRows.reduce((m, e) => {
    if (isBasicEnergy(e)) return Math.max(m, 1);
    return Math.max(m, e.zhTiers?.length ?? (e.zhPricing || e.zhVariantPricing ? 1 : 0));
  }, 0);
  const tierCols = Math.min(Math.max(maxTiers, 1), 3);

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="grid items-center gap-3 pb-2 border-b border-slate-700 text-slate-400 text-xs font-medium"
        style={{ gridTemplateColumns: `1fr repeat(${tierCols}, minmax(80px,1fr)) 80px 48px 80px` }}
      >
        <div>卡牌</div>
        {Array.from({ length: tierCols }, (_, i) => (
          <div key={i} className="text-center">{TIER_LABELS[i] ?? `版本${i + 1}`}</div>
        ))}
        <div className="text-center">我的買價</div>
        <div className="text-center">數量</div>
        <div className="text-right">小計</div>
      </div>

      {/* Card rows */}
      {sorted.map((entry) => {
        const { card, quantity, zhTiers, zhPricing, zhVariantPricing } = entry;
        const basic = isBasicEnergy(entry);
        const mainImg = card.zhImageUrl ?? card.imageUrl;
        const cardLink = `/cards/${card.supertype === 'POKEMON' ? (card.canonicalWebCardId ?? card.webCardId) : card.webCardId}`;
        const override = priceOverrides.get(card.webCardId);
        const minP = getMinPrice(entry);
        const maxP = basic ? 1 : (zhVariantPricing?.highestRarity ?? zhPricing?.highest ?? 0);
        const subtotalMin = minP * quantity;
        const subtotalMax = maxP * quantity;

        // Build tiers, deduplicating by price
        let rawTiers: Array<{ imageUrl: string | null; rarity: string | null; price: number; inStock: boolean }>;
        if (basic) {
          rawTiers = [{ imageUrl: mainImg ?? null, rarity: null, price: 1, inStock: true }];
        } else if (zhTiers && zhTiers.length > 0) {
          rawTiers = zhTiers.slice(0, 3).map((t) => ({ imageUrl: t.imageUrl, rarity: t.rarity, price: t.price, inStock: t.inStock }));
        } else {
          const lo = zhVariantPricing?.lowestRarity ?? zhPricing?.lowest ?? 0;
          const hi = zhVariantPricing?.highestRarity ?? zhPricing?.highest ?? lo;
          if (lo === 0 && hi === 0) {
            rawTiers = []; // No price data — tier cells will show —
          } else if (lo === hi) {
            rawTiers = [{ imageUrl: mainImg ?? null, rarity: card.rarity ?? null, price: lo, inStock: true }];
          } else {
            rawTiers = [{ imageUrl: mainImg ?? null, rarity: card.rarity ?? null, price: lo, inStock: true }, { imageUrl: null, rarity: null, price: hi, inStock: true }];
          }
        }
        // Deduplicate consecutive tiers with same price
        const tiers = rawTiers.filter((t, i) => i === 0 || t.price !== rawTiers[i - 1].price);

        return (
          <div
            key={card.webCardId}
            className="grid items-center gap-3 py-3 border-b border-slate-800/70 hover:bg-slate-800/20 transition-colors rounded-lg px-1"
            style={{ gridTemplateColumns: `1fr repeat(${tierCols}, minmax(80px,1fr)) 80px 48px 80px` }}
          >
            {/* Card identity */}
            <div className="flex items-center gap-3 min-w-0">
              <Link href={cardLink} target="_blank" className="relative flex-shrink-0 rounded-lg overflow-hidden bg-slate-700 shadow-md hover:ring-2 hover:ring-blue-400 transition-all"
                style={{ width: 56, height: 78 }}>
                {mainImg ? (
                  <Image src={mainImg} alt={card.zhName ?? card.name} fill sizes="56px" className="object-contain" unoptimized />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-[9px] text-center px-1 leading-tight">
                    {card.zhName ?? card.name}
                  </div>
                )}
              </Link>
              <div className="min-w-0">
                <Link href={cardLink} target="_blank" className="group flex items-center gap-1 hover:underline">
                  <span className="text-white text-sm font-semibold truncate">{card.zhName ?? card.name}</span>
                  <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
                </Link>
                {card.zhName && card.zhName !== card.name && (
                  <div className="text-slate-500 text-[10px] truncate">{card.name}</div>
                )}
                {card.supertype && (
                  <div className="text-slate-600 text-[10px] mt-0.5">{card.supertype}</div>
                )}
              </div>
            </div>

            {/* Price tiers — deduplicated */}
            {Array.from({ length: tierCols }, (_, i) => {
              const tier = tiers[i];
              if (!tier) return <div key={i} className="text-center text-slate-700 text-xs">—</div>;
              const rarityLabel = tier.rarity ? (RARITY_SHORT[tier.rarity] ?? tier.rarity.replace(/_/g, ' ')) : null;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="relative rounded overflow-hidden bg-slate-800 shadow" style={{ width: 48, height: 67 }}>
                    {tier.imageUrl ? (
                      <Image src={tier.imageUrl} alt={rarityLabel ?? ''} fill sizes="48px" className="object-contain" unoptimized />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-[9px]">
                        {rarityLabel ?? '?'}
                      </div>
                    )}
                  </div>
                  {rarityLabel && (
                    <div className={`text-[10px] font-medium ${TIER_COLORS[i] ?? 'text-slate-400'}`}>{rarityLabel}</div>
                  )}
                  <div className={`text-xs font-bold ${tier.inStock === false ? 'text-slate-500 line-through' : (TIER_COLORS[i] ?? 'text-slate-300')}`}>
                    ${tier.price.toLocaleString()}
                  </div>
                  {tier.inStock === false && (
                    <div className="text-[9px] text-orange-400 font-medium">無貨</div>
                  )}
                </div>
              );
            })}

            {/* Min price override input */}
            <div className="flex flex-col items-center gap-1">
              <input
                type="number"
                min={0}
                value={override ?? ''}
                placeholder={`${isBasicEnergy(entry) ? 1 : (zhVariantPricing?.lowestRarity ?? zhPricing?.lowest ?? 0)}`}
                onChange={(e) => {
                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                  setPriceOverrides((prev) => {
                    const next = new Map(prev);
                    if (val === undefined) next.delete(card.webCardId);
                    else next.set(card.webCardId, val);
                    return next;
                  });
                }}
                className="w-16 bg-slate-700 border border-slate-600 rounded px-1.5 py-1 text-xs text-center text-white focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
              />
              {override !== undefined && (
                <button
                  onClick={() => setPriceOverrides((prev) => { const next = new Map(prev); next.delete(card.webCardId); return next; })}
                  className="text-slate-500 hover:text-red-400 text-[9px] transition-colors"
                >
                  重置
                </button>
              )}
            </div>

            {/* Quantity */}
            <div className="text-center text-slate-300 text-sm font-medium">×{quantity}</div>

            {/* Subtotal */}
            <div className="text-right">
              {minP === 0 && override === undefined && !basic ? (
                <div className="text-slate-600 text-sm">—</div>
              ) : (
                <>
                  <div className={`text-sm font-bold whitespace-nowrap ${override !== undefined ? 'text-blue-400' : 'text-green-400'}`}>
                    ${subtotalMin.toLocaleString()}
                  </div>
                  {subtotalMax > subtotalMin && override === undefined && (
                    <div className="text-red-400 text-[11px] whitespace-nowrap">${subtotalMax.toLocaleString()}</div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Totals */}
      <div className="grid items-center gap-3 pt-3 border-t-2 border-slate-600"
        style={{ gridTemplateColumns: `1fr repeat(${tierCols}, minmax(80px,1fr)) 80px 48px 80px` }}
      >
        <div className="text-slate-400 text-sm font-semibold">總計</div>
        {Array.from({ length: tierCols + 1 }, (_, i) => <div key={i} />)}
        <div className="text-center text-slate-300 text-sm">×{allRows.reduce((s, e) => s + e.quantity, 0)}</div>
        <div className="text-right">
          <div className="text-green-400 text-base font-bold whitespace-nowrap">HK${budgetTotal.toLocaleString()}</div>
          {premiumTotal > budgetTotal && priceOverrides.size === 0 && (
            <div className="text-red-400 text-sm font-bold whitespace-nowrap">HK${premiumTotal.toLocaleString()}</div>
          )}
        </div>
      </div>

      {/* Save user prices */}
      {priceOverrides.size > 0 && (
        <div className="flex items-center justify-end gap-3 pt-2">
          {saveResult && (
            <span className={`text-xs ${saveResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {saveResult.message}
            </span>
          )}
          <button
            onClick={handleSavePrices}
            disabled={isSaving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-sm font-medium transition-colors"
          >
            {isSaving ? '儲存中...' : `儲存買價 (${priceOverrides.size})`}
          </button>
        </div>
      )}
      {saveResult?.ok && priceOverrides.size === 0 && (
        <div className="text-green-400 text-xs text-right pt-1">{saveResult.message}</div>
      )}
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
  'pokemon-main': '主攻',
  'pokemon-secondary': '副攻',
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
  const isPokemon = section === 'pokemon-main' || section === 'pokemon-secondary' || section === 'pokemon-support' || section === 'pokemon-evolution';
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
          {(['pokemon-main', 'pokemon-secondary', 'pokemon-support', 'pokemon-evolution'] as PokemonRole[]).map((role) => (
            <button
              key={role}
              onClick={(e) => { e.stopPropagation(); onRoleChange(entry.card.primaryCardId ?? entry.card.canonicalWebCardId ?? entry.card.webCardId, role); }}
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
