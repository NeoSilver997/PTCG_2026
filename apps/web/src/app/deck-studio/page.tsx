'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Plus, Trash2 } from 'lucide-react';

interface DeckCard {
  name: string;
  quantity: number;
  category: 'POKEMON' | 'TRAINER' | 'ENERGY';
}

const INITIAL_DECK: DeckCard[] = [
  { name: '噴火龍 EX', quantity: 2, category: 'POKEMON' },
  { name: '比比鳥', quantity: 4, category: 'POKEMON' },
  { name: '超級球', quantity: 4, category: 'TRAINER' },
  { name: '基本火能量', quantity: 10, category: 'ENERGY' },
];

export default function DeckStudioPage() {
  const [cards, setCards] = useState<DeckCard[]>(INITIAL_DECK);

  const addCard = () => {
    setCards([...cards, { name: '', quantity: 1, category: 'POKEMON' }]);
  };

  const updateCard = (index: number, key: keyof DeckCard, value: string | number) => {
    setCards((prev) =>
      prev.map((card, cardIndex) =>
        cardIndex === index ? { ...card, [key]: value } : card,
      ),
    );
  };

  const removeCard = (index: number) => {
    setCards(cards.filter((_, cardIndex) => cardIndex !== index));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Deck Studio</h1>
            <p className="text-gray-600 mt-2">建立與編輯牌組清單，對應 deck-studio 版型。</p>
          </div>
          <Link
            href="/deck-builder/tournaments"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            返回賽事列表
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">牌組列表</h2>
              <button
                type="button"
                onClick={addCard}
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
              >
                <Plus className="w-4 h-4" />
                新增卡片
              </button>
            </div>

            <div className="space-y-3">
              {cards.map((card, index) => (
                <div key={`${card.name}-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <input
                    type="text"
                    placeholder="卡片名稱"
                    value={card.name}
                    onChange={(event) => updateCard(index, 'name', event.target.value)}
                    className="md:col-span-6 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <select
                    value={card.category}
                    onChange={(event) => updateCard(index, 'category', event.target.value)}
                    className="md:col-span-3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="POKEMON">寶可夢</option>
                    <option value="TRAINER">訓練家</option>
                    <option value="ENERGY">能量</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={card.quantity}
                    onChange={(event) => updateCard(index, 'quantity', Number(event.target.value))}
                    className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeCard(index)}
                    className="md:col-span-1 flex items-center justify-center text-gray-400 hover:text-red-500"
                    aria-label="移除卡片"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <aside className="bg-white rounded-lg p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">牌組資訊</h3>
              <p className="text-sm text-gray-500 mt-1">
                尚未接上 API，先展示資料結構與操作流程。
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">牌組名稱</label>
                <input
                  type="text"
                  placeholder="例如：噴火龍 EX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">賽制</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="STANDARD">Standard</option>
                  <option value="EXPANDED">Expanded</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">牌組類型</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="AGGRO">Aggro</option>
                  <option value="MIDRANGE">Midrange</option>
                  <option value="CONTROL">Control</option>
                  <option value="COMBO">Combo</option>
                  <option value="TOOLBOX">Toolbox</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg opacity-60 cursor-not-allowed"
            >
              儲存牌組 (待 API)
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
