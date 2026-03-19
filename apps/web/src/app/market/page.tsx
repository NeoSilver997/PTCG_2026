'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

const SOURCE_LABELS: Record<string, string> = {
  YUYU_TEI: 'Yuyu-tei',
  HARERUYA: 'Hareruya',
  CARDMARKET: 'Cardmarket',
  TCGPLAYER: 'TCGPlayer',
  OTHER: 'Other',
};

const SOURCE_COLORS: Record<string, string> = {
  YUYU_TEI: 'bg-red-100 text-red-700',
  HARERUYA: 'bg-blue-100 text-blue-700',
  CARDMARKET: 'bg-green-100 text-green-700',
  TCGPLAYER: 'bg-yellow-100 text-yellow-700',
  OTHER: 'bg-gray-100 text-gray-600',
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

interface PriceMover {
  card: { webCardId: string; name: string; imageUrl?: string };
  source: string;
  firstPrice: number;
  lastPrice: number;
  changePct: number;
}

export default function MarketPage() {
  const [lookupId, setLookupId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [historyDays, setHistoryDays] = useState(30);

  // Top movers
  const moversQuery = useQuery({
    queryKey: ['price-movers'],
    queryFn: () => apiClient.get('/prices/movers?take=20'),
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

  const movers: PriceMover[] = moversQuery.data?.data ?? [];
  const cardPrices: CardPrice[] = priceQuery.data?.data?.prices ?? [];
  const cardInfo = priceQuery.data?.data?.card;
  const history: any[] = historyQuery.data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-amber-600 to-orange-500 text-white p-6">
        <h1 className="text-3xl font-bold">Market Prices</h1>
        <p className="text-amber-100 mt-1">Track card prices across multiple sources</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Price Lookup */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Card Price Lookup</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter card webCardId (e.g. hk00014744)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setLookupId(searchInput)}
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              onClick={() => setLookupId(searchInput)}
              disabled={!searchInput}
              className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
            >
              Lookup
            </button>
          </div>

          {lookupId && (
            <div className="mt-4">
              {priceQuery.isLoading && <p className="text-gray-400 text-sm">Loading prices...</p>}
              {priceQuery.error && <p className="text-red-500 text-sm">Card not found or no prices available.</p>}

              {cardInfo && (
                <div className="flex items-center gap-4 mb-4">
                  {cardInfo.imageUrl && (
                    <img src={cardInfo.imageUrl} alt={cardInfo.name} className="w-16 h-22 object-contain rounded" />
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
                    <thead className="bg-gray-50">
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

              {/* Price history */}
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
                          className="flex-1 bg-amber-400 rounded-t hover:bg-amber-500 transition-colors"
                          style={{ height: `${pct}%` }}
                          title={`${h.price} ${h.currency} · ${new Date(h.date).toLocaleDateString()}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top Movers */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-800">Top Movers (Last 7 Days)</h2>
          </div>
          {moversQuery.isLoading && <p className="text-center py-8 text-gray-400">Loading movers...</p>}
          {movers.length === 0 && !moversQuery.isLoading && (
            <p className="text-center py-8 text-gray-400">No price data available yet.</p>
          )}
          <div className="divide-y">
            {movers.map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => { setSearchInput(m.card.webCardId); setLookupId(m.card.webCardId); }}
              >
                {m.card.imageUrl && (
                  <img src={m.card.imageUrl} alt={m.card.name} className="w-8 h-11 object-contain rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{m.card.name}</p>
                  <p className="text-xs text-gray-400">{SOURCE_LABELS[m.source] ?? m.source}</p>
                </div>
                <div className="text-right">
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
      </div>
    </div>
  );
}
