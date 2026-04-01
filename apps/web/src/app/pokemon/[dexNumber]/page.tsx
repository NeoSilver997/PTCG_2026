'use client';

import { use, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import apiClient from '@/lib/api-client';
import Link from 'next/link';

interface PokemonEntry {
  number: string;
  name_zh_hans: string;
  name_zh_hant: string;
  name_ja: string;
  name_en: string;
  form: string | null;
}

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
  primaryCard?: {
    cardNumber?: string | null;
    primaryExpansion?: { code: string; nameEn: string } | null;
  };
  regionalExpansion?: {
    code: string;
    name: string;
    region: string;
    primaryExpansion?: { code: string; nameEn: string };
  } | null;
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

export default function PokemonDetailPage({
  params,
}: {
  params: Promise<{ dexNumber: string }>;
}) {
  const { dexNumber } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = searchParams.get('form');

  // Load the species info
  const { data: pokemonList } = useQuery<PokemonEntry[]>({
    queryKey: ['pokemon-names'],
    queryFn: async () => {
      const res = await fetch('/api/pokemon-names');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    staleTime: Infinity,
  });

  const species = useMemo(() => {
    if (!pokemonList) return null;
    return pokemonList.find(
      (p) => p.number === dexNumber && (form ? p.form === form : !p.form)
    ) ?? pokemonList.find((p) => p.number === dexNumber) ?? null;
  }, [pokemonList, dexNumber, form]);

  // Fetch all cards with this Pokémon's name (try ZH_HANT name and JP name)
  const searchName = species?.name_zh_hant || species?.name_en || '';

  const { data: cardsData, isLoading } = useQuery({
    queryKey: ['pokemon-cards', dexNumber, searchName],
    queryFn: async () => {
      if (!searchName) return { data: [], pagination: { total: 0 } };
      const params = new URLSearchParams({
        name: searchName,
        supertype: 'POKEMON',
        take: '100',
        skip: '0',
        sortBy: 'webCardId',
        sortOrder: 'desc',
      });
      const res = await apiClient.get(`/cards?${params.toString()}`);
      return res.data;
    },
    enabled: !!searchName,
  });

  // Also search with English name (to pick up EN_US cards)
  const { data: enCardsData } = useQuery({
    queryKey: ['pokemon-cards-en', dexNumber, species?.name_en],
    queryFn: async () => {
      if (!species?.name_en || species.name_en === searchName) return { data: [] };
      const params = new URLSearchParams({
        name: species.name_en,
        supertype: 'POKEMON',
        take: '100',
        skip: '0',
        language: 'EN_US',
        sortBy: 'webCardId',
        sortOrder: 'desc',
      });
      const res = await apiClient.get(`/cards?${params.toString()}`);
      return res.data;
    },
    enabled: !!species?.name_en && species.name_en !== searchName,
  });

  // Also search with Japanese name
  const { data: jaCardsData } = useQuery({
    queryKey: ['pokemon-cards-ja', dexNumber, species?.name_ja],
    queryFn: async () => {
      if (!species?.name_ja || species.name_ja === searchName) return { data: [] };
      const params = new URLSearchParams({
        name: species.name_ja,
        supertype: 'POKEMON',
        take: '100',
        skip: '0',
        language: 'JA_JP',
        sortBy: 'webCardId',
        sortOrder: 'desc',
      });
      const res = await apiClient.get(`/cards?${params.toString()}`);
      return res.data;
    },
    enabled: !!species?.name_ja && species.name_ja !== searchName,
  });

  // Deduplicate by webCardId
  const allCards = useMemo((): CardItem[] => {
    const seen = new Set<string>();
    const combined: CardItem[] = [
      ...(cardsData?.data ?? []),
      ...(enCardsData?.data ?? []),
      ...(jaCardsData?.data ?? []),
    ];
    return combined.filter((c) => {
      if (seen.has(c.webCardId)) return false;
      seen.add(c.webCardId);
      return true;
    });
  }, [cardsData, enCardsData, jaCardsData]);

  const handleCardClick = (card: CardItem) => {
    router.push(`/cards/${card.webCardId}`);
  };

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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="bg-blue-50 rounded-lg px-3 py-2 font-mono text-blue-700 font-bold text-lg">
              #{dexNumber}
            </div>
            <div>
              {species ? (
                <>
                  <h1 className="text-2xl font-bold text-gray-900">{species.name_zh_hant}</h1>
                  {species.form && (
                    <div className="text-sm text-purple-600 mt-0.5">{species.form}</div>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-sm text-gray-500">
                    <span>{species.name_en}</span>
                    <span className="text-gray-300">|</span>
                    <span>{species.name_ja}</span>
                    <span className="text-gray-300">|</span>
                    <span className="text-gray-400">{species.name_zh_hans}</span>
                  </div>
                </>
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">圖鑑 #{dexNumber}</h1>
              )}
              <div className="mt-2 text-sm text-gray-500">
                共 {allCards.length} 張卡牌
              </div>
            </div>
          </div>
        </div>

        {/* Cards grid */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">載入中...</div>
        ) : allCards.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">尚無此寶可夢的卡牌資料</p>
            <p className="text-sm mt-1">資料庫中找不到相關卡牌</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
            {allCards.map((card) => (
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
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                      No Image
                    </div>
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
                    {(card.primaryCard?.cardNumber) ? ` #${card.primaryCard.cardNumber}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
