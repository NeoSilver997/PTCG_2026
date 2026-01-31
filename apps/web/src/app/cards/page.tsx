'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import Link from 'next/link';
import { useState } from 'react';
import { Pencil, Trash2, Eye, Plus, Search } from 'lucide-react';

interface Card {
  id: string;
  webCardId: string;
  name: string;
  hp: number | null;
  types: string[];
  rarity: string | null;
  language: string;
  imageUrl: string | null;
  supertype: string | null;
}

interface Filters {
  search: string;
  supertype: string;
  rarity: string;
  language: string;
}

async function fetchCards(skip: number, take: number, filters: Filters) {
  const params = new URLSearchParams({
    skip: skip.toString(),
    take: take.toString(),
  });
  
  if (filters.search) params.append('name', filters.search);
  if (filters.supertype) params.append('supertype', filters.supertype);
  if (filters.rarity) params.append('rarity', filters.rarity);
  if (filters.language) params.append('language', filters.language);
  
  const { data } = await apiClient.get(`/cards?${params.toString()}`);
  return data.data; // Extract the cards array from the API response
}

export default function CardsPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [supertype, setSupertype] = useState('');
  const [rarity, setRarity] = useState('');
  const [language, setLanguage] = useState('');
  const pageSize = 50;
  
  const filters: Filters = { search, supertype, rarity, language };

  const { data: cards, isLoading, error } = useQuery({
    queryKey: ['cards', page, filters],
    queryFn: () => fetchCards(page * pageSize, pageSize, filters),
  });
  
  // Reset to first page when filters change
  const handleFilterChange = () => {
    setPage(0);
  };

  // Debug logging
  console.log('Cards data:', cards);
  console.log('Is loading:', isLoading);
  console.log('Error:', error);

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-lg">
          {/* Header */}
          <div className="p-6 border-b">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">卡片管理</h1>
                <p className="text-sm text-gray-500 mt-1">管理所有寶可夢卡片資料</p>
              </div>
              <Link
                href="/cards/new"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5 mr-2" />
                新增卡片
              </Link>
            </div>

            {/* Search and Filters */}
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="搜尋卡片名稱..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div>
                <select 
                  value={supertype}
                  onChange={(e) => { setSupertype(e.target.value); handleFilterChange(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">所有超級類型</option>
                  <option value="POKEMON">寶可夢</option>
                  <option value="TRAINER">訓練師</option>
                  <option value="ENERGY">能量</option>
                </select>
              </div>

              <div>
                <select 
                  value={rarity}
                  onChange={(e) => { setRarity(e.target.value); handleFilterChange(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">所有稀有度</option>
                  <option value="COMMON">C - 普通</option>
                  <option value="UNCOMMON">U - 非普通</option>
                  <option value="RARE">R - 稀有</option>
                  <option value="ULTRA_RARE">RRR - 三倍稀有</option>
                  <option value="ILLUSTRATION_RARE">AR - 插圖稀有</option>
                  <option value="SPECIAL_ILLUSTRATION_RARE">SAR - 特別插圖稀有</option>
                </select>
              </div>

              <div>
                <select 
                  value={language}
                  onChange={(e) => { setLanguage(e.target.value); handleFilterChange(); }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">所有語言</option>
                  <option value="JA_JP">日文</option>
                  <option value="ZH_HK">繁體中文</option>
                  <option value="EN_US">英文</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    圖片
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    卡片名稱
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    WebCard ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    HP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    屬性
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    稀有度
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    語言
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {error ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-red-500">
                      錯誤: {error instanceof Error ? error.message : '無法載入卡片'}
                    </td>
                  </tr>
                ) : isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      載入中...
                    </td>
                  </tr>
                ) : !cards || cards.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      沒有找到卡片
                    </td>
                  </tr>
                ) : (
                  cards?.map((card: Card) => (
                    <tr key={card.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="w-16 h-22 bg-gray-100 rounded flex items-center justify-center">
                          {card.imageUrl ? (
                            <img
                              src={`${process.env.NEXT_PUBLIC_API_URL}/storage/cards/${card.webCardId}/image`}
                              alt={card.name}
                              className="w-full h-full object-cover rounded"
                              onError={(e) => {
                                e.currentTarget.src = card.imageUrl || '';
                              }}
                            />
                          ) : (
                            <span className="text-gray-400 text-xs">無圖片</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{card.name}</div>
                        <div className="text-xs text-gray-500">{card.supertype || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {card.webCardId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {card.hp || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex gap-1">
                          {card.types?.slice(0, 2).map((type, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {card.rarity || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {card.language.replace('_', '-')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/cards/${card.webCardId}`}
                            className="text-blue-600 hover:text-blue-900"
                            title="檢視"
                          >
                            <Eye className="w-5 h-5" />
                          </Link>
                          <Link
                            href={`/cards/${card.webCardId}/edit`}
                            className="text-green-600 hover:text-green-900"
                            title="編輯"
                          >
                            <Pencil className="w-5 h-5" />
                          </Link>
                          <button
                            className="text-red-600 hover:text-red-900"
                            title="刪除"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <div className="text-sm text-gray-500">
              顯示 {page * pageSize + 1} - {page * pageSize + (cards?.length || 0)} 筆資料
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一頁
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!cards || cards.length < pageSize}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一頁
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
