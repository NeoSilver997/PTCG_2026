'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, List } from 'lucide-react';
import apiClient from '@/lib/api-client';

export interface SpeciesSummary {
  id: string;
  dexNumber: string;
  form: string;
  nameZhHant: string;
  nameZhHans: string;
  nameJa: string;
  nameEn: string;
  latestZhImage: string | null;
  latestZhCardId: string | null;
  cardCounts: Record<string, number>; // JA_JP, ZH_TW, EN_US
  evolvesFrom: string | null; // JA name of pre-evolution
  evolutionStage: string | null; // BASIC, STAGE_1, STAGE_2, …
}

const STAGE_LABEL: Record<string, { label: string; color: string }> = {
  BASIC:    { label: 'たね',   color: 'bg-green-100 text-green-700' },
  STAGE_1:  { label: '1進化', color: 'bg-blue-100 text-blue-700' },
  STAGE_2:  { label: '2進化', color: 'bg-purple-100 text-purple-700' },
  STAGE_3:  { label: '3進化', color: 'bg-red-100 text-red-700' },
  BABY:     { label: 'よちよち', color: 'bg-yellow-100 text-yellow-700' },
  RESTORED: { label: '化石',  color: 'bg-amber-100 text-amber-700' },
  VSTAR:    { label: 'VSTAR', color: 'bg-pink-100 text-pink-700' },
  VMAX:     { label: 'VMAX',  color: 'bg-pink-100 text-pink-700' },
};

interface EvolutionChain {
  members: SpeciesSummary[];
}

/** Follow evolvesFrom links upward to find chain root — resolves from all name fields. */
function findRoot(
  s: SpeciesSummary,
  byJaName: Map<string, SpeciesSummary>,
  byZhHant: Map<string, SpeciesSummary>,
  byZhHans: Map<string, SpeciesSummary>,
  byEnName: Map<string, SpeciesSummary>,
  visited = new Set<string>(),
): SpeciesSummary {
  if (!s.evolvesFrom || visited.has(s.id)) return s;
  const parent =
    byJaName.get(s.evolvesFrom) ??
    byZhHant.get(s.evolvesFrom) ??
    byZhHans.get(s.evolvesFrom) ??
    byEnName.get(s.evolvesFrom);
  if (!parent) return s;
  visited.add(s.id);
  return findRoot(parent, byJaName, byZhHant, byZhHans, byEnName, visited);
}

function buildEvolutionChains(species: SpeciesSummary[]): EvolutionChain[] {
  const byJaName  = new Map(species.map((s) => [s.nameJa,     s]));
  const byZhHant  = new Map(species.map((s) => [s.nameZhHant, s]));
  const byZhHans  = new Map(species.map((s) => [s.nameZhHans, s]));
  const byEnName  = new Map(species.map((s) => [s.nameEn,     s]));

  const resolve = (name: string | null) =>
    name
      ? byJaName.get(name) ?? byZhHant.get(name) ?? byZhHans.get(name) ?? byEnName.get(name)
      : undefined;

  // Group by root
  const chainMap = new Map<string, SpeciesSummary[]>();
  for (const s of species) {
    const root = findRoot(s, byJaName, byZhHant, byZhHans, byEnName);
    if (!chainMap.has(root.id)) chainMap.set(root.id, []);
    chainMap.get(root.id)!.push(s);
  }

  // Emit chains in dex-number order
  const result: EvolutionChain[] = [];
  const visited = new Set<string>();
  for (const s of species) {
    const root = findRoot(s, byJaName, byZhHant, byZhHans, byEnName);
    if (!visited.has(root.id)) {
      visited.add(root.id);
      const members = chainMap.get(root.id)!.slice().sort((a, b) =>
        a.dexNumber.localeCompare(b.dexNumber) || a.form.localeCompare(b.form),
      );
      result.push({ members });
    }
  }
  return result;
}

