'use client';

import { useState, use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

interface CardDetail {
  id: string;
  webCardId: string;
  name: string;
  evolvesFrom: string | null;
  evolvesTo: string | null;
}

interface EvolutionFormData {
  evolvesFrom: string;
  evolvesTo: string;
}

async function fetchCardDetail(webCardId: string): Promise<CardDetail> {
  const { data } = await apiClient.get(`/cards/web/${webCardId}`);
  return data;
}

async function updateEvolution(webCardId: string, data: EvolutionFormData) {
  // This would call a PATCH endpoint to update evolution data
  const response = await apiClient.patch(`/cards/web/${webCardId}/evolution`, data);
  return response.data;
}

export default function EditEvolutionPage({ params }: { params: Promise<{ webCardId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: card, isLoading } = useQuery<CardDetail>({
    queryKey: ['card', resolvedParams.webCardId],
    queryFn: () => fetchCardDetail(resolvedParams.webCardId),
  });

  const [formData, setFormData] = useState<EvolutionFormData>({
    evolvesFrom: '',
    evolvesTo: '',
  });

  // Update form when card data loads
  useState(() => {
    if (card) {
      setFormData({
        evolvesFrom: card.evolvesFrom || '',
        evolvesTo: card.evolvesTo || '',
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: EvolutionFormData) => updateEvolution(resolvedParams.webCardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', resolvedParams.webCardId] });
      router.push(`/cards/${resolvedParams.webCardId}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">載入中...</div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-red-600">找不到卡片</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/cards/${card.webCardId}`}
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回卡片詳情
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">編輯進化資訊</h1>
          <p className="text-gray-600 mt-2">
            {card.name} ({card.webCardId})
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Evolves From */}
            <div>
              <label htmlFor="evolvesFrom" className="block text-sm font-medium text-gray-700 mb-2">
                進化自 (Evolves From)
              </label>
              <input
                type="text"
                id="evolvesFrom"
                value={formData.evolvesFrom}
                onChange={(e) => setFormData({ ...formData, evolvesFrom: e.target.value })}
                placeholder="例如：皮卡丘"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                輸入此卡片從哪張卡片進化而來的名稱
              </p>
            </div>

            {/* Evolves To */}
            <div>
              <label htmlFor="evolvesTo" className="block text-sm font-medium text-gray-700 mb-2">
                可進化為 (Evolves To)
              </label>
              <input
                type="text"
                id="evolvesTo"
                value={formData.evolvesTo}
                onChange={(e) => setFormData({ ...formData, evolvesTo: e.target.value })}
                placeholder="例如：雷丘"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                輸入此卡片可以進化成哪張卡片的名稱
              </p>
            </div>

            {/* Future Enhancement Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">未來功能</h3>
              <p className="text-xs text-blue-800">
                未來版本將支援：
              </p>
              <ul className="text-xs text-blue-800 list-disc list-inside mt-1 space-y-1">
                <li>搜尋並連結實際卡片</li>
                <li>顯示進化卡片圖片</li>
                <li>自動建立進化鏈關係</li>
                <li>支援多重進化路線</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                <Save className="w-5 h-5" />
                {updateMutation.isPending ? '儲存中...' : '儲存變更'}
              </button>
              <Link
                href={`/cards/${card.webCardId}`}
                className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 flex items-center justify-center font-medium"
              >
                取消
              </Link>
            </div>

            {updateMutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  儲存失敗：{(updateMutation.error as Error).message}
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Current Values */}
        <div className="mt-6 bg-gray-100 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">目前的進化資訊</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">進化自：</dt>
              <dd className="font-medium text-gray-900">{card.evolvesFrom || '(未設定)'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">可進化為：</dt>
              <dd className="font-medium text-gray-900">{card.evolvesTo || '(未設定)'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
