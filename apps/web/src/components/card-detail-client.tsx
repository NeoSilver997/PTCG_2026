'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

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

// Function to check if card has Tera-related information
const hasTeraInfo = (card: CardDetail): boolean => {
  // Check for TERA subtype
  if (card.subtypes && Array.isArray(card.subtypes) && card.subtypes.includes('TERA')) {
    return true;
  }

  // Check abilities for Terastal mentions
  if (card.abilities && Array.isArray(card.abilities)) {
    for (const ability of card.abilities) {
      const desc = ability.description || '';
      const name = ability.name || '';
      if (desc.includes('テラスタル') || desc.includes('太晶') || desc.includes('Tera') ||
          name.includes('テラスタル') || name.includes('太晶') || name.includes('Tera')) {
        return true;
      }
    }
  }

  // Check attacks for Terastal mentions
  if (card.attacks && Array.isArray(card.attacks)) {
    for (const attack of card.attacks) {
      const name = attack.name || '';
      const effect = attack.effect || '';
      if (name.includes('テラスタル') || name.includes('太晶') || name.includes('Tera') ||
          effect.includes('テラスタル') || effect.includes('太晶') || effect.includes('Tera')) {
        return true;
      }
    }
  }

  return false;
};

// Function to get Tera-related abilities and attacks
const getTeraInfo = (card: CardDetail) => {
  const teraAbilities: any[] = [];
  const teraAttacks: any[] = [];
  const isTeraPokemon = card.subtypes && Array.isArray(card.subtypes) && card.subtypes.includes('TERA');

  // Check abilities
  if (card.abilities && Array.isArray(card.abilities)) {
    for (const ability of card.abilities) {
      const desc = ability.description || '';
      const name = ability.name || '';
      if (desc.includes('テラスタル') || desc.includes('太晶') || desc.includes('Tera') ||
          name.includes('テラスタル') || name.includes('太晶') || name.includes('Tera')) {
        teraAbilities.push(ability);
      }
    }
  }

  // Check attacks
  if (card.attacks && Array.isArray(card.attacks)) {
    for (const attack of card.attacks) {
      const name = attack.name || '';
      const effect = attack.effect || '';
      if (name.includes('テラスタル') || name.includes('太晶') || name.includes('Tera') ||
          effect.includes('テラスタル') || effect.includes('太晶') || effect.includes('Tera')) {
        teraAttacks.push(attack);
      }
    }
  }

  return { teraAbilities, teraAttacks, isTeraPokemon };
};

