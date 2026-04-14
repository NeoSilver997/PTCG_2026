'use client';

import { use, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { type DeckCardEntry, DeckPriceBreakdown } from '@/components/deck-view';

interface DeckResponse {
  id: string;
  name: string;
  deckCode?: string | null;
  cards?: DeckCardEntry[];
}

function PricesInner({ deckCode }: { deckCode: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['deck-by-code', deckCode],
    queryFn: async () => {
      try {
        const res = await apiClient.get<DeckResponse>(`/decks/code/${deckCode}`);
        return res.data;
      } catch {
        const mapRes = await fetch('/deck-code-map.json');
        if (!mapRes.ok) throw new Error('Deck not found');
        const codeMap = (await mapRes.json()) as Array<{ deckCode: string; id: string }>;
        const found = codeMap.find((e) => e.deckCode === deckCode);
        if (!found) throw new Error(`Deck ${deckCode} not found`);
        const byId = await apiClient.get<DeckResponse>(`/decks/${found.id}`);
        return { ...byId.data, deckCode };
      }
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-slate-400 text-sm">
        載入中...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <p className="text-red-400 mb-3">找不到牌組。</p>
        <Link href={`/deck-builder/event/${deckCode}`} className="text-blue-400 hover:underline text-sm">
          ← 返回牌組
        </Link>
      </div>
    );
  }

  const entries: DeckCardEntry[] = data.cards ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">

        {/* Back nav */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={`/deck-builder/event/${deckCode}`}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition"
          >
            <ArrowLeft className="h-4 w-4" />
            返回牌組
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-white text-2xl font-bold">{data.name}</h1>
          <p className="text-slate-400 text-sm mt-1">價格明細 · 港幣 HKD</p>
        </div>

        {/* Breakdown table */}
        <div className="bg-slate-800/60 rounded-xl border border-yellow-900/30 p-4 md:p-6">
          <DeckPriceBreakdown entries={entries} />
        </div>

      </div>
    </div>
  );
}

export default function DeckPricesPage({ params }: { params: Promise<{ deckCode: string }> }) {
  const { deckCode } = use(params);
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-slate-400 text-sm">
        載入中...
      </div>
    }>
      <PricesInner deckCode={deckCode} />
    </Suspense>
  );
}
