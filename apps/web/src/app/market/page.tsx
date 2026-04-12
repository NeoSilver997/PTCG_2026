'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

const SOURCE_LABELS: Record<string, string> = {
  YUYU_TEI: 'Yuyu-tei',
  HARERUYA: 'Hareruya',
  CARDMARKET: 'Cardmarket',
  TCGPLAYER: 'TCGPlayer',
  OTHER: 'Beehive TCG HK',
};

const SOURCE_COLORS: Record<string, string> = {
  YUYU_TEI: 'bg-red-100 text-red-700',
  HARERUYA: 'bg-blue-100 text-blue-700',
  CARDMARKET: 'bg-green-100 text-green-700',
  TCGPLAYER: 'bg-yellow-100 text-yellow-700',
  OTHER: 'bg-amber-100 text-amber-700',
};

interface CardPrice {
  id: string;
  source: string;
  price: number;
  currency: string;
  condition?: string;
  inStock: boolean;
  fetchedAt: string;
}

interface RecentPriceRow {
  id: string;
  source: string;
  price: number;
  currency: string;
  condition?: string;
  inStock: boolean;
  fetchedAt: string;
  card: { id: string; webCardId: string; name: string; imageUrl?: string };
}

interface PriceMover {
  card: { webCardId: string; name: string; imageUrl?: string; supertype?: string; types?: string[] };
  source: string;
  firstPrice: number;
  lastPrice: number;
  firstDate?: string;
  lastDate?: string;
  changePct: number;
}

const TYPE_EMOJI: Record<string, string> = {
  FIRE: '🔥', WATER: '💧', GRASS: '🌿', LIGHTNING: '⚡',
  PSYCHIC: '🔮', FIGHTING: '👊', DARKNESS: '🌑', METAL: '⚙️',
  DRAGON: '🐉', FAIRY: '✨', COLORLESS: '⭐',
};

const PAGE_SIZE = 50;

