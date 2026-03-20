'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import apiClient from '@/lib/api-client';

/* ---- Shared view-mode types & helpers ---- */
interface AttackData { name: string; damage: string; cost: string[]; }
interface ViewCard {
  webCardId: string; name: string; imageUrl?: string | null;
  supertype?: string | null; subtypes?: string[]; types?: string[];
  rarity?: string | null; hp?: number | null;
  attacks?: AttackData[] | null; evolutionStage?: string | null;
}
interface ViewEntry { quantity: number; card: ViewCard; }
type SectionKey = 'pokemon' | 'supporter' | 'item' | 'ace' | 'tool' | 'stadium' | 'basic-energy' | 'special-energy';
const SECTION_ORDER: SectionKey[] = ['pokemon','supporter','item','ace','tool','stadium','basic-energy','special-energy'];
const SECTION_LABELS: Record<SectionKey,string> = { pokemon:'Pokémon', supporter:'Supporter', item:'Item', ace:'ACE SPEC', tool:'Pokémon Tool', stadium:'Stadium', 'basic-energy':'Basic Energy', 'special-energy':'Special Energy' };
const SECTION_COLORS: Record<SectionKey,string> = { pokemon:'bg-emerald-600', supporter:'bg-blue-600', item:'bg-slate-500', ace:'bg-yellow-500', tool:'bg-purple-600', stadium:'bg-teal-600', 'basic-energy':'bg-orange-600', 'special-energy':'bg-pink-600' };
function maxDamage(attacks?: AttackData[] | null) { return attacks?.length ? Math.max(...attacks.map(a=>parseInt(String(a.damage||'0').replace(/[^0-9]/g,''),10)||0)) : 0; }
function getSectionKey(e: ViewEntry): SectionKey {
  const { supertype, subtypes = [], rarity } = e.card;
  if (supertype === 'POKEMON') return 'pokemon';
  if (supertype === 'ENERGY') return subtypes.includes('BASIC_ENERGY') ? 'basic-energy' : 'special-energy';
  if (rarity === 'ACE_SPEC') return 'ace';
  if (subtypes.includes('SUPPORTER')) return 'supporter';
  if (subtypes.includes('ITEM')) return 'item';
  if (subtypes.includes('TOOL')) return 'tool';
  if (subtypes.includes('STADIUM')) return 'stadium';
  return 'item';
}
function sortSection(entries: ViewEntry[], section: SectionKey) {
  return [...entries].sort((a,b) => section === 'pokemon'
    ? (b.card.hp??0)-(a.card.hp??0) || maxDamage(b.card.attacks)-maxDamage(a.card.attacks)
    : b.quantity-a.quantity || (a.card.name??'').localeCompare(b.card.name??''));
}
function ViewCardTile({ e, section }: { e: ViewEntry; section: SectionKey }) {
  const dmg = section==='pokemon' ? maxDamage(e.card.attacks) : 0;
  const col = SECTION_COLORS[section];
  return (
    <div className="relative">
      <div className="relative w-full aspect-[2.5/3.5] bg-slate-700 rounded-lg overflow-hidden border border-slate-600 hover:border-slate-400 transition">
        {e.card.imageUrl
          ? <Image src={e.card.imageUrl} alt={e.card.name} fill sizes="140px" className="object-contain" unoptimized />
          : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-[9px] text-center px-1">{e.card.name}</div>}
      </div>
      <div className={`absolute top-1 right-1 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow ${col}`}>×{e.quantity}</div>
      {(e.card.hp??0)>0 && <div className="absolute top-1 left-1 bg-red-700 text-white text-[8px] font-bold px-1 py-0.5 rounded shadow">{e.card.hp}HP</div>}
      {dmg>0 && <div className="absolute bottom-6 right-1 bg-orange-700 text-white text-[8px] font-bold px-1 py-0.5 rounded shadow">{dmg}</div>}
      <p className="text-slate-300 text-[9px] mt-0.5 text-center line-clamp-1 leading-tight">{e.card.name}</p>
      <p className="text-slate-600 text-[8px] text-center truncate leading-tight">
        <Link href={`/cards/${e.card.webCardId}`} onClick={(evt) => evt.stopPropagation()} className="hover:text-slate-400 transition-colors">
          {e.card.webCardId}
        </Link>
      </p>
    </div>
  );
}
function ViewSection({ section, entries }: { section: SectionKey; entries: ViewEntry[] }) {
  if (!entries.length) return null;
  const qty = entries.reduce((s,e)=>s+e.quantity,0);
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2.5 py-0.5 rounded text-xs font-bold text-white ${SECTION_COLORS[section]}`}>{SECTION_LABELS[section]}</span>
        <span className="text-slate-400 text-xs">{entries.length} types · {qty} cards</span>
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-11 gap-2">
        {sortSection(entries,section).map(e => <ViewCardTile key={e.card.webCardId} e={e} section={section} />)}
      </div>
    </div>
  );
}
function DeckViewMode({ deckId, onEdit }: { deckId: string; onEdit: ()=>void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => apiClient.get(`/decks/${deckId}`).then(r => r.data),
  });
  if (isLoading) return <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center text-slate-400 text-sm">Loading deck...</div>;
  if (isError || !data) return <div className="p-6 bg-slate-900 min-h-screen text-red-400">Deck not found.</div>;
  const entries: ViewEntry[] = (data.cards ?? []).map((c: any) => ({ quantity: c.quantity, card: c.card }));
  const sections = new Map<SectionKey, ViewEntry[]>();
  SECTION_ORDER.forEach(k => sections.set(k, []));
  entries.forEach(e => sections.get(getSectionKey(e))!.push(e));
  const total = entries.reduce((s,e)=>s+e.quantity,0);
  const pokQty = (sections.get('pokemon')??[]).reduce((s,e)=>s+e.quantity,0);
  const trnQty = (['supporter','item','ace','tool','stadium'] as SectionKey[]).flatMap(k=>sections.get(k)??[]).reduce((s,e)=>s+e.quantity,0);
  const enrQty = (['basic-energy','special-energy'] as SectionKey[]).flatMap(k=>sections.get(k)??[]).reduce((s,e)=>s+e.quantity,0);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/deck-builder/archetypes" className="text-slate-400 hover:text-white text-sm transition">← Archetypes</Link>
          <button onClick={onEdit} className="ml-auto px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition">✏️ Edit</button>
        </div>
        <div className="bg-slate-700/60 rounded-xl p-4 mb-5 border border-slate-600">
          <h1 className="text-white text-xl font-bold mb-2">{data.name}</h1>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-slate-300">Total: <span className="text-white font-semibold">{total}</span></span>
            <span className="text-emerald-400">Pokémon: {pokQty}</span>
            <span className="text-blue-400">Trainer: {trnQty}</span>
            <span className="text-orange-400">Energy: {enrQty}</span>
            {data.deckCode && (
              <a
                href={`https://www.pokemon-card.com/deck/confirm.html/deckID/${data.deckCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-mono text-xs underline underline-offset-2 transition-colors"
                title="View on pokemon-card.com"
              >
                #{data.deckCode} ↗
              </a>
            )}
          </div>
        </div>
        {SECTION_ORDER.map(key => <ViewSection key={key} section={key} entries={sections.get(key)??[]} />)}
      </div>
    </div>
  );
}

