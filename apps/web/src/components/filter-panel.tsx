import { Search, SlidersHorizontal, X } from 'lucide-react';
import React, { useState } from 'react';

const DEFAULT_EXPANSION_CODES = 'm4,m3,m2a,m1l,m1s,sv11w,sv11b,sv10';

const LANG_LABEL: Record<string, string> = {
  JA_JP: '🇯🇵 日文',
  ZH_HK: '🇭🇰 港版',
  EN_US: '🇺🇸 英文',
  ZH_TW: '🇹🇼 繁中',
};
const SUPERTYPE_ZH: Record<string, string> = {
  POKEMON: '寶可夢',
  TRAINER: '訓練師',
  ENERGY: '能量',
};
const SUPERTYPE_INACTIVE: Record<string, string> = {
  POKEMON: 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100',
  TRAINER: 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100',
  ENERGY: 'bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100',
};
const SUPERTYPE_ACTIVE: Record<string, string> = {
  POKEMON: 'bg-emerald-600 text-white border-emerald-600',
  TRAINER: 'bg-blue-600 text-white border-blue-600',
  ENERGY: 'bg-orange-500 text-white border-orange-500',
};
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
    effectTag?: string;
    cardTier?: string;
    abilityText?: string;
    weakness?: string;
  };
  onFilterChange: (filters: any) => void;
  stats?: {
    total: number;
    byLanguage: Array<{ language: string; count: number }>;
    bySupertype: Array<{ supertype: string; count: number }>;
    byExpansion?: Array<{ code: string; nameEn: string; count: number }>;
  } | null;
}

