import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

interface FilterPanelProps {
  filters: {
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
  };
  onFilterChange: (filters: any) => void;
}

export function FilterPanel({ filters, onFilterChange }: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const updateFilter = (key: string, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };
  
  const clearFilters = () => {
    onFilterChange({
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
  };
  
  const hasActiveFilters = filters.search || filters.supertype || filters.types || 
    filters.rarity || filters.language || filters.webCardId || filters.subtypes ||
    filters.variantType || filters.minHp || filters.maxHp || filters.artist ||
    filters.regulationMark || filters.hasAbilities || filters.hasAttacks;
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">篩選條件</h2>
          {hasActiveFilters && (
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
              已套用
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              清除
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {isExpanded ? '收起' : '展開更多'}
          </button>
        </div>
      </div>
      
      {/* Search Bar (Always Visible) */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="搜尋卡片名稱..."
          value={filters.search}
          onChange={(e) => updateFilter('search', e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      
      {/* Basic Filters (Always Visible) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            超級類型
          </label>
          <select
            value={filters.supertype}
            onChange={(e) => updateFilter('supertype', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
          >
            <option value="" className="text-gray-900">全部</option>
            <option value="POKEMON" className="text-gray-900">寶可夢</option>
            <option value="TRAINER" className="text-gray-900">訓練師</option>
            <option value="ENERGY" className="text-gray-900">能量</option>
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            屬性
          </label>
          <select
            value={filters.types}
            onChange={(e) => updateFilter('types', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
          >
            <option value="" className="text-gray-900">全部</option>
            <option value="COLORLESS" className="text-gray-900">無色</option>
            <option value="DARKNESS" className="text-gray-900">惡</option>
            <option value="DRAGON" className="text-gray-900">龍</option>
            <option value="FAIRY" className="text-gray-900">妖精</option>
            <option value="FIGHTING" className="text-gray-900">格鬥</option>
            <option value="FIRE" className="text-gray-900">火</option>
            <option value="GRASS" className="text-gray-900">草</option>
            <option value="LIGHTNING" className="text-gray-900">雷</option>
            <option value="METAL" className="text-gray-900">鋼</option>
            <option value="PSYCHIC" className="text-gray-900">超</option>
            <option value="WATER" className="text-gray-900">水</option>
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            稀有度
          </label>
          <select
            value={filters.rarity}
            onChange={(e) => updateFilter('rarity', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
          >
            <option value="" className="text-gray-900">全部</option>
            <option value="COMMON" className="text-gray-900">C - 普通</option>
            <option value="UNCOMMON" className="text-gray-900">U - 非普通</option>
            <option value="RARE" className="text-gray-900">R - 稀有</option>
            <option value="DOUBLE_RARE" className="text-gray-900">RR - 雙倍稀有</option>
            <option value="ULTRA_RARE" className="text-gray-900">RRR - 三倍稀有</option>
            <option value="ILLUSTRATION_RARE" className="text-gray-900">AR - 插圖稀有</option>
            <option value="SPECIAL_ILLUSTRATION_RARE" className="text-gray-900">SAR - 特別插圖稀有</option>
            <option value="HYPER_RARE" className="text-gray-900">UR - 超級稀有</option>
            <option value="SECRET_RARE" className="text-gray-900">SR - 秘藏稀有</option>
            <option value="SHINY_RARE" className="text-gray-900">閃卡稀有</option>
          </select>
        </div>
        
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            語言
          </label>
          <select
            value={filters.language}
            onChange={(e) => updateFilter('language', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
          >
            <option value="" className="text-gray-900">全部</option>
            <option value="JA_JP" className="text-gray-900">日文</option>
            <option value="ZH_HK" className="text-gray-900">繁體中文</option>
            <option value="EN_US" className="text-gray-900">英文</option>
          </select>
        </div>
      </div>
      
      {/* Advanced Filters (Expandable) */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Web Card ID */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                卡片編號
              </label>
              <input
                type="text"
                placeholder="例: jp47009"
                value={filters.webCardId || ''}
                onChange={(e) => updateFilter('webCardId', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Subtypes */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                次類型
              </label>
              <select
                value={filters.subtypes || ''}
                onChange={(e) => updateFilter('subtypes', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
              >
                <option value="" className="text-gray-900">全部</option>
                <option value="BASIC" className="text-gray-900">基本寶可夢</option>
                <option value="STAGE_1" className="text-gray-900">1階進化</option>
                <option value="STAGE_2" className="text-gray-900">2階進化</option>
                <option value="EX" className="text-gray-900">EX</option>
                <option value="V" className="text-gray-900">V</option>
                <option value="VMAX" className="text-gray-900">VMAX</option>
                <option value="ITEM" className="text-gray-900">物品</option>
                <option value="SUPPORTER" className="text-gray-900">支援者</option>
                <option value="STADIUM" className="text-gray-900">競技場</option>
                <option value="TOOL" className="text-gray-900">寶可夢道具</option>
              </select>
            </div>

            {/* Variant Type */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                變體類型
              </label>
              <select
                value={filters.variantType || ''}
                onChange={(e) => updateFilter('variantType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
              >
                <option value="" className="text-gray-900">全部</option>
                <option value="NORMAL" className="text-gray-900">普通</option>
                <option value="HOLO" className="text-gray-900">閃卡</option>
                <option value="REVERSE_HOLO" className="text-gray-900">反閃</option>
                <option value="COSMOS_HOLO" className="text-gray-900">宇宙閃</option>
              </select>
            </div>

            {/* Artist */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                繪師
              </label>
              <input
                type="text"
                placeholder="繪師名稱"
                value={filters.artist || ''}
                onChange={(e) => updateFilter('artist', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Min HP */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                最小 HP
              </label>
              <input
                type="number"
                placeholder="0"
                value={filters.minHp || ''}
                onChange={(e) => updateFilter('minHp', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                min="0"
              />
            </div>

            {/* Max HP */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                最大 HP
              </label>
              <input
                type="number"
                placeholder="340"
                value={filters.maxHp || ''}
                onChange={(e) => updateFilter('maxHp', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                min="0"
              />
            </div>

            {/* Regulation Mark */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                規格標記
              </label>
              <input
                type="text"
                placeholder="例: F, G, H"
                value={filters.regulationMark || ''}
                onChange={(e) => updateFilter('regulationMark', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Has Abilities */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                有特性
              </label>
              <select
                value={filters.hasAbilities || ''}
                onChange={(e) => updateFilter('hasAbilities', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
              >
                <option value="" className="text-gray-900">全部</option>
                <option value="true" className="text-gray-900">有特性</option>
                <option value="false" className="text-gray-900">無特性</option>
              </select>
            </div>

            {/* Has Attacks */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                有招式
              </label>
              <select
                value={filters.hasAttacks || ''}
                onChange={(e) => updateFilter('hasAttacks', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
              >
                <option value="" className="text-gray-900">全部</option>
                <option value="true" className="text-gray-900">有招式</option>
                <option value="false" className="text-gray-900">無招式</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
