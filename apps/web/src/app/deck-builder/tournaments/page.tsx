'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, Calendar, PenSquare, Search, Sword, Users } from 'lucide-react';

const tournaments = [
  {
    id: '2025-hk-cup',
    name: '2025 香港大師賽',
    date: '2025-12-08',
    location: '香港',
    format: 'Standard',
    players: 256,
    champion: '噴火龍 EX',
    topDecks: ['噴火龍 EX', '伊布 BOX', 'Miraidon'],
  },
  {
    id: '2025-jp-champ',
    name: '2025 日本地區賽',
    date: '2025-11-12',
    location: '東京',
    format: 'Expanded',
    players: 312,
    champion: '未來箱',
    topDecks: ['未來箱', '古代箱', '噴火龍 EX'],
  },
  {
    id: '2025-en-regionals',
    name: '2025 EN Regional',
    date: '2025-10-05',
    location: '洛杉磯',
    format: 'Standard',
    players: 198,
    champion: 'Gardevoir',
    topDecks: ['Charizard EX', 'Gardevoir', 'Miraidon'],
  },
];

export default function DeckBuilderTournamentsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTournaments = tournaments.filter((tournament) => {
    const keyword = searchTerm.trim();
    if (!keyword) return true;
    return [tournament.name, tournament.location, tournament.id]
      .join(' ')
      .toLowerCase()
      .includes(keyword.toLowerCase());
  });

  const totalPlayers = tournaments.reduce((sum, tournament) => sum + tournament.players, 0);
  const formatCount = new Set(tournaments.map((tournament) => tournament.format)).size;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <PenSquare className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Deck Builder</h1>
                <p className="text-sm text-gray-600">賽事牌組與構築參考</p>
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
                href="/deck-studio"
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm font-medium w-full sm:w-auto"
              >
                <Sword className="h-4 w-4" />
                <span>Deck Studio</span>
              </Link>
              <div className="text-sm text-gray-500">
                {tournaments.length} 場賽事
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100">賽事總數</p>
                <p className="text-2xl font-bold">{tournaments.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-blue-200" />
            </div>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100">參賽人數</p>
                <p className="text-2xl font-bold">{totalPlayers}</p>
              </div>
              <Users className="h-8 w-8 text-green-200" />
            </div>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100">賽制類型</p>
                <p className="text-2xl font-bold">{formatCount}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-purple-200" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜尋賽事或地區"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-sm text-gray-500">顯示 {filteredTournaments.length} 筆結果</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((tournament) => (
            <div
              key={tournament.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{tournament.name}</h3>
                    <p className="text-xs text-gray-500">{tournament.id}</p>
                  </div>
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
                    {tournament.format}
                  </span>
                </div>
                <div className="text-sm text-gray-600 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>日期</span>
                    <span className="font-medium">{tournament.date}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>地點</span>
                    <span className="font-medium">{tournament.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>參賽</span>
                    <span className="font-medium">{tournament.players}</span>
                  </div>
                </div>
              </div>
              <div className="p-5 bg-gray-50">
                <div className="text-xs text-gray-500 mb-2">熱門牌組</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {tournament.topDecks.map((deck, index) => (
                    <span
                      key={`${tournament.id}-${deck}-${index}`}
                      className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full"
                    >
                      {deck}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">冠軍</span>
                  <span className="font-semibold text-gray-900">{tournament.champion}</span>
                </div>
              </div>
              <div className="p-4 border-t border-gray-100">
                <Link
                  href="/deck-studio"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  開啟 Deck Studio
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
