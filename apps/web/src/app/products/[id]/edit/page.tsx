'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, X } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import React from 'react';

interface ProductDetail {
  id: string;
  country: string;
  productName: string;
  price: string | null;
  releaseDate: string | null;
  code: string | null;
  productType: string | null;
  imageUrl: string | null;
  link: string | null;
  include: string | null;
  cardOnly: boolean | null;
  beginnerFlag: boolean | null;
  storesAvailable: string | null;
  createdAt: string;
  updatedAt: string;
}

async function fetchProductDetail(id: string) {
  const { data } = await apiClient.get(`/products/${id}`);
  return data;
}

async function updateProduct(id: string, data: Partial<ProductDetail>) {
  const { data: updatedProduct } = await apiClient.put(`/products/${id}`, data);
  return updatedProduct;
}

const COUNTRY_OPTIONS = [
  { value: 'Japan', label: '日本' },
  { value: 'Hong Kong (EN)', label: '香港 (英文)' },
  { value: 'Hong Kong (ZH)', label: '香港 (中文)' },
];

const PRODUCT_TYPE_OPTIONS = [
  { value: '拡張パック', label: '擴張包' },
  { value: '強化拡張パック', label: '強化擴張包' },
  { value: 'スターターセット', label: '入門套組' },
  { value: 'デッキ', label: '牌組' },
  { value: '周辺グッズ', label: '周邊商品' },
];

export default function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = use(params);

  const { data: product, isLoading } = useQuery<ProductDetail>({
    queryKey: ['product', id],
    queryFn: () => fetchProductDetail(id),
  });

  const [formData, setFormData] = useState<Partial<ProductDetail>>({});

  // Initialize form data when product loads
  React.useEffect(() => {
    if (product) {
      setFormData(product);
    }
  }, [product]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<ProductDetail>) => updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      router.push(`/products/${id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleChange = (field: keyof ProductDetail, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center py-12">載入中...</div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="text-center py-12 text-red-600">
            找不到商品
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Link
              href={`/products/${id}`}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              返回商品詳情
            </Link>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.push(`/products/${id}`)}
                className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
                取消
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                <Save className="w-4 h-4" />
                {updateMutation.isPending ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900">
            編輯商品: {product.productName}
          </h1>
        </div>

        {/* Form */}
        <form id="product-form" onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="md:col-span-2">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">基本資訊</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                商品名稱 *
              </label>
              <input
                type="text"
                value={formData.productName || ''}
                onChange={(e) => handleChange('productName', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                國家地區 *
              </label>
              <select
                value={formData.country || ''}
                onChange={(e) => handleChange('country', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">選擇國家</option>
                {COUNTRY_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                商品編號
              </label>
              <input
                type="text"
                value={formData.code || ''}
                onChange={(e) => handleChange('code', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                商品類型
              </label>
              <select
                value={formData.productType || ''}
                onChange={(e) => handleChange('productType', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">選擇類型</option>
                {PRODUCT_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                價格
              </label>
              <input
                type="text"
                value={formData.price || ''}
                onChange={(e) => handleChange('price', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="例如: ¥2,420"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                發售日期
              </label>
              <input
                type="date"
                value={formData.releaseDate ? formData.releaseDate.split('T')[0] : ''}
                onChange={(e) => handleChange('releaseDate', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* URLs */}
            <div className="md:col-span-2">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">連結資訊</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                圖片網址
              </label>
              <input
                type="url"
                value={formData.imageUrl || ''}
                onChange={(e) => handleChange('imageUrl', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                官方連結
              </label>
              <input
                type="url"
                value={formData.link || ''}
                onChange={(e) => handleChange('link', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://..."
              />
            </div>

            {/* Additional Information */}
            <div className="md:col-span-2">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">其他資訊</h2>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                包含內容
              </label>
              <textarea
                value={formData.include || ''}
                onChange={(e) => handleChange('include', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="描述商品包含的內容..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                銷售店鋪
              </label>
              <input
                type="text"
                value={formData.storesAvailable || ''}
                onChange={(e) => handleChange('storesAvailable', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="可購買的店鋪..."
              />
            </div>

            <div className="flex items-center space-x-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.cardOnly || false}
                  onChange={(e) => handleChange('cardOnly', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">僅含卡片</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.beginnerFlag || false}
                  onChange={(e) => handleChange('beginnerFlag', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">入門商品</span>
              </label>
            </div>
          </div>
        </form>

        {updateMutation.error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-red-800">
              更新失敗: {(updateMutation.error as any)?.message || '未知錯誤'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}