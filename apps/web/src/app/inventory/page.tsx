'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

interface CollectionItem {
  id: string;
  cardId: string;
  quantity: number;
  condition?: string;
  notes?: string;
  card: {
    webCardId: string;
    name: string;
    imageUrl?: string;
    supertype?: string;
    types?: string[];
    rarity?: string;
  };
}

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DAMAGED'];

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'text-gray-500',
  UNCOMMON: 'text-green-600',
  RARE: 'text-blue-600',
  DOUBLE_RARE: 'text-purple-600',
  ILLUSTRATION_RARE: 'text-pink-600',
  SPECIAL_ILLUSTRATION_RARE: 'text-red-600',
  ULTRA_RARE: 'text-yellow-600',
  HYPER_RARE: 'text-orange-600',
};

export default function InventoryPage() {
  const [page, setPage] = useState(0);
  const [addCardId, setAddCardId] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [addCondition, setAddCondition] = useState('NM');
  const [showAddForm, setShowAddForm] = useState(false);
  const queryClient = useQueryClient();
  const take = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', page],
    queryFn: () => apiClient.get('/inventory', { params: { skip: page * take, take } }),
  });

  const items: CollectionItem[] = data?.data?.data ?? [];
  const total: number = data?.data?.meta?.total ?? 0;
  const totalPages = Math.ceil(total / take);

  const upsertMutation = useMutation({
    mutationFn: (dto: { cardId: string; quantity: number; condition?: string }) =>
      apiClient.post('/inventory', dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setAddCardId('');
      setAddQty(1);
      setShowAddForm(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (cardId: string) => apiClient.delete(`/inventory/${cardId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const handleExportCSV = () => {
    const rows = [
      ['Card ID', 'Name', 'Supertype', 'Rarity', 'Quantity', 'Condition', 'Notes'],
      ...items.map((i) => [
        i.card.webCardId,
        i.card.name,
        i.card.supertype ?? '',
        i.card.rarity ?? '',
        i.quantity,
        i.condition ?? '',
        i.notes ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map(String).map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-600 text-white p-6">
        <h1 className="text-3xl font-bold">Inventory</h1>
        <p className="text-emerald-200 mt-1">{total} cards in your collection</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Actions bar */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-center justify-between">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700"
          >
            + Add Card
          </button>
          <button
            onClick={handleExportCSV}
            disabled={items.length === 0}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Card Web ID</label>
              <input
                value={addCardId}
                onChange={(e) => setAddCardId(e.target.value)}
                placeholder="e.g. hk00014744"
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantity</label>
              <input
                type="number"
                value={addQty}
                min={1}
                max={99}
                onChange={(e) => setAddQty(parseInt(e.target.value) || 1)}
                className="w-20 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Condition</label>
              <select
                value={addCondition}
                onChange={(e) => setAddCondition(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              >
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button
              onClick={() => upsertMutation.mutate({ cardId: addCardId, quantity: addQty, condition: addCondition })}
              disabled={!addCardId || upsertMutation.isPending}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
            >
              {upsertMutation.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        )}

        {/* Items table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {isLoading && <p className="text-center py-8 text-gray-400">Loading inventory...</p>}
          {!isLoading && items.length === 0 && (
            <p className="text-center py-12 text-gray-400">Your inventory is empty. Add cards above.</p>
          )}
          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Card</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rarity</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Condition</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.card.imageUrl && (
                          <img src={item.card.imageUrl} alt={item.card.name} className="w-8 h-11 object-contain rounded" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{item.card.name}</p>
                          <p className="text-xs text-gray-400">{item.card.webCardId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.card.supertype}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${RARITY_COLORS[item.card.rarity ?? ''] ?? 'text-gray-600'}`}>
                        {item.card.rarity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-gray-800">{item.quantity}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{item.condition ?? 'NM'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${item.card.name} from inventory?`)) {
                            removeMutation.mutate(item.card.webCardId);
                          }
                        }}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 border rounded-md text-sm disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <span className="px-4 py-2 text-sm text-gray-600">Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-4 py-2 border rounded-md text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
