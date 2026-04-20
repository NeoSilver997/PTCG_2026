'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
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
  sourceUrl: string | null;
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
    primaryExpansionId: string;
    cardNumber: string;
    name?: string;
    effectTags: string[];
    specialEffectTags: string[];
    effectScore: number | null;
    cardTier: string | null;
    primaryExpansion: {
      code: string;
      nameEn: string;
      releaseDate: string | null;
    } | null;
    pokemonSpecies: {
      id: string;
      dexNumber: string;
      form: string;
      nameZhHans: string;
      nameZhHant: string;
      nameJa: string;
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
  sameSpeciesCards: Array<{
    id: string;
    webCardId: string;
    name: string;
    language: string;
    variantType: string;
    imageUrl: string | null;
    rarity: string | null;
    primaryCard: {
      id: string;
      cardNumber: string | null;
      primaryExpansion: { code: string; nameEn: string } | null;
    };
    regionalExpansion: {
      code: string;
      name: string;
      region: string;
      primaryExpansion: { code: string; nameEn: string };
    } | null;
  }>;
  relatedCards?: Array<{
    relationId: string;
    relationType: string;
    note: string | null;
    direction: 'from' | 'to';
    primaryCardId: string;
    webCardId: string | null;
    name: string;
    imageUrl: string | null;
    supertype: string | null;
    ruleBox: string | null;
  }>;
}

