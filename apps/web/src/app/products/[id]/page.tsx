'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

interface ProductDetail {
  id: string;
  country: string;
  productName: string;
  price: string | null;
  releaseDate: string | null;
  code: string | null;
  productType: {
    id: string;
    code: string;
    nameJa: string;
    nameZh: string;
    nameEn: string;
  } | null;
  imageUrl: string | null;
  link: string | null;
  include: string | null;
  cardOnly: boolean | null;
  beginnerFlag: boolean | null;
  storesAvailable: string | null;
  linkCardList: string | null;
  linkPokemonCenter: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CardsSummary {
  cardCount: number;
  typeCount: Record<string, number>;
  rarityCount: Record<string, number>;
  totalPrice: number;
  priceCount: number;
  currency: string;
}

async function fetchProductDetail(id: string) {
  const { data } = await apiClient.get(`/products/${id}`);
  return data;
}

async function fetchCardsSummary(id: string): Promise<CardsSummary> {
  const { data } = await apiClient.get(`/products/${id}/cards-summary`);
  return data;
}

async function fetchRelatedCards(productCode: string, language: string, skip = 0) {
  const { data } = await apiClient.get('/cards', {
    params: {
      expansionCode: productCode,
      language,
      take: 120,
      skip,
      sortBy: 'webCardId',
      sortOrder: 'asc'
    }
  });
  return data;
}

async function fetchLinkedProduct(code: string, country: string) {
  const targetCountry = country.includes('Hong Kong') ? 'Japan' : null;
  if (!targetCountry) return null;
  const { data } = await apiClient.get('/products', {
    params: { country: targetCountry, expansionCode: code, take: 1 }
  });
  return data?.data?.[0] || null;
}

const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  'Japan': 'JA_JP',
  'Hong Kong (ZH)': 'ZH_TW',
  'Hong Kong (EN)': 'EN_US',
};

const COUNTRY_LABELS: Record<string, string> = {
  Japan: '日本',
  'Hong Kong (EN)': '香港 (英文)',
  'Hong Kong (ZH)': '香港 (中文)',
};

const SUPERTYPE_LABELS: Record<string, string> = {
  POKEMON: '寶可夢',
  TRAINER: '訓練家',
  ENERGY: '能量',
};

const RARITY_SORT = [
  'HYPER_RARE', 'SPECIAL_ILLUSTRATION_RARE', 'ILLUSTRATION_RARE', 'ULTRA_RARE',
  'DOUBLE_RARE', 'SHINY_RARE', 'RARE', 'UNCOMMON', 'COMMON', 'PROMO',
];

