'use client';

import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { ArrowUpRight, Search } from 'lucide-react';

const mockTournaments = [
  {
    id: '2025-hk-cup',
    name: '2025 香港大師賽',
    date: '2025-12-08',
    location: '香港',
    topDecks: ['噴火龍 EX', '伊布 BOX', '噴火龍 EX'],
  },
  {
    id: '2025-jp-champ',
    name: '2025 日本地區賽',
    date: '2025-11-12',
    location: '東京',
    topDecks: ['未來箱', '古代箱', '未來箱'],
  },
  {
    id: '2025-en-regionals',
    name: '2025 EN Regional',
    date: '2025-10-05',
    location: '洛杉磯',
    topDecks: ['Charizard EX', 'Miraidon', 'Gardevoir'],
  },
];

export default function DeckBuilderTournamentsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">賽事牌組</h1>
            <p className="text-gray-600 mt-2">
              參考官方 Deck Builder 賽事列表，先以靜態資料展示版型。
            </p>
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜尋賽事名稱"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">賽事</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期 / 地點</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">熱門牌組</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {mockTournaments.map((tournament) => (
                <tr key={tournament.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{tournament.name}</div>
                    <div className="text-xs text-gray-500">{tournament.id}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div>{tournament.date}</div>
                    <div>{tournament.location}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {tournament.topDecks.map((deck, index) => (
                        <span
                          key={`${tournament.id}-${deck}-${index}`}
                          className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full"
                        >
                          {deck}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href="/deck-studio"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      開啟 Deck Studio
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 text-sm text-gray-500">
          賽事資料將會接上 /api/v1/storage/events 及 deck 資料來源。
        </div>
      </div>
    </div>
  );
}
