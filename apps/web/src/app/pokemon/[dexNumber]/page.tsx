'use client';

import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ImageIcon } from 'lucide-react';
import apiClient from '@/lib/api-client';
import Link from 'next/link';
import { type SpeciesSummary } from '../page';

interface CardItem {
  id: string;
  webCardId: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  types: string[] | null;
  hp: number | null;
  language: string;
  variantType: string;
  evolutionStage: string | null;
  primaryCard?: {
    cardNumber?: string | null;
    primaryExpansion?: { code: string; nameEn: string; releaseDate?: string | null } | null;
  };
  regionalExpansion?: {
    code: string;
    name: string;
    region: string;
    primaryExpansion?: { code: string; nameEn: string; releaseDate?: string | null };
  } | null;
}

interface ExcludedNamesByLang {
  zh: string[];
  en: string[];
  ja: string[];
}

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'bg-gray-500',
  UNCOMMON: 'bg-green-500',
  RARE: 'bg-blue-500',
  DOUBLE_RARE: 'bg-purple-500',
  ULTRA_RARE: 'bg-purple-700',
  ILLUSTRATION_RARE: 'bg-amber-500',
  SPECIAL_ILLUSTRATION_RARE: 'bg-pink-500',
  HYPER_RARE: 'bg-red-500',
  ACE_SPEC_RARE: 'bg-orange-500',
  PROMO: 'bg-sky-500',
};

const RARITY_SHORT: Record<string, string> = {
  COMMON: 'C',
  UNCOMMON: 'U',
  RARE: 'R',
  DOUBLE_RARE: 'RR',
  ULTRA_RARE: 'UR',
  ILLUSTRATION_RARE: 'IR',
  SPECIAL_ILLUSTRATION_RARE: 'SAR',
  HYPER_RARE: 'HR',
  ACE_SPEC_RARE: 'ACE',
  PROMO: 'P',
  SHINY_RARE: 'SR',
};

const LANG_FLAG: Record<string, string> = {
  JA_JP: '🇯🇵',
  ZH_HK: '🇭🇰',
  EN_US: '🇺🇸',
  ZH_TW: '🇹🇼',
};

const LANG_ORDER: Record<string, number> = { ZH_TW: 0, EN_US: 1, JA_JP: 2, ZH_HK: 3 };

const TYPE_COLORS: Record<string, string> = {
  COLORLESS: 'bg-gray-300 text-gray-700',
  DARKNESS: 'bg-gray-800 text-white',
  DRAGON: 'bg-purple-600 text-white',
  FAIRY: 'bg-pink-400 text-white',
  FIGHTING: 'bg-orange-600 text-white',
  FIRE: 'bg-red-500 text-white',
  GRASS: 'bg-green-500 text-white',
  LIGHTNING: 'bg-yellow-400 text-gray-900',
  METAL: 'bg-gray-500 text-white',
  PSYCHIC: 'bg-purple-500 text-white',
  WATER: 'bg-blue-500 text-white',
};

const TYPE_LABEL: Record<string, string> = {
  GRASS:     '草',
  FIRE:      '火',
  WATER:     '水',
  LIGHTNING: '雷',
  PSYCHIC:   '超能力',
  FIGHTING:  '格鬥',
  DARKNESS:  '惡',
  METAL:     '鋼',
  DRAGON:    '龍',
  COLORLESS: '無色',
  FAIRY:     '妖精',
};

const TYPE_ORDER = [
  'GRASS','FIRE','WATER','LIGHTNING','PSYCHIC',
  'FIGHTING','DARKNESS','METAL','DRAGON','COLORLESS','FAIRY',
];

