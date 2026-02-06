'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardGrid } from '@/components/card-grid';
import { FilterPanel } from '@/components/filter-panel';
import { Navbar } from '@/components/navbar';
import apiClient from '@/lib/api-client';
import { useRouter } from 'next/navigation';

export default function CardsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState({
    name: '',
    supertype: '',
    types: '',
    rarity: '',
    language: '',
    sortBy: 'expansionReleaseDate',
    sortOrder: 'desc',
    webCardId: '',
    subtypes: '',
    variantType: '',
    minHp: '',
    maxHp: '',
    artist: '',
    regulationMark: '',
    expansionCode: '',
    hasAbilities: '',
    hasAttackText: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['cards', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add filters to query params
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          params.append(key, value);
        }
      });

      // Add pagination
      params.append('take', '50');
      params.append('skip', '0');

      const response = await apiClient.get(`/cards?${params.toString()}`);
      return response.data;
    },
  });

  const handleCardClick = (card: any) => {
    router.push(`/cards/${card.webCardId}`);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">載入失敗</h1>
            <p className="text-gray-600">無法載入卡牌資料。請稍後再試。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">寶可夢卡牌</h1>
          <p className="text-gray-600">瀏覽和搜尋寶可夢卡牌收藏</p>
        </div>

        <div className="mb-6">
          <FilterPanel filters={filters} onFilterChange={setFilters} />
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-lg text-gray-600">載入中...</div>
          </div>
        ) : (
          <div>
            {data?.data && data.data.length > 0 ? (
              <>
                <div className="mb-4 text-sm text-gray-600">
                  顯示 {data.data.length} 張卡牌
                  {data.pagination?.total && ` (總共 ${data.pagination.total} 張)`}
                </div>
                <CardGrid cards={data.data} onCardClick={handleCardClick} />
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-lg text-gray-600">沒有找到卡牌</div>
                <p className="text-sm text-gray-500 mt-2">請調整篩選條件或檢查資料庫連線</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
