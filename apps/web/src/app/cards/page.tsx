'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { CardGrid } from '@/components/card-grid';
import { FilterPanel } from '@/components/filter-panel';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, LayoutGrid, List, ArrowUpDown } from 'lucide-react';

interface Card {
  id: string;
  webCardId: string;
  name: string;
  hp: number | null;
  types: string | null;
  rarity: string | null;
  language: string;
  imageUrl: string | null;
  supertype: string | null;
}

interface Filters {
  search: string;
  supertype: string;
  types: string;
  rarity: string;
  language: string;
  sortBy: string;
  sortOrder: string;
  webCardId?: string;
  subtypes?: string;
  variantType?: string;
  minHp?: string;
  maxHp?: string;
  artist?: string;
  regulationMark?: string;
  hasAbilities?: string;
  hasAttacks?: string;
}

async function fetchCards(skip: number, take: number, filters: Filters) {
  const params = new URLSearchParams({
    skip: skip.toString(),
    take: take.toString(),
  });
  
  if (filters.search) params.append('name', filters.search);
  if (filters.supertype) params.append('supertype', filters.supertype);
  if (filters.types) params.append('types', filters.types);
  if (filters.rarity) params.append('rarity', filters.rarity);
  if (filters.language) params.append('language', filters.language);
  if (filters.sortBy) params.append('sortBy', filters.sortBy);
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
  
  // Advanced filters
  if (filters.webCardId) params.append('webCardId', filters.webCardId);
  if (filters.subtypes) params.append('subtypes', filters.subtypes);
  if (filters.variantType) params.append('variantType', filters.variantType);
  if (filters.minHp) params.append('minHp', filters.minHp);
  if (filters.maxHp) params.append('maxHp', filters.maxHp);
  if (filters.artist) params.append('artist', filters.artist);
  if (filters.regulationMark) params.append('regulationMark', filters.regulationMark);
  if (filters.hasAbilities) params.append('hasAbilities', filters.hasAbilities);
  if (filters.hasAttacks) params.append('hasAttacks', filters.hasAttacks);
  
  const { data } = await apiClient.get(`/cards?${params.toString()}`);
  return data; // Return full response with data and pagination
}

export default function CardsPage() {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState<Filters>({
    search: '',
    supertype: '',
    types: '',
    rarity: '',
    language: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    webCardId: '',
    subtypes: '',
    variantType: '',
    minHp: '',
    maxHp: '',
    artist: '',
    regulationMark: '',
    hasAbilities: '',
    hasAttacks: '',
  });
  const pageSize = 48;

  const { data, isLoading, error } = useQuery({
    queryKey: ['cards', page, filters],
    queryFn: () => fetchCards(page * pageSize, pageSize, filters),
  });
  
  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setPage(0);
  };
  
  const handleCardClick = (card: any) => {
    router.push(`/cards/${card.webCardId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">卡片瀏覽</h1>
              <p className="text-gray-600 mt-1">
                共 {data?.pagination?.total || 0} 張卡片
              </p>
            </div>
            
            <div className="flex gap-3">
              {/* Sorting Controls */}
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-gray-200">
                <ArrowUpDown className="w-4 h-4 text-gray-500" />
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                  className="border-none bg-transparent text-sm focus:outline-none focus:ring-0"
                >
                  <option value="id">ID</option>
                  <option value="webCardId">卡號</option>
                  <option value="createdAt">建立時間</option>
                  <option value="updatedAt">更新時間</option>
                  <option value="name">卡片名稱</option>
                  <option value="hp">HP</option>
                  <option value="rarity">稀有度</option>
                  <option value="supertype">類型</option>
                </select>
                <button
                  onClick={() => setFilters({ ...filters, sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
                  className={`p-1 rounded hover:bg-gray-100 ${
                    filters.sortOrder === 'desc' ? 'rotate-180' : ''
                  } transition-transform`}
                  title={filters.sortOrder === 'asc' ? '升序' : '降序'}
                >
                  ↓
                </button>
              </div>
              
              {/* View Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                  title="網格檢視"
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                  title="列表檢視"
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
              
              <Link
                href="/cards/new"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-5 h-5 mr-2" />
                新增卡片
              </Link>
            </div>
          </div>
          
          <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
        </div>

        {/* Content */}
        {error ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-red-500 text-lg">
              錯誤: {error instanceof Error ? error.message : '無法載入卡片'}
            </p>
          </div>
        ) : isLoading ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 mt-4">載入中...</p>
          </div>
        ) : !data || !data.data || data.data.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-gray-500 text-lg">沒有找到符合條件的卡片</p>
            <button
              onClick={() => handleFilterChange({
                search: '',
                supertype: '',
                types: '',
                rarity: '',
                language: '',
                sortBy: 'createdAt',
                sortOrder: 'desc',
                webCardId: '',
                subtypes: '',
                variantType: '',
                minHp: '',
                maxHp: '',
                artist: '',
                regulationMark: '',
                hasAbilities: '',
                hasAttacks: '',
              })}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              清除篩選條件
            </button>
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <CardGrid cards={data.data} onCardClick={handleCardClick} />
            ) : (
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">圖片</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">卡片名稱</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">HP</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">屬性</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">稀有度</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.data.map((card: Card) => (
                      <tr
                        key={card.id}
                        onClick={() => handleCardClick(card)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="w-16 h-20 bg-gray-100 rounded overflow-hidden">
                            {card.imageUrl && (
                              <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium">{card.name}</div>
                          <div className="text-xs text-gray-500">{card.webCardId}</div>
                        </td>
                        <td className="px-6 py-4 text-sm">{card.hp || '-'}</td>
                        <td className="px-6 py-4">
                          {card.types && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              {card.types}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">{card.rarity || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="mt-8 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                顯示 {page * pageSize + 1} - {Math.min((page + 1) * pageSize, data.pagination.total)} / 共 {data.pagination.total} 筆
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一頁
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    第 {page + 1} / {Math.ceil(data.pagination.total / pageSize)} 頁
                  </span>
                </div>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data.pagination.hasMore}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一頁
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