export default function MarketPage() {
  const [lookupId, setLookupId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [historyDays, setHistoryDays] = useState(30);
  const [browseSkip, setBrowseSkip] = useState(0);
  const [nameFilter, setNameFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'out'>('all');
  const [minPrice, setMinPrice] = useState<number>(0);
  const [hideBelow10, setHideBelow10] = useState(false);
  const [sortField, setSortField] = useState<'price' | 'fetchedAt'>('price');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState<'browse' | 'movers' | 'lookup'>('browse');
  const [moverPctFilter, setMoverPctFilter] = useState<{ min?: number; max?: number } | null>(null);
  const [moverDays, setMoverDays] = useState<30 | 90 | 180>(90);
  const [moverSupertype, setMoverSupertype] = useState<string>('');
  const [moverPokemonType, setMoverPokemonType] = useState<string>('');
  const [moverSortBy, setMoverSortBy] = useState<'change' | 'price'>('price');

  // Browse all prices
  const browseQuery = useQuery({
    queryKey: ['prices-recent', browseSkip, sortField, sortDir, nameFilter, stockFilter, minPrice, hideBelow10],
    queryFn: () => {
      const params = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(browseSkip),
        sortBy: sortField,
        sortDir: sortDir,
      });
      if (nameFilter) params.set('name', nameFilter);
      if (stockFilter === 'in') params.set('inStock', 'true');
      if (stockFilter === 'out') params.set('inStock', 'false');
      const effectiveMin = hideBelow10 ? Math.max(10, minPrice) : minPrice;
      if (effectiveMin > 0) params.set('minPrice', String(effectiveMin));
      return apiClient.get(`/prices?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Top movers
  const moversQuery = useQuery({
    queryKey: ['price-movers', moverPctFilter, moverDays, moverSupertype, moverPokemonType, moverSortBy],
    queryFn: () => {
      const params = new URLSearchParams({ take: '300', days: String(moverDays), sortBy: moverSortBy });
      if (moverPctFilter?.min !== undefined) params.set('minChangePct', String(moverPctFilter.min));
      if (moverPctFilter?.max !== undefined) params.set('maxChangePct', String(moverPctFilter.max));
      if (moverSupertype) params.set('supertype', moverSupertype);
      if (moverPokemonType) params.set('pokemonType', moverPokemonType);
      return apiClient.get(`/prices/movers?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Card lookup
  const priceQuery = useQuery({
    queryKey: ['prices', lookupId],
    queryFn: () => apiClient.get(`/prices/${lookupId}`),
    enabled: !!lookupId,
  });

  // Price history
  const historyQuery = useQuery({
    queryKey: ['price-history', lookupId, historyDays],
    queryFn: () => apiClient.get(`/prices/${lookupId}/history?days=${historyDays}`),
    enabled: !!lookupId,
  });

  const allRows: RecentPriceRow[] = browseQuery.data?.data?.data ?? [];
  const total: number = browseQuery.data?.data?.total ?? 0;
  const movers: PriceMover[] = moversQuery.data?.data ?? [];
  const cardPrices: CardPrice[] = priceQuery.data?.data?.prices ?? [];
  const cardInfo = priceQuery.data?.data?.card;
  const history: any[] = historyQuery.data?.data ?? [];

  // Data comes pre-sorted/filtered from the server; also apply minPrice client-side as fallback
  const effectiveClientMin = hideBelow10 ? Math.max(10, minPrice) : minPrice;
  const filteredRows = effectiveClientMin > 0
    ? allRows.filter((r) => r.price >= effectiveClientMin)
    : allRows;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = browseSkip / PAGE_SIZE + 1;

  function toggleSort(field: 'price' | 'fetchedAt') {
    setBrowseSkip(0);
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-500 text-white p-6">
        <h1 className="text-3xl font-bold">Market Prices</h1>
        <p className="text-amber-100 mt-1">
          {total > 0 ? `${total.toLocaleString()} price entries across all cards` : 'Track card prices across multiple sources'}
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b sticky top-14 z-10">
        <div className="max-w-6xl mx-auto px-4 flex gap-1 py-2">
          {(['browse', 'movers', 'lookup'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'browse' ? '🗂 Browse Prices' : tab === 'movers' ? '📈 Top Movers' : '🔍 Card Lookup'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* === BROWSE TAB === */}
        {activeTab === 'browse' && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Filters */}
            <div className="p-4 border-b flex flex-wrap gap-3 items-center">
              <input
                type="text"
                placeholder="Filter by card name…"
                value={nameFilter}
                onChange={(e) => { setNameFilter(e.target.value); setBrowseSkip(0); }}
                className="border rounded-md px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <select
                value={stockFilter}
                onChange={(e) => { setStockFilter(e.target.value as any); setBrowseSkip(0); }}
                className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="all">All stock</option>
                <option value="in">In stock</option>
                <option value="out">Out of stock</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideBelow10}
                  onChange={(e) => { setHideBelow10(e.target.checked); setBrowseSkip(0); }}
                  className="rounded accent-amber-500"
                />
                Hide &lt; 10
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Min price</span>
                <input
                  type="number"
                  min={0}
                  value={minPrice || ''}
                  placeholder="0"
                  onChange={(e) => { setMinPrice(e.target.value ? parseFloat(e.target.value) : 0); setBrowseSkip(0); }}
                  className="border rounded-md px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <span className="text-xs text-gray-400 ml-auto">
                Page {currentPage} / {totalPages || 1} · {total.toLocaleString()} total
              </span>
            </div>

            {/* Table */}
            {browseQuery.isLoading && (
              <div className="text-center py-16 text-gray-400">Loading prices…</div>
            )}
            {browseQuery.isError && (
              <div className="text-center py-16 text-red-500">Failed to load prices. Make sure the API is running.</div>
            )}
            {!browseQuery.isLoading && filteredRows.length === 0 && (
              <div className="text-center py-16 text-gray-400">No price data found.</div>
            )}

            {filteredRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Card</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Source</th>
                      <th
                        className="text-right px-4 py-2 text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-amber-700"
                        onClick={() => toggleSort('price')}
                      >
                        Price {sortField === 'price' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">Stock</th>
                      <th
                        className="text-left px-4 py-2 text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-amber-700"
                        onClick={() => toggleSort('fetchedAt')}
                      >
                        Updated {sortField === 'fetchedAt' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="hover:bg-amber-50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3">
                            {row.card.imageUrl ? (
                              <img src={row.card.imageUrl} alt={row.card.name} className="w-8 h-11 object-contain rounded shrink-0" />
                            ) : (
                              <div className="w-8 h-11 bg-gray-100 rounded shrink-0 flex items-center justify-center text-gray-300 text-xs">?</div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900 leading-tight">{row.card.name}</p>
                              <p className="text-xs text-gray-400">{row.card.webCardId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[row.source] ?? 'bg-gray-100 text-gray-600'}`}>
                            {SOURCE_LABELS[row.source] ?? row.source}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-gray-900">
                          {row.price.toLocaleString()} <span className="font-normal text-gray-500 text-xs">{row.currency}</span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs font-medium ${row.inStock ? 'text-green-600' : 'text-red-400'}`}>
                            {row.inStock ? '✓ In Stock' : '✗ Out'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">
                          {new Date(row.fetchedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => { setSearchInput(row.card.webCardId); setLookupId(row.card.webCardId); setActiveTab('lookup'); }}
                            className="text-xs text-amber-600 hover:underline"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                <button
                  disabled={browseSkip === 0}
                  onClick={() => setBrowseSkip(Math.max(0, browseSkip - PAGE_SIZE))}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-40 hover:bg-white"
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">
                  Showing {browseSkip + 1}–{Math.min(browseSkip + PAGE_SIZE, total)} of {total.toLocaleString()}
                </span>
                <button
                  disabled={browseSkip + PAGE_SIZE >= total}
                  onClick={() => setBrowseSkip(browseSkip + PAGE_SIZE)}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-40 hover:bg-white"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* === MOVERS TAB === */}
        {activeTab === 'movers' && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b space-y-3">
              {/* Row 1: Title + sort + day range */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-800">Top Movers — {moverDays}d</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Cards with the largest % price change over the last {moverDays} days</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Sort by */}
                  <div className="flex gap-1">
                    {([{ label: '% Change', value: 'change' }, { label: 'Price', value: 'price' }] as const).map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => setMoverSortBy(value)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          moverSortBy === value ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {value === 'change' ? '📈' : '💰'} {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-gray-200">|</span>
                  {/* Day range */}
                  <div className="flex gap-1">
                    {([30, 90, 180] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setMoverDays(d)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          moverDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {d}d{d === 90 ? ' ✦' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Row 2: Supertype + Pokemon type */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-400 font-medium">Type:</span>
                {[
                  { label: 'All', value: '' },
                  { label: '🎴 Pokémon', value: 'POKEMON' },
                  { label: '🃏 Trainer', value: 'TRAINER' },
                  { label: '⚡ Energy', value: 'ENERGY' },
                ].map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => { setMoverSupertype(value); setMoverPokemonType(''); }}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      moverSupertype === value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {moverSupertype === 'POKEMON' && (
                  <>
                    <span className="text-xs text-gray-300">|</span>
                    {['', 'FIRE', 'WATER', 'GRASS', 'LIGHTNING', 'PSYCHIC', 'FIGHTING', 'DARKNESS', 'METAL', 'DRAGON', 'COLORLESS'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setMoverPokemonType(t)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          moverPokemonType === t ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {t === '' ? 'All' : `${TYPE_EMOJI[t] ?? ''} ${t.charAt(0) + t.slice(1).toLowerCase()}`}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {/* Row 3: % filters */}
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-xs text-gray-400 font-medium">Change:</span>
                {[
                  { label: 'All', filter: null },
                  { label: '+500%+', filter: { min: 500 } },
                  { label: '+200%', filter: { min: 200 } },
                  { label: '+100%', filter: { min: 100 } },
                  { label: '-8%', filter: { max: -8 } },
                  { label: '-16%', filter: { max: -16 } },
                  { label: '-35%', filter: { max: -35 } },
                  { label: '-60%', filter: { max: -60 } },
                  { label: '-80%+', filter: { max: -80 } },
                ].map(({ label, filter }) => {
                  const isActive = JSON.stringify(moverPctFilter) === JSON.stringify(filter);
                  const isGain = label.startsWith('+');
                  const isLoss = label.startsWith('-');
                  return (
                    <button
                      key={label}
                      onClick={() => setMoverPctFilter(filter)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        isActive
                          ? isGain ? 'bg-green-600 text-white' : isLoss ? 'bg-red-500 text-white' : 'bg-amber-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {moversQuery.isLoading && <p className="text-center py-16 text-gray-400">Loading…</p>}
            {!moversQuery.isLoading && movers.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-2xl mb-2">📊</p>
                <p>No significant price movements in the last 7 days.</p>
                <p className="text-sm mt-1">Prices were recently imported — check back after prices update.</p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700"
                >
                  Browse All Prices
                </button>
              </div>
            )}
            <div className="divide-y">
              {movers
                .filter((m) => Math.abs(m.changePct) > 0.01)
                .map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => { setSearchInput(m.card.webCardId); setLookupId(m.card.webCardId); setActiveTab('lookup'); }}
                  >
                    {m.card.imageUrl ? (
                      <img src={m.card.imageUrl} alt={m.card.name} className="w-8 h-11 object-contain rounded shrink-0" />
                    ) : (
                      <div className="w-8 h-11 bg-gray-100 rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-gray-900 text-sm truncate">{m.card.name}</p>
                        {m.card.supertype && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium shrink-0">
                            {m.card.supertype === 'POKEMON' ? '🎴' : m.card.supertype === 'TRAINER' ? '🃏' : '⚡'}{' '}
                            {m.card.supertype.charAt(0) + m.card.supertype.slice(1).toLowerCase()}
                          </span>
                        )}
                        {m.card.types && m.card.types.length > 0 && m.card.types.map((t) => (
                          <span key={t} className="text-xs shrink-0">{TYPE_EMOJI[t] ?? t}</span>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400">
                        {SOURCE_LABELS[m.source] ?? m.source}
                        {m.firstDate && m.lastDate && (
                          <span className="ml-1">
                            · {new Date(m.firstDate).toLocaleDateString()} → {new Date(m.lastDate).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm text-gray-600">
                        {m.firstPrice.toLocaleString()} → {m.lastPrice.toLocaleString()}
                      </p>
                      <p className={`text-sm font-bold ${m.changePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {m.changePct >= 0 ? '+' : ''}{m.changePct.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* === LOOKUP TAB === */}
        {activeTab === 'lookup' && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="font-semibold text-gray-800 mb-3">Card Price Lookup</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter card ID (e.g. hk14744)"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setLookupId(searchInput.trim())}
                className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => setLookupId(searchInput.trim())}
                disabled={!searchInput}
                className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
              >
                Lookup
              </button>
            </div>

            {lookupId && (
              <div className="mt-4">
                {priceQuery.isLoading && <p className="text-gray-400 text-sm">Loading prices…</p>}
                {priceQuery.isError && <p className="text-red-500 text-sm">Card not found or no prices available.</p>}

                {cardInfo && (
                  <div className="flex items-center gap-4 mb-4">
                    {cardInfo.imageUrl && (
                      <img src={cardInfo.imageUrl} alt={cardInfo.name} className="w-16 object-contain rounded" />
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900">{cardInfo.name}</h3>
                      <p className="text-sm text-gray-500">{cardInfo.webCardId}</p>
                    </div>
                  </div>
                )}

                {cardPrices.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Source</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Condition</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Price</th>
                          <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">In Stock</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {cardPrices.map((p) => (
                          <tr key={p.id}>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[p.source] ?? 'bg-gray-100 text-gray-600'}`}>
                                {SOURCE_LABELS[p.source] ?? p.source}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{p.condition ?? 'NM'}</td>
                            <td className="px-3 py-2 text-right font-bold text-gray-900">
                              {p.price.toLocaleString()} {p.currency}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={p.inStock ? 'text-green-500' : 'text-red-400'}>
                                {p.inStock ? '✓' : '✗'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-400 text-xs">
                              {new Date(p.fetchedAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {history.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-gray-700 text-sm">Price History</h4>
                      <select
                        value={historyDays}
                        onChange={(e) => setHistoryDays(parseInt(e.target.value))}
                        className="border rounded text-xs px-2 py-1"
                      >
                        <option value={7}>7 days</option>
                        <option value={30}>30 days</option>
                        <option value={90}>90 days</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-1 h-20 bg-gray-50 rounded p-2">
                      {history.slice(-30).map((h, i) => {
                        const maxPrice = Math.max(...history.map((x) => x.price));
                        const pct = maxPrice > 0 ? (h.price / maxPrice) * 100 : 0;
                        return (
                          <div
                            key={i}
                            className="flex-1 bg-amber-400 rounded-t hover:bg-amber-500 transition-colors min-h-[2px]"
                            style={{ height: `${Math.max(pct, 2)}%` }}
                            title={`${h.price} ${h.currency} · ${new Date(h.date).toLocaleDateString()}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!lookupId && (
              <p className="text-gray-400 text-sm mt-4">
                Enter a card ID above, or{' '}
                <button onClick={() => setActiveTab('browse')} className="text-amber-600 underline">
                  browse all prices
                </button>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

