'use client';

import { use, useState, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import apiClient from '@/lib/api-client';
import {
  type DeckCardEntry,
  type SectionKey,
  SECTION_ORDER,
  getSectionKey,
  DeckSection,
  PairedSection,
  DeckSummary,
  CardDetailModal,
  CopyDeckModal,
} from '@/components/deck-view';

/* ---- Deck response from API ---- */
interface DeckResponse {
  id: string;
  name: string;
  deckCode?: string | null;
  cards?: DeckCardEntry[];
  deckData?: Array<{ cardId: string; cardName: string; quantity: number; imageUrl?: string }>;
}

/* ---- Inner page ---- */
function DeckViewInner({ deckCode }: { deckCode: string }) {
  const [selectedCard, setSelectedCard] = useState<DeckCardEntry | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['deck-by-code', deckCode],
    queryFn: async () => {
      try {
        const response = await apiClient.get<DeckResponse>(`/decks/code/${deckCode}`);
        return response.data;
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
        Loading deck...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <p className="text-red-400 mb-3">Deck not found.</p>
        <Link href="/deck-builder/archetypes" className="text-blue-400 hover:underline text-sm">
          ← Back to Archetypes
        </Link>
      </div>
    );
  }

  // Prefer DB-sourced cards (has HP, attacks, subtypes) over raw deckData
  const deckEntries: DeckCardEntry[] = (data.cards && data.cards.length > 0)
    ? data.cards
    : (data.deckData ?? []).map((c) => ({
        quantity: c.quantity,
        card: { webCardId: c.cardId, name: c.cardName, imageUrl: c.imageUrl },
      }));

  // Group into sections
  const sections = new Map<SectionKey, DeckCardEntry[]>();
  SECTION_ORDER.forEach((k) => sections.set(k, []));
  for (const entry of deckEntries) {
    sections.get(getSectionKey(entry))!.push(entry);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Navigation bar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <Link href="/deck-builder/archetypes" className="text-slate-400 hover:text-white text-sm transition">
            ← Archetypes
          </Link>
          <div className="flex-1" />
          <button
            onClick={() => setShowCopyModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition shadow-md"
          >
            <Copy className="h-3.5 w-3.5" />
            複製到我的牌組
          </button>
          {data.deckCode && (
            <a
              href={`https://www.pokemon-card.com/deck/confirm.html/deckID/${data.deckCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-slate-200 font-mono text-xs transition"
              title="View on pokemon-card.com"
            >
              #{data.deckCode} ↗
            </a>
          )}
        </div>

        {/* Header + Summary */}
        <div className="bg-slate-700/60 rounded-xl p-4 mb-6 border border-slate-600">
          <h1 className="text-white text-xl font-bold mb-4">{data.name}</h1>
          <DeckSummary entries={deckEntries} />
        </div>

        {/* Pokémon: Main attackers */}
        <DeckSection
          section="pokemon-main"
          entries={sections.get('pokemon-main') ?? []}
          onCardClick={setSelectedCard}
        />

        {/* Pokémon: Support / tech */}
        <DeckSection
          section="pokemon-support"
          entries={sections.get('pokemon-support') ?? []}
          onCardClick={setSelectedCard}
        />

        {/* ACE SPEC */}
        <DeckSection
          section="ace"
          entries={sections.get('ace') ?? []}
          onCardClick={setSelectedCard}
        />

        {/* Supporter + Stadium */}
        <PairedSection
          sectionA="supporter" sectionB="stadium"
          entriesA={sections.get('supporter') ?? []}
          entriesB={sections.get('stadium') ?? []}
          onCardClick={setSelectedCard}
        />

        {/* Item + Tool */}
        <PairedSection
          sectionA="item" sectionB="tool"
          entriesA={sections.get('item') ?? []}
          entriesB={sections.get('tool') ?? []}
          onCardClick={setSelectedCard}
        />

        {/* Energy */}
        <PairedSection
          sectionA="basic-energy" sectionB="special-energy"
          entriesA={sections.get('basic-energy') ?? []}
          entriesB={sections.get('special-energy') ?? []}
          onCardClick={setSelectedCard}
        />
      </div>

      {/* Card detail modal */}
      {selectedCard && (
        <CardDetailModal entry={selectedCard} onClose={() => setSelectedCard(null)} />
      )}

      {/* Copy deck modal */}
      {showCopyModal && (
        <CopyDeckModal
          deckName={data.name}
          entries={deckEntries}
          onClose={() => setShowCopyModal(false)}
        />
      )}
    </div>
  );
}

export default function DeckBuilderEventDeckPage({ params }: { params: Promise<{ deckCode: string }> }) {
  const { deckCode } = use(params);
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-slate-400 text-sm">
        Loading...
      </div>
    }>
      <DeckViewInner deckCode={deckCode} />
    </Suspense>
  );
}