function LangCounts({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div className="flex flex-wrap gap-0.5 mt-1">
      {counts['JA_JP'] ? (
        <span className="text-[9px] bg-red-50 text-red-600 px-1 py-0.5 rounded font-medium">
          🇯🇵{counts['JA_JP']}
        </span>
      ) : null}
      {counts['ZH_TW'] ? (
        <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded font-medium">
          🇹🇼{counts['ZH_TW']}
        </span>
      ) : null}
      {counts['EN_US'] ? (
        <span className="text-[9px] bg-green-50 text-green-600 px-1 py-0.5 rounded font-medium">
          🇺🇸{counts['EN_US']}
        </span>
      ) : null}
    </div>
  );
}

function SpeciesCard({
  s,
  onClick,
  compact = false,
}: {
  s: SpeciesSummary;
  onClick: () => void;
  compact?: boolean;
}) {
  const total = Object.values(s.cardCounts).reduce((a, b) => a + b, 0);
  const stageInfo = s.evolutionStage ? STAGE_LABEL[s.evolutionStage] : null;
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left group ${compact ? 'w-28 flex-shrink-0' : 'w-full'}`}
    >
      {/* Card image */}
      <div className="aspect-[3/4] bg-gray-100 rounded-t-lg overflow-hidden relative">
        {s.latestZhImage ? (
          <img
            src={s.latestZhImage}
            alt={s.nameZhHant}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 gap-1">
            <span className="text-2xl opacity-30">⚪</span>
            <span className="text-[9px] font-mono text-gray-400">#{s.dexNumber}</span>
          </div>
        )}
        {total === 0 && (
          <div className="absolute inset-0 bg-gray-50/60 flex items-center justify-center">
            <span className="text-[9px] text-gray-400">無卡牌</span>
          </div>
        )}
        {stageInfo && (
          <div className="absolute bottom-1 left-1">
            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${stageInfo.color}`}>
              {stageInfo.label}
            </span>
          </div>
        )}
      </div>

      {/* Info block */}
      <div className="p-1.5">
        <div className="text-[9px] text-gray-400 font-mono">#{s.dexNumber}</div>
        <div className="font-semibold text-[11px] text-gray-900 leading-tight truncate group-hover:text-blue-600">
          {s.nameZhHant}
        </div>
        {s.form && (
          <div className="text-[9px] text-purple-500 truncate">{s.form}</div>
        )}
        <div className="text-[9px] text-gray-400 truncate">{s.nameEn}</div>
        <LangCounts counts={s.cardCounts} />
      </div>
    </button>
  );
}

function ChainBlock({
  chain,
  onClickSpecies,
}: {
  chain: EvolutionChain;
  onClickSpecies: (s: SpeciesSummary) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-start gap-2 overflow-x-auto">
      {chain.members.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 flex-shrink-0">
          {i > 0 && (
            <span className="text-gray-300 text-lg self-center flex-shrink-0">→</span>
          )}
          <SpeciesCard s={s} compact onClick={() => onClickSpecies(s)} />
        </div>
      ))}
    </div>
  );
}

