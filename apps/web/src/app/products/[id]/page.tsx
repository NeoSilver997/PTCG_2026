'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
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

async function fetchProductDetail(id: string) {
  const { data } = await apiClient.get(`/products/${id}`);
  return data;
}

async function fetchRelatedCards(productCode: string) {
  const { data } = await apiClient.get('/cards', {
    params: {
      expansionCode: productCode,
      take: 50,
      sortBy: 'id',
      sortOrder: 'desc'
    }
  });
  return data;
}

const COUNTRY_LABELS: Record<string, string> = {
  Japan: '日本',
  'Hong Kong (EN)': '香港 (英文)',
  'Hong Kong (ZH)': '香港 (中文)',
};

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { data: product, isLoading, error } = useQuery<ProductDetail>({
    queryKey: ['product', id],
    queryFn: () => fetchProductDetail(id),
  });

  const { data: relatedCards, isLoading: cardsLoading } = useQuery({
    queryKey: ['product-cards', product?.code],
    queryFn: () => product?.code ? fetchRelatedCards(product.code) : Promise.resolve({ data: [] }),
    enabled: !!product?.code,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="w-full px-6 py-8">
          <div className="text-center py-12">載入中...</div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
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
      <Navbar />

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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {relatedCards.data.map((card: any) => (
                    <div key={card.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
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
                    </div>
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