import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

const DEFAULT_EXPANSION_CODES = 'm4,m3,m2a,m1l,m1s,sv11w,sv11b,sv10';
const QUICK_EXPANSIONS = [
  { code: 'm4',    label: 'M4' },
  { code: 'm3',    label: 'M3' },
  { code: 'm2a',   label: 'M2A' },
  { code: 'm2',   label: 'M2' },
  { code: 'm1l',   label: 'M1L' },
  { code: 'm1s',   label: 'M1S' },
  { code: 'sv11w', label: 'SV11W' },
  { code: 'sv11b', label: 'SV11B' },
  { code: 'sv10',  label: 'SV10' },
  { code: 'sv9',   label: 'SV9' },
  { code: 'sv9a',  label: 'SV9A' },
  { code: 'sv8',   label: 'SV8' },
  { code: 'sv7',   label: 'SV7' },
];

interface FilterPanelProps {
  filters: {
    name: string;
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
    expansionCode?: string;
    hasAbilities?: string;
    hasAttackText?: string;
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
      expansionCode: DEFAULT_EXPANSION_CODES,
      hasAbilities: '',
      hasAttackText: '',
    });
  };

  const activeExpansions = new Set(
    (filters.expansionCode || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
  );
  const toggleExpansion = (code: string) => {
    const codeL = code.toLowerCase();
    const next = new Set(activeExpansions);
    if (next.has(codeL)) next.delete(codeL); else next.add(codeL);
    updateFilter('expansionCode', Array.from(next).join(','));
  };
  
  const hasActiveFilters = filters.name || filters.supertype || filters.types || 
    filters.rarity || filters.language || filters.webCardId || filters.subtypes ||
    filters.variantType || filters.minHp || filters.maxHp || filters.artist ||
    filters.regulationMark || filters.expansionCode || filters.hasAbilities || filters.hasAttackText;
  
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
          value={filters.name}
          onChange={(e) => updateFilter('name', e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      
      {/* Basic Filters (Always Visible) */}  
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            排序依據
          </label>
          <select
            value={filters.sortBy}
            onChange={(e) => updateFilter('sortBy', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
          >
            <option value="expansionReleaseDate" className="text-gray-900">發行日期</option>
            <option value="expansionCode" className="text-gray-900">擴展包代碼</option>
            <option value="createdAt" className="text-gray-900">匯入日期</option>
            <option value="name" className="text-gray-900">名稱</option>
            <option value="hp" className="text-gray-900">HP</option>
            <option value="rarity" className="text-gray-900">稀有度</option>
            <option value="supertype" className="text-gray-900">超級類型</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            排序順序
          </label>
          <select
            value={filters.sortOrder}
            onChange={(e) => updateFilter('sortOrder', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
          >
            <option value="desc" className="text-gray-900">降序 (新到舊)</option>
            <option value="asc" className="text-gray-900">升序 (舊到新)</option>
          </select>
        </div>
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
            <option value="ZH_TW" className="text-gray-900">繁體中文</option>
            <option value="EN_US" className="text-gray-900">英文</option>
          </select>
        </div>
      </div>

      {/* Expansion Quick-Select (Always Visible) */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-gray-500 shrink-0">擴展包:</span>
          {QUICK_EXPANSIONS.map(({ code, label }, idx) => (
            <>
              {idx > 0 && activeExpansions.has(QUICK_EXPANSIONS[idx - 1].code) && activeExpansions.has(code) && (
                <span key={`or-${code}`} className="text-[10px] font-bold text-purple-400 shrink-0">OR</span>
              )}
              <button
                key={code}
                onClick={() => toggleExpansion(code)}
                className={`px-2.5 py-1 rounded-full text-xs border transition ${
                  activeExpansions.has(code)
                    ? 'bg-purple-600 text-white border-purple-600 shadow'
                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-purple-400'
                }`}
              >
                {label}
              </button>
            </>
          ))}
          {activeExpansions.size > 0 && (
            <button
              onClick={() => updateFilter('expansionCode', '')}
              className="px-2 py-1 rounded text-xs text-gray-400 hover:text-red-500 transition"
              title="清除擴展包篩選"
            >
              ✕
            </button>
          )}
          <input
            type="text"
            placeholder="輸入代碼..."
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
              const val = e.target.value.trim().toLowerCase();
              if (val) {
                const next = new Set(activeExpansions);
                next.add(val);
                updateFilter('expansionCode', Array.from(next).join(','));
                e.target.value = '';
              }
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
                if (val) {
                  const next = new Set(activeExpansions);
                  next.add(val);
                  updateFilter('expansionCode', Array.from(next).join(','));
                  (e.target as HTMLInputElement).value = '';
                }
              }
            }}
            className="w-24 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-purple-500"
          />
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

            {/* Has Attack Text */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                招式有特性
              </label>
              <select
                value={filters.hasAttackText || ''}
                onChange={(e) => updateFilter('hasAttackText', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
              >
                <option value="" className="text-gray-900">全部</option>
                <option value="true" className="text-gray-900">有特性描述</option>
                <option value="false" className="text-gray-900">無特性描述</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