function CardDetailClient({ webCardId }: { webCardId: string }) {
  console.log('CardDetailClient rendered with webCardId:', webCardId);
  const router = useRouter();
  const { data: card, isLoading, error } = useQuery<CardDetail>({
    queryKey: ['card', webCardId],
    queryFn: () => fetchCardDetail(webCardId),
  });

  // State for variant navigation
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);

  // Navigation functions for language variants
  const navigateToPreviousVariant = () => {
    if (card?.languageVariants && card.languageVariants.length > 0) {
      const newIndex = currentVariantIndex > 0 ? currentVariantIndex - 1 : card.languageVariants.length - 1;
      setCurrentVariantIndex(newIndex);
      router.push(`/cards/${card.languageVariants[newIndex].webCardId}`);
    }
  };

  const navigateToNextVariant = () => {
    if (card?.languageVariants && card.languageVariants.length > 0) {
      const newIndex = currentVariantIndex < card.languageVariants.length - 1 ? currentVariantIndex + 1 : 0;
      setCurrentVariantIndex(newIndex);
      router.push(`/cards/${card.languageVariants[newIndex].webCardId}`);
    }
  };

  // Update current variant index when card changes
  useEffect(() => {
    if (card?.languageVariants) {
      const currentIndex = card.languageVariants.findIndex(variant => variant.webCardId === webCardId);
      if (currentIndex !== -1) {
        setCurrentVariantIndex(currentIndex);
      }
    }
  }, [card?.languageVariants, webCardId]);

  // Fetch evolution-related cards
  const { data: evolvesFromCards = [] } = useQuery({
    queryKey: ['evolutionFrom', card?.evolvesFrom],
    queryFn: () => searchCardsByName(card!.evolvesFrom!),
    enabled: !!card?.evolvesFrom,
  });

  const { data: evolvesToCards = [] } = useQuery({
    queryKey: ['evolutionTo', card?.evolvesTo],
    queryFn: () => searchCardsByName(card!.evolvesTo!),
    enabled: !!card?.evolvesTo,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">卡片未找到</h1>
            <p className="text-gray-600 mb-6">抱歉，我們找不到您請求的卡片。</p>
            <Link href="/cards" className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回卡片列表
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentVariant = card.languageVariants?.[currentVariantIndex] || card;
  const hasVariants = card.languageVariants && card.languageVariants.length > 1;
  const { teraAbilities, teraAttacks, isTeraPokemon } = getTeraInfo(card);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/cards" className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回卡片列表
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card Image */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                {currentVariant.imageUrl ? (
                  <img
                    src={currentVariant.imageUrl}
                    alt={card.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    無圖片
                  </div>
                )}
              </div>
            </div>

            {/* Language Variants Navigation */}
            {hasVariants && (
              <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={navigateToPreviousVariant}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="flex-1 text-center">
                    <span className="text-sm text-gray-600">
                      {currentVariantIndex + 1} / {card.languageVariants.length}
                    </span>
                    <div className="text-lg font-semibold">
                      {LANGUAGE_LABELS[currentVariant.language] || currentVariant.language}
                    </div>
                  </div>

                  <button
                    onClick={navigateToNextVariant}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card Details */}
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{card.name}</h1>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  {SUPERTYPE_LABELS[card.supertype] || card.supertype}
                </span>
                {card.subtypes && card.subtypes.map((subtype, index) => (
                  <span key={index} className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                    {subtype}
                  </span>
                ))}
                {card.rarity && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                    {card.rarity}
                  </span>
                )}
              </div>

              {/* Types */}
              {card.types && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">屬性</h3>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(card.types) ? card.types.map((type, index) => (
                      <span
                        key={index}
                        className={`px-3 py-1 text-white rounded-full text-sm ${TYPE_COLORS[type] || 'bg-gray-500'}`}
                      >
                        {type}
                      </span>
                    )) : (
                      <span className={`px-3 py-1 text-white rounded-full text-sm ${TYPE_COLORS[card.types] || 'bg-gray-500'}`}>
                        {card.types}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* HP */}
              {card.hp && (
                <div className="mb-4">
                  <span className="text-2xl font-bold text-red-600">{card.hp} HP</span>
                </div>
              )}

              {/* Artist */}
              {card.artist && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">插畫家</h3>
                  <p className="text-gray-900">{card.artist}</p>
                </div>
              )}

              {/* Regulation Mark */}
              {card.regulationMark && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">法規標記</h3>
                  <p className="text-gray-900">{card.regulationMark}</p>
                </div>
              )}
            </div>

            {/* Abilities */}
            {card.abilities && Array.isArray(card.abilities) && card.abilities.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">特性</h2>
                <div className="space-y-4">
                  {card.abilities.map((ability, index) => (
                    <div key={index} className="border-l-4 border-blue-500 pl-4">
                      <h3 className="font-semibold text-gray-900">{ability.name}</h3>
                      {ability.description && (
                        <p className="text-gray-700 mt-1 whitespace-pre-line">{ability.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tera Abilities */}
            {teraAbilities.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-purple-900 mb-4">太晶特性</h2>
                <div className="space-y-4">
                  {teraAbilities.map((ability, index) => (
                    <div key={index} className="border-l-4 border-purple-500 pl-4">
                      <h3 className="font-semibold text-gray-900">{ability.name}</h3>
                      {ability.description && (
                        <p className="text-gray-700 mt-1 whitespace-pre-line">{ability.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attacks */}
            {card.attacks && Array.isArray(card.attacks) && card.attacks.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">攻擊</h2>
                <div className="space-y-4">
                  {card.attacks.map((attack, index) => (
                    <div key={index} className="border-l-4 border-red-500 pl-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{attack.name}</h3>
                        <div className="flex items-center gap-2">
                          {attack.cost && Array.isArray(attack.cost) && attack.cost.map((cost: string, costIndex: number) => (
                            <span key={costIndex} className={`w-6 h-6 rounded-full ${TYPE_COLORS[cost] || 'bg-gray-500'} flex items-center justify-center text-xs text-white font-bold`}>
                              {cost[0]}
                            </span>
                          ))}
                          {attack.damage && (
                            <span className="text-lg font-bold text-red-600 ml-2">{attack.damage}</span>
                          )}
                        </div>
                      </div>
                      {attack.effect && (
                        <p className="text-gray-700 whitespace-pre-line">{attack.effect}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tera Attacks */}
            {teraAttacks.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-purple-900 mb-4">太晶攻擊</h2>
                <div className="space-y-4">
                  {teraAttacks.map((attack, index) => (
                    <div key={index} className="border-l-4 border-purple-500 pl-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">{attack.name}</h3>
                        <div className="flex items-center gap-2">
                          {attack.cost && Array.isArray(attack.cost) && attack.cost.map((cost: string, costIndex: number) => (
                            <span key={costIndex} className={`w-6 h-6 rounded-full ${TYPE_COLORS[cost] || 'bg-gray-500'} flex items-center justify-center text-xs text-white font-bold`}>
                              {cost[0]}
                            </span>
                          ))}
                          {attack.damage && (
                            <span className="text-lg font-bold text-red-600 ml-2">{attack.damage}</span>
                          )}
                        </div>
                      </div>
                      {attack.effect && (
                        <p className="text-gray-700 whitespace-pre-line">{attack.effect}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weaknesses */}
            {card.weaknesses && Array.isArray(card.weaknesses) && card.weaknesses.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">弱點</h2>
                <div className="flex flex-wrap gap-2">
                  {card.weaknesses.map((weakness, index) => (
                    <div key={index} className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
                      <span className={`w-6 h-6 rounded-full ${TYPE_COLORS[weakness.type] || 'bg-gray-500'} flex items-center justify-center text-xs text-white font-bold`}>
                        {weakness.type[0]}
                      </span>
                      <span className="text-red-600 font-semibold">{weakness.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resistances */}
            {card.resistances && Array.isArray(card.resistances) && card.resistances.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">抵抗</h2>
                <div className="flex flex-wrap gap-2">
                  {card.resistances.map((resistance, index) => (
                    <div key={index} className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                      <span className={`w-6 h-6 rounded-full ${TYPE_COLORS[resistance.type] || 'bg-gray-500'} flex items-center justify-center text-xs text-white font-bold`}>
                        {resistance.type[0]}
                      </span>
                      <span className="text-green-600 font-semibold">{resistance.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retreat Cost */}
            {card.retreatCost && Array.isArray(card.retreatCost) && card.retreatCost.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">撤退費用</h2>
                <div className="flex gap-2">
                  {card.retreatCost.map((cost, index) => (
                    <span key={index} className={`w-8 h-8 rounded-full ${TYPE_COLORS[cost] || 'bg-gray-500'} flex items-center justify-center text-sm text-white font-bold`}>
                      {cost[0]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rule Box */}
            {card.ruleBox && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">規則說明</h2>
                <p className="text-gray-700 whitespace-pre-line">{card.ruleBox}</p>
              </div>
            )}

            {/* Text (for Trainer/Energy cards) */}
            {card.text && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">說明</h2>
                <p className="text-gray-700 whitespace-pre-line">{card.text}</p>
              </div>
            )}

            {/* Evolution Info */}
            {(card.evolvesFrom || card.evolvesTo || card.evolutionStage) && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">進化資訊</h2>
                {card.evolutionStage && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">進化階段</h3>
                    <p className="text-gray-900">{card.evolutionStage}</p>
                  </div>
                )}
                {card.evolvesFrom && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700">進化自</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {evolvesFromCards.slice(0, 3).map((evoCard: { webCardId: string; name: string; imageUrl?: string }, index: number) => (
                        <Link
                          key={index}
                          href={`/cards/${evoCard.webCardId}`}
                          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          {evoCard.imageUrl && (
                            <img src={evoCard.imageUrl} alt={evoCard.name} className="w-8 h-8 object-contain" />
                          )}
                          <span className="text-sm text-gray-900">{evoCard.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {card.evolvesTo && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">進化成</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {evolvesToCards.slice(0, 3).map((evoCard: { webCardId: string; name: string; imageUrl?: string }, index: number) => (
                        <Link
                          key={index}
                          href={`/cards/${evoCard.webCardId}`}
                          className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          {evoCard.imageUrl && (
                            <img src={evoCard.imageUrl} alt={evoCard.name} className="w-8 h-8 object-contain" />
                          )}
                          <span className="text-sm text-gray-900">{evoCard.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metadata */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">卡片資訊</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-gray-700">卡片編號:</span>
                  <p className="text-gray-900">{card.primaryCard?.cardNumber}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">系列:</span>
                  <p className="text-gray-900">{card.primaryCard?.primaryExpansion?.nameEn || card.regionalExpansion?.primaryExpansion?.nameEn}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">區域代碼:</span>
                  <p className="text-gray-900">{card.regionalExpansion?.code}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">語言:</span>
                  <p className="text-gray-900">{LANGUAGE_LABELS[card.language] || card.language}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">變體:</span>
                  <p className="text-gray-900">{card.variantType}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">區域:</span>
                  <p className="text-gray-900">{card.region}</p>
                </div>
              </div>
              {card.scrapedAt && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <span className="text-xs text-gray-500">
                    最後更新: {new Date(card.scrapedAt).toLocaleString('zh-TW')}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { CardDetailClient };