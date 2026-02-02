'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  DollarSign,
  Eye,
  Package,
  Plus,
  Search,
  Sword,
  Trash2,
  Zap,
} from 'lucide-react';

interface DeckCard {
  name: string;
  quantity: number;
  category: 'POKEMON' | 'TRAINER' | 'ENERGY';
}

interface DeckSummary {
  id: string;
  name: string;
  format: 'Standard' | 'Expanded';
  totalCards: number;
  pokemonCount: number;
  trainerCount: number;
  energyCount: number;
  isValid: boolean;
  updatedAt: string;
  description: string;
  keyCards: string[];
  estimatedValue: number;
  mainAttribute: string;
}

const INITIAL_DECKS: DeckSummary[] = [
  {
    id: 'deck-001',
    name: '噴火龍 EX Midrange',
    format: 'Standard',
    totalCards: 60,
    pokemonCount: 16,
    trainerCount: 32,
    energyCount: 12,
    isValid: true,
    updatedAt: '2026-01-25',
    description: '以噴火龍 EX 為核心的穩定中速構築。',
    keyCards: ['噴火龍 EX', '火之結晶', '博士的研究'],
    estimatedValue: 1280,
    mainAttribute: 'FIRE',
  },
  {
    id: 'deck-002',
    name: '未來箱 Aggro',
    format: 'Expanded',
    totalCards: 58,
    pokemonCount: 20,
    trainerCount: 26,
    energyCount: 12,
    isValid: false,
    updatedAt: '2026-01-18',
    description: '高速進攻，主打未來系列組件。',
    keyCards: ['未來爆擊', '量子引擎'],
    estimatedValue: 860,
    mainAttribute: 'LIGHTNING',
  },
  {
    id: 'deck-003',
    name: 'Gardevoir Control',
    format: 'Standard',
    totalCards: 60,
    pokemonCount: 18,
    trainerCount: 30,
    energyCount: 12,
    isValid: true,
    updatedAt: '2026-01-10',
    description: '控制節奏，延伸後期資源。',
    keyCards: ['Gardevoir', '靈魂交換'],
    estimatedValue: 1020,
    mainAttribute: 'PSYCHIC',
  },
];

const INITIAL_CARDS: DeckCard[] = [
  { name: '噴火龍 EX', quantity: 2, category: 'POKEMON' },
  { name: '比比鳥', quantity: 4, category: 'POKEMON' },
  { name: '超級球', quantity: 4, category: 'TRAINER' },
  { name: '基本火能量', quantity: 10, category: 'ENERGY' },
];

