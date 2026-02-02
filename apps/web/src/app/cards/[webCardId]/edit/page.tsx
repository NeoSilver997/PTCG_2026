'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Plus, Trash2 } from 'lucide-react';

interface RelatedCardEntry {
  webCardId: string;
  note: string;
}

interface TournamentUsageEntry {
  event: string;
  deckName: string;
  placement: string;
}

export default function CardEditPage({ params }: { params: Promise<{ webCardId: string }> }) {
  const { webCardId } = use(params);
  const [relatedCards, setRelatedCards] = useState<RelatedCardEntry[]>([
    { webCardId: '', note: '' },
  ]);
  const [evolutionChain, setEvolutionChain] = useState({
    base: '',
    stage1: '',
    stage2: '',
  });
  const [tournamentUsage, setTournamentUsage] = useState<TournamentUsageEntry[]>([
    { event: '', deckName: '', placement: '' },
  ]);

  const updateRelatedCard = (index: number, key: keyof RelatedCardEntry, value: string) => {
    setRelatedCards((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry,
      ),
    );
  };

  const updateTournamentUsage = (index: number, key: keyof TournamentUsageEntry, value: string) => {
    setTournamentUsage((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry,
      ),
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">編輯卡片</h1>
            <p className="text-gray-600 mt-1">Web Card ID：{webCardId}</p>
          </div>
          <Link
            href={`/cards/${webCardId}`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            返回卡片詳情
          </Link>
        </div>

        <div className="space-y-6">
          <section className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">相關卡片</h2>
              <button
                type="button"
                onClick={() => setRelatedCards([...relatedCards, { webCardId: '', note: '' }])}
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus className="w-4 h-4" />
                新增關聯
              </button>
            </div>
            <div className="space-y-3">
              {relatedCards.map((entry, index) => (
                <div key={`${entry.webCardId}-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <input
                    type="text"
                    placeholder="卡片編號 (webCardId)"
                    value={entry.webCardId}
                    onChange={(event) => updateRelatedCard(index, 'webCardId', event.target.value)}
                    className="md:col-span-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="關聯說明 (例: 同系列、同構築)"
                    value={entry.note}
                    onChange={(event) => updateRelatedCard(index, 'note', event.target.value)}
                    className="md:col-span-7 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setRelatedCards(relatedCards.filter((_, entryIndex) => entryIndex !== index))}
                    className="md:col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500"
                    aria-label="移除關聯"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">進化鏈</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">基礎</label>
                <input
                  type="text"
                  placeholder="基礎形態卡片"
                  value={evolutionChain.base}
                  onChange={(event) =>
                    setEvolutionChain({ ...evolutionChain, base: event.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">1 階進化</label>
                <input
                  type="text"
                  placeholder="1 階進化卡片"
                  value={evolutionChain.stage1}
                  onChange={(event) =>
                    setEvolutionChain({ ...evolutionChain, stage1: event.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">2 階進化</label>
                <input
                  type="text"
                  placeholder="2 階進化卡片"
                  value={evolutionChain.stage2}
                  onChange={(event) =>
                    setEvolutionChain({ ...evolutionChain, stage2: event.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">賽事使用狀態</h2>
              <button
                type="button"
                onClick={() =>
                  setTournamentUsage([
                    ...tournamentUsage,
                    { event: '', deckName: '', placement: '' },
                  ])
                }
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus className="w-4 h-4" />
                新增紀錄
              </button>
            </div>
            <div className="space-y-3">
              {tournamentUsage.map((entry, index) => (
                <div key={`${entry.event}-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <input
                    type="text"
                    placeholder="賽事名稱"
                    value={entry.event}
                    onChange={(event) => updateTournamentUsage(index, 'event', event.target.value)}
                    className="md:col-span-5 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="牌組名稱"
                    value={entry.deckName}
                    onChange={(event) => updateTournamentUsage(index, 'deckName', event.target.value)}
                    className="md:col-span-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="名次 (例: Top 8)"
                    value={entry.placement}
                    onChange={(event) => updateTournamentUsage(index, 'placement', event.target.value)}
                    className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setTournamentUsage(tournamentUsage.filter((_, entryIndex) => entryIndex !== index))
                    }
                    className="md:col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500"
                    aria-label="移除賽事紀錄"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled
              className="px-5 py-2 bg-blue-600 text-white rounded-lg opacity-60 cursor-not-allowed"
            >
              儲存變更 (待 API)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