/* ---- Edit-mode types ---- */
interface Card {
  webCardId: string;
  name: string;
  imageUrl?: string;
  supertype?: string;
  subtype?: string;
  types?: string[];
  rarity?: string;
}

interface DeckCard {
  cardId: string;
  quantity: number;
  card: Card;
}

interface Deck {
  id: string;
  name: string;
  description?: string;
  archetype?: string;
  cards: DeckCard[];
}

const ARCHETYPES = ['AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'TOOLBOX', 'OTHER'];
const SUPERTYPES = ['', 'POKEMON', 'TRAINER', 'ENERGY'];

function DeckBuilderInner() {
  const searchParams = useSearchParams();
  const deckId = searchParams.get('deckId');
  const mode = searchParams.get('mode');
  const router = useRouter();
  const queryClient = useQueryClient();

  // If view mode, render DeckViewMode
  if (deckId && mode === 'view') {
    return <DeckViewMode deckId={deckId} onEdit={() => router.push(`/deck-builder?deckId=${deckId}`)} />;
  }

  // Deck state
  const [deckName, setDeckName] = useState('New Deck');
  const [deckArchetype, setDeckArchetype] = useState('');
  const [deckCards, setDeckCards] = useState<Map<string, DeckCard>>(new Map());
  const [savedDeckId, setSavedDeckId] = useState<string | null>(deckId);

  // Card search state
  const [cardSearch, setCardSearch] = useState('');
  const [supertype, setSupertype] = useState('');
  const [cardPage, setCardPage] = useState(0);

  const cardTake = 20;

  // Load existing deck if deckId provided
  const { data: deckData } = useQuery({
    queryKey: ['deck', deckId],
    queryFn: () => apiClient.get(`/decks/${deckId}`),
    enabled: !!deckId,
  });

  useEffect(() => {
    const deck: Deck | undefined = deckData?.data;
    if (!deck) return;
    setDeckName(deck.name);
    setDeckArchetype(deck.archetype ?? '');
    const map = new Map<string, DeckCard>();
    for (const dc of deck.cards) {
      map.set(dc.card.webCardId, dc);
    }
    setDeckCards(map);
    setSavedDeckId(deck.id);
  }, [deckData]);

  // Card search
  const { data: cardsData, isLoading: cardsLoading } = useQuery({
    queryKey: ['cards-search', cardSearch, supertype, cardPage],
    queryFn: () =>
      apiClient.get('/cards', {
        params: {
          ...(cardSearch && { search: cardSearch }),
          ...(supertype && { supertype }),
          skip: cardPage * cardTake,
          take: cardTake,
        },
      }),
  });

  const cards: Card[] = cardsData?.data?.data ?? [];
  const totalCards: number = cardsData?.data?.meta?.total ?? 0;
  const totalCardPages = Math.ceil(totalCards / cardTake);

  // Save deck mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const cardPayload = Array.from(deckCards.values()).map((dc) => ({
        cardId: dc.card.webCardId,
        quantity: dc.quantity,
      }));

      if (savedDeckId) {
        // Update cards
        return apiClient.post(`/decks/${savedDeckId}/cards`, cardPayload);
      } else {
        const res = await apiClient.post('/decks', {
          name: deckName,
          archetype: deckArchetype || undefined,
          cards: cardPayload,
        });
        setSavedDeckId(res.data.id);
        return res;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      alert('Deck saved!');
    },
  });

  const totalCount = Array.from(deckCards.values()).reduce((s, dc) => s + dc.quantity, 0);
  const currentDeckId = savedDeckId || deckId;

  const addCard = useCallback((card: Card) => {
    setDeckCards((prev) => {
      const next = new Map(prev);
      const existing = next.get(card.webCardId);
      if (existing) {
        if (existing.quantity < 4) {
          next.set(card.webCardId, { ...existing, quantity: existing.quantity + 1 });
        }
      } else {
        next.set(card.webCardId, { cardId: card.webCardId, quantity: 1, card });
      }
      return next;
    });
  }, []);

  const removeCard = useCallback((webCardId: string) => {
    setDeckCards((prev) => {
      const next = new Map(prev);
      const existing = next.get(webCardId);
      if (!existing) return prev;
      if (existing.quantity > 1) {
        next.set(webCardId, { ...existing, quantity: existing.quantity - 1 });
      } else {
        next.delete(webCardId);
      }
      return next;
    });
  }, []);

  const deckCardsSorted = Array.from(deckCards.values()).sort((a, b) => {
    const order = ['POKEMON', 'TRAINER', 'ENERGY'];
    return (
      (order.indexOf(a.card.supertype ?? '') - order.indexOf(b.card.supertype ?? '')) ||
      a.card.name.localeCompare(b.card.name)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-indigo-700 to-purple-600 text-white p-6">
        <h1 className="text-3xl font-bold">Deck Builder</h1>
        <p className="text-indigo-200 mt-1">Build and save your 60-card decks</p>
        {currentDeckId && (
          <button
            onClick={() => router.push(`/deck-builder?deckId=${currentDeckId}&mode=view`)}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm rounded-lg transition"
          >
            👁 View Deck
          </button>
        )}
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 flex gap-4 h-[calc(100vh-140px)]">
        {/* Left: Card Search */}
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-3 border-b space-y-2">
            <input
              type="text"
              placeholder="Search cards..."
              value={cardSearch}
              onChange={(e) => { setCardSearch(e.target.value); setCardPage(0); }}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <select
                value={supertype}
                onChange={(e) => { setSupertype(e.target.value); setCardPage(0); }}
                className="border rounded-md px-2 py-1.5 text-sm flex-1"
              >
                {SUPERTYPES.map((s) => (
                  <option key={s} value={s}>{s || 'All Types'}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400 self-center">{totalCards} cards</span>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {cardsLoading && <p className="text-center py-8 text-gray-400">Loading...</p>}
            {cards.map((card) => (
              <div
                key={card.webCardId}
                className="flex items-center gap-3 p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
                onClick={() => addCard(card)}
              >
                {card.imageUrl && (
                  <img src={card.imageUrl} alt={card.name} className="w-10 h-14 object-contain rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{card.name}</p>
                  <p className="text-xs text-gray-400">{card.supertype} · {card.rarity}</p>
                </div>
                <button className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-semibold hover:bg-indigo-200">
                  +
                </button>
              </div>
            ))}
          </div>

          {/* Card pagination */}
          {totalCardPages > 1 && (
            <div className="flex justify-between items-center p-2 border-t text-xs">
              <button onClick={() => setCardPage((p) => Math.max(0, p - 1))} disabled={cardPage === 0} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">←</button>
              <span className="text-gray-500">{cardPage + 1}/{totalCardPages}</span>
              <button onClick={() => setCardPage((p) => Math.min(totalCardPages - 1, p + 1))} disabled={cardPage >= totalCardPages - 1} className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50">→</button>
            </div>
          )}
        </div>

        {/* Right: Deck */}
        <div className="w-80 flex flex-col bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-3 border-b space-y-2">
            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full border rounded-md px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Deck name"
            />
            <select
              value={deckArchetype}
              onChange={(e) => setDeckArchetype(e.target.value)}
              className="w-full border rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">No Archetype</option>
              {ARCHETYPES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${totalCount === 60 ? 'text-green-600' : totalCount > 60 ? 'text-red-600' : 'text-gray-700'}`}>
                {totalCount}/60 cards
              </span>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || deckCards.size === 0}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-40"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Deck'}
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {deckCardsSorted.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">Click cards to add them</p>
            )}
            {deckCardsSorted.map((dc) => (
              <div key={dc.card.webCardId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 border-b border-gray-50">
                <span className="text-sm font-bold text-indigo-700 w-4 shrink-0">{dc.quantity}×</span>
                <span className="text-sm text-gray-800 flex-1 truncate">{dc.card.name}</span>
                <button onClick={() => addCard(dc.card)} className="text-green-600 hover:text-green-800 text-sm px-1">+</button>
                <button onClick={() => removeCard(dc.card.webCardId)} className="text-red-400 hover:text-red-600 text-sm px-1">−</button>
              </div>
            ))}
          </div>

          <div className="p-2 border-t">
            <Link href="/deck-studio" className="block text-center text-xs text-indigo-600 hover:underline">
              View all saved decks →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DeckBuilderPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>}>
      <DeckBuilderInner />
    </Suspense>
  );
}