export default function DeckStudioPage() {
  const [currentView, setCurrentView] = useState<'manager' | 'builder' | 'review'>('manager');
  const [decks] = useState<DeckSummary[]>(INITIAL_DECKS);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [cards, setCards] = useState<DeckCard[]>(INITIAL_CARDS);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredDecks = decks.filter((deck) =>
    deck.name.toLowerCase().includes(searchTerm.trim().toLowerCase()),
  );

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

  const stats = {
    totalDecks: decks.length,
    validDecks: decks.filter((deck) => deck.isValid).length,
    totalValue: decks.reduce((sum, deck) => sum + deck.estimatedValue, 0),
    formats: new Set(decks.map((deck) => deck.format)).size,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <Package className="h-8 w-8 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Deck Studio</h1>
                <p className="text-sm text-gray-600">Manage deck building workflows</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <Link
                href="/cards"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium w-full sm:w-auto"
              >
                <Search className="h-4 w-4" />
                <span>Card Search</span>
              </Link>
              <Link
                href="/deck-builder/tournaments"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium w-full sm:w-auto"
              >
                <Sword className="h-4 w-4" />
                <span>Deck Builder</span>
              </Link>
              <div className="text-sm text-gray-500">{decks.length} decks</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-lg shadow-sm border p-3">
          <nav className="flex flex-col sm:flex-row gap-2 sm:gap-6">
            {(['manager', 'builder', 'review'] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setCurrentView(view)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentView === view
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {view === 'manager' && 'Manager'}
                {view === 'builder' && 'Builder'}
                {view === 'review' && `Review${selectedDeck ? ` (${selectedDeck.name})` : ''}`}
              </button>
            ))}
          </nav>
        </div>

        {currentView === 'manager' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Deck Manager</h2>
                <p className="text-gray-600">Manage your Pokémon TCG decks and collections</p>
              </div>
              <div className="flex gap-2">
                <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg">
                  <Plus className="h-4 w-4" />
                  <span>New Deck</span>
                </button>
                <button className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg">
                  <Copy className="h-4 w-4" />
                  <span>Import from Text</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg">
                <p className="text-blue-100">Total Decks</p>
                <p className="text-2xl font-bold">{stats.totalDecks}</p>
              </div>
              <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg">
                <p className="text-green-100">Valid Decks</p>
                <p className="text-2xl font-bold">{stats.validDecks}</p>
              </div>
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg">
                <p className="text-purple-100">Total Value</p>
                <p className="text-2xl font-bold">${stats.totalValue}</p>
              </div>
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg">
                <p className="text-orange-100">Formats</p>
                <p className="text-2xl font-bold">{stats.formats}</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center gap-3">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search decks"
                  className="flex-1 text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDecks.map((deck) => (
                <div key={deck.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Package className="h-6 w-6 text-gray-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{deck.name}</h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                              {deck.format}
                            </span>
                            <span
                              className={`px-2 py-1 text-xs rounded-full ${
                                deck.isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {deck.isValid ? 'Valid' : 'Invalid'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDeck(deck);
                            setCurrentView('review');
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button type="button" className="p-1 text-gray-400 hover:text-green-600">
                          <Copy className="h-4 w-4" />
                        </button>
                        <button type="button" className="p-1 text-gray-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-blue-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-blue-600">{deck.pokemonCount}</div>
                        <div className="text-xs text-blue-600">Pokemon</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-green-600">{deck.trainerCount}</div>
                        <div className="text-xs text-green-600">Trainer</div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg p-2">
                        <div className="text-lg font-bold text-yellow-600">{deck.energyCount}</div>
                        <div className="text-xs text-yellow-600">Energy</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>{deck.totalCards}/60 cards</span>
                      <span className="text-green-600 font-semibold">${deck.estimatedValue}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <Zap className="h-3 w-3" />
                      <span>{deck.mainAttribute}</span>
                    </div>
                    <div className="text-xs text-gray-500">Updated {deck.updatedAt}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Deck Builder</h2>
                <button
                  type="button"
                  onClick={addCard}
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Plus className="h-4 w-4" />
                  Add Card
                </button>
              </div>
              <div className="space-y-3">
                {cards.map((card, index) => (
                  <div key={`${card.name}-${index}`} className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <input
                      type="text"
                      placeholder="Card name"
                      value={card.name}
                      onChange={(event) => updateCard(index, 'name', event.target.value)}
                      className="md:col-span-6 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={card.category}
                      onChange={(event) => updateCard(index, 'category', event.target.value)}
                      className="md:col-span-3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="POKEMON">Pokémon</option>
                      <option value="TRAINER">Trainer</option>
                      <option value="ENERGY">Energy</option>
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
                      aria-label="Remove card"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <aside className="bg-white rounded-lg p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Deck Info</h3>
                <p className="text-sm text-gray-500 mt-1">Sync with API later.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Deck Name</label>
                  <input
                    type="text"
                  placeholder="e.g. Charizard EX"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Format</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="STANDARD">Standard</option>
                  <option value="EXPANDED">Expanded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Archetype</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="AGGRO">Aggro</option>
                    <option value="MIDRANGE">Midrange</option>
                    <option value="CONTROL">Control</option>
                    <option value="COMBO">Combo</option>
                    <option value="TOOLBOX">Toolbox</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg opacity-60 cursor-not-allowed"
              >
                Save Deck (API pending)
              </button>
            </aside>
          </div>
        )}

        {currentView === 'review' && (
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Deck Review</h2>
            {selectedDeck ? (
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                  <span>Deck Name</span>
                  <span className="font-medium text-gray-900">{selectedDeck.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Format</span>
                  <span className="font-medium text-gray-900">{selectedDeck.format}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cards</span>
                  <span className="font-medium text-gray-900">{selectedDeck.totalCards}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Estimated Value</span>
                  <span className="font-medium text-gray-900">${selectedDeck.estimatedValue}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Key Cards</span>
                  <span className="font-medium text-gray-900">{selectedDeck.keyCards.join(', ')}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Select a deck from Manager.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
