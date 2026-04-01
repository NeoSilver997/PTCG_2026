'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface PokemonEntry {
  number: string;
  name_zh_hans: string;
  name_zh_hant: string;
  name_ja: string;
  name_en: string;
  form: string | null;
}

const TYPE_EN_TO_ZH: Record<string, string> = {};

export default function PokemonPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: pokemonList, isLoading, error } = useQuery<PokemonEntry[]>({
    queryKey: ['pokemon-names'],
    queryFn: async () => {
      const res = await fetch('/api/pokemon-names');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    staleTime: Infinity,
  });

  const filtered = useMemo(() => {
    if (!pokemonList) return [];
    const q = search.trim().toLowerCase();
    if (!q) return pokemonList;
    return pokemonList.filter(
      (p) =>
        p.number.includes(q) ||
        p.name_en.toLowerCase().includes(q) ||
        p.name_zh_hant.includes(search.trim()) ||
        p.name_zh_hans.includes(search.trim()) ||
        p.name_ja.includes(search.trim())
    );
  }, [pokemonList, search]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">寶可夢圖鑑</h1>
          <p className="text-sm text-gray-500">按寶可夢圖鑑編號瀏覽卡牌</p>
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋寶可夢（號碼、中文、日文、英文名稱）..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {pokemonList && (
            <div className="mt-2 text-xs text-gray-500">
              顯示 {filtered.length} / {pokemonList.length} 隻寶可夢
            </div>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">載入中...</div>
        ) : error ? (
          <div className="text-center py-16 text-red-500">載入失敗，請重試</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
            {filtered.map((pokemon) => (
              <button
                key={`${pokemon.number}-${pokemon.form ?? ''}`}
                onClick={() =>
                  router.push(
                    `/pokemon/${pokemon.number}${pokemon.form ? `?form=${encodeURIComponent(pokemon.form)}` : ''}`
                  )
                }
                className="bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all p-3 text-left group"
              >
                <div className="text-xs text-gray-400 font-mono mb-1">#{pokemon.number}</div>
                <div className="font-semibold text-sm text-gray-900 leading-tight group-hover:text-blue-600 truncate">
                  {pokemon.name_zh_hant}
                </div>
                {pokemon.form && (
                  <div className="text-[10px] text-purple-600 truncate mt-0.5">{pokemon.form}</div>
                )}
                <div className="text-xs text-gray-500 truncate mt-0.5">{pokemon.name_en}</div>
                <div className="text-xs text-gray-400 truncate">{pokemon.name_ja}</div>
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 && !isLoading && (
          <div className="text-center py-16 text-gray-500">
            <p>找不到符合條件的寶可夢</p>
          </div>
        )}
      </div>
    </div>
  );
}
