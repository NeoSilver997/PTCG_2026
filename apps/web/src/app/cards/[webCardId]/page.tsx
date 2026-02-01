'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

interface CardDetail {
  id: string;
  webCardId: string;
  name: string;
  hp: number | null;
  types: string | null;
  supertype: string;
  subtypes: string[];
  rarity: string | null;
  variantType: string;
  language: string;
  imageUrl: string | null;
  artist: string | null;
  regulationMark: string | null;
  ruleBox: string | null;
  abilities: any;
  attacks: any;
  weaknesses: any;
  resistances: any;
  retreatCost: any;
  evolvesFrom: string | null;
  evolvesTo: string | null;
  region: string | null;
  scrapedAt: string | null;
  createdAt: string;
  updatedAt: string;
  primaryCard: {
    id: string;
    expansionId: string;
    cardNumber: string;
  };
  languageVariants: Array<{
    id: string;
    webCardId: string;
    name: string;
    language: string;
    variantType: string;
    imageUrl: string | null;
  }>;
}

async function fetchCardDetail(webCardId: string) {
  const { data } = await apiClient.get(`/cards/web/${webCardId}`);
  return data;
}

const LANGUAGE_LABELS: Record<string, string> = {
  JA_JP: '日文',
  ZH_HK: '繁體中文',
  EN_US: '英文',
  ZH_TW: '繁體中文',
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center">載入中...</div>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center text-red-600">找不到卡片資料</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          返回列表
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card Image */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                className="w-full h-auto rounded-lg"
              />
            ) : (
              <div className="aspect-[2.5/3.5] bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-gray-400">無圖片</span>
              </div>
            )}

            {/* Language Variants */}
            {card.languageVariants && card.languageVariants.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900">語言版本</h3>
                <div className="grid grid-cols-3 gap-3">
                  {card.languageVariants.map((variant) => (
                    <Link
                      key={variant.id}
                      href={`/cards/${variant.webCardId}`}
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="text-xs text-gray-600 mb-1">
                        {LANGUAGE_LABELS[variant.language] || variant.language}
                      </div>
                      <div className="text-sm font-medium truncate">{variant.name}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card Details */}
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h1 className="text-3xl font-bold mb-2 text-gray-900">{card.name}</h1>
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                  {SUPERTYPE_LABELS[card.supertype] || card.supertype}
                </span>
                {card.types && (
                  <span className={`px-3 py-1 text-white text-sm rounded-full ${TYPE_COLORS[card.types] || 'bg-gray-500'}`}>
                    {card.types}
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
                  <dd className="font-medium text-gray-900">{card.webCardId}</dd>
                </div>
                {card.hp && (
                  <div>
                    <dt className="text-sm text-gray-600">HP</dt>
                    <dd className="font-medium text-gray-900">{card.hp}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-gray-600">語言</dt>
                  <dd className="font-medium text-gray-900">{LANGUAGE_LABELS[card.language] || card.language}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-600">變體類型</dt>
                  <dd className="font-medium text-gray-900">{card.variantType}</dd>
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

            {/* Evolution */}
            {(card.evolvesFrom || card.evolvesTo) && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">進化</h2>
                {card.evolvesFrom && (
                  <div className="mb-2">
                    <span className="text-sm text-gray-600">進化自：</span>
                    <span className="ml-2 font-medium text-gray-900">{card.evolvesFrom}</span>
                  </div>
                )}
                {card.evolvesTo && (
                  <div>
                    <span className="text-sm text-gray-600">可進化為：</span>
                    <span className="ml-2 font-medium text-gray-900">{card.evolvesTo}</span>
                  </div>
                )}
              </div>
            )}

            {/* Abilities */}
            {card.abilities && Array.isArray(card.abilities) && card.abilities.length > 0 && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">特性</h2>
                {card.abilities.map((ability: any, index: number) => (
                  <div key={index} className="mb-4 last:mb-0">
                    <div className="font-semibold text-blue-700">{ability.name}</div>
                    <div className="text-sm text-gray-800 mt-1">{ability.text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Attacks */}
            {card.attacks && Array.isArray(card.attacks) && card.attacks.length > 0 && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">招式</h2>
                {card.attacks.map((attack: any, index: number) => (
                  <div key={index} className="mb-4 last:mb-0 border-b last:border-0 pb-4 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{attack.name}</div>
                        <div className="text-sm text-gray-800 mt-1">{attack.text}</div>
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

            {/* Weaknesses & Resistances */}
            {((card.weaknesses && Array.isArray(card.weaknesses) && card.weaknesses.length > 0) ||
              (card.resistances && Array.isArray(card.resistances) && card.resistances.length > 0)) && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4 text-gray-900">弱點與抵抗</h2>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
