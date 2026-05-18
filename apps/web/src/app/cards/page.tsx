'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardGrid } from '@/components/card-grid';
import { FilterPanel } from '@/components/filter-panel';
import { CardDetailOverlay } from '@/components/card-detail-overlay';
import apiClient from '@/lib/api-client';
import { useSearchParams } from 'next/navigation';

const FILTER_VERSION = '7';
const TAKE = 120;

const DEFAULT_FILTERS = {
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
  minDamage: '',
  artist: '',
  regulationMark: 'H,I,J',
  missingRegulationMark: '',
  expansionCode: '',
  hasAbilities: '',
  hasAttackText: '',
  effectTag: '',
  cardTier: '',
  abilityText: '',
  weakness: '',
  resistance: '',
};

function getInitialFilters() {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('cardFilters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.__version === FILTER_VERSION) {
          const { __version, ...rest } = parsed;
          return { ...DEFAULT_FILTERS, ...rest };
        }
      }
    } catch {}
  }
  return { ...DEFAULT_FILTERS };
}



interface CardStats {
  total: number;
  byLanguage: Array<{ language: string; count: number }>;
  bySupertype: Array<{ supertype: string; count: number }>;
  byExpansion: Array<{ code: string; nameEn: string; count: number }>;
}

function CardsPageInner() {
  const searchParams = useSearchParams();

  // Derive URL params before state initialization so they win on first render
  const urlEffectTag = searchParams.get('effectTag');
  const urlCardTier = searchParams.get('cardTier');

  const [filters, setFilters] = useState<typeof DEFAULT_FILTERS>(() => {
    const base = getInitialFilters();
    if (urlEffectTag) {
      return { ...base, effectTag: urlEffectTag, regulationMark: '', expansionCode: '' };
    }
    if (urlCardTier) {
      return { ...base, cardTier: urlCardTier };
    }
    return base;
  });
  const [skip, setSkip] = useState(0);
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [showOverlay, setShowOverlay] = useState(false);

  // Derive URL params so the effect dependency is stable scalars (re-runs on client-side navigation)

  // Apply URL params each time they change (covers both initial load and client-side navigation)
  useEffect(() => {
    if (urlEffectTag || urlCardTier) {
      setFilters(prev => ({
        ...prev,
        ...(urlEffectTag ? { effectTag: urlEffectTag, regulationMark: '', expansionCode: '' } : {}),
        ...(urlCardTier ? { cardTier: urlCardTier } : {}),
      }));
      setSkip(0);
    }
  }, [urlEffectTag, urlCardTier]);

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cardFilters', JSON.stringify({ ...filters, __version: FILTER_VERSION }));
  }, [filters]);

  const updateFilters = (newFilters: typeof DEFAULT_FILTERS) => {
    setFilters(newFilters);
    setSkip(0);
  };

  const { data: stats } = useQuery<CardStats>({
    queryKey: ['card-stats'],
    queryFn: async () => {
      const res = await apiClient.get<CardStats>('/cards/stats');
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['cards', filters, skip],
    queryFn: async () => {
      const params = new URLSearchParams();

      // Add filters to query params
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          params.append(key, value);
        }
      });

      params.append('take', String(TAKE));
      params.append('skip', String(skip));

      const response = await apiClient.get(`/cards?${params.toString()}`);
      return response.data;
    },
  });

  // Deduplicate by primaryCardId when toggled (client-side, keeps first per sort order)
  const displayCards: any[] = (() => {
    const raw: any[] = data?.data ?? [];
    if (!hideDuplicates) return raw;
    const seen = new Set<string>();
    return raw.filter((card: any) => {
      const key = card.primaryCardId;
      if (!key) return true; // no primaryCard — always show
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const totalCards: number = data?.pagination?.total ?? 0;
  const totalPages = Math.ceil(totalCards / TAKE);
  const currentPage = Math.floor(skip / TAKE) + 1;

  const handleCardImageClick = (card: any, index: number) => {
    setSelectedCard(card);
    setSelectedIndex(index);
    setShowOverlay(true);
  };

  const applyFilter = (patch: Partial<typeof DEFAULT_FILTERS>) => {
    updateFilters({ ...filters, ...patch });
  };

  const handleTagFilter = (tag: string) => {
    applyFilter({ effectTag: filters.effectTag === tag ? '' : tag });
  };

  const handleTypeFilter = (type: string) => {
    applyFilter({ types: filters.types === type ? '' : type });
  };

  const handleWeaknessFilter = (type: string) => {
    applyFilter({ weakness: filters.weakness === type ? '' : type });
  };

  const handlePrevCard = () => {
    if (selectedIndex <= 0) return;
    const nextIndex = selectedIndex - 1;
    setSelectedIndex(nextIndex);
    setSelectedCard(displayCards[nextIndex]);
  };

  const handleNextCard = () => {
    if (selectedIndex < 0 || selectedIndex >= displayCards.length - 1) return;
    const nextIndex = selectedIndex + 1;
    setSelectedIndex(nextIndex);
    setSelectedCard(displayCards[nextIndex]);
  };

  const handleCloseOverlay = () => {
    setShowOverlay(false);
    setSelectedCard(null);
    setSelectedIndex(-1);
  };

  const handleExportMarkdown = () => {
    if (!displayCards.length) return;

    const markdown = generateCardMarkdown(displayCards, filters);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ptcg-cards-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

function generateCardMarkdown(cards: any[], filters: typeof DEFAULT_FILTERS): string {
  const timestamp = new Date().toISOString();
  let markdown = `# PTCG Card Search Results\n\n`;
  markdown += `**Generated:** ${timestamp}\n\n`;

  // Add filter summary
  const activeFilters = Object.entries(filters).filter(([key, value]) => value && value !== '');
  if (activeFilters.length > 0) {
    markdown += `## Search Filters\n\n`;
    activeFilters.forEach(([key, value]) => {
      const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
      markdown += `- **${label}:** ${value}\n`;
    });
    markdown += `\n`;
  }

  markdown += `## Cards (${cards.length})\n\n`;

  cards.forEach((card, index) => {
    markdown += `### ${index + 1}. ${card.name}\n\n`;
    markdown += `**Web Card ID:** ${card.webCardId}\n`;
    if (card.primaryCard?.primaryExpansion) {
      markdown += `**Expansion:** ${card.primaryCard.primaryExpansion.code} - ${card.primaryCard.primaryExpansion.nameEn}\n`;
    }
    markdown += `**Language:** ${card.language}\n`;
    markdown += `**Supertype:** ${card.supertype}\n`;
    if (card.subtypes?.length > 0) {
      markdown += `**Subtypes:** ${card.subtypes.join(', ')}\n`;
    }
    if (card.rarity) {
      markdown += `**Rarity:** ${card.rarity}\n`;
    }
    if (card.variantType) {
      markdown += `**Variant:** ${card.variantType}\n`;
    }
    if (card.hp) {
      markdown += `**HP:** ${card.hp}\n`;
    }
    if (card.types) {
      const types = Array.isArray(card.types) ? card.types : [card.types];
      markdown += `**Types:** ${types.join(', ')}\n`;
    }
    if (card.artist) {
      markdown += `**Artist:** ${card.artist}\n`;
    }
    if (card.regulationMark) {
      markdown += `**Regulation Mark:** ${card.regulationMark}\n`;
    }

    // Abilities
    if (card.abilities && Array.isArray(card.abilities) && card.abilities.length > 0) {
      markdown += `\n**Abilities:**\n`;
      card.abilities.forEach((ability: any) => {
        markdown += `- **${ability.name}**`;
        if (ability.type) markdown += ` (${ability.type})`;
        markdown += `\n`;
        if (ability.text || ability.description) {
          markdown += `  ${ability.text || ability.description}\n`;
        }
      });
    }

    // Attacks
    if (card.attacks && Array.isArray(card.attacks) && card.attacks.length > 0) {
      markdown += `\n**Attacks:**\n`;
      card.attacks.forEach((attack: any) => {
        markdown += `- **${attack.name}**`;
        if (attack.cost && Array.isArray(attack.cost)) {
          markdown += ` [${attack.cost.join(', ')}]`;
        }
        if (attack.damage) {
          markdown += ` (${attack.damage})`;
        }
        markdown += `\n`;
        if (attack.effect || attack.text) {
          markdown += `  ${attack.effect || attack.text}\n`;
        }
      });
    }

    // Weaknesses and Resistances
    const weaknesses = card.weaknesses && Array.isArray(card.weaknesses) ? card.weaknesses : [];
    const resistances = card.resistances && Array.isArray(card.resistances) ? card.resistances : [];
    if (weaknesses.length > 0 || resistances.length > 0 || card.retreatCost != null) {
      markdown += `\n**Stats:**\n`;
      if (weaknesses.length > 0) {
        markdown += `- **Weaknesses:** ${weaknesses.map((w: any) => `${w.type} ${w.value}`).join(', ')}\n`;
      }
      if (resistances.length > 0) {
        markdown += `- **Resistances:** ${resistances.map((r: any) => `${r.type} ${r.value}`).join(', ')}\n`;
      }
      if (card.retreatCost != null) {
        markdown += `- **Retreat Cost:** ${card.retreatCost}\n`;
      }
    }

    // Effect tags and tier
    if (card.primaryCard?.effectTags?.length > 0 || card.primaryCard?.cardTier) {
      markdown += `\n**Meta Information:**\n`;
      if (card.primaryCard.effectTags?.length > 0) {
        markdown += `- **Effect Tags:** ${card.primaryCard.effectTags.join(', ')}\n`;
      }
      if (card.primaryCard.cardTier) {
        markdown += `- **Card Tier:** ${card.primaryCard.cardTier}\n`;
      }
    }

    if (card.imageUrl) {
      markdown += `\n**Image:** ${card.imageUrl}\n`;
    }

    markdown += `\n---\n\n`;
  });

  return markdown;
}

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
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
      <div className="w-full px-4 md:px-6 xl:px-8 2xl:px-10 py-6">
        <div className="mb-6">
          <FilterPanel filters={filters} onFilterChange={updateFilters} stats={stats} />
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-lg text-gray-600">載入中...</div>
          </div>
        ) : (
          <div>
            {data?.data && data.data.length > 0 ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
                  <div className="flex items-center gap-3">
                    <span>顯示 {skip + 1}–{Math.min(skip + data.data.length, totalCards)} / {totalCards} 張</span>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hideDuplicates}
                        onChange={e => setHideDuplicates(e.target.checked)}
                        className="w-3.5 h-3.5 accent-blue-600"
                      />
                      <span className="text-xs text-gray-600">隱藏重複卡</span>
                      {hideDuplicates && (
                        <span className="text-xs text-blue-600">({displayCards.length} 張)</span>
                      )}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportMarkdown}
                      disabled={!displayCards.length}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      匯出 Markdown
                    </button>
                    {totalPages > 1 && (
                      <>
                        <button onClick={() => setSkip(Math.max(0, skip - TAKE))} disabled={skip === 0}
                          className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-xs">上一頁</button>
                        <span className="text-xs">第 {currentPage} / {totalPages} 頁</span>
                        <button onClick={() => setSkip(skip + TAKE)} disabled={skip + TAKE >= totalCards}
                          className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-40 text-xs">下一頁</button>
                      </>
                    )}
                  </div>
                </div>
                <CardGrid
                  cards={displayCards}
                  onCardImageClick={handleCardImageClick}
                  onFilterByEffectTag={handleTagFilter}
                  onFilterByType={handleTypeFilter}
                  onFilterByWeakness={handleWeaknessFilter}
                />
                {totalPages > 1 && (
                  <div className="mt-6 flex justify-center items-center gap-3">
                    <button onClick={() => setSkip(Math.max(0, skip - TAKE))} disabled={skip === 0}
                      className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 text-sm">上一頁</button>
                    <span className="text-sm text-gray-700">第 {currentPage} / {totalPages} 頁</span>
                    <button onClick={() => setSkip(skip + TAKE)} disabled={skip + TAKE >= totalCards}
                      className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 text-sm">下一頁</button>
                  </div>
                )}
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

      {/* Card Detail Overlay */}
      {showOverlay && selectedCard && (
        <CardDetailOverlay
          card={selectedCard}
          onClose={handleCloseOverlay}
          onPrev={handlePrevCard}
          onNext={handleNextCard}
          canPrev={selectedIndex > 0}
          canNext={selectedIndex >= 0 && selectedIndex < displayCards.length - 1}
          currentIndex={selectedIndex}
          totalCount={displayCards.length}
        />
      )}
    </div>
  );
}

export default function CardsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <CardsPageInner />
    </Suspense>
  );
}