function rarityLabel(key: string) {
  return key.replace(/_/g, ' ');
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { data: product, isLoading, error } = useQuery<ProductDetail>({
    queryKey: ['product', id],
    queryFn: () => fetchProductDetail(id),
  });

  const { data: cardsSummary } = useQuery<CardsSummary>({
    queryKey: ['product-cards-summary', id],
    queryFn: () => fetchCardsSummary(id),
    enabled: !!product?.code,
  });

  const { data: linkedProduct } = useQuery({
    queryKey: ['linked-product', product?.code, product?.country],
    queryFn: () => fetchLinkedProduct(product!.code!, product!.country),
    enabled: !!product?.code && !!product?.country,
  });

  const { data: relatedCards, isLoading: cardsLoading } = useQuery({
    queryKey: ['product-cards', product?.code, product?.country],
    queryFn: () => {
      if (!product?.code) return Promise.resolve({ data: [] });
      const language = COUNTRY_TO_LANGUAGE[product.country] ?? '';
      return fetchRelatedCards(product.code, language);
    },
    enabled: !!product?.code,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8">
          <div className="text-center py-12">載入中...</div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-6 py-8">
          <div className="text-center py-12 text-red-600">
            找不到商品或載入失敗
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      <div className="w-full px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              返回
            </button>

            <Link
              href={`/products/${id}/edit`}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="w-4 h-4" />
              編輯
            </Link>
          </div>

          <div className="flex items-start gap-6">
            {/* Product Image */}
            <div className="w-3/10 flex-shrink-0">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.productName}
                  className="w-full h-auto object-cover rounded-lg shadow-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full aspect-square bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400">無圖片</span>
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {product.productName}
                  </h1>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      {COUNTRY_LABELS[product.country] || product.country}
                    </span>
                    {product.productType && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        {product.productType.nameZh}
                      </span>
                    )}
                  </div>
                </div>
                {product.price && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">
                      {product.price}
                    </div>
                  </div>
                )}
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  {product.code && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        商品編號
                      </label>
                      <div className="text-gray-900">{product.code}</div>
                    </div>
                  )}

                  {product.releaseDate && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        發售日期
                      </label>
                      <div className="text-gray-900">{product.releaseDate}</div>
                    </div>
                  )}

                  {product.include && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        包含內容
                      </label>
                      <div className="text-gray-900">{product.include}</div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {product.cardOnly !== null && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        僅含卡片
                      </label>
                      <div className="text-gray-900">
                        {product.cardOnly ? '是' : '否'}
                      </div>
                    </div>
                  )}

                  {product.beginnerFlag !== null && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        入門商品
                      </label>
                      <div className="text-gray-900">
                        {product.beginnerFlag ? '是' : '否'}
                      </div>
                    </div>
                  )}

                  {product.storesAvailable && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        銷售店鋪
                      </label>
                      <div className="text-gray-900">{product.storesAvailable}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* External Link */}
              {product.link && (
                <div className="mt-6">
                  <a
                    href={product.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    查看官方頁面
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card Summary */}
        {(cardsSummary && cardsSummary.cardCount > 0) && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              卡牌統計
              <span className="ml-2 text-sm font-normal text-gray-500">({cardsSummary.cardCount} 張)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* By Type */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">類型分佈</h3>
                <div className="space-y-2">
                  {Object.entries(cardsSummary.typeCount)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 w-20 shrink-0">{SUPERTYPE_LABELS[type] || type}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div
                            className="h-4 rounded-full bg-blue-500"
                            style={{ width: `${(count / cardsSummary.cardCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* By Rarity */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">稀有度分佈</h3>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {[
                    ...RARITY_SORT.filter(r => cardsSummary.rarityCount[r]),
                    ...Object.keys(cardsSummary.rarityCount).filter(r => !RARITY_SORT.includes(r)).sort(),
                  ].map(rarity => {
                    const count = cardsSummary.rarityCount[rarity];
                    if (!count) return null;
                    return (
                      <div key={rarity} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{rarityLabel(rarity)}</span>
                        <span className="font-medium text-gray-900">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Price */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">市場估值</h3>
                {cardsSummary.priceCount > 0 ? (
                  <div>
                    <div className="text-3xl font-bold text-green-600">
                      {cardsSummary.currency === 'JPY' ? '¥' : '$'}{cardsSummary.totalPrice.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {cardsSummary.priceCount} / {cardsSummary.cardCount} 張有價格資料
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      平均 {cardsSummary.currency === 'JPY' ? '¥' : '$'}{Math.round(cardsSummary.totalPrice / cardsSummary.priceCount).toLocaleString()} /張
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">暫無價格資料</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Linked JP/HK Product */}
        {linkedProduct && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {product.country.includes('Hong Kong') ? '關聯日版產品' : '關聯港版產品'}
            </h2>
            <Link
              href={`/products/${linkedProduct.id}`}
              className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              {linkedProduct.imageUrl && (
                <img
                  src={linkedProduct.imageUrl}
                  alt={linkedProduct.productName}
                  className="w-16 h-auto rounded shadow-sm object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div className="flex-1">
                <div className="font-medium text-gray-900">{linkedProduct.productName}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {COUNTRY_LABELS[linkedProduct.country] || linkedProduct.country}
                  {linkedProduct.code && <span className="ml-2 font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{linkedProduct.code}</span>}
                  {linkedProduct.releaseDate && <span className="ml-2">{new Date(linkedProduct.releaseDate).toLocaleDateString('zh-TW')}</span>}
                </div>
              </div>
              <span className="text-blue-600 text-sm">查看 →</span>
            </Link>
          </div>
        )}

        {/* Metadata */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">系統資訊</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">建立時間:</span>
              <span className="ml-2 text-gray-900">
                {new Date(product.createdAt).toLocaleString('zh-TW')}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">更新時間:</span>
              <span className="ml-2 text-gray-900">
                {new Date(product.updatedAt).toLocaleString('zh-TW')}
              </span>
            </div>
          </div>
        </div>

        {/* Related Cards */}
        {product.code && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              相關卡牌 ({product.code})
            </h2>
            {cardsLoading ? (
              <div className="text-center py-8">載入卡牌中...</div>
            ) : relatedCards?.data?.length > 0 ? (
              <>
                <div className="mb-4 text-sm text-gray-600">
                  共 {relatedCards.pagination?.total || 0} 張卡牌 (按 ID 降序排列)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {relatedCards.data.map((card: any) => (
                    <Link key={card.id} href={`/cards/${card.webCardId}`}
                      className="border rounded-lg p-2 hover:shadow-md transition-shadow block">
                      <div className="aspect-[2.5/3.5] bg-gray-100 rounded mb-2 relative overflow-hidden">
                        {card.imageUrl ? (
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                            無圖片
                          </div>
                        )}
                      </div>
                      <div className="text-sm">
                        <div className="font-medium text-gray-900 truncate">{card.name}</div>
                        <div className="text-gray-600 text-xs">
                          {card.webCardId} • {card.supertype}
                          {card.hp && ` • HP ${card.hp}`}
                        </div>
                        {card.rarity && (
                          <div className="text-gray-500 text-xs">{card.rarity}</div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div>此商品代碼 ({product.code}) 目前沒有相關卡牌</div>
                <div className="text-xs mt-2">卡牌數據將在導入後顯示</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}