export function FilterPanel({ filters, onFilterChange, stats }: FilterPanelProps) {
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
      sortBy: 'webCardId',
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
      effectTag: '',
      cardTier: '',
      abilityText: '',
      weakness: '',
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
    filters.regulationMark || filters.expansionCode || filters.hasAbilities || filters.hasAttackText ||
    filters.effectTag || filters.cardTier || filters.abilityText || filters.weakness;
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-gray-600" />
          <h2 className="font-semibold text-gray-900">🃏 卡牌資料庫</h2>
          {stats && (
            <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {stats.total.toLocaleString()} 張
            </span>
          )}
          {hasActiveFilters && (
            <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5 rounded">
              篩選中
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
            {isExpanded ? '收起' : '進階篩選'}
          </button>
        </div>
      </div>

      {/* Stats: Language + Supertype quick chips */}
      {stats && (
        <div className="flex flex-wrap items-center gap-3 mb-4 pb-3 border-b border-gray-100">
          <div className="flex flex-wrap gap-1.5">
            {stats.byLanguage.map(({ language, count }) => (
              <button
                key={language}
                onClick={() => updateFilter('language', filters.language === language ? '' : language)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
                  filters.language === language
                    ? 'bg-blue-600 text-white border-blue-600 shadow'
                    : 'bg-gray-50 text-gray-800 border-gray-300 hover:border-blue-400'
                }`}
              >
                {LANG_LABEL[language] ?? language}
                <span className="opacity-60">{count.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="w-px bg-gray-200 self-stretch hidden sm:block" />
          <div className="flex flex-wrap gap-1.5">
            {stats.bySupertype.map(({ supertype, count }) => (
              <button
                key={supertype}
                onClick={() => updateFilter('supertype', filters.supertype === supertype ? '' : supertype)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition ${
                  filters.supertype === supertype
                    ? (SUPERTYPE_ACTIVE[supertype] ?? 'bg-gray-700 text-white border-gray-700')
                    : (SUPERTYPE_INACTIVE[supertype] ?? 'bg-gray-50 text-gray-800 border-gray-300 hover:border-gray-400')
                }`}
              >
                {SUPERTYPE_ZH[supertype] ?? supertype}
                <span className="opacity-70">{count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Search Bar (Always Visible) */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="搜尋卡片名稱..."
          value={filters.name}
          onChange={(e) => updateFilter('name', e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white placeholder:text-gray-400"
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
          >            <option value="webCardId" className="text-gray-900">收藏編號</option>            <option value="expansionReleaseDate" className="text-gray-900">發行日期</option>
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
            onChange={(e) => {
              const newRarity = e.target.value;
              // When selecting a rarity, clear the expansion filter if it's still at the
              // default value — otherwise AR/SAR searches would be silently limited to
              // those few default expansions and return 0 results.
              if (newRarity && filters.expansionCode === DEFAULT_EXPANSION_CODES) {
                onFilterChange({ ...filters, rarity: newRarity, expansionCode: '' });
              } else {
                updateFilter('rarity', newRarity);
              }
            }}
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
            <option value="SHINY_RARE" className="text-gray-900">SR - 閃卡稀有</option>
            <option value="AMAZING_RARE" className="text-gray-900">A - 神奇稀有</option>
            <option value="ACE_SPEC" className="text-gray-900">ACE - ACE SPEC</option>
            <option value="PROMO" className="text-gray-900">PROMO - 宣傳卡</option>
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
          <span className="text-xs font-medium text-gray-600 shrink-0">擴展包:</span>
          {QUICK_EXPANSIONS.map(({ code, label }, idx) => (
            <React.Fragment key={code}>
              {idx > 0 && activeExpansions.has(QUICK_EXPANSIONS[idx - 1].code) && activeExpansions.has(code) && (
                <span className="text-[10px] font-bold text-purple-600 shrink-0">OR</span>
              )}
              <button
                onClick={() => toggleExpansion(code)}
                className={`px-2.5 py-1 rounded-full text-xs border transition ${
                  activeExpansions.has(code)
                    ? 'bg-purple-600 text-white border-purple-600 shadow'
                    : 'bg-gray-50 text-gray-800 border-gray-300 hover:border-purple-400'
                }`}
              >
                {label}
              </button>
            </React.Fragment>
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
            className="w-24 px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-purple-500 text-gray-900 bg-white placeholder:text-gray-400"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white placeholder:text-gray-400"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white placeholder:text-gray-400"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white placeholder:text-gray-400"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white placeholder:text-gray-400"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white placeholder:text-gray-400"
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

            {/* Effect Tag */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                效果標籤
              </label>
              <select
                value={filters.effectTag || ''}
                onChange={(e) => updateFilter('effectTag', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
              >
                <option value="">全部</option>
                <optgroup label="── 資源 ──">
                  <option value="抽卡效果">抽卡效果</option>
                  <option value="搜索效果">搜索效果</option>
                  <option value="能量操作">能量操作</option>
                  <option value="能量回收">能量回收</option>
                  <option value="能量附著">能量附著</option>
                  <option value="手牌丟棄">手牌丟棄</option>
                  <option value="牌庫操作">牌庫操作</option>
                  <option value="牌庫重洗">牌庫重洗</option>
                </optgroup>
                <optgroup label="── 傷害/戰鬥 ──">
                  <option value="傷害效果">傷害效果</option>
                  <option value="條件傷害">條件傷害</option>
                  <option value="連鎖傷害">連鎖傷害</option>
                  <option value="備戰傷害加成">備戰傷害加成</option>
                  <option value="棄牌區傷害加成">棄牌區傷害加成</option>
                  <option value="傷害指示物">傷害指示物</option>
                  <option value="反噬傷害">反噬傷害</option>
                </optgroup>
                <optgroup label="── 防禦/控制 ──">
                  <option value="傷害防禦">傷害防禦</option>
                  <option value="傷害減免">傷害減免</option>
                  <option value="高額傷害減免">高額傷害減免</option>
                  <option value="全體防禦">全體防禦</option>
                  <option value="效果免疫">效果免疫</option>
                  <option value="無視弱點/效果">無視弱點/效果</option>
                  <option value="HP提升">HP提升</option>
                </optgroup>
                <optgroup label="── 狀態/干擾 ──">
                  <option value="狀態異常">狀態異常</option>
                  <option value="狀態恢復">狀態恢復</option>
                  <option value="昏厥條件">昏厥條件</option>
                  <option value="招式封鎖">招式封鎖</option>
                  <option value="招式鎖定">招式鎖定</option>
                  <option value="撤退封鎖">撤退封鎖</option>
                  <option value="撤退干擾">撤退干擾</option>
                  <option value="道具消除">道具消除</option>
                  <option value="物品卡封鎖">物品卡封鎖</option>
                  <option value="附著干擾">附著干擾</option>
                  <option value="支援者限制">支援者限制</option>
                </optgroup>
                <optgroup label="── 其他 ──">
                  <option value="切換效果">切換效果</option>
                  <option value="回復效果">回復效果</option>
                  <option value="進化支援">進化支援</option>
                  <option value="招式複製">招式複製</option>
                  <option value="硬幣判定">硬幣判定</option>
                  <option value="連續技">連續技</option>
                  <option value="獎賞控制">獎賞控制</option>
                  <option value="情報收集">情報收集</option>
                  <option value="弱點改變">弱點改變</option>
                </optgroup>
              </select>
            </div>

            {/* Ability / Attack Text Search */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                效果文字搜索
              </label>
              <input
                type="text"
                placeholder="例: 超、鬥、雷、太晶"
                value={filters.abilityText || ''}
                onChange={(e) => updateFilter('abilityText', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 bg-white placeholder:text-gray-400"
              />
            </div>

            {/* Weakness Type */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                弱點屬性
              </label>
              <select
                value={filters.weakness || ''}
                onChange={(e) => updateFilter('weakness', e.target.value)}
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

            {/* Card Tier */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                卡牌等級
              </label>
              <select
                value={filters.cardTier || ''}
                onChange={(e) => updateFilter('cardTier', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
              >
                <option value="">全部</option>
                <option value="S+">S+ (最強)</option>
                <option value="S">S</option>
                <option value="A+">A+</option>
                <option value="A">A</option>
                <option value="B+">B+</option>
                <option value="B">B</option>
                <option value="C+">C+</option>
                <option value="C">C</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
