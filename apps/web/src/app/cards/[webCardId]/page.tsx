'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { use, useState, useEffect } from 'react';

interface CardDetail {
  id: string;
  webCardId: string;
  name: string;
  hp: number | null;
  types: string[] | string | null;
  supertype: string;
  subtypes: string[];
  rarity: string | null;
  variantType: string;
  language: string;
  imageUrl: string | null;
  artist: string | null;
  regulationMark: string | null;
  ruleBox: string | null;
  text: string | null; // For Trainer/Energy card text/description
  abilities: any;
  attacks: any;
  weaknesses: any;
  resistances: any;
  retreatCost: any;
  evolvesFrom: string | null;
  evolvesTo: string | null;
  evolutionStage: string | null;
  region: string | null;
  scrapedAt: string | null;
  createdAt: string;
  updatedAt: string;
  primaryCard: {
    id: string;
    expansionId: string;
    cardNumber: string;
    primaryExpansion: {
      code: string;
      nameEn: string;
    } | null;
  };
  regionalExpansion: {
    id: string;
    code: string;
    name: string;
    region: string;
    primaryExpansion: {
      code: string;
      nameEn: string;
    };
  } | null;
  languageVariants: Array<{
    id: string;
    webCardId: string;
    name: string;
    language: string;
    variantType: string;
    imageUrl: string | null;
    regionalExpansion: {
      code: string;
      name: string;
      region: string;
      primaryExpansion: {
        code: string;
        nameEn: string;
      };
    } | null;
  }>;
}

