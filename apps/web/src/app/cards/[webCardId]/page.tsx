'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit2, Save, X, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { toast } from 'sonner';

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
  text: string | null;
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
  const { data } = await apiClient.get(`/cards/web/${webCardId}`);
  return data;
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
  ZH_HK: '繁中',
  EN_US: '英文',
  ZH_TW: '繁中',
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
  const queryClient = useQueryClient();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCard, setEditedCard] = useState<Partial<CardDetail> | null>(null);

  const { data: card, isLoading, error } = useQuery<CardDetail>({
    queryKey: ['card', webCardId],
    queryFn: () => fetchCardDetail(webCardId),
  });

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

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (updatedData: Partial<CardDetail>) => {
      const { data } = await apiClient.patch(`/cards/web/${webCardId}`, updatedData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', webCardId] });
      setIsEditMode(false);
      setEditedCard(null);
      toast.success('卡片更新成功');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || '更新失敗');
    },
  });

  const handleEditToggle = () => {
    if (isEditMode) {
      // Cancel edit
      setEditedCard(null);
      setIsEditMode(false);
    } else {
      // Start edit
      setEditedCard(card ? { ...card } : null);
      setIsEditMode(true);
    }
  };

  const handleSave = () => {
    if (editedCard) {
      saveMutation.mutate(editedCard);
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setEditedCard(prev => prev ? { ...prev, [field]: value } : null);
  };

  const displayCard = isEditMode && editedCard ? editedCard : card;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="text-center">載入中...</div>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="text-center text-red-600">找不到卡片資料</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          
          <div className="flex gap-2">
            {isEditMode ? (
              <>
                <button
                  onClick={handleEditToggle}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                >
                  <X className="w-4 h-4" />
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saveMutation.isPending ? '儲存中...' : '儲存'}
                </button>
              </>
            ) : (
              <button
                onClick={handleEditToggle}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Edit2 className="w-4 h-4" />
                編輯模式
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Card Image & Quick Actions */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              {displayCard?.imageUrl ? (
                <img
                  src={displayCard.imageUrl}
                  alt={displayCard.name || ''}
                  className="w-full h-auto rounded"
                />
              ) : (
                <div className="aspect-[2.5/3.5] bg-gray-100 rounded flex items-center justify-center">
                  <span className="text-gray-400 text-sm">無圖片</span>
                </div>
              )}

              {isEditMode && (
                <div className="mt-3">
                  <label className="block text-xs text-gray-600 mb-1">圖片 URL</label>
                  <input
                    type="text"
                    value={editedCard?.imageUrl || ''}
                    onChange={(e) => handleFieldChange('imageUrl', e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded"
                    placeholder="圖片網址"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Middle & Right Columns: Card Details - Compact Layout */}
          <div className="lg:col-span-2 space-y-4">
            {/* Basic Info - Compact */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Name */}
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">卡片名稱</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.name || ''}
                      onChange={(e) => handleFieldChange('name', e.target.value)}
                      className="w-full px-2 py-1 text-lg font-bold border rounded"
                    />
                  ) : (
                    <h1 className="text-2xl font-bold text-gray-900">{displayCard?.name}</h1>
                  )}
                </div>

                {/* Type & Supertype */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">類型</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.supertype || ''}
                      onChange={(e) => handleFieldChange('supertype', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 text-sm rounded">
                      {SUPERTYPE_LABELS[displayCard?.supertype || ''] || displayCard?.supertype}
                    </span>
                  )}
                </div>

                {/* HP */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">HP</label>
                  {isEditMode ? (
                    <input
                      type="number"
                      value={editedCard?.hp || ''}
                      onChange={(e) => handleFieldChange('hp', parseInt(e.target.value) || null)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm font-medium">{displayCard?.hp || '—'}</div>
                  )}
                </div>

                {/* Types */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">屬性</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={Array.isArray(editedCard?.types) ? editedCard.types.join(', ') : editedCard?.types || ''}
                      onChange={(e) => handleFieldChange('types', e.target.value.split(',').map(t => t.trim()))}
                      className="w-full px-2 py-1 text-sm border rounded"
                      placeholder="GRASS, FIRE"
                    />
                  ) : (
                    displayCard?.types && (
                      <span className={`inline-block px-2 py-0.5 text-white text-sm rounded ${TYPE_COLORS[Array.isArray(displayCard.types) ? displayCard.types[0] : displayCard.types] || 'bg-gray-500'}`}>
                        {Array.isArray(displayCard.types) ? displayCard.types.join(', ') : displayCard.types}
                      </span>
                    )
                  )}
                </div>

                {/* Rarity */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">稀有度</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.rarity || ''}
                      onChange={(e) => handleFieldChange('rarity', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm">{displayCard?.rarity || '—'}</div>
                  )}
                </div>

                {/* Evolution Stage */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">進化階段</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.evolutionStage || ''}
                      onChange={(e) => handleFieldChange('evolutionStage', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm">{displayCard?.evolutionStage || '—'}</div>
                  )}
                </div>

                {/* Evolves From */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">進化自</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.evolvesFrom || ''}
                      onChange={(e) => handleFieldChange('evolvesFrom', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm">{displayCard?.evolvesFrom || '—'}</div>
                  )}
                </div>

                {/* Evolves To */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">可進化成</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.evolvesTo || ''}
                      onChange={(e) => handleFieldChange('evolvesTo', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                      placeholder="多個用逗號分隔"
                    />
                  ) : (
                    <div className="text-sm">{displayCard?.evolvesTo || '—'}</div>
                  )}
                </div>

                {/* Artist */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">繪師</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.artist || ''}
                      onChange={(e) => handleFieldChange('artist', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm">{displayCard?.artist || '—'}</div>
                  )}
                </div>

                {/* Regulation Mark */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">規格標記</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.regulationMark || ''}
                      onChange={(e) => handleFieldChange('regulationMark', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm">{displayCard?.regulationMark || '—'}</div>
                  )}
                </div>

                {/* Language */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">語言</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.language || ''}
                      onChange={(e) => handleFieldChange('language', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm">{LANGUAGE_LABELS[displayCard?.language || ''] || displayCard?.language}</div>
                  )}
                </div>

                {/* Variant Type */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">變體類型</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedCard?.variantType || ''}
                      onChange={(e) => handleFieldChange('variantType', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  ) : (
                    <div className="text-sm">{displayCard?.variantType}</div>
                  )}
                </div>

                {/* Expansion Info */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">擴展包</label>
                  <div className="text-sm">
                    {displayCard?.regionalExpansion?.primaryExpansion?.code || displayCard?.regionalExpansion?.code || '—'}
                  </div>
                </div>

                {/* Card Number */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">卡號</label>
                  <div className="text-sm font-mono">{displayCard?.webCardId}</div>
                </div>
              </div>
            </div>

            {/* Abilities - Compact */}
            {(displayCard?.abilities || isEditMode) && (
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h2 className="text-sm font-semibold mb-2 text-gray-900">特性</h2>
                {isEditMode ? (
                  <textarea
                    value={JSON.stringify(editedCard?.abilities, null, 2)}
                    onChange={(e) => {
                      try {
                        handleFieldChange('abilities', JSON.parse(e.target.value));
                      } catch {}
                    }}
                    className="w-full px-2 py-1 text-xs border rounded font-mono"
                    rows={4}
                    placeholder='[{"name": "特性名", "text": "效果描述"}]'
                  />
                ) : (
                  displayCard?.abilities && Array.isArray(displayCard.abilities) && displayCard.abilities.length > 0 && (
                    <div className="space-y-2">
                      {displayCard.abilities.map((ability: any, index: number) => (
                        <div key={index} className="text-sm">
                          <div className="font-semibold text-blue-700">{ability.name}</div>
                          <div className="text-gray-800">{ability.text}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Attacks - Compact */}
            {(displayCard?.attacks || isEditMode) && (
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h2 className="text-sm font-semibold mb-2 text-gray-900">招式</h2>
                {isEditMode ? (
                  <textarea
                    value={JSON.stringify(editedCard?.attacks, null, 2)}
                    onChange={(e) => {
                      try {
                        handleFieldChange('attacks', JSON.parse(e.target.value));
                      } catch {}
                    }}
                    className="w-full px-2 py-1 text-xs border rounded font-mono"
                    rows={6}
                    placeholder='[{"name": "招式名", "cost": ["GRASS"], "damage": "30", "text": "效果"}]'
                  />
                ) : (
                  displayCard?.attacks && Array.isArray(displayCard.attacks) && displayCard.attacks.length > 0 && (
                    <div className="space-y-2">
                      {displayCard.attacks.map((attack: any, index: number) => (
                        <div key={index} className="pb-2 border-b last:border-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-semibold text-sm">{attack.name}</div>
                              {(attack.effect || attack.text) && (
                                <div className="text-xs text-gray-700 mt-0.5">{attack.effect || attack.text}</div>
                              )}
                            </div>
                            {attack.damage && (
                              <div className="ml-2 text-base font-bold text-red-600">{attack.damage}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Trainer Card Text */}
            {(displayCard?.supertype === 'TRAINER' && displayCard?.text) || (isEditMode && editedCard?.supertype === 'TRAINER') ? (
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h2 className="text-sm font-semibold mb-2 text-gray-900">效果</h2>
                {isEditMode ? (
                  <textarea
                    value={editedCard?.text || ''}
                    onChange={(e) => handleFieldChange('text', e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{displayCard?.text}</p>
                )}
              </div>
            ) : null}

            {/* Weaknesses & Resistances - Compact */}
            {((displayCard?.weaknesses && Array.isArray(displayCard.weaknesses) && displayCard.weaknesses.length > 0) ||
              (displayCard?.resistances && Array.isArray(displayCard.resistances) && displayCard.resistances.length > 0) ||
              isEditMode) && (
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h2 className="text-sm font-semibold mb-2 text-gray-900">弱點與抵抗</h2>
                {isEditMode ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">弱點 (JSON)</label>
                      <textarea
                        value={JSON.stringify(editedCard?.weaknesses, null, 2)}
                        onChange={(e) => {
                          try {
                            handleFieldChange('weaknesses', JSON.parse(e.target.value));
                          } catch {}
                        }}
                        className="w-full px-2 py-1 text-xs border rounded font-mono"
                        rows={2}
                        placeholder='[{"type": "FIRE", "value": "×2"}]'
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">抵抗 (JSON)</label>
                      <textarea
                        value={JSON.stringify(editedCard?.resistances, null, 2)}
                        onChange={(e) => {
                          try {
                            handleFieldChange('resistances', JSON.parse(e.target.value));
                          } catch {}
                        }}
                        className="w-full px-2 py-1 text-xs border rounded font-mono"
                        rows={2}
                        placeholder='[{"type": "WATER", "value": "-30"}]'
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm space-y-1">
                    {displayCard?.weaknesses && displayCard.weaknesses.length > 0 && (
                      <div>
                        <span className="text-gray-600">弱點：</span>
                        {displayCard.weaknesses.map((w: any, i: number) => (
                          <span key={i} className="ml-2 font-medium">
                            {w.type} {w.value}
                          </span>
                        ))}
                      </div>
                    )}
                    {displayCard?.resistances && displayCard.resistances.length > 0 && (
                      <div>
                        <span className="text-gray-600">抵抗：</span>
                        {displayCard.resistances.map((r: any, i: number) => (
                          <span key={i} className="ml-2 font-medium">
                            {r.type} {r.value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Language Variants - Compact Grid */}
            {card.languageVariants && card.languageVariants.length > 0 && (
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <h2 className="text-sm font-semibold mb-2 text-gray-900">
                  其他版本 ({card.languageVariants.length})
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {card.languageVariants.slice(0, 12).map((variant) => (
                    <Link
                      key={variant.id}
                      href={`/cards/${variant.webCardId}`}
                      className="group border rounded hover:shadow-md transition-shadow"
                    >
                      {variant.imageUrl ? (
                        <img
                          src={variant.imageUrl}
                          alt={variant.name}
                          className="w-full h-auto rounded-t"
                        />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-gray-200 flex items-center justify-center rounded-t">
                          <span className="text-gray-400 text-xs">無圖</span>
                        </div>
                      )}
                      <div className="p-1 bg-gray-50 text-center">
                        <div className="text-xs text-gray-600 truncate">
                          {LANGUAGE_LABELS[variant.language] || variant.language}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