const STAGE_LABEL: Record<string, { label: string; color: string }> = {
  BASIC:    { label: 'たね',    color: 'bg-green-100 text-green-700 border-green-300' },
  STAGE_1:  { label: '1進化',  color: 'bg-blue-100 text-blue-700 border-blue-300' },
  STAGE_2:  { label: '2進化',  color: 'bg-purple-100 text-purple-700 border-purple-300' },
  STAGE_3:  { label: '3進化',  color: 'bg-red-100 text-red-700 border-red-300' },
  BABY:     { label: 'よちよち', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  RESTORED: { label: '化石',   color: 'bg-amber-100 text-amber-700 border-amber-300' },
};

// Build the chain starting from the root species through evolvesFrom links
function buildChainFor(target: SpeciesSummary, all: SpeciesSummary[]): SpeciesSummary[] {
  // Build lookups by all name fields so evolvesFrom works regardless of stored language
  const byJaName  = new Map(all.map((s) => [s.nameJa,      s]));
  const byZhHant  = new Map(all.map((s) => [s.nameZhHant,  s]));
  const byZhHans  = new Map(all.map((s) => [s.nameZhHans,  s]));
  const byEnName  = new Map(all.map((s) => [s.nameEn,      s]));
  const byId      = new Map(all.map((s) => [s.id,          s]));

  const resolve = (name: string | null): SpeciesSummary | undefined => {
    if (!name) return undefined;
    return byJaName.get(name) ?? byZhHant.get(name) ?? byZhHans.get(name) ?? byEnName.get(name);
  };

  // walk up to root
  const chain: SpeciesSummary[] = [];
  const visited = new Set<string>();
  let cur: SpeciesSummary | undefined = target;
  while (cur && !visited.has(cur.id)) {
    chain.unshift(cur);
    visited.add(cur.id);
    cur = cur.evolvesFrom ? resolve(cur.evolvesFrom) : undefined;
  }
  // walk down from target (children whose evolvesFrom resolves back to this species)
  const addChildren = (parent: SpeciesSummary) => {
    const children = all.filter((s) => {
      if (!s.evolvesFrom || visited.has(s.id)) return false;
      const pre = resolve(s.evolvesFrom);
      return pre?.id === parent.id;
    });
    for (const child of children) {
      visited.add(child.id);
      chain.push(child);
      addChildren(child);
    }
  };
  addChildren(target);
  return chain;
}

/** Mini chain thumbnail shown in the header */
function ChainThumb({
  s,
  isCurrent,
}: {
  s: SpeciesSummary;
  isCurrent: boolean;
}) {
  const stageInfo = s.evolutionStage ? STAGE_LABEL[s.evolutionStage] : null;
  return (
    <Link
      href={`/pokemon/${s.dexNumber}${s.form ? `?form=${encodeURIComponent(s.form)}` : ''}`}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
        isCurrent
          ? 'ring-2 ring-blue-500 bg-blue-50'
          : 'hover:bg-gray-100'
      }`}
    >
      <div className="w-16 h-20 bg-gray-100 rounded overflow-hidden flex-shrink-0">
        {s.latestZhImage ? (
          <img src={s.latestZhImage} alt={s.nameZhHant} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 gap-0.5">
            <span className="text-xl opacity-25">⚪</span>
            <span className="text-[8px] font-mono text-gray-400">#{s.dexNumber}</span>
          </div>
        )}
      </div>
      <span className="text-[10px] font-medium text-gray-700 text-center leading-tight">
        {s.nameZhHant}
      </span>
      {stageInfo && (
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${stageInfo.color}`}>
          {stageInfo.label}
        </span>
      )}
    </Link>
  );
}