async function fetchCardDetail(webCardId: string) {
  try {
    console.log('Fetching card detail for:', webCardId);
    // Try with fetch instead of axios
    const response = await fetch(`http://localhost:4000/api/v1/cards/web/${webCardId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log('Card detail fetched successfully:', data?.name);
    return data;
  } catch (error) {
    console.error('Error fetching card detail:', error);
    throw error;
  }
}

async function searchCardsByName(name: string) {
  try {
    const { data } = await apiClient.get('/cards', {
      params: { name, take: 100 }
    });
    return data?.data || [];
  } catch (error) {
    console.error('Error searching cards by name:', error);
    return [];
  }
}

const LANGUAGE_LABELS: Record<string, string> = {
  JA_JP: '日文',
  ZH_TW: '繁體中文',
  EN_US: '英文',
  KO_KR: '韓文',
};

const SUPERTYPE_LABELS: Record<string, string> = {
  POKEMON: '寶可夢',
  TRAINER: '訓練家',
  ENERGY: '能量',
};

const TYPE_COLORS: Record<string, string> = {
  GRASS: 'bg-green-500',
  FIRE: 'bg-red-500',
  WATER: 'bg-blue-500',
  LIGHTNING: 'bg-yellow-500',
  PSYCHIC: 'bg-purple-500',
  FIGHTING: 'bg-orange-700',
  DARKNESS: 'bg-gray-800',
  METAL: 'bg-gray-400',
  DRAGON: 'bg-gradient-to-r from-blue-500 to-red-500',
  FAIRY: 'bg-pink-400',
  COLORLESS: 'bg-gray-300',
};

export default function CardDetailPage({ params }: { params: Promise<{ webCardId: string }> }) {
  const router = useRouter();
  const { webCardId } = use(params);
  const { data: card, isLoading, error } = useQuery<CardDetail>({
    queryKey: ['card', webCardId],
    queryFn: () => fetchCardDetail(webCardId),
  });

  // State for variant navigation
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);

  // Create all variants array including current card
  const allVariants = card ? [card, ...(card.languageVariants || [])] : [];

  // Get the current variant being displayed
  const currentVariant = allVariants[currentVariantIndex] || card;

  // Navigation functions for language variants
  const navigateToPreviousVariant = () => {
    if (allVariants.length > 0) {
      const newIndex = currentVariantIndex > 0 ? currentVariantIndex - 1 : allVariants.length - 1;
      setCurrentVariantIndex(newIndex);
    }
  };

  const navigateToNextVariant = () => {
    if (allVariants.length > 0) {
      const newIndex = currentVariantIndex < allVariants.length - 1 ? currentVariantIndex + 1 : 0;
      setCurrentVariantIndex(newIndex);
    }
  };

  // Update current variant index when card changes
  useEffect(() => {
    if (card && allVariants.length > 0) {
      const currentIndex = allVariants.findIndex(variant => variant.webCardId === webCardId);
      if (currentIndex !== -1) {
        setCurrentVariantIndex(currentIndex);
      }
    }
  }, [card, webCardId]); // Remove allVariants from dependencies to prevent resetting during navigation

  // Fetch evolution-related cards
  const { data: evolvesFromCards = [] } = useQuery({
    queryKey: ['evolutionFrom', card?.evolvesFrom],
    queryFn: () => searchCardsByName(card!.evolvesFrom!),
    enabled: !!card?.evolvesFrom,
  });

  const { data: evolvesToCards = [] } = useQuery({
    queryKey: ['evolutionTo', card?.evolvesTo, card?.webCardId],
    queryFn: async () => {
      if (!card?.evolvesTo) return [];
      const names = card.evolvesTo.split(',').map(n => n.trim());
      const results = await Promise.all(names.map(name => searchCardsByName(name)));
      const allCards = results.flat();

      // Remove duplicates by webCardId and exclude current card
      const uniqueCards = Array.from(
        new Map(
          allCards
            .filter((c: any) => c.webCardId !== card.webCardId)
            .map(c => [c.webCardId, c])
        ).values()
      );

      return uniqueCards;
    },
    enabled: !!card?.evolvesTo,
  });

  // Reverse lookup: find cards that evolve INTO this card using the new API filters
  const { data: evolvesIntoThisCard = [] } = useQuery({
    queryKey: ['evolutionReverse', card?.name],
    queryFn: async () => {
      if (!card?.name) return [];
      try {
        const allEvolutionCards: any[] = [];

        // Search for BASIC cards that evolve to this Pokemon
        try {
          const { data: basicData } = await apiClient.get('/cards', {
            params: {
              evolvesTo: card.name,
              evolutionStage: 'BASIC',
              supertype: 'POKEMON',
              take: 100
            }
          });
          if (basicData?.data) {
            allEvolutionCards.push(...basicData.data);
          }
        } catch (err) {
          console.error('Error fetching BASIC cards:', err);
        }

        // Search for STAGE_1 cards that evolve to this Pokemon
        try {
          const { data: stage1Data } = await apiClient.get('/cards', {
            params: {
              evolvesTo: card.name,
              evolutionStage: 'STAGE_1',
              supertype: 'POKEMON',
              take: 100
            }
          });
          if (stage1Data?.data) {
            allEvolutionCards.push(...stage1Data.data);
          }
        } catch (err) {
          console.error('Error fetching STAGE_1 cards:', err);
        }

        // Search for STAGE_2 cards that evolve to this Pokemon (alternate forms)
        try {
          const { data: stage2Data } = await apiClient.get('/cards', {
            params: {
              evolvesTo: card.name,
              evolutionStage: 'STAGE_2',
              supertype: 'POKEMON',
              take: 50
            }
          });
          if (stage2Data?.data) {
            allEvolutionCards.push(...stage2Data.data);
          }
        } catch (err) {
          console.error('Error fetching STAGE_2 cards:', err);
        }

        // Remove duplicates and exclude current card
        const uniqueCards = Array.from(
          new Map(
            allEvolutionCards
              .filter((c: any) => c.webCardId !== card.webCardId)
              .map(c => [c.webCardId, c])
          ).values()
        );

        console.log('Evolution cards found:', uniqueCards.length);
        console.log('Current card expansion:', card.regionalExpansion?.code);
        uniqueCards.forEach((c: any) => {
          console.log(`  - ${c.name} (${c.evolutionStage}): ${c.regionalExpansion?.code}`);
        });

        return uniqueCards;
      } catch (error) {
        console.error('Evolution search error:', error);
        return [];
      }
    },
    enabled: !!card?.name,
  });

  // Find cards with same name (other variants)
  const { data: sameNameCards = [] } = useQuery({
    queryKey: ['sameName', card?.name, card?.webCardId],
    queryFn: async () => {
      if (!card?.name) return [];
      const cards = await searchCardsByName(card.name);
      // Filter to exact name matches only and exclude current card
      return cards.filter((c: any) =>
        c.name === card.name && c.webCardId !== card.webCardId
      );
    },
    enabled: !!card?.name,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-6 py-8">
          <div className="text-center">載入中...</div>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-6 py-8">
          <div className="text-center text-red-600">找不到卡片資料</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="w-full px-6 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          返回列表
        </button>

        <div className="flex gap-8">
          {/* Card Image */}
          <div className="w-3/10 bg-white rounded-lg p-6 shadow-sm">
            <div className="relative">
              {currentVariant?.imageUrl ? (
                <img
                  src={currentVariant.imageUrl}
                  alt={currentVariant.name}
                  className="w-full h-auto rounded-lg"
                />
              ) : (
                <div className="aspect-[2.5/3.5] bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400">無圖片</span>
                </div>
              )}

              {/* Navigation Buttons - Always visible when multiple variants exist */}
              {allVariants.length > 1 && (
                <>
                  <button
                    onClick={navigateToPreviousVariant}
                    className="absolute top-2 left-2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white p-1.5 rounded-full shadow-lg transition-all duration-200 hover:scale-110"
                    title="上一版本"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={navigateToNextVariant}
                    className="absolute top-2 right-2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white p-1.5 rounded-full shadow-lg transition-all duration-200 hover:scale-110"
                    title="下一版本"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Expansion Code and Card Number */}
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded-full">
                    {(currentVariant?.regionalExpansion?.primaryExpansion?.code || currentVariant?.regionalExpansion?.code || card.primaryCard?.primaryExpansion?.code || 'N/A').toUpperCase()} #{card.primaryCard?.cardNumber || 'N/A'} {currentVariantIndex + 1}/{allVariants.length}
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/cards/${card.webCardId}/edit`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                編輯卡片資訊
              </Link>
              <Link
                href="/deck-builder/tournaments"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                查看賽事牌組
              </Link>
            </div>

          </div>

          {/* Card Details */}
          <div className="flex-1 space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h1 className="text-3xl font-bold mb-2 text-gray-900">{currentVariant?.name || card.name}</h1>
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                  {SUPERTYPE_LABELS[card.supertype] || card.supertype}
                </span>
                {card.types && (
                  <span className={`px-3 py-1 text-white text-sm rounded-full ${
                    TYPE_COLORS[Array.isArray(card.types) ? card.types[0] : card.types] || 'bg-gray-500'
                  }`}>
                    {Array.isArray(card.types) ? card.types.join(', ') : card.types}
                  </span>
                )}
                {card.rarity && (
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                    {card.rarity}
                  </span>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-600">卡號</dt>
                  <dd className="font-medium text-gray-900">{currentVariant?.webCardId || card.webCardId}</dd>
                </div>
                {currentVariant?.regionalExpansion && (
                  <div>
                    <dt className="text-sm text-gray-600">擴展包</dt>
                    <dd className="font-medium text-gray-900">
                      {currentVariant.regionalExpansion.primaryExpansion?.code || currentVariant.regionalExpansion.code}
                      {currentVariant.regionalExpansion.name && (
                        <span className="text-sm text-gray-600 ml-1">({currentVariant.regionalExpansion.name})</span>
                      )}
                    </dd>
                  </div>
                )}
                {card.hp && (
                  <div>
                    <dt className="text-sm text-gray-600">HP</dt>
                    <dd className="font-medium text-gray-900">{card.hp}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-600">語言</dt>
                  <dd className="font-medium text-gray-900">{LANGUAGE_LABELS[currentVariant?.language || card.language] || (currentVariant?.language || card.language)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">變體類型</dt>
                  <dd className="font-medium text-gray-900">{currentVariant?.variantType || card.variantType}</dd>
                </div>
                {card.artist && (
                  <div className="col-span-2">
                    <dt className="text-sm text-gray-600">繪師</dt>
                    <dd className="font-medium text-gray-900">{card.artist}</dd>
                  </div>
                )}
                {card.regulationMark && (
                  <div>
                    <dt className="text-sm text-gray-600">規格標記</dt>
                    <dd className="font-medium text-gray-900">{card.regulationMark}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Attacks */}
            {card.attacks && Array.isArray(card.attacks) && card.attacks.length > 0 && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h2 className="text-xl font-semibold mb-3 text-gray-900">招式</h2>
                {card.attacks.map((attack: any, index: number) => (
                  <div key={index} className="mb-3 last:mb-0 border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{attack.name}</div>
                        {(attack.effect || attack.text) && (
                          <div className="text-sm text-gray-800 mt-1">{attack.effect || attack.text}</div>
                        )}
                      </div>
                      {attack.damage && (
                        <div className="ml-4 text-xl font-bold text-red-600">{attack.damage}</div>
                      )}
                    </div>
                    {attack.cost && attack.cost.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {(Array.isArray(attack.cost) ? attack.cost : attack.cost.split('')).map((cost: string, idx: number) => (
                          <span
                            key={idx}
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white ${
                              TYPE_COLORS[cost] || 'bg-gray-500'
                            }`}
                          >
                            {cost.charAt(0)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Evolution Chain */}
            {(card.evolvesFrom || card.evolvesTo || card.evolutionStage) && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xl font-semibold text-gray-900">進化鏈</h2>
                  <Link
                    href={`/cards/${card.webCardId}/edit-evolution`}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    編輯進化資訊
                  </Link>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {/* Basic Stage */}
                  <div className="flex-shrink-0">
                    <div className="text-xs font-semibold text-gray-500 mb-3 text-center">基礎</div>
                    {(() => {
                      const currentExpansionCode = card.regionalExpansion?.code;
                      const basicCards = evolvesIntoThisCard.filter((c: any) => c.evolutionStage === 'BASIC');
                      const basicCard = basicCards.find((c: any) =>
                        c.regionalExpansion?.code === currentExpansionCode
                      ) || (basicCards.length > 0 ? basicCards.sort((a, b) =>
                        Math.abs(parseInt(a.webCardId.replace(/\D/g, '')) - parseInt(card.webCardId.replace(/\D/g, ''))) -
                        Math.abs(parseInt(b.webCardId.replace(/\D/g, '')) - parseInt(card.webCardId.replace(/\D/g, '')))
                      )[0] : null);
                      if (basicCard) {
                        return (
                          <Link
                            href={`/cards/${basicCard.webCardId}`}
                            className="block bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 hover:border-green-400 rounded-lg p-4 min-w-[140px] transition-all hover:shadow-md"
                          >
                            {basicCard.imageUrl && (
                              <img src={basicCard.imageUrl} alt={basicCard.name} className="w-full h-32 object-contain mb-2 rounded" />
                            )}
                            <div className="text-sm font-medium text-gray-900 mb-1">{basicCard.name}</div>
                            <div className="text-xs text-green-700">點擊查看 →</div>
                          </Link>
                        );
                      } else if (card.evolvesFrom) {
                        if (evolvesFromCards.length > 0) {
                          return (
                            <Link
                              href={`/cards/${evolvesFromCards[0].webCardId}`}
                              className="block bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 hover:border-green-400 rounded-lg p-4 min-w-[140px] transition-all hover:shadow-md"
                            >
                              {evolvesFromCards[0].imageUrl && (
                                <img src={evolvesFromCards[0].imageUrl} alt={evolvesFromCards[0].name} className="w-full h-32 object-contain mb-2 rounded" />
                              )}
                              <div className="text-sm font-medium text-gray-900 mb-1">{card.evolvesFrom}</div>
                              <div className="text-xs text-green-700">點擊查看 →</div>
                            </Link>
                          );
                        } else {
                          return (
                            <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-4 min-w-[140px]">
                              <div className="text-sm font-medium text-gray-900 mb-1">{card.evolvesFrom}</div>
                              <div className="text-xs text-gray-600">たね</div>
                            </div>
                          );
                        }
                      } else if (card.evolutionStage === 'BASIC') {
                        return (
                          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg p-4 min-w-[140px]">
                            {card.imageUrl && (
                              <img src={card.imageUrl} alt={card.name} className="w-full h-32 object-contain mb-2 rounded" />
                            )}
                            <div className="text-sm font-bold text-blue-900 mb-1">{card.name}</div>
                            <div className="text-xs text-blue-700">當前卡片</div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-4 min-w-[140px]">
                            <div className="text-xs text-gray-400 text-center">未知</div>
                          </div>
                        );
                      }
                    })()}
                  </div>

                  {/* Arrow */}
                  <div className="flex-shrink-0 text-2xl text-gray-400">→</div>

                  {/* Stage 1 */}
                  <div className="flex-shrink-0">
                    <div className="text-xs font-semibold text-gray-500 mb-3 text-center">1進化</div>
                    {(() => {
                      const currentExpansionCode = card.regionalExpansion?.code;
                      const stage1Cards = evolvesIntoThisCard.filter((c: any) => c.evolutionStage === 'STAGE_1');
                      const stage1Card = stage1Cards.find((c: any) =>
                        c.regionalExpansion?.code === currentExpansionCode
                      ) || (stage1Cards.length > 0 ? stage1Cards.sort((a, b) =>
                        Math.abs(parseInt(a.webCardId.replace(/\D/g, '')) - parseInt(card.webCardId.replace(/\D/g, ''))) -
                        Math.abs(parseInt(b.webCardId.replace(/\D/g, '')) - parseInt(card.webCardId.replace(/\D/g, '')))
                      )[0] : null);
                      if (card.evolutionStage === 'STAGE_1') {
                        return (
                          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg p-4 min-w-[140px]">
                            {card.imageUrl && (
                              <img src={card.imageUrl} alt={card.name} className="w-full h-32 object-contain mb-2 rounded" />
                            )}
                            <div className="text-sm font-bold text-blue-900 mb-1">{card.name}</div>
                            <div className="text-xs text-blue-700">當前卡片</div>
                          </div>
                        );
                      } else if (stage1Card) {
                        return (
                          <Link
                            href={`/cards/${stage1Card.webCardId}`}
                            className="block bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 hover:border-green-400 rounded-lg p-4 min-w-[140px] transition-all hover:shadow-md"
                          >
                            {stage1Card.imageUrl && (
                              <img src={stage1Card.imageUrl} alt={stage1Card.name} className="w-full h-32 object-contain mb-2 rounded" />
                            )}
                            <div className="text-sm font-medium text-gray-900 mb-1">{stage1Card.name}</div>
                            <div className="text-xs text-green-700">點擊查看 →</div>
                          </Link>
                        );
                      } else if (card.evolutionStage === 'STAGE_2' && card.evolvesFrom) {
                        return (
                          <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-4 min-w-[140px]">
                            <div className="text-sm font-medium text-gray-900 mb-1">?</div>
                            <div className="text-xs text-gray-600">進化階段</div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-4 min-w-[140px]">
                            <div className="text-xs text-gray-400 text-center">—</div>
                          </div>
                        );
                      }
                    })()}
                  </div>

                  {/* Stage 2 - Only show if there are Stage 2 cards or current card is Stage 2 */}
                  {(() => {
                    const hasStage2Cards = evolvesToCards.some((c: any) => c.evolutionStage === 'STAGE_2');
                    const isCurrentStage2 = card.evolutionStage === 'STAGE_2';
                    return (hasStage2Cards || isCurrentStage2) && (
                      <>
                        {/* Arrow */}
                        <div className="flex-shrink-0 text-2xl text-gray-400">→</div>
                        {/* Stage 2 */}
                        <div className="flex-shrink-0">
                          <div className="text-xs font-semibold text-gray-500 mb-3 text-center">2進化</div>
                          {card.evolutionStage === 'STAGE_2' ? (
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-500 rounded-lg p-4 min-w-[140px]">
                              {card.imageUrl && (
                                <img src={card.imageUrl} alt={card.name} className="w-full h-32 object-contain mb-2 rounded" />
                              )}
                              <div className="text-sm font-bold text-blue-900 mb-1">{card.name}</div>
                              <div className="text-xs text-blue-700">當前卡片</div>
                            </div>
                          ) : card.evolvesTo ? (
                            (() => {
                              const currentExpansionCode = card.regionalExpansion?.code;
                              // Filter to STAGE_2 cards only
                              const stage2Cards = evolvesToCards.filter((c: any) => c.evolutionStage === 'STAGE_2');
                              // Prioritize same expansion code, then nearest webCardId
                              const stage2Card = stage2Cards.find((c: any) =>
                                c.regionalExpansion?.code === currentExpansionCode
                              ) || (stage2Cards.length > 0 ? stage2Cards.sort((a, b) =>
                                Math.abs(parseInt(a.webCardId.replace(/\D/g, '')) - parseInt(card.webCardId.replace(/\D/g, ''))) -
                                Math.abs(parseInt(b.webCardId.replace(/\D/g, '')) - parseInt(card.webCardId.replace(/\D/g, '')))
                              )[0] : null);

                              return stage2Card ? (
                                <Link
                                  href={`/cards/${stage2Card.webCardId}`}
                                  className="block bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 hover:border-purple-400 rounded-lg p-4 min-w-[140px] max-w-[200px] transition-all hover:shadow-md"
                                >
                                  {stage2Card.imageUrl && (
                                    <img src={stage2Card.imageUrl} alt={stage2Card.name} className="w-full h-32 object-contain mb-2 rounded" />
                                  )}
                                  <div className="text-sm font-medium text-gray-900 mb-1 truncate" title={stage2Card.name}>
                                    {stage2Card.name}
                                  </div>
                                  <div className="text-xs text-purple-700">
                                    {stage2Cards.length > 1 ? `點擊查看 (${stage2Cards.length} 種)` : '點擊查看 →'}
                                  </div>
                                </Link>
                              ) : (
                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg p-4 min-w-[140px] max-w-[200px]">
                                  <div className="text-sm font-medium text-gray-900 mb-1 truncate" title={card.evolvesTo}>
                                    {card.evolvesTo.split(',')[0].trim()}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    {card.evolvesTo.split(',').length > 1 ? `+${card.evolvesTo.split(',').length - 1} 更多` : '可進化'}
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-4 min-w-[140px]">
                              <div className="text-xs text-gray-400 text-center">—</div>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Evolution Options */}
                {(() => {
                  // Determine next evolution stage
                  const nextStage = card.evolutionStage === 'BASIC' ? 'STAGE_1' :
                                    card.evolutionStage === 'STAGE_1' ? 'STAGE_2' : null;
                  // Filter to only show next evolution level
                  const nextLevelCards = nextStage ?
                    evolvesToCards.filter((c: any) => c.evolutionStage === nextStage) : [];

                  // Group by primaryCardId to show only one variant per card
                  const primaryCardMap = new Map();
                  nextLevelCards.forEach((card: any) => {
                    if (!primaryCardMap.has(card.primaryCard?.id)) {
                      primaryCardMap.set(card.primaryCard?.id, card);
                    }
                  });

                  // Sort by webCardId descending to show newest first
                  const sortedCards = Array.from(primaryCardMap.values()).sort((a, b) =>
                    b.webCardId.localeCompare(a.webCardId)
                  );

                  // Show all unique primary cards from next evolution level
                  const displayCards = sortedCards;

                  return displayCards.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">
                        所有可進化選項 ({displayCards.length} 個版本)：
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {displayCards.map((evolCard: any) => (
                          <Link
                            key={evolCard.webCardId}
                            href={`/cards/${evolCard.webCardId}`}
                            className="block bg-white border-2 border-purple-200 hover:border-purple-400 rounded-lg p-3 transition-all hover:shadow-lg"
                          >
                            {evolCard.imageUrl && (
                              <img
                                src={evolCard.imageUrl}
                                alt={evolCard.name}
                                className="w-full h-40 object-contain mb-2 rounded"
                              />
                            )}
                            <div className="text-sm font-medium text-gray-900 mb-1 truncate" title={evolCard.name}>
                              {evolCard.name}
                            </div>
                            {evolCard.primaryCard?.primaryExpansion && (
                              <div className="text-xs text-gray-600 mb-1">
                                {evolCard.primaryCard.primaryExpansion.nameEn} #{evolCard.primaryCard.cardNumber}
                              </div>
                            )}
                            {evolCard.regionalExpansion?.code && (
                              <div className="text-xs font-medium text-purple-600">
                                {evolCard.regionalExpansion.code}
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4 text-xs text-gray-500 italic">
                  {evolvesFromCards.length > 0 || evolvesToCards.length > 0
                    ? '點擊卡片名稱以查看詳細資訊'
                    : '提示：點擊「編輯進化資訊」以連結實際卡片'}
                </div>
              </div>
            )}

            {/* Same Name / Same Attack Cards */}
            {sameNameCards.length > 0 && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h2 className="text-xl font-semibold mb-3 text-gray-900">相關卡片</h2>
                {/* Same Name Cards */}
                {sameNameCards.length > 0 && (
                  <div className="mb-3">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      同名卡片 ({sameNameCards.length} 個版本)：
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                      {sameNameCards.slice(0, 10).map((relatedCard: any) => (
                        <Link
                          key={relatedCard.webCardId}
                          href={`/cards/${relatedCard.webCardId}`}
                          className="block bg-white border-2 border-blue-200 hover:border-blue-400 rounded-lg p-2 transition-all hover:shadow-lg"
                        >
                          {relatedCard.imageUrl && (
                            <img
                              src={relatedCard.imageUrl}
                              alt={relatedCard.name}
                              className="w-full h-24 object-contain mb-1 rounded"
                            />
                          )}
                          <div className="text-sm font-medium text-gray-900 mb-1 truncate" title={relatedCard.name}>
                            {relatedCard.name}
                          </div>
                          {relatedCard.variantType && (
                            <div className="text-xs text-blue-600 font-medium">
                              {relatedCard.variantType}
                            </div>
                          )}
                          {relatedCard.regionalExpansion?.code && (
                            <div className="text-xs text-gray-600">
                              {relatedCard.regionalExpansion.code}
                            </div>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Abilities */}
            {card.abilities && Array.isArray(card.abilities) && card.abilities.length > 0 && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h2 className="text-xl font-semibold mb-3 text-gray-900">特性</h2>
                {card.abilities.map((ability: any, index: number) => (
                  <div key={index} className="mb-4 last:mb-0">
                    <div className="font-semibold text-blue-700">{ability.name}</div>
                    <div className="text-sm text-gray-800 mt-1">{ability.text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Trainer Card Text/Description */}
            {card.supertype === 'TRAINER' && card.text && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h2 className="text-xl font-semibold mb-3 text-gray-900">
                  {card.subtypes.includes('SUPPORTER') && '效果 (Supporter Effect)'}
                  {card.subtypes.includes('ITEM') && '效果 (Item Effect)'}
                  {card.subtypes.includes('STADIUM') && '效果 (Stadium Effect)'}
                  {card.subtypes.includes('TOOL') && '效果 (Tool Effect)'}
                  {!card.subtypes.includes('SUPPORTER') && !card.subtypes.includes('ITEM') && !card.subtypes.includes('STADIUM') && !card.subtypes.includes('TOOL') && '效果'}
                </h2>
                <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{card.text}</p>
              </div>
            )}

            {/* Weaknesses & Resistances */}
            {((card.weaknesses && Array.isArray(card.weaknesses) && card.weaknesses.length > 0) ||
              (card.resistances && Array.isArray(card.resistances) && card.resistances.length > 0)) && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h2 className="text-xl font-semibold mb-3 text-gray-900">弱點與抵抗</h2>
                {card.weaknesses && card.weaknesses.length > 0 && (
                  <div className="mb-3">
                    <span className="text-sm text-gray-600">弱點：</span>
                    {card.weaknesses.map((weakness: any, index: number) => (
                      <span key={index} className="ml-2 font-medium">
                        {weakness.type} {weakness.value}
                      </span>
                    ))}
                  </div>
                )}
                {card.resistances && card.resistances.length > 0 && (
                  <div>
                    <span className="text-sm text-gray-600">抵抗：</span>
                    {card.resistances.map((resistance: any, index: number) => (
                      <span key={index} className="ml-2 font-medium">
                        {resistance.type} {resistance.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Metadata */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold mb-4 text-gray-900">資料</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">擴展包</dt>
                  <dd className="font-medium text-gray-900">{card.primaryCard.expansionId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">卡片編號</dt>
                  <dd className="font-medium text-gray-900">{card.primaryCard.cardNumber}</dd>
                </div>
                {card.region && (
                  <div className="flex justify-between">
                    <dt className="text-gray-600">地區</dt>
                    <dd className="font-medium text-gray-900">{card.region}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-gray-600">建立時間</dt>
                  <dd className="font-medium text-gray-900">{new Date(card.createdAt).toLocaleDateString('zh-TW')}</dd>
                </div>
              </dl>
              <div className="mt-4 text-sm text-gray-600 space-y-2">
                <div className="flex items-center justify-between">
                  <span>關聯卡片</span>
                  <Link
                    href={`/cards/${card.webCardId}/edit`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    編輯關聯
                  </Link>
                </div>
                <div className="flex items-center justify-between">
                  <span>進化鏈</span>
                  <Link
                    href={`/cards/${card.webCardId}/edit-evolution`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    編輯進化
                  </Link>
                </div>
                <div className="flex items-center justify-between">
                  <span>賽事使用</span>
                  <Link
                    href={`/cards/${card.webCardId}/edit`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    編輯紀錄
                  </Link>
                </div>
              </div>
            </div>

            {/* Language Variants / Different Versions */}
            {card.languageVariants && card.languageVariants.length > 0 && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">
                  其他版本 ({card.languageVariants.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {card.languageVariants.slice(0, 10).map((variant) => (
                    <Link
                      key={variant.id}
                      href={`/cards/${variant.webCardId}`}
                      className="group"
                    >
                      <div className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                        {variant.imageUrl ? (
                          <img
                            src={variant.imageUrl}
                            alt={variant.name}
                            className="w-full h-auto object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-[2/3] bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-400 text-xs">無圖片</span>
                          </div>
                        )}
                        <div className="p-2 bg-gray-50">
                          <div className="text-xs font-semibold text-blue-700 mb-1">
                            {variant.regionalExpansion?.primaryExpansion?.code || variant.regionalExpansion?.code || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-600 truncate">
                            {LANGUAGE_LABELS[variant.language] || variant.language}
                          </div>
                          <div className="text-xs font-medium text-gray-900 truncate">
                            {variant.webCardId}
                          </div>
                          <div className="text-xs text-gray-500">
                            {variant.variantType}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                {card.languageVariants.length > 10 && (
                  <div className="mt-4 text-center">
                    <span className="text-sm text-gray-600">
                      顯示前 10 個，共 {card.languageVariants.length} 個版本
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