async function fetchCardDetail(webCardId: string) {
  try {
    console.log('Fetching card detail for:', webCardId);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
    const response = await fetch(`${apiUrl}/cards/web/${webCardId}`);
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

// --- Effect keyword highlighting ---
type EffectKeywordRule = { pattern: string; isRegex: boolean; flags: string; colorClass: string };

function buildHighlightSpans(text: string, rules: EffectKeywordRule[]) {
  type Span = { start: number; end: number; cls: string };
  const spans: Span[] = [];
  for (const rule of rules) {
    try {
      const re = rule.isRegex
        ? new RegExp(rule.pattern, rule.flags)
        : new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), rule.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const s = m.index, e = m.index + m[0].length;
        if (!spans.some(x => s < x.end && e > x.start)) {
          spans.push({ start: s, end: e, cls: rule.colorClass });
        }
        if (!rule.flags.includes('g')) break;
      }
    } catch {
      // skip invalid patterns
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function HighlightedText({ text, rules }: { text: string; rules: EffectKeywordRule[] }) {
  const spans = buildHighlightSpans(text, rules);
  const nodes: React.ReactNode[] = [];
  let pos = 0;
  for (const { start, end, cls } of spans) {
    if (start > pos) nodes.push(text.slice(pos, start));
    nodes.push(
      <mark key={start} className={`${cls} rounded-sm px-0.5 not-italic font-medium`}>
        {text.slice(start, end)}
      </mark>
    );
    pos = end;
  }
  if (pos < text.length) nodes.push(text.slice(pos));
  return <span className="whitespace-pre-wrap leading-relaxed">{nodes}</span>;
}

export default function CardDetailPage({ params }: { params: Promise<{ webCardId: string }> }) {
  const router = useRouter();
  const { webCardId } = use(params);
  const { data: card, isLoading, error } = useQuery<CardDetail>({
    queryKey: ['card', webCardId],
    queryFn: () => fetchCardDetail(webCardId),
  });

  // State for variant navigation
  const [currentVariantIndex, setCurrentVariantIndex] = useState(0);

  // State for weekly usage chart selection
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  // State to control showing all language variants
  const [showAllVariants, setShowAllVariants] = useState(false);
  // State for 2-language side-by-side reference
  const [refCardId, setRefCardId] = useState<string | null>(null);

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

    // Load species summary for fallback linking when PrimaryCard.pokemonSpecies is missing
    const { data: speciesList } = useQuery<any[]>({
      queryKey: ['pokemon-species-summary'],
      queryFn: async () => {
        const res = await apiClient.get('/cards/species-summary');
        return res.data;
      },
      staleTime: 5 * 60 * 1000,
    });

    const normalize = (s?: string) =>
      s
        ? s
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\b(mega|ex|gx|v|vstar)\b/g, '')
            .trim()
        : '';

    const fallbackSpecies = (() => {
      if (!speciesList || !card || card.supertype !== 'POKEMON') return null;
      const primaryName = card.primaryCard?.name || card.name || '';
      const base = normalize(primaryName).split(/\s+/).slice(-2).join(' ');
      const exact = speciesList.find((s: any) => normalize(s.nameEn) === normalize(primaryName) || normalize(s.nameEn) === base);
      if (exact) return exact;
      return speciesList.find((s: any) => normalize(s.nameEn).includes(base) || base.includes(normalize(s.nameEn)));
    })();

    const species = card?.supertype === 'POKEMON'
      ? ((card?.primaryCard as any)?.pokemonSpecies ?? fallbackSpecies)
      : null;

  // Find cards with same name (other variants)
  const { data: sameNameCards = [] } = useQuery({
    queryKey: ['sameName', card?.name, card?.webCardId],
    queryFn: async () => {
      if (!card?.name) return [];
      const cards = await searchCardsByName(card.name);
      // Filter to exact name matches only and exclude current card
      let filteredCards = cards.filter((c: any) =>
        c.name === card.name && c.webCardId !== card.webCardId
      );

      // For Pokemon cards, exclude cards with identical attacks
      if (card.supertype === 'POKEMON' && card.attacks) {
        filteredCards = filteredCards.filter((c: any) => {
          if (!c.attacks || c.attacks.length !== card.attacks.length) return true;
          
          // Check if attacks are identical
          const currentAttacks = JSON.stringify(card.attacks.map((attack: any) => ({
            name: attack.name,
            damage: attack.damage,
            text: attack.text || attack.effect,
            cost: attack.cost
          })));
          
          const cardAttacks = JSON.stringify(c.attacks.map((attack: any) => ({
            name: attack.name,
            damage: attack.damage,
            text: attack.text || attack.effect,
            cost: attack.cost
          })));
          
          return currentAttacks !== cardAttacks;
        });
      }

      // For Trainer cards, exclude cards with identical text/effects
      if (card.supertype === 'TRAINER' && card.text) {
        filteredCards = filteredCards.filter((c: any) => c.text !== card.text);
      }

      return filteredCards;
    },
    enabled: !!card?.name,
  });

  // Fetch related products for this card's expansion (matched by expansion code)
  // Use regionalExpansion.code first (e.g. "sv5k") which is the actual per-region release code,
  // falling back to primaryExpansion.code only when unavailable.
  const expansionCode = card?.regionalExpansion?.code || card?.primaryCard?.primaryExpansion?.code;
  const cardLanguage = card?.language;

  // Map card language to the product country value used in the DB
  const LANGUAGE_TO_COUNTRY: Record<string, string> = {
    JA_JP: 'Japan',
    ZH_TW: 'Hong Kong (ZH)',
    EN_US: 'Hong Kong (EN)',
  };
  const productCountry = cardLanguage ? LANGUAGE_TO_COUNTRY[cardLanguage] : undefined;

  const { data: relatedProducts = [] } = useQuery({
    queryKey: ['relatedProducts', expansionCode, productCountry],
    queryFn: async () => {
      if (!expansionCode) return [];
      try {
        const { data } = await apiClient.get('/products', {
          params: {
            expansionCode,
            productTypeGroup: 'expansion_series',
            ...(productCountry ? { country: productCountry } : {}),
            take: 10
          }
        });
        return data?.data || [];
      } catch (error) {
        console.error('Error fetching related products:', error);
        return [];
      }
    },
    enabled: !!expansionCode,
  });

  // Pick the most relevant product for this card's language/region.
  // For ZH_TW prefer HK/Taiwan products; for JA_JP prefer Japan; fall back to any with a date.
  const preferredProduct: any = (() => {
    if (!relatedProducts.length) return null;
    const COUNTRY_PREF: Record<string, string[]> = {
      ZH_TW: ['hong kong', 'taiwan', 'zh'],
      JA_JP: ['japan'],
      EN_US: ['united states', 'international', 'english', 'en'],
    };
    const prefs = COUNTRY_PREF[cardLanguage || ''] || [];
    if (prefs.length) {
      const match = relatedProducts.find((p: any) =>
        prefs.some(k => (p.country || '').toLowerCase().includes(k))
      );
      if (match) return match;
    }
    // No language preference match — return first with releaseDate (already sorted by date desc)
    return relatedProducts.find((p: any) => p.releaseDate) || relatedProducts[0];
  })();

  // Basic energy cards don't appear in competitive decks — skip related decks section
  const isBasicEnergy = card?.supertype === 'ENERGY' && Array.isArray(card?.subtypes) && card.subtypes.includes('BASIC_ENERGY');

  const { data: relatedDecks } = useQuery({
    queryKey: ['relatedDecks', card?.primaryCard?.id ?? webCardId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/cards/web/${webCardId}/related-decks`);
      return data;
    },
    enabled: !!card && !isBasicEnergy,
    staleTime: 1000 * 60 * 60, // cache for 1 hour
  });

  const { data: cardPrices } = useQuery({
    queryKey: ['card-prices', webCardId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/prices/${webCardId}`);
      return data;
    },
    enabled: !!card,
    staleTime: 1000 * 60 * 5,
  });

  const { data: priceHistory } = useQuery({
    queryKey: ['price-history', webCardId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/prices/${webCardId}/history`, { params: { days: 90 } });
      return data as Array<{ id: string; source: string; price: number; currency: string; date: string }>;
    },
    enabled: !!card,
    staleTime: 1000 * 60 * 5,
  });

  // Fetch full card data for the selected reference language
  const { data: refCard } = useQuery<CardDetail>({
    queryKey: ['card', refCardId],
    queryFn: () => fetchCardDetail(refCardId!),
    enabled: !!refCardId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch effect highlight keywords from DB (cached 1 hour — rarely changes)
  const { data: effectKeywords = [] } = useQuery<EffectKeywordRule[]>({
    queryKey: ['effect-keywords'],
    queryFn: async () => {
      const { data } = await apiClient.get('/cards/effect-keywords');
      return data as EffectKeywordRule[];
    },
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8">
          <div className="text-center">載入中...</div>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8">
          <div className="text-center text-red-600">找不到卡片資料</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

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
                {card.ruleBox && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full font-semibold">
                    {card.ruleBox}
                  </span>
                )}
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
                  <dd className="font-medium text-gray-900 flex flex-wrap items-center gap-2">
                    {card.sourceUrl ? (
                      <a
                        href={card.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        {currentVariant?.webCardId || card.webCardId}
                      </a>
                    ) : (
                      currentVariant?.webCardId || card.webCardId
                    )}
                    {(currentVariant?.language || card.language) === 'EN_US' && (() => {
                      const cardName = currentVariant?.name || card.name;
                      const setCode = card.regionalExpansion?.code?.toLowerCase();
                      const url = `https://www.pokemon.com/us/pokemon-tcg/pokemon-cards?cardName=${encodeURIComponent(cardName)}${setCode ? `&${setCode}=on` : ''}`;
                      return (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 hover:bg-red-100 text-xs rounded-full transition-colors font-normal"
                          title="Verify card data on official Pokémon.com TCG"
                        >
                          Pokémon.com TCG
                        </a>
                      );
                    })()}
                  </dd>
                </div>
                {currentVariant?.regionalExpansion && (
                  <div>
                    <dt className="text-sm text-gray-600">擴展包</dt>
                    <dd className="font-medium text-gray-900">
                      <Link
                        href={`/products?productTypeGroup=expansion_series&expansionCode=${encodeURIComponent(currentVariant.regionalExpansion.code)}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {currentVariant.regionalExpansion.primaryExpansion?.code || currentVariant.regionalExpansion.code}
                      </Link>
                      {currentVariant.regionalExpansion.name && (
                        <span className="text-sm text-gray-600 ml-1">({currentVariant.regionalExpansion.name})</span>
                      )}
                    </dd>
                  </div>
                )}
                {card.primaryCard?.primaryExpansion?.releaseDate && (
                  <div>
                    <dt className="text-sm text-gray-600">發行日期</dt>
                    <dd className="font-medium text-gray-900">
                      {new Date(card.primaryCard.primaryExpansion.releaseDate).toLocaleDateString('zh-TW')}
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
                {/* Added 擴展包 release date field */}
                <div className="flex justify-between">
                  <dt className="text-gray-600">擴展包發行日期</dt>
                  <dd className="font-medium text-gray-900">
                    {(() => {
                      const date = card.primaryCard.primaryExpansion?.releaseDate
                        || preferredProduct?.releaseDate;
                      return date
                        ? new Date(date).toLocaleDateString('zh-TW')
                        : 'N/A';
                    })()}
                  </dd>
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

            {/* Pokémon Species — multilingual names */}
            {card.supertype === 'POKEMON' && species && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">物種資訊</h2>
                  {species.dexNumber ? (
                    <a
                      href={`https://ptcg002.tcghk.trade/pokemon/${String(species.dexNumber).padStart(4, '0')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-500 hover:underline"
                      title={`View #${species.dexNumber} on internal Pokédex`}
                    >
                      #{String(species.dexNumber).padStart(4, '0')}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-500">#—</span>
                  )}

                  {species.form && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                      {species.form}
                    </span>
                  )}

                  {species.nameEn && (
                    <a
                      href={`https://www.pokemon.com/us/pokedex/${species.nameEn.toLowerCase().replace(/\s+/g, '-')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 hover:bg-red-100 text-xs rounded-full transition-colors"
                      title={`View ${species.nameEn} on official Pokédex`}
                    >
                      Pokédex
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-xs font-semibold text-gray-400 w-16 shrink-0">繁體中文</span>
                    <span className="font-medium text-gray-900">{species?.nameZhHant}</span>
                  </div>
                  <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-xs font-semibold text-gray-400 w-16 shrink-0">簡體中文</span>
                    <span className="font-medium text-gray-900">{species?.nameZhHans}</span>
                  </div>
                  <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-xs font-semibold text-gray-400 w-16 shrink-0">日文</span>
                    <span className="font-medium text-gray-900">{species?.nameJa}</span>
                  </div>
                  <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-xs font-semibold text-gray-400 w-16 shrink-0">English</span>
                    <span className="font-medium text-gray-900">{species?.nameEn}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Language Reference Picker ─────────────────────────────── */}
            {card.languageVariants && card.languageVariants.length > 0 && (
              <div className="bg-white rounded-lg px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-500 shrink-0">對比語言：</span>
                  {/* Current card pill */}
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-600 text-white ring-2 ring-blue-300">
                    {LANGUAGE_LABELS[card.language] || card.language} ●
                  </span>
                  {/* Linked language variant pills */}
                  {card.languageVariants.map((v) => {
                    const isRef = refCardId === v.webCardId;
                    return (
                      <button
                        key={v.webCardId}
                        onClick={() => setRefCardId(isRef ? null : v.webCardId)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          isRef
                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                            : 'bg-gray-100 text-gray-700 hover:bg-emerald-100 hover:text-emerald-800'
                        }`}
                        title={isRef ? '點擊取消對比' : '點擊對比此語言'}
                      >
                        {LANGUAGE_LABELS[v.language] || v.language}
                        {v.variantType && v.variantType !== 'NORMAL' && (
                          <span className="ml-1 opacity-70">·{v.variantType}</span>
                        )}
                        {isRef && <span className="ml-1">⇄</span>}
                      </button>
                    );
                  })}
                  {refCardId && (
                    <button
                      onClick={() => setRefCardId(null)}
                      className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                    >
                      ✕ 清除對比
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Trainer / Energy Card Text/Description */}
            {(card?.supertype === 'TRAINER' || card?.supertype === 'ENERGY') && (() => {
              // text may be null for some scraped cards; fall back to abilities[].text
              const effectText = card.text?.trim() ||
                (Array.isArray(card.abilities) ? card.abilities.map((a: any) => a.text || a.description).filter(Boolean).join('\n\n') : '') ||
                '';
              if (!effectText) return null;
              let label = '效果';
              if (card.supertype === 'TRAINER') {
                if (card.subtypes?.includes('SUPPORTER')) label = '效果 (Supporter Effect)';
                else if (card.subtypes?.includes('ITEM')) label = '效果 (Item Effect)';
                else if (card.subtypes?.includes('STADIUM')) label = '效果 (Stadium Effect)';
                else if (card.subtypes?.includes('TOOL')) label = '效果 (Tool Effect)';
              } else if (card.supertype === 'ENERGY') {
                label = '效果 (Energy Effect)';
              }
              return (
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <h2 className="text-xl font-semibold mb-3 text-gray-900">{label}</h2>
                  <p className="text-gray-800"><HighlightedText text={effectText} rules={effectKeywords} /></p>
                </div>
              );
            })()}
            {/* Abilities — only show for POKEMON cards, or TRAINER/ENERGY with named abilities */}
            {card.abilities && Array.isArray(card.abilities) && card.abilities.filter((a: any) => (a.text || a.description) && (card.supertype === 'POKEMON' || a.name)).length > 0 && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h2 className="text-xl font-semibold mb-3 text-gray-900">
                  {card.supertype === 'POKEMON' ? '特性' : '效果'}
                </h2>
                {card.abilities
                  .filter((a: any) => a.text || a.description)
                  .map((ability: any, index: number) => (
                    <div key={index} className="mb-4 last:mb-0">
                      {ability.name && <div className="font-semibold text-blue-700">{ability.name}</div>}
                      <div className="text-sm text-gray-800 mt-1">
                        <HighlightedText text={ability.text || ability.description} rules={effectKeywords} />
                      </div>
                    </div>
                  ))}
              </div>
            )}
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
                          <div className="text-sm text-gray-800 mt-1">
                            <HighlightedText text={attack.effect || attack.text} rules={effectKeywords} />
                          </div>
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

            {/* ── 2-Language Comparison Panel ───────────────────────────── */}
            {refCard && (() => {
              // Always use `card` (fully loaded) for the left column;
              // language variants from languageVariants[] are partial objects without abilities/attacks.
              const renderCardContent = (c: CardDetail, label: string, highlight: boolean) => {
                // For TRAINER/ENERGY: plain text field; for POKEMON: abilities + attacks
                const trainerText =
                  (c.supertype === 'TRAINER' || c.supertype === 'ENERGY')
                    ? (c.text?.trim() ||
                       (Array.isArray(c.abilities)
                         ? c.abilities.map((a: any) => a.text || a.description).filter(Boolean).join('\n\n')
                         : ''))
                    : '';
                const abilities = Array.isArray(c.abilities)
                  ? c.abilities.filter((a: any) => (a.text || a.description) && (c.supertype === 'POKEMON' || a.name))
                  : [];
                const attacks = Array.isArray(c.attacks) ? c.attacks : [];
                const hasContent = trainerText || abilities.length > 0 || attacks.length > 0;
                return (
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className={`text-sm font-semibold pb-1 border-b ${
                      highlight ? 'text-blue-700 border-blue-200' : 'text-emerald-700 border-emerald-200'
                    }`}>{label}</div>
                    {!hasContent && (
                      <p className="text-xs text-gray-400">無文字資料</p>
                    )}
                    {trainerText && (
                      <p className="text-sm text-gray-800">
                        {highlight ? <HighlightedText text={trainerText} rules={effectKeywords} /> : <span className="whitespace-pre-wrap">{trainerText}</span>}
                      </p>
                    )}
                    {abilities.map((a: any, i: number) => (
                      <div key={i}>
                        {a.name && (
                          <div className={`text-xs font-semibold mb-0.5 ${
                            highlight ? 'text-blue-700' : 'text-emerald-700'
                          }`}>
                            ★ {a.name}
                          </div>
                        )}
                        <p className="text-sm text-gray-800">
                          {highlight ? <HighlightedText text={a.text || a.description} rules={effectKeywords} /> : <span className="whitespace-pre-wrap">{a.text || a.description}</span>}
                        </p>
                      </div>
                    ))}
                    {attacks.map((atk: any, i: number) => (
                      <div key={i} className="pt-2 border-t border-gray-100 first:border-0 first:pt-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-semibold text-gray-900">{atk.name}</span>
                          {atk.damage && (
                            <span className="text-sm font-bold text-red-600">{atk.damage}</span>
                          )}
                        </div>
                        {(atk.effect || atk.text) && (
                          <p className="text-sm text-gray-700">
                            {highlight ? <HighlightedText text={atk.effect || atk.text} rules={effectKeywords} /> : <span className="whitespace-pre-wrap">{atk.effect || atk.text}</span>}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              };

              return (
                <div className="bg-white rounded-lg p-4 shadow-sm border border-emerald-100">
                  <div className="flex items-center gap-2 mb-4 text-sm">
                    <span className="font-semibold text-gray-600">語言對比</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                      {LANGUAGE_LABELS[card.language] || card.language}
                    </span>
                    <span className="text-gray-400">⇄</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                      {LANGUAGE_LABELS[refCard.language] || refCard.language}
                    </span>
                    <button
                      onClick={() => setRefCardId(null)}
                      className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 divide-x divide-gray-100">
                    {renderCardContent(card, LANGUAGE_LABELS[card.language] || card.language, true)}
                    <div className="pl-4">
                      {renderCardContent(refCard, LANGUAGE_LABELS[refCard.language] || refCard.language, false)}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Effect Tags */}
            {(card.primaryCard.cardTier || (card.primaryCard.effectTags?.length > 0) || (card.primaryCard.specialEffectTags?.length > 0)) && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <h2 className="text-xl font-semibold mb-3 text-gray-900">效果評級</h2>
                <div className="flex flex-wrap items-center gap-3">
                  {card.primaryCard.cardTier && (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                      card.primaryCard.cardTier === 'S+' ? 'bg-yellow-400 text-yellow-900' :
                      card.primaryCard.cardTier === 'S'  ? 'bg-yellow-300 text-yellow-900' :
                      card.primaryCard.cardTier === 'A+' ? 'bg-green-500 text-white' :
                      card.primaryCard.cardTier === 'A'  ? 'bg-green-400 text-white' :
                      card.primaryCard.cardTier === 'B+' ? 'bg-blue-500 text-white' :
                      card.primaryCard.cardTier === 'B'  ? 'bg-blue-400 text-white' :
                      card.primaryCard.cardTier === 'C+' ? 'bg-gray-400 text-white' :
                      card.primaryCard.cardTier === 'C'  ? 'bg-gray-300 text-gray-700' :
                      'bg-gray-200 text-gray-500'
                    }`}>
                      Tier {card.primaryCard.cardTier}
                    </span>
                  )}
                  {card.primaryCard.effectScore != null && (
                    <span className="text-sm text-gray-500">
                      分數：<span className="font-semibold text-gray-800">{card.primaryCard.effectScore.toFixed(1)}</span>
                    </span>
                  )}
                </div>
                {card.primaryCard.effectTags?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 mb-1">效果標籤</div>
                    <div className="flex flex-wrap gap-2">
                      {card.primaryCard.effectTags.map((tag: string) => (
                        <Link
                          key={tag}
                          href={`/cards?effectTag=${encodeURIComponent(tag)}`}
                          className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-medium hover:bg-blue-200 transition-colors cursor-pointer"
                          title={`篩選：${tag}`}
                        >
                          {tag}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {card.primaryCard.specialEffectTags?.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-gray-500 mb-1">特殊標籤</div>
                    <div className="flex flex-wrap gap-2">
                      {card.primaryCard.specialEffectTags.map((tag: string) => (
                        <Link
                          key={tag}
                          href={`/cards?effectTag=${encodeURIComponent(tag)}`}
                          className="px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 font-medium hover:bg-purple-200 transition-colors cursor-pointer"
                          title={`篩選：${tag}`}
                        >
                          {tag}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
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

            {/* Related Cards — synergy / named-card links */}
            {card.relatedCards && card.relatedCards.length > 0 && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xl font-semibold text-gray-900">相關卡片</h2>
                  <span className="text-sm text-gray-500">({card.relatedCards.length} 張)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {card.relatedCards.map((rel) => (
                    <Link
                      key={rel.relationId}
                      href={rel.webCardId ? `/cards/${rel.webCardId}` : '#'}
                      className="group flex flex-col gap-1"
                    >
                      <div className="aspect-[2.5/3.5] bg-gray-100 rounded-lg overflow-hidden border border-gray-200 group-hover:border-blue-400 transition-colors">
                        {rel.imageUrl ? (
                          <img src={rel.imageUrl} alt={rel.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">無圖片</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-700 text-center leading-tight">{rel.name}</div>
                      <div className="flex gap-1 justify-center flex-wrap">
                        {rel.ruleBox && (
                          <span className="text-[10px] px-1 rounded bg-orange-100 text-orange-700">{rel.ruleBox}</span>
                        )}
                        {rel.note && (
                          <span className="text-[10px] px-1 rounded bg-blue-100 text-blue-700 truncate max-w-[80px]" title={rel.note}>{rel.note}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Same Species Cards — cross-language versions of this Pokémon */}
            {card.sameSpeciesCards && card.sameSpeciesCards.length > 0 && (
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xl font-semibold text-gray-900">同物種其他版本</h2>
                  <span className="text-sm text-gray-500">({card.sameSpeciesCards.length} 張)</span>
                  {card.primaryCard?.pokemonSpecies && (
                    <span className="text-sm text-gray-400">
                      · {card.primaryCard.pokemonSpecies.nameEn} / {card.primaryCard.pokemonSpecies.nameZhHant}
                    </span>
                  )}
                </div>
                {/* Group by language */}
                {(['JA_JP', 'ZH_TW', 'EN_US'] as const).map((lang) => {
                  const langCards = card.sameSpeciesCards.filter((c) => c.language === lang);
                  if (langCards.length === 0) return null;
                  const langLabel = LANGUAGE_LABELS[lang] || lang;
                  return (
                    <div key={lang} className="mb-4 last:mb-0">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {langLabel} ({langCards.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {langCards.slice(0, 20).map((sc) => (
                          <Link
                            key={sc.webCardId}
                            href={`/cards/${sc.webCardId}`}
                            className="flex items-center gap-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg px-3 py-2 transition-all"
                          >
                            {sc.imageUrl && (
                              <img src={sc.imageUrl} alt={sc.name} className="w-8 h-10 object-contain rounded" />
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-900 truncate max-w-[140px]" title={sc.name}>
                                {sc.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {sc.primaryCard?.primaryExpansion?.code || sc.regionalExpansion?.code || '—'}
                                {sc.primaryCard?.cardNumber && ` #${sc.primaryCard.cardNumber}`}
                              </div>
                              {sc.rarity && (
                                <div className="text-xs text-blue-600">{sc.rarity.replace(/_/g, ' ')}</div>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
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
                  <dd className="font-medium text-gray-900">
                    {preferredProduct?.productName || (card.primaryCard.primaryExpansion?.code || card.primaryCard.primaryExpansionId)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">卡片編號</dt>
                  <dd className="font-medium text-gray-900">{card.primaryCard.cardNumber}</dd>
                </div>
                {(() => {
                    const date = card.primaryCard.primaryExpansion?.releaseDate
                      || preferredProduct?.releaseDate;
                    return date ? (
                      <div className="flex justify-between">
                        <dt className="text-gray-600">發行日期</dt>
                        <dd className="font-medium text-gray-900">
                          {new Date(date).toLocaleDateString('zh-TW')}
                        </dd>
                      </div>
                    ) : null;
                  })()}
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

            {/* Related Products */}
            {relatedProducts.length > 0 && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">相關產品</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {relatedProducts.map((product: any) => (
                    <Link
                      key={product.id}
                      href={`/products/${product.id}`}
                      className="block bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900 text-sm mb-1">
                            {product.name || product.productName}
                          </h3>
                          <div className="text-xs text-gray-600 space-y-1">
                            {product.country && (
                              <div>國家: {product.country}</div>
                            )}
                            {product.productType && (
                              <div>類型: {product.productType.nameZh || product.productType.code}</div>
                            )}
                            {product.releaseDate && (
                              <div>發行日期: {new Date(product.releaseDate).toLocaleDateString('zh-TW')}</div>
                            )}
                          </div>
                        </div>
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name || product.productName}
                            className="w-12 h-12 object-cover rounded ml-3 flex-shrink-0"
                          />
                        )}
                      </div>
                      <div className="text-xs text-blue-600 hover:text-blue-800">
                        查看產品詳情 →
                      </div>
                    </Link>
                  ))}
                </div>
                {relatedProducts.length >= 10 && (
                  <div className="mt-4 text-center">
                    <Link
                      href={`/products?expansionCode=${encodeURIComponent(card.primaryCard.primaryExpansion?.code || card.primaryCard.primaryExpansionId)}`}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      查看更多相關產品 →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Price History */}
            {((cardPrices?.prices?.length > 0) || ((priceHistory?.length ?? 0) > 0)) && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">市場價格</h2>

                {/* Current Prices */}
                {cardPrices?.prices?.length > 0 && (
                  <div className="mb-5">
                    <h3 className="text-sm font-medium text-gray-600 mb-3">目前售價</h3>
                    <div className="flex flex-wrap gap-3">
                      {cardPrices.prices.map((p: any) => (
                        <div key={p.id} className={`px-4 py-3 rounded-lg border ${p.inStock ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="text-xs text-gray-500 mb-1">{p.source}{p.condition ? ` · ${p.condition}` : ''}</div>
                          <div className="text-lg font-bold text-gray-900">
                            {p.currency === 'JPY' ? '¥' : '$'}{p.price.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {p.inStock ? '有庫存' : '無庫存'} · {new Date(p.fetchedAt).toLocaleDateString('zh-TW')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price History Chart */}
                {priceHistory && priceHistory.length > 0 && (() => {
                  // Group by source, then show a mini chart per source
                  const bySource: Record<string, typeof priceHistory> = {};
                  for (const h of priceHistory) {
                    if (!bySource[h.source]) bySource[h.source] = [];
                    bySource[h.source].push(h);
                  }
                  return (
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 mb-3">90日價格紀錄</h3>
                      {Object.entries(bySource).map(([source, entries]) => {
                        const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const maxPrice = Math.max(...sorted.map(e => e.price));
                        const minPrice = Math.min(...sorted.map(e => e.price));
                        const range = maxPrice - minPrice || 1;
                        const currency = sorted[0].currency;
                        return (
                          <div key={source} className="mb-4 last:mb-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-500">{source}</span>
                              <span className="text-xs text-gray-400">
                                {currency === 'JPY' ? '¥' : '$'}{minPrice.toLocaleString()} – {currency === 'JPY' ? '¥' : '$'}{maxPrice.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-end gap-0.5 h-12">
                              {sorted.map((entry, i) => {
                                const heightPct = ((entry.price - minPrice) / range) * 80 + 20;
                                return (
                                  <div
                                    key={entry.id}
                                    className="flex-1 bg-blue-400 hover:bg-blue-600 rounded-sm transition-colors cursor-default"
                                    style={{ height: `${heightPct}%` }}
                                    title={`${new Date(entry.date).toLocaleDateString('zh-TW')}: ${currency === 'JPY' ? '¥' : '$'}${entry.price.toLocaleString()}`}
                                  />
                                );
                              })}
                            </div>
                            <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                              <span>{new Date(sorted[0].date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}</span>
                              <span>{new Date(sorted[sorted.length - 1].date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Related Tournament Decks */}
            {!isBasicEnergy && relatedDecks && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">相關賽事牌組</h2>

                {relatedDecks.weeklyTrend && relatedDecks.weeklyTrend.length > 0 ? (
                  <>
                    {/* Weekly usage % bar chart */}
                    <div className="mb-5">
                      <h3 className="text-sm font-medium text-gray-600 mb-3">
                      每週使用率 (近1年) — 點擊週份查看牌組
                      {relatedDecks.versionCount > 1 && (
                        <span className="ml-2 text-xs font-normal text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                          合計 {relatedDecks.versionCount} 個版本
                        </span>
                      )}
                    </h3>
                      <div className="flex items-end gap-0.5 h-20">
                        {(() => {
                          const maxPct = Math.max(
                            ...relatedDecks.weeklyTrend.map((w: any) => w.usagePct ?? 0),
                            1
                          );
                          return relatedDecks.weeklyTrend.map((w: any) => {
                            const isSelected = selectedWeek === w.weekStart;
                            const pct = w.usagePct ?? 0;
                            const hasData = w.deckCount > 0;
                            return (
                              <button
                                key={w.weekStart}
                                className="flex-1 flex flex-col items-center gap-0.5 group"
                                onClick={() => setSelectedWeek(isSelected ? null : w.weekStart)}
                                title={`${new Date(w.weekStart).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}: ${pct}% (${w.deckCount}/${w.totalDecks} 牌組)`}
                              >
                                <span
                                  className={`text-[9px] whitespace-nowrap transition-opacity ${
                                    isSelected
                                      ? 'opacity-100 text-blue-700 font-bold'
                                      : 'opacity-0 group-hover:opacity-100 text-gray-500'
                                  }`}
                                >
                                  {pct > 0 ? `${pct}%` : ''}
                                </span>
                                <div
                                  className={`w-full rounded-sm transition-colors ${
                                    isSelected
                                      ? 'bg-blue-600'
                                      : hasData
                                      ? 'bg-blue-400 hover:bg-blue-500'
                                      : 'bg-gray-200'
                                  }`}
                                  style={{
                                    height: `${Math.max(hasData ? 4 : 2, (pct / maxPct) * 48)}px`,
                                  }}
                                />
                                <span
                                  className={`text-[8px] leading-tight ${
                                    isSelected ? 'text-blue-600 font-semibold' : 'text-gray-400'
                                  }`}
                                >
                                  {new Date(w.weekStart).toLocaleDateString('zh-TW', {
                                    month: 'numeric',
                                    day: 'numeric',
                                  })}
                                </span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        最高使用率:{' '}
                        {Math.max(
                          ...relatedDecks.weeklyTrend.map((w: any) => w.usagePct ?? 0),
                          0
                        ).toFixed(1)}
                        % · 共{' '}
                        {relatedDecks.weeklyTrend.reduce(
                          (s: number, w: any) => s + (w.deckCount ?? 0),
                          0
                        )}{' '}
                        個牌組 (近1年)
                      </p>
                    </div>

                    {/* Deck list for selected week or most recent week with data */}
                    {(() => {
                      const displayWeek = selectedWeek
                        ? relatedDecks.weeklyTrend.find((w: any) => w.weekStart === selectedWeek)
                        : relatedDecks.weeklyTrend
                            .filter((w: any) => (w.deckCount ?? 0) > 0)
                            .at(-1);

                      if (!displayWeek?.decks?.length) {
                        return (
                          <p className="text-sm text-gray-400">
                            {selectedWeek ? '此週無相關牌組記錄' : '近12週無賽事使用記錄'}
                          </p>
                        );
                      }

                      const weekLabel = new Date(displayWeek.weekStart).toLocaleDateString('zh-TW', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      });

                      return (
                        <div>
                          <h3 className="text-sm font-medium text-gray-600 mb-2 flex items-center gap-2">
                            <span>
                              {selectedWeek ? `${weekLabel} 週` : '最近相關牌組'} ({displayWeek.deckCount} 個 ·{' '}
                              {displayWeek.usagePct}% 使用率)
                            </span>
                            {selectedWeek && (
                              <button
                                className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                                onClick={() => setSelectedWeek(null)}
                              >
                                清除篩選 ×
                              </button>
                            )}
                          </h3>
                          <div className="space-y-2">
                            {displayWeek.decks.map((deck: any, i: number) => (
                              <div
                                key={deck.deckId}
                                className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100 hover:border-gray-300 transition-colors"
                              >
                                <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                                  {i + 1}
                                </span>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-200 text-gray-600">
                                  #{deck.placement}
                                </div>
                                {/* Key cards: ACE SPEC first, then main Pokemon */}
                                {deck.keyCards && deck.keyCards.length > 0 && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {deck.keyCards.slice(0, 4).map((kc: any) => (
                                      <div key={kc.webCardId} className="relative group" title={`${kc.name} ×${kc.quantity}`}>
                                        {kc.imageUrl ? (
                                          <img
                                            src={kc.imageUrl}
                                            alt={kc.name}
                                            className="w-8 h-11 object-cover rounded shadow-sm"
                                          />
                                        ) : (
                                          <div className="w-8 h-11 bg-gray-200 rounded flex items-center justify-center text-[8px] text-gray-500 text-center px-0.5">
                                            {kc.name}
                                          </div>
                                        )}
                                        {kc.rarity === 'ACE_SPEC' && (
                                          <span className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-900 text-[7px] font-bold px-0.5 rounded leading-tight">ACE</span>
                                        )}
                                        <span className="absolute -bottom-1 -right-1 bg-gray-700 text-white text-[7px] font-bold px-0.5 rounded leading-tight">×{kc.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {deck.playerName}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {deck.tournamentName}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {deck.tournamentDate
                                      ? new Date(deck.tournamentDate).toLocaleDateString('zh-TW')
                                      : ''}{' '}
                                    · ×{deck.quantity}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {deck.deckCode && (
                                    <>
                                      <a
                                        href={`https://www.pokemon-card.com/deck/confirm.html/deckID/${deck.deckCode}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-[10px] text-blue-500 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded transition-colors"
                                      >
                                        {deck.deckCode} ↗
                                      </a>
                                      <Link
                                        href={`/deck-builder/event/${deck.deckCode}`}
                                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 bg-blue-50 rounded transition-colors"
                                      >
                                        View
                                      </Link>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                            {displayWeek.deckCount > displayWeek.decks.length && (
                              <p className="text-xs text-gray-400 text-center pt-1">
                                顯示前 {displayWeek.decks.length} 個，共 {displayWeek.deckCount} 個牌組
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">近12週無賽事使用記錄</p>
                )}
              </div>
            )}

            {/* Language Variants / Different Versions */}
            {card.languageVariants && card.languageVariants.length > 0 && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">
                  其他版本 ({card.languageVariants.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {card.languageVariants.slice(0, showAllVariants ? card.languageVariants.length : 10).map((variant) => (
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
                    <button
                      onClick={() => setShowAllVariants(!showAllVariants)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {showAllVariants
                        ? `顯示前 10 個，共 ${card.languageVariants.length} 個版本`
                        : `顯示全部 ${card.languageVariants.length} 個版本`}
                    </button>
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