export default function PokemonDetailPage({
  params,
}: {
  params: Promise<{ dexNumber: string }>;
}) {
  const { dexNumber } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = searchParams.get('form');

  // Use species-summary (shared cache with list page)
  const { data: speciesList } = useQuery<SpeciesSummary[]>({
    queryKey: ['pokemon-species-summary'],
    queryFn: async () => {
      const res = await apiClient.get('/cards/species-summary');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const species = useMemo(() => {
    if (!speciesList) return null;
    return (
      speciesList.find(
        (p) => p.dexNumber === dexNumber && (form ? p.form === form : !p.form)
      ) ?? speciesList.find((p) => p.dexNumber === dexNumber) ?? null
    );
  }, [speciesList, dexNumber, form]);

  // Build evolution chain from species-summary data
  const evolutionChain = useMemo(() => {
    if (!species || !speciesList) return [];
    return buildChainFor(species, speciesList);
  }, [species, speciesList]);

  // Search by ZH name (primary)
  const searchName = species?.nameZhHant || '';
  const excludedNamesByLang = useMemo<ExcludedNamesByLang>(() => {
    if (!species || !speciesList) return { zh: [], en: [], ja: [] };

    const buildSimilarNames = (targetNames: string[], candidateNames: string[]) => {
      const targetSet = new Set(targetNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
      const result = new Set<string>();

      for (const candidate of candidateNames) {
        const candidateTrimmed = candidate.trim();
        const candidateLower = candidateTrimmed.toLowerCase();
        if (!candidateTrimmed || targetSet.has(candidateLower)) continue;

        if (targetNames.some((target) => target && candidateTrimmed.includes(target))) {
          result.add(candidateTrimmed);
        }
      }

      return Array.from(result);
    };

    const targetZh = [species.nameZhHant, species.nameZhHans].filter(Boolean);
    const targetEn = [species.nameEn].filter(Boolean);
    const targetJa = [species.nameJa].filter(Boolean);

    return {
      zh: buildSimilarNames(targetZh, speciesList.map((s) => s.nameZhHant).concat(speciesList.map((s) => s.nameZhHans))),
      en: buildSimilarNames(targetEn, speciesList.map((s) => s.nameEn)),
      ja: buildSimilarNames(targetJa, speciesList.map((s) => s.nameJa)),
    };
  }, [species, speciesList]);

  const { data: zhCardsData, isLoading: zhLoading } = useQuery({
    queryKey: ['pokemon-cards-zh', dexNumber, searchName, excludedNamesByLang.zh.join('|')],
    queryFn: async () => {
      if (!searchName) return { data: [] };
      const p = new URLSearchParams({
        name: searchName,
        supertype: 'POKEMON',
        take: '100',
        skip: '0',
        sortBy: 'webCardId',
        sortOrder: 'desc',
      });
      if (excludedNamesByLang.zh.length > 0) {
        p.set('excludeNames', excludedNamesByLang.zh.join(','));
      }
      const res = await apiClient.get(`/cards?${p}`);
      return res.data;
    },
    enabled: !!searchName,
  });

  // Also search EN name for EN_US cards
  const { data: enCardsData } = useQuery({
    queryKey: ['pokemon-cards-en', dexNumber, species?.nameEn, excludedNamesByLang.en.join('|')],
    queryFn: async () => {
      if (!species?.nameEn || species.nameEn === searchName) return { data: [] };
      const p = new URLSearchParams({
        name: species.nameEn,
        supertype: 'POKEMON',
        take: '100',
        skip: '0',
        language: 'EN_US',
        sortBy: 'webCardId',
        sortOrder: 'desc',
      });
      if (excludedNamesByLang.en.length > 0) {
        p.set('excludeNames', excludedNamesByLang.en.join(','));
      }
      const res = await apiClient.get(`/cards?${p}`);
      return res.data;
    },
    enabled: !!species?.nameEn && species.nameEn !== searchName,
  });

  // Also search JA name for JA_JP cards
  const { data: jaCardsData } = useQuery({
    queryKey: ['pokemon-cards-ja', dexNumber, species?.nameJa, excludedNamesByLang.ja.join('|')],
    queryFn: async () => {
      if (!species?.nameJa || species.nameJa === searchName) return { data: [] };
      const p = new URLSearchParams({
        name: species.nameJa,
        supertype: 'POKEMON',
        take: '100',
        skip: '0',
        language: 'JA_JP',
        sortBy: 'webCardId',
        sortOrder: 'desc',
      });
      if (excludedNamesByLang.ja.length > 0) {
        p.set('excludeNames', excludedNamesByLang.ja.join(','));
      }
      const res = await apiClient.get(`/cards?${p}`);
      return res.data;
    },
    enabled: !!species?.nameJa && species.nameJa !== searchName,
  });

  const isLoading = zhLoading;

  // Deduplicate then sort: language order (ZH→EN→JA), then webCardId desc within each group
  const allCards = useMemo((): CardItem[] => {
    const canonicalNames = species
      ? [species.nameZhHant, species.nameZhHans, species.nameJa, species.nameEn].filter(Boolean)
      : [];
    const excludedNameSet = new Set(
      [
        ...excludedNamesByLang.zh,
        ...excludedNamesByLang.en,
        ...excludedNamesByLang.ja,
      ].map((n) => n.trim().toLowerCase()).filter(Boolean)
    );

    const nameMatches = (cardName: string): boolean => {
      if (canonicalNames.length === 0) return true;
      const normalizedCardName = cardName.trim().toLowerCase();
      if (excludedNameSet.has(normalizedCardName)) return false;

      return canonicalNames.some((n) => {
        if (!n) return false;
        const normalizedTarget = n.trim().toLowerCase();
        if (normalizedCardName === normalizedTarget) return true;
        if (normalizedCardName.endsWith(normalizedTarget)) return true;
        if (normalizedCardName.startsWith(`${normalizedTarget} `)) return true;
        if (normalizedCardName.startsWith(`${normalizedTarget}ex`)) return true;
        return false;
      });
    };

    const seen = new Set<string>();
    const combined: CardItem[] = [
      ...(zhCardsData?.data ?? []),
      ...(enCardsData?.data ?? []),
      ...(jaCardsData?.data ?? []),
    ];
    const deduped = combined.filter((c) => {
      if (seen.has(c.webCardId)) return false;
      seen.add(c.webCardId);
      return nameMatches(c.name);
    });
    return deduped.sort((a, b) => {
      const langDiff = (LANG_ORDER[a.language] ?? 9) - (LANG_ORDER[b.language] ?? 9);
      if (langDiff !== 0) return langDiff;
      return b.webCardId.localeCompare(a.webCardId);
    });
  }, [zhCardsData, enCardsData, jaCardsData, species, excludedNamesByLang]);

  // Group cards by primary type
  const cardsByType = useMemo(() => {
    const groups = new Map<string, CardItem[]>();
    for (const card of allCards) {
      const type = card.types?.[0] ?? 'COLORLESS';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(card);
    }
    // Sort groups by TYPE_ORDER
    return Array.from(groups.entries()).sort(
      ([a], [b]) =>
        (TYPE_ORDER.indexOf(a) === -1 ? 99 : TYPE_ORDER.indexOf(a)) -
        (TYPE_ORDER.indexOf(b) === -1 ? 99 : TYPE_ORDER.indexOf(b)),
    );
  }, [allCards]);

  const handleCardClick = (card: CardItem) => {
    router.push(`/cards/${card.webCardId}`);
  };

  // --- Selected display image (header portrait) ---
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  // Resolve: explicit pick > species thumbnail > first card image
  const headerImage =
    selectedImage ??
    species?.latestZhImage ??
    allCards.find((c) => c.imageUrl)?.imageUrl ??
    null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Back button */}
        <Link
          href="/pokemon"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          返回圖鑑
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
          <div className="flex items-start gap-4">
            {/* Portrait image */}
            <div className="w-24 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 relative group">
              {headerImage ? (
                <img src={headerImage} alt={species?.nameZhHant ?? dexNumber} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                  <span className="text-3xl opacity-20">⚪</span>
                  <span className="font-mono text-xs text-gray-400">#{dexNumber}</span>
                </div>
              )}
              {/* Reset to species default */}
              {selectedImage && (
                <button
                  onClick={() => setSelectedImage(null)}
                  className="absolute bottom-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="重設圖片"
                >
                  <ImageIcon className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {/* Dex number badge */}
              <div className="bg-blue-50 rounded-lg px-3 py-1.5 font-mono text-blue-700 font-bold text-base inline-block mb-2">
                #{dexNumber}
              </div>
              {species ? (
                <>
                  <div className="flex items-center flex-wrap gap-2">
                    <h1 className="text-2xl font-bold text-gray-900">{species.nameZhHant}</h1>
                    {species.evolutionStage && STAGE_LABEL[species.evolutionStage] && (
                      <span className={`text-xs font-bold px-2 py-1 rounded border ${STAGE_LABEL[species.evolutionStage].color}`}>
                        {STAGE_LABEL[species.evolutionStage].label}
                      </span>
                    )}
                  </div>
                  {species.form && (
                    <div className="text-sm text-purple-600 mt-0.5">{species.form}</div>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-sm text-gray-500">
                    <span>{species.nameEn}</span>
                    <span className="text-gray-300">|</span>
                    <span>{species.nameJa}</span>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-400">{species.nameZhHans}</span>
                  </div>
                </>
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">圖鑑 #{dexNumber}</h1>
              )}
              <div className="mt-2 text-sm text-gray-500">
                共 {allCards.length} 張卡牌
                {species && (
                  <span className="ml-3">
                    {species.cardCounts['ZH_TW'] ? `🇹🇼 ${species.cardCounts['ZH_TW']} ` : ''}
                    {species.cardCounts['EN_US'] ? `🇺🇸 ${species.cardCounts['EN_US']} ` : ''}
                    {species.cardCounts['JA_JP'] ? `🇯🇵 ${species.cardCounts['JA_JP']}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Evolution chain */}
        {evolutionChain.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">進化鏈</h2>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {evolutionChain.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
                  {i > 0 && <span className="text-gray-300 text-lg">→</span>}
                  <ChainThumb s={s} isCurrent={s.id === species?.id} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cards grid */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">載入中...</div>
        ) : allCards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">尚無此寶可夢的卡牌資料</p>
            <p className="text-sm mt-1">資料庫中找不到相關卡牌</p>
          </div>
        ) : (
          <div className="space-y-6">
            {cardsByType.map(([type, cards]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${TYPE_COLORS[type] ?? 'bg-gray-300 text-gray-700'}`}>
                    {TYPE_LABEL[type] ?? type}
                  </span>
                  <span className="text-sm text-gray-400">{cards.length} 張</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {cards.map((card) => (
              <div
                key={card.webCardId}
                onClick={() => handleCardClick(card)}
                className="bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer overflow-hidden group"
              >
                {/* Card image */}
                <div className="aspect-[2.5/3.5] bg-gray-100 relative">
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 gap-1">
                      <span className="text-3xl opacity-20">⚪</span>
                      <span className="text-[9px] text-gray-400">{card.name}</span>
                    </div>
                  )}
                  {/* Select as header image button */}
                  {card.imageUrl && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedImage(card.imageUrl); }}
                      className={`absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold transition-all ${
                        selectedImage === card.imageUrl
                          ? 'bg-blue-500 text-white opacity-100'
                          : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                      }`}
                      title="設為代表圖片"
                    >
                      {selectedImage === card.imageUrl ? '✓' : '設圖'}
                    </button>
                  )}
                  {/* Rarity badge */}
                  {card.rarity && (
                    <div className="absolute top-1.5 right-1.5">
                      <span
                        className={`${RARITY_COLORS[card.rarity] ?? 'bg-gray-400'} text-white text-[10px] font-bold px-1.5 py-0.5 rounded`}
                      >
                        {RARITY_SHORT[card.rarity] ?? card.rarity.split('_')[0]}
                      </span>
                    </div>
                  )}
                  {/* Lang flag */}
                  <div className="absolute top-1.5 left-1.5 text-sm leading-none">
                    {LANG_FLAG[card.language] ?? ''}
                  </div>
                </div>

                {/* Card info */}
                <div className="p-2.5">
                  <div className="font-semibold text-xs text-gray-900 truncate" title={card.name}>
                    {card.name}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    {card.hp && (
                      <span className="text-[10px] font-bold text-red-600">HP {card.hp}</span>
                    )}
                    {card.types && card.types.length > 0 && (
                      <div
                        className={`w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center ${TYPE_COLORS[card.types[0]] ?? 'bg-gray-300 text-gray-700'}`}
                      >
                        {card.types[0][0]}
                      </div>
                    )}
                  </div>
                  {/* Expansion info */}
                  <div className="mt-1 text-[10px] text-gray-400 truncate">
                    {card.regionalExpansion?.primaryExpansion?.code ??
                      card.primaryCard?.primaryExpansion?.code ??
                      ''}
                    {card.primaryCard?.cardNumber ? ` #${card.primaryCard.cardNumber}` : ''}
                  </div>
                </div>
              </div>
            ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
