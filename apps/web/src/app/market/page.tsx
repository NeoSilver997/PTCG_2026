'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
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
  stockQty?: number | null;
  fetchedAt: string;
}

interface HistoryEntry {
  id: string;
  source: string;
  price: number;
  currency: string;
  inStock: boolean;
  stockQty?: number | null;
  date: string;
}

interface RecentPriceRow {
  id: string;
  source: string;
  price: number;
  currency: string;
  condition?: string;
  inStock: boolean;
  stockQty?: number | null;
  fetchedAt: string;
  card: { id: string; webCardId: string; name: string; imageUrl?: string; regulationMark?: string | null };
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
const MOVERS_PAGE_SIZE = 50;

export default function MarketPage() {
  const [lookupId, setLookupId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [browseSkip, setBrowseSkip] = useState(0);
  const [nameFilter, setNameFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'out'>('all');
  const [minPrice, setMinPrice] = useState<number>(0);
  const [hideBelow10, setHideBelow10] = useState(false);
  const [sortField, setSortField] = useState<'price' | 'fetchedAt'>('price');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState<'browse' | 'movers' | 'stock' | 'lookup'>('browse');
  const [moverPctFilter, setMoverPctFilter] = useState<{ min?: number; max?: number } | null>(null);
  const [moverDays, setMoverDays] = useState<28 | 90 | 180>(28);
  const [moverSupertype, setMoverSupertype] = useState<string>('');
  const [moverPokemonType, setMoverPokemonType] = useState<string>('');
  const [moverSortBy, setMoverSortBy] = useState<'change' | 'price'>('price');
  const [moverSkip, setMoverSkip] = useState(0);
  const [regulationMarks, setRegulationMarks] = useState<string[]>(['H', 'I', 'J']);

  // Custom price form
  const [cpPrice, setCpPrice] = useState('');
  const [cpCurrency, setCpCurrency] = useState('HKD');
  const [cpCondition, setCpCondition] = useState('NM');
  const [cpInStock, setCpInStock] = useState(true);
  const [cpStockQty, setCpStockQty] = useState('');
  const [cpSuccess, setCpSuccess] = useState(false);

  const queryClient = useQueryClient();
  const addPriceMutation = useMutation({
    mutationFn: (data: object) => apiClient.post('/prices', data),
    onSuccess: () => {
      setCpSuccess(true);
      setCpPrice('');
      setCpStockQty('');
      setTimeout(() => setCpSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['prices', lookupId] });
    },
  });

  const ALL_REG_MARKS = ['F', 'G', 'H', 'I', 'J'];

  function toggleRegMark(mark: string) {
    setRegulationMarks((prev) =>
      prev.includes(mark) ? prev.filter((m) => m !== mark) : [...prev, mark]
    );
    setBrowseSkip(0);
  }

  // Browse all prices
  const browseQuery = useQuery({
    queryKey: ['prices-recent', browseSkip, sortField, sortDir, nameFilter, stockFilter, minPrice, hideBelow10, regulationMarks],
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
      if (regulationMarks.length > 0) params.set('regulationMarks', regulationMarks.join(','));
      return apiClient.get(`/prices?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Top movers
  const moversQuery = useQuery({
    queryKey: ['price-movers', moverPctFilter, moverDays, moverSupertype, moverPokemonType, moverSortBy, regulationMarks],
    queryFn: () => {
      const params = new URLSearchParams({ take: '300', days: String(moverDays), sortBy: moverSortBy });
      if (moverPctFilter?.min !== undefined) params.set('minChangePct', String(moverPctFilter.min));
      if (moverPctFilter?.max !== undefined) params.set('maxChangePct', String(moverPctFilter.max));
      if (moverSupertype) params.set('supertype', moverSupertype);
      if (moverPokemonType) params.set('pokemonType', moverPokemonType);
      if (regulationMarks.length > 0) params.set('regulationMarks', regulationMarks.join(','));
      setMoverSkip(0);
      return apiClient.get(`/prices/movers?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Stock changes
  const stockQuery = useQuery({
    queryKey: ['price-stock-changes', regulationMarks],
    queryFn: () => {
      const params = new URLSearchParams({ days: '14' });
      if (regulationMarks.length > 0) params.set('regulationMarks', regulationMarks.join(','));
      return apiClient.get(`/prices/stock-changes?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Card lookup — now returns card + prices + 28d history in one call
  const priceQuery = useQuery({
    queryKey: ['prices', lookupId],
    queryFn: () => apiClient.get(`/prices/${lookupId}`),
    enabled: !!lookupId,
  });

  const allRows: RecentPriceRow[] = browseQuery.data?.data?.data ?? [];
  const total: number = browseQuery.data?.data?.total ?? 0;
  const movers: PriceMover[] = moversQuery.data?.data ?? [];
  const filteredMovers = movers.filter((m) => Math.abs(m.changePct) > 0.01);
  const moversTotal = filteredMovers.length;
  const moversTotalPages = Math.ceil(moversTotal / MOVERS_PAGE_SIZE);
  const moversCurrentPage = moverSkip / MOVERS_PAGE_SIZE + 1;
  const pagedMovers = filteredMovers.slice(moverSkip, moverSkip + MOVERS_PAGE_SIZE);
  const outOfStock: RecentPriceRow[] = stockQuery.data?.data?.outOfStock ?? [];
  const recentlyInStock: RecentPriceRow[] = stockQuery.data?.data?.recentlyInStock ?? [];
  const cardPrices: CardPrice[] = priceQuery.data?.data?.prices ?? [];
  const cardInfo = priceQuery.data?.data?.card;
  const history: HistoryEntry[] = priceQuery.data?.data?.history ?? [];

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
          {(['browse', 'movers', 'stock', 'lookup'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-amber-100 text-amber-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'browse' ? '🗂 Browse Prices' : tab === 'movers' ? '📈 Top Movers' : tab === 'stock' ? '📦 Stock Changes' : '🔍 Card Lookup'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* === BROWSE TAB === */}
        {activeTab === 'browse' && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Filters */}
            <div className="p-4 border-b space-y-2">
              {/* Row 1: Regulation mark filter */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-gray-500 font-medium">規格標記:</span>
                {ALL_REG_MARKS.map((mark) => (
                  <button
                    key={mark}
                    onClick={() => toggleRegMark(mark)}
                    className={`w-7 h-7 rounded text-xs font-bold transition-colors ${
                      regulationMarks.includes(mark)
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    {mark}
                  </button>
                ))}
                <button
                  onClick={() => { setRegulationMarks([]); setBrowseSkip(0); }}
                  className={`px-2 h-7 rounded text-xs font-medium transition-colors ${
                    regulationMarks.length === 0
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
              </div>
              {/* Row 2: Other filters */}
              <div className="flex flex-wrap gap-3 items-center">
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
                className="border rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                              <div className="flex items-center gap-1 mt-0.5">
                                <p className="text-xs text-gray-400">{row.card.webCardId}</p>
                                  {row.card.regulationMark && (
                                    <span className="text-xs font-bold bg-cyan-100 text-cyan-700 px-1 rounded leading-tight">
                                      {row.card.regulationMark}
                                  </span>
                                )}
                              </div>
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
                          {row.stockQty != null && (
                            <span className="block text-xs text-gray-400">qty: {row.stockQty}</span>
                          )}
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
                  <h2 className="font-semibold text-gray-800">Top Movers — {moverDays}d{moversTotal > 0 ? ` · ${moversTotal} cards` : ''}</h2>
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
                    {([28, 90, 180] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setMoverDays(d)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          moverDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {d}d{d === 28 ? ' ✦' : ''}
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
              {/* Row 4: Regulation mark filter */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-400 font-medium">Reg Mark:</span>
                {ALL_REG_MARKS.map((mark) => (
                  <button
                    key={mark}
                    onClick={() => toggleRegMark(mark)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                      regulationMarks.includes(mark)
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {mark}
                  </button>
                ))}
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
              {pagedMovers
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
            {moversTotal > MOVERS_PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                <button
                  disabled={moverSkip === 0}
                  onClick={() => setMoverSkip(Math.max(0, moverSkip - MOVERS_PAGE_SIZE))}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-40 hover:bg-white"
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">
                  Page {moversCurrentPage} / {moversTotalPages} · {moversTotal.toLocaleString()} results
                </span>
                <button
                  disabled={moverSkip + MOVERS_PAGE_SIZE >= moversTotal}
                  onClick={() => setMoverSkip(moverSkip + MOVERS_PAGE_SIZE)}
                  className="px-3 py-1 text-sm border rounded-md disabled:opacity-40 hover:bg-white"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* === STOCK TAB === */}
        {activeTab === 'stock' && (
          <div className="space-y-4">
            {stockQuery.isLoading && <div className="text-center py-16 text-gray-400 bg-white rounded-lg shadow-sm">Loading stock data…</div>}

            {/* Regulation mark filter */}
            <div className="bg-white rounded-lg shadow-sm px-4 py-3 flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-400 font-medium">Reg Mark:</span>
              {ALL_REG_MARKS.map((mark) => (
                <button
                  key={mark}
                  onClick={() => toggleRegMark(mark)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                    regulationMarks.includes(mark)
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {mark}
                </button>
              ))}
            </div>

            {/* Recently Restocked */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-green-50 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-green-800">Recently Restocked</h2>
                  <p className="text-xs text-green-600 mt-0.5">Cards that came back in stock within the last 14 days</p>
                </div>
                <span className="text-sm font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{recentlyInStock.length} cards</span>
              </div>
              {recentlyInStock.length === 0 && !stockQuery.isLoading && (
                <p className="text-center py-8 text-gray-400 text-sm">No recently restocked cards.</p>
              )}
              {recentlyInStock.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Card</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Source</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Price</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Restocked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {recentlyInStock.map((row) => (
                        <tr key={row.id} className="hover:bg-green-50 transition-colors cursor-pointer" onClick={() => { setSearchInput(row.card.webCardId); setLookupId(row.card.webCardId); setActiveTab('lookup'); }}>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              {row.card.imageUrl ? (
                                <img src={row.card.imageUrl} alt={row.card.name} className="w-8 h-11 object-contain rounded shrink-0" />
                              ) : (
                                <div className="w-8 h-11 bg-gray-100 rounded shrink-0" />
                              )}
                              <div>
                                <p className="font-medium text-gray-900 leading-tight">{row.card.name}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <p className="text-xs text-gray-400">{row.card.webCardId}</p>
                                  {row.card.regulationMark && (
                                    <span className="text-xs font-bold bg-cyan-100 text-cyan-700 px-1 rounded leading-tight">{row.card.regulationMark}</span>
                                  )}
                                </div>
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
                          <td className="px-4 py-2 text-xs text-green-600 font-medium">
                            {new Date(row.fetchedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Out of Stock */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-red-50 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-red-800">Out of Stock</h2>
                  <p className="text-xs text-red-500 mt-0.5">Prices may be stale — last known price shown</p>
                </div>
                <span className="text-sm font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{outOfStock.length} cards</span>
              </div>
              {outOfStock.length === 0 && !stockQuery.isLoading && (
                <p className="text-center py-8 text-gray-400 text-sm">No out-of-stock cards found.</p>
              )}
              {outOfStock.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Card</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Source</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Last Price</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Last Checked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {outOfStock.map((row) => {
                        const staleDays = Math.floor((Date.now() - new Date(row.fetchedAt).getTime()) / 86400000);
                        return (
                          <tr key={row.id} className="hover:bg-red-50 transition-colors cursor-pointer" onClick={() => { setSearchInput(row.card.webCardId); setLookupId(row.card.webCardId); setActiveTab('lookup'); }}>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-3">
                                {row.card.imageUrl ? (
                                  <img src={row.card.imageUrl} alt={row.card.name} className="w-8 h-11 object-contain rounded shrink-0" />
                                ) : (
                                  <div className="w-8 h-11 bg-gray-100 rounded shrink-0" />
                                )}
                                <div>
                                  <p className="font-medium text-gray-900 leading-tight">{row.card.name}</p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <p className="text-xs text-gray-400">{row.card.webCardId}</p>
                                    {row.card.regulationMark && (
                                      <span className="text-xs font-bold bg-cyan-100 text-cyan-700 px-1 rounded leading-tight">{row.card.regulationMark}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[row.source] ?? 'bg-gray-100 text-gray-600'}`}>
                                {SOURCE_LABELS[row.source] ?? row.source}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-gray-400">
                              {row.price.toLocaleString()} <span className="font-normal text-xs">{row.currency}</span>
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span className={staleDays > 7 ? 'text-red-500 font-medium' : 'text-gray-400'}>
                                {staleDays === 0 ? 'Today' : staleDays === 1 ? 'Yesterday' : `${staleDays}d ago`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === LOOKUP TAB === */}
        {activeTab === 'lookup' && (
          <div className="space-y-4">
            {/* Search bar */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h2 className="font-semibold text-gray-800 mb-3">Card Price Lookup</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter card ID (e.g. hk14744)"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setLookupId(searchInput.trim())}
                  className="flex-1 border rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={() => setLookupId(searchInput.trim())}
                  disabled={!searchInput}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
                >
                  Lookup
                </button>
              </div>
              {!lookupId && (
                <p className="text-gray-400 text-sm mt-3">
                  Enter a card ID above, or{' '}
                  <button onClick={() => setActiveTab('browse')} className="text-amber-600 underline">browse all prices</button>.
                </p>
              )}
            </div>

            {lookupId && (
              <>
                {priceQuery.isLoading && <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400">Loading…</div>}
                {priceQuery.isError && <div className="bg-white rounded-lg shadow-sm p-8 text-center text-red-500">Card not found or no prices available.</div>}

                {/* Card header */}
                {cardInfo && (
                  <div className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-4">
                    {cardInfo.imageUrl && (
                      <img src={cardInfo.imageUrl} alt={cardInfo.name} className="w-16 object-contain rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-lg">{cardInfo.name}</h3>
                        {cardInfo.regulationMark && (
                          <span className="text-xs font-bold bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded">{cardInfo.regulationMark}</span>
                        )}
                        {cardInfo.rarity && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">{cardInfo.rarity}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">{cardInfo.webCardId}</p>
                    </div>
                    <Link
                      href={`/cards/${cardInfo.webCardId}`}
                      className="shrink-0 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md font-medium transition-colors"
                    >
                      Card Detail →
                    </Link>
                  </div>
                )}

                {/* Current prices table */}
                {cardPrices.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <h4 className="font-medium text-gray-700 text-sm">Current Prices</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Source</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Condition</th>
                            <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Price</th>
                            <th className="text-center px-3 py-2 text-xs font-medium text-gray-500">Stock</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {cardPrices.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[p.source] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {SOURCE_LABELS[p.source] ?? p.source}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-700">{p.condition ?? 'NM'}</td>
                              <td className="px-3 py-2 text-right font-bold text-gray-900">
                                {p.price.toLocaleString()} <span className="font-normal text-gray-500 text-xs">{p.currency}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-xs font-medium ${p.inStock ? 'text-green-600' : 'text-red-400'}`}>
                                  {p.inStock ? '✓ In' : '✗ Out'}
                                </span>
                                {p.stockQty != null && (
                                  <span className="block text-xs text-gray-400">qty: {p.stockQty}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-400 text-xs">{new Date(p.fetchedAt).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Add Custom Price */}
                {cardInfo && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <h4 className="font-medium text-gray-700 text-sm">Add Custom Price</h4>
                    </div>
                    <div className="p-4 flex flex-wrap gap-3 items-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Price</label>
                        <input
                          type="number"
                          min={0}
                          value={cpPrice}
                          onChange={(e) => setCpPrice(e.target.value)}
                          placeholder="0"
                          className="border rounded-md px-3 py-1.5 text-sm text-gray-900 w-24 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Currency</label>
                        <select
                          value={cpCurrency}
                          onChange={(e) => setCpCurrency(e.target.value)}
                          className="border rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          <option value="HKD">HKD</option>
                          <option value="JPY">JPY</option>
                          <option value="USD">USD</option>
                          <option value="TWD">TWD</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Condition</label>
                        <select
                          value={cpCondition}
                          onChange={(e) => setCpCondition(e.target.value)}
                          className="border rounded-md px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          <option value="NM">NM</option>
                          <option value="LP">LP</option>
                          <option value="MP">MP</option>
                          <option value="HP">HP</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer pb-1.5">
                        <input
                          type="checkbox"
                          checked={cpInStock}
                          onChange={(e) => setCpInStock(e.target.checked)}
                          className="rounded accent-amber-500"
                        />
                        In Stock
                      </label>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Qty</label>
                        <input
                          type="number"
                          min={0}
                          value={cpStockQty}
                          onChange={(e) => setCpStockQty(e.target.value)}
                          placeholder="—"
                          className="border rounded-md px-3 py-1.5 text-sm text-gray-900 w-16 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        />
                      </div>
                      <button
                        disabled={!cpPrice || addPriceMutation.isPending}
                        onClick={() => addPriceMutation.mutate({
                          webCardId: lookupId,
                          source: 'USER',
                          price: parseFloat(cpPrice),
                          currency: cpCurrency,
                          condition: cpCondition,
                          inStock: cpInStock,
                          ...(cpStockQty !== '' ? { stockQty: parseInt(cpStockQty, 10) } : {}),
                        })}
                        className="px-4 py-1.5 bg-amber-600 text-white text-sm rounded-md font-medium hover:bg-amber-700 disabled:opacity-40"
                      >
                        {addPriceMutation.isPending ? 'Saving…' : 'Save Price'}
                      </button>
                      {cpSuccess && <span className="text-green-600 text-sm font-medium">✓ Saved!</span>}
                      {addPriceMutation.isError && <span className="text-red-500 text-sm">Failed to save.</span>}
                    </div>
                  </div>
                )}

                {/* 4-week stock + price history */}
                {history.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                      <h4 className="font-medium text-gray-700 text-sm">4-Week Stock & Price History</h4>
                      <span className="text-xs text-gray-400">{history.length} entries</span>
                    </div>

                    {/* Stock chart — bars colored by inStock */}
                    <div className="p-4">
                      <p className="text-xs text-gray-400 mb-2">Price chart — <span className="text-green-600 font-medium">green = in stock</span>, <span className="text-red-400 font-medium">red = out of stock</span></p>
                      <div className="flex items-end gap-0.5 h-24 bg-gray-50 rounded p-2">
                        {(() => {
                          const slice = history.slice(-56);
                          const maxP = Math.max(...slice.map((x) => x.price));
                          return slice.map((h, i) => {
                            const pct = maxP > 0 ? (h.price / maxP) * 100 : 0;
                            return (
                              <div
                                key={i}
                                className={`flex-1 rounded-t min-h-[2px] transition-opacity hover:opacity-70 ${h.inStock ? 'bg-green-400' : 'bg-red-400'}`}
                                style={{ height: `${Math.max(pct, 2)}%` }}
                                title={`${h.inStock ? '✓ In Stock' : '✗ Out'} · ${h.price.toLocaleString()} ${h.currency} · ${new Date(h.date).toLocaleDateString()} · ${SOURCE_LABELS[h.source] ?? h.source}`}
                              />
                            );
                          });
                        })()}
                      </div>

                      {/* Last 10 records table */}
                      <div className="mt-4">
                        <p className="text-xs font-medium text-gray-500 mb-1.5">Last 10 Records</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-1.5 pr-3 font-medium text-gray-500">Date</th>
                              <th className="text-left py-1.5 pr-3 font-medium text-gray-500">Source</th>
                              <th className="text-right py-1.5 pr-3 font-medium text-gray-500">Price</th>
                              <th className="text-center py-1.5 font-medium text-gray-500">Stock</th>
                              <th className="text-center py-1.5 font-medium text-gray-500">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {[...history].reverse().slice(0, 10).map((h) => (
                              <tr key={h.id} className={`${h.inStock ? '' : 'bg-red-50'}`}>
                                <td className="py-1.5 pr-3 text-gray-500">{new Date(h.date).toLocaleDateString()}</td>
                                <td className="py-1.5 pr-3">
                                  <span className={`px-1.5 py-0.5 rounded-full font-medium ${SOURCE_COLORS[h.source] ?? 'bg-gray-100 text-gray-600'}`}>
                                    {SOURCE_LABELS[h.source] ?? h.source}
                                  </span>
                                </td>
                                <td className="py-1.5 pr-3 text-right font-bold text-gray-900">
                                  {h.price.toLocaleString()} <span className="font-normal text-gray-500">{h.currency}</span>
                                </td>
                                <td className="py-1.5 text-center">
                                  <span className={`font-medium ${h.inStock ? 'text-green-600' : 'text-red-500'}`}>
                                    {h.inStock ? '✓' : '✗'}
                                  </span>
                                </td>
                                <td className="py-1.5 text-center text-gray-500">
                                  {h.stockQty != null ? h.stockQty : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

