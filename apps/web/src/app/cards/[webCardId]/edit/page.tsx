'use client';

import { use, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Plus, Trash2, Copy } from 'lucide-react';

interface RelatedCardEntry {
  webCardId: string;
  note: string;
  searchQuery: string;
  searchResults: any[];
  isSearching: boolean;
  searchTimeoutId?: NodeJS.Timeout;
}

interface TournamentUsageEntry {
  event: string;
  deckName: string;
  placement: string;
}

interface Ability {
  name: string;
  text: string;
  type: string;
}

interface Attack {
  name: string;
  cost: string[];
  damage: string;
  effect: string;
  text: string;
}

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
    expansionId: string;
    cardNumber: string;
    primaryExpansion: {
      code: string;
      nameEn: string;
      releaseDate: string | null;
    } | null;
  };
  regionalExpansion: {
    id: string;
    code: string;
    name: string;
    region: string;
    primaryExpansionId: string;
  } | null;
}

export default function CardEditPage({ params }: { params: Promise<{ webCardId: string }> }) {
  const { webCardId } = use(params);
  const [relatedCards, setRelatedCards] = useState<RelatedCardEntry[]>([
    { webCardId: '', note: '', searchQuery: '', searchResults: [], isSearching: false },
  ]);
  const [evolutionChain, setEvolutionChain] = useState({
    base: '',
    stage1: '',
    stage2: '',
  });
  const [tournamentUsage, setTournamentUsage] = useState<TournamentUsageEntry[]>([
    { event: '', deckName: '', placement: '' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Card data state
  const [cardData, setCardData] = useState({
    name: '',
    supertype: 'POKEMON' as 'POKEMON' | 'TRAINER' | 'ENERGY',
    subtypes: [] as string[],
    hp: '',
    types: [] as string[],
    ruleBox: '' as '' | 'EX' | 'GX' | 'V' | 'VMAX' | 'VSTAR' | 'RADIANT' | 'MEGA',
    rarity: '' as '' | 'COMMON' | 'UNCOMMON' | 'RARE' | 'DOUBLE_RARE' | 'ULTRA_RARE' | 'ILLUSTRATION_RARE' | 'SPECIAL_ILLUSTRATION_RARE' | 'HYPER_RARE' | 'PROMO' | 'AMAZING_RARE' | 'SHINY_RARE' | 'ACE_SPEC',
    variantType: 'NORMAL' as 'NORMAL' | 'REVERSE_HOLO' | 'HOLO' | '1ST_EDITION' | 'SHINY' | 'FULL_ART' | 'ALT_ART',
    evolutionStage: '' as '' | 'BASIC' | 'STAGE_1' | 'STAGE_2',
    evolvesFrom: '',
    evolvesTo: '',
    artist: '',
    regulationMark: '',
    customReleaseDate: '',
    imageUrl: '',
    imageUrlHiRes: '',
    sourceUrl: '',
    flavorText: '',
    text: '',
    rules: [] as string[],
    abilities: [] as Ability[],
    attacks: [] as Attack[],
    language: 'EN_US' as string,
    weaknesses: null as any,
    resistances: null as any,
    retreatCost: null as any,
    region: '' as string,
    scrapedAt: null as string | null,
  });


  const updateCardData = (key: string, value: any) => {
    setCardData(prev => ({ ...prev, [key]: value }));
  };

  // Fetch existing card data
  const { data: card, isLoading, error } = useQuery<CardDetail>({
    queryKey: ['card', webCardId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/cards/web/${webCardId}`);
      return data;
    },
  });

  // Populate form when card data loads
  useEffect(() => {
    if (card) {
      setCardData({
        name: card.name || '',
        supertype: card.supertype as 'POKEMON' | 'TRAINER' | 'ENERGY' || 'POKEMON',
        subtypes: card.subtypes || [],
        hp: card.hp ? card.hp.toString() : '',
        types: Array.isArray(card.types) ? card.types : (card.types ? [card.types] : []),
        rarity: (card.rarity as '' | 'COMMON' | 'UNCOMMON' | 'RARE' | 'DOUBLE_RARE' | 'ULTRA_RARE' | 'ILLUSTRATION_RARE' | 'SPECIAL_ILLUSTRATION_RARE' | 'HYPER_RARE' | 'PROMO' | 'AMAZING_RARE' | 'SHINY_RARE' | 'ACE_SPEC') || '',
        variantType: (card.variantType as 'NORMAL' | 'REVERSE_HOLO' | 'HOLO' | '1ST_EDITION' | 'SHINY' | 'FULL_ART' | 'ALT_ART') || 'NORMAL',
        imageUrl: card.imageUrl || '',
        imageUrlHiRes: '',
        sourceUrl: card.sourceUrl || '',
        artist: card.artist || '',
        regulationMark: card.regulationMark || '',
        customReleaseDate: card.primaryCard?.primaryExpansion?.releaseDate ? new Date(card.primaryCard.primaryExpansion.releaseDate).toISOString().split('T')[0] : '',
        ruleBox: (card.ruleBox as '' | 'EX' | 'GX' | 'V' | 'VMAX' | 'VSTAR' | 'RADIANT' | 'MEGA') || '',
        text: card.text || '',
        flavorText: '',
        rules: [],
        abilities: (card.abilities || []).map((ability: any) => ({
          name: ability.name || '',
          text: ability.description || ability.text || '',
          type: ability.type || 'ABILITY'
        })),
        attacks: (card.attacks || []).map((attack: any) => ({
          name: attack.name || '',
          cost: Array.isArray(attack.cost) ? attack.cost : [],
          damage: attack.damage || '',
          effect: attack.effect || '',
          text: attack.effect || attack.text || ''
        })),
        evolvesFrom: card.evolvesFrom || '',
        evolvesTo: card.evolvesTo || '',
        evolutionStage: (card.evolutionStage as '' | 'BASIC' | 'STAGE_1' | 'STAGE_2') || '',
        language: card.language || 'EN_US',
        weaknesses: card.weaknesses,
        resistances: card.resistances,
        retreatCost: card.retreatCost,
        region: card.region || '',
        scrapedAt: card.scrapedAt,
      });
    }
  }, [card]);

  // Cleanup search timeouts on unmount
  useEffect(() => {
    return () => {
      relatedCards.forEach(link => {
        if (link.searchTimeoutId) {
          clearTimeout(link.searchTimeoutId);
        }
      });
    };
  }, [relatedCards]);

  const addType = (type: string) => {
    if (!cardData.types.includes(type)) {
      setCardData(prev => ({ ...prev, types: [...prev.types, type] }));
    }
  };

  const removeType = (type: string) => {
    setCardData(prev => ({ ...prev, types: prev.types.filter(t => t !== type) }));
  };

  const addSubtype = (subtype: string) => {
    if (!cardData.subtypes.includes(subtype)) {
      setCardData(prev => ({ ...prev, subtypes: [...prev.subtypes, subtype] }));
    }
  };

  const removeSubtype = (subtype: string) => {
    setCardData(prev => ({ ...prev, subtypes: prev.subtypes.filter(s => s !== subtype) }));
  };

  const addRule = () => {
    setCardData(prev => ({ ...prev, rules: [...prev.rules, ''] }));
  };

  const updateRule = (index: number, value: string) => {
    setCardData(prev => ({
      ...prev,
      rules: prev.rules.map((rule, i) => i === index ? value : rule)
    }));
  };

  const removeRule = (index: number) => {
    setCardData(prev => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
  };

  const addAbility = () => {
    setCardData(prev => ({
      ...prev,
      abilities: [...prev.abilities, { name: '', text: '', type: 'ABILITY' }]
    }));
  };

  const updateAbility = (index: number, key: keyof Ability, value: string) => {
    setCardData(prev => ({
      ...prev,
      abilities: prev.abilities.map((ability, i) =>
        i === index ? { ...ability, [key]: value } : ability
      )
    }));
  };

  const removeAbility = (index: number) => {
    setCardData(prev => ({
      ...prev,
      abilities: prev.abilities.filter((_, i) => i !== index)
    }));
  };

  const addAttack = () => {
    setCardData(prev => ({
      ...prev,
      attacks: [...prev.attacks, { name: '', cost: [], damage: '', effect: '', text: '' }]
    }));
  };

  const updateAttack = (index: number, key: keyof Attack, value: any) => {
    setCardData(prev => ({
      ...prev,
      attacks: prev.attacks.map((attack, i) =>
        i === index ? { ...attack, [key]: value } : attack
      )
    }));
  };

  const removeAttack = (index: number) => {
    setCardData(prev => ({
      ...prev,
      attacks: prev.attacks.filter((_, i) => i !== index)
    }));
  };

  const addRelatedLink = () => {
    setRelatedCards(prev => [...prev, { webCardId: '', note: '', searchQuery: '', searchResults: [], isSearching: false }]);
  };

  const updateRelatedLink = (index: number, key: keyof RelatedCardEntry, value: string) => {
    setRelatedCards(prev => prev.map((link, i) =>
      i === index ? { ...link, [key]: value } : link
    ));

    // Trigger search when searchQuery changes
    if (key === 'searchQuery') {
      // Debounce search
      const timeoutId = setTimeout(() => {
        searchCards(value, index);
      }, 300);

      // Clear previous timeout
      setRelatedCards(prev => prev.map((link, i) =>
        i === index ? { ...link, searchTimeoutId: timeoutId } : link
      ));
    }
  };

  const removeRelatedLink = (index: number) => {
    setRelatedCards(prev => prev.filter((_, i) => i !== index));
  };

  const searchCards = async (query: string, index: number) => {
    if (!query.trim()) {
      setRelatedCards(prev => prev.map((link, i) =>
        i === index ? { ...link, searchResults: [], isSearching: false } : link
      ));
      return;
    }

    setRelatedCards(prev => prev.map((link, i) =>
      i === index ? { ...link, isSearching: true } : link
    ));

    try {
      const { data } = await apiClient.get('/cards', {
        params: { name: query, take: 5 }
      });
      setRelatedCards(prev => prev.map((link, i) =>
        i === index ? { ...link, searchResults: data, isSearching: false } : link
      ));
    } catch (error) {
      console.error('Search failed:', error);
      setRelatedCards(prev => prev.map((link, i) =>
        i === index ? { ...link, searchResults: [], isSearching: false } : link
      ));
    }
  };

  const selectCard = (index: number, card: any) => {
    setRelatedCards(prev => prev.map((link, i) =>
      i === index ? {
        ...link,
        webCardId: card.webCardId,
        searchQuery: card.name,
        searchResults: []
      } : link
    ));
  };

  const saveCard = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      // Transform the data to match the API DTO
      const updateData = {
        name: cardData.name,
        hp: cardData.hp ? parseInt(cardData.hp.toString()) : null,
        types: cardData.types,
        supertype: cardData.supertype,
        subtypes: cardData.subtypes,
        rarity: cardData.rarity,
        variantType: cardData.variantType,
        language: cardData.language,
        imageUrl: cardData.imageUrl,
        sourceUrl: cardData.sourceUrl,
        artist: cardData.artist,
        regulationMark: cardData.regulationMark,
        ruleBox: cardData.ruleBox,
        text: cardData.text,
        abilities: cardData.abilities,
        attacks: cardData.attacks,
        weaknesses: cardData.weaknesses,
        resistances: cardData.resistances,
        retreatCost: cardData.retreatCost,
        evolvesFrom: cardData.evolvesFrom,
        evolvesTo: cardData.evolvesTo,
        evolutionStage: cardData.evolutionStage,
        region: cardData.region,
        scrapedAt: cardData.scrapedAt
      };

      await apiClient.patch(`/cards/web/${webCardId}`, updateData);

      // Redirect to card detail page on success
      window.location.href = `/cards/${webCardId}`;
    } catch (error: any) {
      console.error('Save failed:', error);
      setSaveError(error.response?.data?.message || '儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="w-full px-6 py-8">
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-600">載入中...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="text-red-800">載入卡片資料時發生錯誤: {error.message}</div>
          </div>
        )}

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="text-red-800">儲存失敗: {saveError}</div>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* Back Button */}
            <Link
              href={`/cards/${webCardId}`}
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
            >
              ← 返回卡片詳情
            </Link>

        <div className="flex gap-8">
          {/* Card Image Display */}
          <div className="w-3/10 bg-white rounded-lg p-6 shadow-sm">
            <div className="mb-6">
              {cardData.imageUrl ? (
                <img
                  src={cardData.imageUrl}
                  alt={cardData.name || '卡片圖片'}
                  className="w-full h-auto rounded-lg"
                />
              ) : (
                <div className="aspect-[2.5/3.5] bg-gray-100 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400">無圖片</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveCard}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? '儲存中...' : '儲存變更'}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Copy current card data to create new card
                  const newCardData = { ...cardData };
                  // Clear the webCardId to create a new card
                  // Note: In a real implementation, this would generate a new ID
                  alert('複製卡片功能待實現 - 需要 API 支援');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Copy className="w-4 h-4" />
                複製為新卡片
              </button>
              <Link
                href={`/cards/${webCardId}`}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50"
              >
                取消編輯
              </Link>
            </div>
          </div>

          {/* Edit Form */}
          <div className="flex-1 space-y-6">
            {/* Basic Information */}
            <section className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">基本資訊</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">卡片名稱</label>
                  <input
                    type="text"
                    value={cardData.name}
                    onChange={(e) => updateCardData('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="卡片名稱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">卡片類型</label>
                  <select
                    value={cardData.supertype}
                    onChange={(e) => updateCardData('supertype', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  >
                    <option value="POKEMON">寶可夢</option>
                    <option value="TRAINER">訓練家</option>
                    <option value="ENERGY">能量</option>
                  </select>
                </div>
                {cardData.supertype === 'POKEMON' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">HP</label>
                    <input
                      type="number"
                      value={cardData.hp}
                      onChange={(e) => updateCardData('hp', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                      placeholder="HP 值"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">稀有度</label>
                  <select
                    value={cardData.rarity}
                    onChange={(e) => updateCardData('rarity', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  >
                    <option value="">選擇稀有度</option>
                    <option value="COMMON">普通</option>
                    <option value="UNCOMMON">非普通</option>
                    <option value="RARE">稀有</option>
                    <option value="DOUBLE_RARE">雙稀有</option>
                    <option value="ULTRA_RARE">極稀有</option>
                    <option value="ILLUSTRATION_RARE">畫師稀有</option>
                    <option value="SPECIAL_ILLUSTRATION_RARE">特殊畫師稀有</option>
                    <option value="HYPER_RARE">超稀有</option>
                    <option value="PROMO">特典</option>
                    <option value="AMAZING_RARE">驚奇稀有</option>
                    <option value="SHINY_RARE">閃光稀有</option>
                    <option value="ACE_SPEC">王牌規格</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">變體類型</label>
                  <select
                    value={cardData.variantType}
                    onChange={(e) => updateCardData('variantType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  >
                    <option value="NORMAL">普通</option>
                    <option value="REVERSE_HOLO">反轉全息</option>
                    <option value="HOLO">全息</option>
                    <option value="1ST_EDITION">首版</option>
                    <option value="SHINY">閃光</option>
                    <option value="FULL_ART">全圖</option>
                    <option value="ALT_ART">替代圖</option>
                  </select>
                </div>
                {cardData.supertype === 'POKEMON' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">進化階段</label>
                      <select
                        value={cardData.evolutionStage}
                        onChange={(e) => updateCardData('evolutionStage', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                      >
                        <option value="">選擇進化階段</option>
                        <option value="BASIC">基礎</option>
                        <option value="STAGE_1">1 階進化</option>
                        <option value="STAGE_2">2 階進化</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">進化自</label>
                      <input
                        type="text"
                        value={cardData.evolvesFrom}
                        onChange={(e) => updateCardData('evolvesFrom', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                        placeholder="進化來源卡片名稱"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">進化至</label>
                      <input
                        type="text"
                        value={cardData.evolvesTo}
                        onChange={(e) => updateCardData('evolvesTo', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                        placeholder="進化目標卡片名稱"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">繪師</label>
                  <input
                    type="text"
                    value={cardData.artist}
                    onChange={(e) => updateCardData('artist', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="繪師名稱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">規格標記</label>
                  <input
                    type="text"
                    value={cardData.regulationMark}
                    onChange={(e) => updateCardData('regulationMark', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="例: A, B, C..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">自訂發行日期</label>
                  <input
                    type="date"
                    value={cardData.customReleaseDate}
                    onChange={(e) => updateCardData('customReleaseDate', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="選擇發行日期"
                  />
                </div>
              </div>
            </section>

            {/* Pokemon-specific fields */}
            {cardData.supertype === 'POKEMON' && (
              <>
                {/* Types */}
                <section className="bg-white rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">屬性</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">選擇屬性</label>
                      <div className="flex flex-wrap gap-2">
                        {['COLORLESS', 'DARKNESS', 'DRAGON', 'FAIRY', 'FIGHTING', 'FIRE', 'GRASS', 'LIGHTNING', 'METAL', 'PSYCHIC', 'WATER'].map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => addType(type)}
                            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full"
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-2">已選屬性</label>
                      <div className="flex flex-wrap gap-2">
                        {cardData.types.map(type => (
                          <span key={type} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {type}
                            <button
                              type="button"
                              onClick={() => removeType(type)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Rule Box */}
                <section className="bg-white rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">規則框</h2>
                  <select
                    value={cardData.ruleBox}
                    onChange={(e) => updateCardData('ruleBox', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  >
                    <option value="">無規則框</option>
                    <option value="EX">EX</option>
                    <option value="GX">GX</option>
                    <option value="V">V</option>
                    <option value="VMAX">VMAX</option>
                    <option value="VSTAR">VSTAR</option>
                    <option value="RADIANT">RADIANT</option>
                    <option value="MEGA">MEGA</option>
                  </select>
                </section>
              </>
            )}

            {/* Subtypes */}
            <section className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">子類型</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-blue-700 mb-2">選擇子類型</label>
                  <div className="flex flex-wrap gap-2">
                    {['ITEM', 'SUPPORTER', 'STADIUM', 'TOOL', 'BASIC_ENERGY', 'SPECIAL_ENERGY', 'TERA'].map(subtype => (
                      <button
                        key={subtype}
                        type="button"
                        onClick={() => addSubtype(subtype)}
                        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full"
                      >
                        {subtype}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">已選子類型</label>
                  <div className="flex flex-wrap gap-2">
                    {cardData.subtypes.map(subtype => (
                      <span key={subtype} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        {subtype}
                        <button
                          type="button"
                          onClick={() => removeSubtype(subtype)}
                          className="text-green-600 hover:text-green-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Text Content */}
            <section className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">文字內容</h2>
              <div className="space-y-4">
                {cardData.supertype === 'TRAINER' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">效果文字</label>
                    <textarea
                      value={cardData.text}
                      onChange={(e) => updateCardData('text', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                      placeholder="訓練家卡片的效果描述"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">風格文字</label>
                  <textarea
                    value={cardData.flavorText}
                    onChange={(e) => updateCardData('flavorText', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="卡片底部的風格文字"
                  />
                </div>
              </div>
            </section>

            {/* Rules */}
            <section className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">規則</h2>
                <button
                  type="button"
                  onClick={addRule}
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Plus className="w-4 h-4" />
                  新增規則
                </button>
              </div>
              <div className="space-y-3">
                {cardData.rules.map((rule, index) => (
                  <div key={index} className="flex gap-3">
                    <input
                      type="text"
                      value={rule}
                      onChange={(e) => updateRule(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-black"
                      placeholder="規則文字"
                    />
                    <button
                      type="button"
                      onClick={() => removeRule(index)}
                      className="flex items-center justify-center text-gray-400 hover:text-red-500 p-2"
                      aria-label="移除規則"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Abilities */}
            {cardData.supertype === 'POKEMON' && (
              <section className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">特性</h2>
                  <button
                    type="button"
                    onClick={addAbility}
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="w-4 h-4" />
                    新增特性
                  </button>
                </div>
                <div className="space-y-4">
                  {cardData.abilities.map((ability, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <input
                          type="text"
                          placeholder="特性名稱"
                          value={ability.name}
                          onChange={(e) => updateAbility(index, 'name', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-black"
                        />
                        <select
                          value={ability.type}
                          onChange={(e) => updateAbility(index, 'type', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-black"
                        >
                          <option value="ABILITY">ABILITY</option>
                          <option value="POKEMON_POWER">POKEMON_POWER</option>
                          <option value="POKEPOWER">POKEPOWER</option>
                          <option value="POKEBODY">POKEBODY</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeAbility(index)}
                          className="flex items-center justify-center text-gray-400 hover:text-red-500"
                          aria-label="移除特性"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        placeholder="特性效果描述"
                        value={ability.text}
                        onChange={(e) => updateAbility(index, 'text', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Attacks */}
            {cardData.supertype === 'POKEMON' && (
              <section className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">招式</h2>
                  <button
                    type="button"
                    onClick={addAttack}
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="w-4 h-4" />
                    新增招式
                  </button>
                </div>
                <div className="space-y-4">
                  {cardData.attacks.map((attack, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                        <input
                          type="text"
                          placeholder="招式名稱"
                          value={attack.name}
                          onChange={(e) => updateAttack(index, 'name', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-black"
                        />
                        <input
                          type="text"
                          placeholder="傷害"
                          value={attack.damage}
                          onChange={(e) => updateAttack(index, 'damage', e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-black"
                        />
                        <input
                          type="text"
                          placeholder="能量花費 (例: F,F,C)"
                          value={attack.cost.join(',')}
                          onChange={(e) => updateAttack(index, 'cost', e.target.value.split(',').map(s => s.trim()))}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-black"
                        />
                        <button
                          type="button"
                          onClick={() => removeAttack(index)}
                          className="flex items-center justify-center text-gray-400 hover:text-red-500"
                          aria-label="移除招式"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        placeholder="招式效果描述"
                        value={attack.effect}
                        onChange={(e) => updateAttack(index, 'effect', e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black mb-2"
                      />
                      <textarea
                        placeholder="額外文字"
                        value={attack.text}
                        onChange={(e) => updateAttack(index, 'text', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Images and URLs */}
            <section className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">圖片與連結</h2>
              
              {/* Card Image Display */}
              <div className="mb-6 flex justify-center">
                {cardData.imageUrl ? (
                  <img
                    src={cardData.imageUrl}
                    alt={cardData.name || '卡片圖片'}
                    className="max-w-xs h-auto rounded-lg shadow-sm"
                  />
                ) : (
                  <div className="w-48 h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-400">無圖片</span>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">圖片 URL</label>
                  <input
                    type="url"
                    value={cardData.imageUrl}
                    onChange={(e) => updateCardData('imageUrl', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="卡片圖片 URL"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">高解析度圖片 URL</label>
                  <input
                    type="url"
                    value={cardData.imageUrlHiRes}
                    onChange={(e) => updateCardData('imageUrlHiRes', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="高解析度圖片 URL"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">來源 URL</label>
                  <input
                    type="url"
                    value={cardData.sourceUrl}
                    onChange={(e) => updateCardData('sourceUrl', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                    placeholder="官方網站來源 URL"
                  />
                </div>
              </div>
            </section>

            {/* Related Links */}
            <section className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">相關連結</h2>
                <button
                  type="button"
                  onClick={addRelatedLink}
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Plus className="w-4 h-4" />
                  新增連結
                </button>
              </div>
              <div className="space-y-6">
                {relatedCards.map((link, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">搜尋卡片</label>
                        <input
                          type="text"
                          value={link.searchQuery}
                          onChange={(e) => updateRelatedLink(index, 'searchQuery', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                          placeholder="輸入卡片名稱或 ID"
                        />
                        {link.isSearching && (
                          <div className="absolute right-3 top-9 text-gray-400">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                          </div>
                        )}
                        {link.searchResults.length > 0 && (
                          <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                            {link.searchResults.map((card: any) => (
                              <div
                                key={card.webCardId}
                                className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onClick={() => selectCard(index, card)}
                              >
                                <div className="flex items-center gap-3">
                                  {card.imageUrl && (
                                    <img
                                      src={card.imageUrl}
                                      alt={card.name}
                                      className="w-8 h-8 object-cover rounded"
                                    />
                                  )}
                                  <div>
                                    <div className="font-medium text-sm">{card.name}</div>
                                    <div className="text-xs text-gray-500">{card.webCardId}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
                        <input
                          type="text"
                          value={link.note}
                          onChange={(e) => updateRelatedLink(index, 'note', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                          placeholder="關聯說明"
                        />
                      </div>
                    </div>

                    {/* Card Image Display */}
                    {link.webCardId && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">卡片圖片</label>
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0">
                            {link.searchResults.find((card: any) => card.webCardId === link.webCardId)?.imageUrl ? (
                              <img
                                src={link.searchResults.find((card: any) => card.webCardId === link.webCardId)?.imageUrl}
                                alt={link.searchQuery}
                                className="w-20 h-28 object-cover rounded-lg border border-gray-200"
                              />
                            ) : (
                              <div className="w-20 h-28 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                                <span className="text-xs text-gray-400">載入中...</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">{link.searchQuery}</div>
                            <div className="text-xs text-gray-500">ID: {link.webCardId}</div>
                            {link.note && (
                              <div className="text-xs text-gray-600 mt-1">備註: {link.note}</div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRelatedLink(index)}
                            className="flex items-center justify-center text-gray-400 hover:text-red-500 p-2"
                            aria-label="移除連結"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {!link.webCardId && (
                      <div className="flex justify-end mt-4">
                        <button
                          type="button"
                          onClick={() => removeRelatedLink(index)}
                          className="flex items-center justify-center text-gray-400 hover:text-red-500 px-2 py-2"
                          aria-label="移除連結"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
