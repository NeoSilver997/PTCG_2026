'use client';

import { use, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import apiClient from '@/lib/api-client';

/* ---- Types ---- */
interface AttackData {
  name: string;
  damage: string;
  cost: string[];
  text?: string;
}

interface CardDetail {
  webCardId: string;
  name: string;
  imageUrl?: string | null;
  supertype?: string | null;
  subtypes?: string[];
  types?: string[];
  rarity?: string | null;
  hp?: number | null;
  attacks?: AttackData[] | null;
  evolutionStage?: string | null;
}

interface DeckCardEntry {
  quantity: number;
  card: CardDetail;
}

interface DeckResponse {
  id: string;
  name: string;
  deckCode?: string | null;
  cards?: DeckCardEntry[];
  deckData?: Array<{ cardId: string; cardName: string; quantity: number; imageUrl?: string }>;
}

/* ---- Sort helpers ---- */
function maxDamage(attacks: AttackData[] | null | undefined): number {
  if (!attacks?.length) return 0;
  return Math.max(...attacks.map(a => parseInt(String(a.damage || '0').replace(/[^0-9]/g, ''), 10) || 0));
}

type SectionKey = 'pokemon' | 'supporter' | 'item' | 'ace' | 'tool' | 'stadium' | 'basic-energy' | 'special-energy';

const SECTION_ORDER: SectionKey[] = ['pokemon', 'supporter', 'item', 'ace', 'tool', 'stadium', 'basic-energy', 'special-energy'];

const SECTION_LABELS: Record<SectionKey, string> = {
  pokemon: 'Pokémon',
  supporter: 'Supporter',
  item: 'Item',
  ace: 'ACE SPEC',
  tool: 'Pokémon Tool',
  stadium: 'Stadium',
  'basic-energy': 'Basic Energy',
  'special-energy': 'Special Energy',
};

const SECTION_COLORS: Record<SectionKey, string> = {
  pokemon: 'bg-emerald-600',
  supporter: 'bg-blue-600',
  item: 'bg-slate-500',
  ace: 'bg-yellow-500 text-black',
  tool: 'bg-purple-600',
  stadium: 'bg-teal-600',
  'basic-energy': 'bg-orange-600',
  'special-energy': 'bg-pink-600',
};

function getSectionKey(entry: DeckCardEntry): SectionKey {
  const { supertype, subtypes = [], rarity } = entry.card;
  if (supertype === 'POKEMON') return 'pokemon';
  if (supertype === 'ENERGY') return subtypes.includes('BASIC_ENERGY') ? 'basic-energy' : 'special-energy';
  if (supertype === 'TRAINER') {
    if (rarity === 'ACE_SPEC') return 'ace';
    if (subtypes.includes('SUPPORTER')) return 'supporter';
    if (subtypes.includes('ITEM')) return 'item';
    if (subtypes.includes('TOOL')) return 'tool';
    if (subtypes.includes('STADIUM')) return 'stadium';
    return 'item';
  }
  return 'item';
}

function sortSection(entries: DeckCardEntry[], section: SectionKey): DeckCardEntry[] {
  return [...entries].sort((a, b) => {
    if (section === 'pokemon') {
      const hpDiff = (b.card.hp ?? 0) - (a.card.hp ?? 0);
      if (hpDiff !== 0) return hpDiff;
      return maxDamage(b.card.attacks) - maxDamage(a.card.attacks);
    }
    return b.quantity - a.quantity || (a.card.name ?? '').localeCompare(b.card.name ?? '');
  });
}

/* ---- Card tile ---- */
function CardTile({ entry, section }: { entry: DeckCardEntry; section: SectionKey }) {
  const dmg = section === 'pokemon' ? maxDamage(entry.card.attacks) : 0;
  const colorClass = SECTION_COLORS[section] || 'bg-slate-600';
  return (
    <div className="relative">
      <div className="relative w-full aspect-[2.5/3.5] bg-slate-700 rounded-lg overflow-hidden border border-slate-600 hover:border-slate-400 transition">
        {entry.card.imageUrl ? (
          <Image
            src={entry.card.imageUrl}
            alt={entry.card.name}
            fill
            sizes="160px"
            className="object-contain"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-[10px] text-center px-1 leading-tight">
            {entry.card.name}
          </div>
        )}
      </div>
      {/* Quantity */}
      <div className={`absolute top-1 right-1 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow ${colorClass}`}>
        ×{entry.quantity}
      </div>
      {/* HP (Pokemon) */}
      {entry.card.hp != null && entry.card.hp > 0 && (
        <div className="absolute top-1 left-1 bg-red-700 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow">
          {entry.card.hp}HP
        </div>
      )}
      {/* Max damage (Pokemon) */}
      {dmg > 0 && (
        <div className="absolute bottom-6 right-1 bg-orange-700 text-white text-[9px] font-bold px-1 py-0.5 rounded shadow">
          {dmg}
        </div>
      )}
      <p className="text-slate-300 text-[10px] mt-1 text-center line-clamp-1 leading-tight">{entry.card.name}</p>
    </div>
  );
}

/* ---- Paired section (two sub-sections side by side) ---- */
function PairedSection({ sectionA, sectionB, entriesA, entriesB }: {
  sectionA: SectionKey; sectionB: SectionKey;
  entriesA: DeckCardEntry[]; entriesB: DeckCardEntry[];
}) {
  if (!entriesA.length && !entriesB.length) return null;
  return (
    <div className="mb-6 flex gap-4">
      {entriesA.length > 0 && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${SECTION_COLORS[sectionA] ?? 'bg-slate-600'}`}>
              {SECTION_LABELS[sectionA]}
            </span>
            <span className="text-slate-400 text-xs">
              {entriesA.length} types · {entriesA.reduce((s, e) => s + e.quantity, 0)} cards
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
            {sortSection(entriesA, sectionA).map((entry) => (
              <CardTile key={entry.card.webCardId} entry={entry} section={sectionA} />
            ))}
          </div>
        </div>
      )}
      {entriesA.length > 0 && entriesB.length > 0 && (
        <div className="w-px bg-slate-700 self-stretch" />
      )}
      {entriesB.length > 0 && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${SECTION_COLORS[sectionB] ?? 'bg-slate-600'}`}>
              {SECTION_LABELS[sectionB]}
            </span>
            <span className="text-slate-400 text-xs">
              {entriesB.length} types · {entriesB.reduce((s, e) => s + e.quantity, 0)} cards
            </span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
            {sortSection(entriesB, sectionB).map((entry) => (
              <CardTile key={entry.card.webCardId} entry={entry} section={sectionB} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Section block ---- */
function DeckSection({ section, entries }: { section: SectionKey; entries: DeckCardEntry[] }) {
  if (entries.length === 0) return null;
  const totalQty = entries.reduce((s, e) => s + e.quantity, 0);
  const sorted = sortSection(entries, section);
  const colorClass = SECTION_COLORS[section] || 'bg-slate-600';
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${colorClass}`}>
          {SECTION_LABELS[section]}
        </span>
        <span className="text-slate-400 text-xs">{entries.length} types · {totalQty} cards</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11 gap-2">
        {sorted.map((entry) => (
          <CardTile key={entry.card.webCardId} entry={entry} section={section} />
        ))}
      </div>
    </div>
  );
}

/* ---- Inner page (needs QueryClientProvider from parent layout) ---- */
function DeckViewInner({ deckCode }: { deckCode: string }) {
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
        <Link href="/deck-builder/archetypes" className="text-blue-400 hover:underline text-sm">← Back to Archetypes</Link>
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

  const totalCards = deckEntries.reduce((s, e) => s + e.quantity, 0);

  // Group into sections
  const sections = new Map<SectionKey, DeckCardEntry[]>();
  SECTION_ORDER.forEach((k) => sections.set(k, []));
  for (const entry of deckEntries) {
    sections.get(getSectionKey(entry))!.push(entry);
  }

  const pokemonQty = (sections.get('pokemon') ?? []).reduce((s, e) => s + e.quantity, 0);
  const trainerQty = (['supporter', 'item', 'ace', 'tool', 'stadium'] as SectionKey[])
    .flatMap((k) => sections.get(k) ?? []).reduce((s, e) => s + e.quantity, 0);
  const energyQty = (['basic-energy', 'special-energy'] as SectionKey[])
    .flatMap((k) => sections.get(k) ?? []).reduce((s, e) => s + e.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <Link href="/deck-builder/archetypes" className="text-slate-400 hover:text-white text-sm transition mb-4 inline-block">
          ← Archetypes
        </Link>

        <div className="bg-slate-700/60 rounded-xl p-4 mb-6 border border-slate-600">
          <h1 className="text-white text-xl font-bold mb-2">{data.name}</h1>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-slate-300">Total: <span className="text-white font-semibold">{totalCards}</span></span>
            <span className="text-emerald-400">Pokémon: {pokemonQty}</span>
            <span className="text-blue-400">Trainer: {trainerQty}</span>
            <span className="text-orange-400">Energy: {energyQty}</span>
            {data.deckCode && <span className="text-slate-500 font-mono text-xs">#{data.deckCode}</span>}
          </div>
        </div>

        <DeckSection key="pokemon" section="pokemon" entries={sections.get('pokemon') ?? []} />
        <DeckSection key="ace" section="ace" entries={sections.get('ace') ?? []} />
        <PairedSection
          sectionA="supporter" sectionB="stadium"
          entriesA={sections.get('supporter') ?? []} entriesB={sections.get('stadium') ?? []}
        />
        <PairedSection
          sectionA="item" sectionB="tool"
          entriesA={sections.get('item') ?? []} entriesB={sections.get('tool') ?? []}
        />
        <PairedSection
          sectionA="basic-energy" sectionB="special-energy"
          entriesA={sections.get('basic-energy') ?? []} entriesB={sections.get('special-energy') ?? []}
        />
      </div>
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