export default function PokemonPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showForms, setShowForms] = useState(false);
  const [viewMode, setViewMode] = useState<'chain' | 3 | 6 | 9 | 12>('chain');

  const { data: speciesList, isLoading, error } = useQuery<SpeciesSummary[]>({
    queryKey: ['pokemon-species-summary'],
    queryFn: async () => {
      const res = await apiClient.get('/cards/species-summary');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!speciesList) return [];
    const q = search.trim().toLowerCase();
    let list = showForms ? speciesList : speciesList.filter((p) => !p.form);
    if (!q) return list;
    return list.filter(
      (p) =>
        p.dexNumber.includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.nameZhHant.includes(search.trim()) ||
        p.nameZhHans.includes(search.trim()) ||
        p.nameJa.includes(search.trim())
    );
  }, [speciesList, search, showForms]);

  const chains = useMemo(() => buildEvolutionChains(filtered), [filtered]);

  const handleClick = (s: SpeciesSummary) => {
    router.push(
      `/pokemon/${s.dexNumber}${s.form ? `?form=${encodeURIComponent(s.form)}` : ''}`
    );
  };

  // Stats for header
  const totalCards = useMemo(() => {
    if (!speciesList) return { JA_JP: 0, ZH_TW: 0, EN_US: 0 };
    const totals: Record<string, number> = {};
    for (const s of speciesList) {
      for (const [lang, cnt] of Object.entries(s.cardCounts)) {
        totals[lang] = (totals[lang] ?? 0) + cnt;
      }
    }
    return totals;
  }, [speciesList]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">寶可夢圖鑑</h1>
          <p className="text-sm text-gray-500">按寶可夢圖鑑編號瀏覽卡牌，並依進化鏈分組</p>
        </div>

        {/* Cards-by-language summary block */}
        {speciesList && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600">資料庫卡牌總數</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-lg">
                <span className="text-base">🇯🇵</span>
                <div>
                  <div className="text-xs text-red-600 font-medium">日文</div>
                  <div className="text-lg font-bold text-red-700">{(totalCards['JA_JP'] ?? 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg">
                <span className="text-base">🇹🇼</span>
                <div>
                  <div className="text-xs text-blue-600 font-medium">繁中</div>
                  <div className="text-lg font-bold text-blue-700">{(totalCards['ZH_TW'] ?? 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-lg">
                <span className="text-base">🇺🇸</span>
                <div>
                  <div className="text-xs text-green-600 font-medium">英文</div>
                  <div className="text-lg font-bold text-green-700">{(totalCards['EN_US'] ?? 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg">
                <div>
                  <div className="text-xs text-gray-500 font-medium">寶可夢種</div>
                  <div className="text-lg font-bold text-gray-700">{speciesList.length.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋寶可夢（號碼、中文、日文、英文名稱）..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowForms((v) => !v)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                showForms
                  ? 'bg-purple-100 text-purple-700 border-purple-300'
                  : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {showForms ? '✓ 顯示異形' : '異形'}
            </button>
            <div className="flex-shrink-0 flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setViewMode('chain')}
                title="進化鏈視圖"
                className={`px-2.5 py-2 transition-colors text-xs font-medium ${
                  viewMode === 'chain'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-100'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              {([3, 6, 9, 12] as const).map((n, i) => (
                <button
                  key={n}
                  onClick={() => setViewMode(n)}
                  title={`${n} 列視圖`}
                  className={`px-2.5 py-2 border-l border-gray-300 transition-colors text-xs font-bold ${
                    viewMode === n
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {speciesList && (
            <div className="mt-2 text-xs text-gray-500">
              顯示 {filtered.length} / {showForms ? speciesList.length : speciesList.filter(p => !p.form).length} 隻寶可夢
              {viewMode === 'chain' && <span> · {chains.length} 個進化鏈</span>}
              {typeof viewMode === 'number' && <span> · {viewMode} 列視圖</span>}
              {!showForms && speciesList.filter(p => p.form).length > 0 && (
                <span className="ml-1 text-purple-500">（已隱藏 {speciesList.filter(p => p.form).length} 個異形）</span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">載入中...</div>
        ) : error ? (
          <div className="text-center py-16 text-red-500">載入失敗，請重試</div>
        ) : viewMode !== 'chain' ? (
          <div className={`grid gap-3 ${
            viewMode === 3  ? 'grid-cols-2 sm:grid-cols-3' :
            viewMode === 6  ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6' :
            viewMode === 9  ? 'grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9' :
                              'grid-cols-5 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-12'
          }`}>
            {filtered.map((s) => (
              <SpeciesCard key={s.id} s={s} onClick={() => handleClick(s)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {/* Render chains: multi-member chains span full width, solo chains pack into a mini-grid row */}
            {(() => {
              const elements: React.ReactNode[] = [];
              let soloBuffer: SpeciesSummary[] = [];

              const flushSoloBuffer = () => {
                if (soloBuffer.length === 0) return;
                elements.push(
                  <div
                    key={`solo-${soloBuffer[0].id}`}
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-2"
                  >
                    {soloBuffer.map((s) => (
                      <SpeciesCard key={s.id} s={s} onClick={() => handleClick(s)} />
                    ))}
                  </div>
                );
                soloBuffer = [];
              };

              for (const chain of chains) {
                if (chain.members.length === 1) {
                  soloBuffer.push(chain.members[0]);
                } else {
                  flushSoloBuffer();
                  elements.push(
                    <ChainBlock
                      key={chain.members[0].id}
                      chain={chain}
                      onClickSpecies={handleClick}
                    />
                  );
                }
              }
              flushSoloBuffer();
              return elements;
            })()}
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
