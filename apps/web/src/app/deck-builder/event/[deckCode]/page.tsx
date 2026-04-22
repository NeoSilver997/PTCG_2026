'use client';

import { use, useState, useEffect, useRef, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import apiClient from '@/lib/api-client';
import {
  type DeckCardEntry,
  type SectionKey,
  type PokemonRole,
  SECTION_ORDER,
  getSectionKey,
  DeckSection,
  PairedSection,
  PairedPokemonSection,
  DeckSummary,
  CardDetailModal,
  CopyDeckModal,
  EffectsSummary,
  WeaknessSummary,
  EffectTagSummary,
} from '@/components/deck-view';

/* ---- Deck response from API ---- */
interface DeckResponse {
  id: string;
  name: string;
  deckCode?: string | null;
  cards?: DeckCardEntry[];
  deckData?: Array<{ cardId: string; cardName: string; quantity: number; imageUrl?: string }>;
  tournamentResults?: Array<{
    tournament: {
      date: string;
      name: string;
      location?: string;
    };
  }>;
  pricing?: {
    currency?: string;
    lowestTotal?: number;
    highestTotal?: number;
    zh?: { lowestTotal: number; highestTotal: number; budgetTotal: number; premiumTotal: number; currency: string };
  };
}

/* ---- Inner page ---- */
function DeckViewInner({ deckCode }: { deckCode: string }) {
  const [selectedCard, setSelectedCard] = useState<DeckCardEntry | null>(null);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showEffectsSummary, setShowEffectsSummary] = useState(false);

  const DB_TO_ROLE: Record<string, PokemonRole> = {
    POKEMON_MAIN: 'pokemon-main',
    POKEMON_SECONDARY: 'pokemon-secondary',
    POKEMON_SUPPORT: 'pokemon-support',
    POKEMON_EVOLUTION: 'pokemon-evolution',
  };
  const DB_ROLE: Record<PokemonRole, string> = {
    'pokemon-main': 'POKEMON_MAIN',
    'pokemon-secondary': 'POKEMON_SECONDARY',
    'pokemon-support': 'POKEMON_SUPPORT',
    'pokemon-evolution': 'POKEMON_EVOLUTION',
  };

  const storageKey = `ptcg:pokemon-roles:${deckCode}`;
  const queryClient = useQueryClient();

  // DB roles for this deck (source of truth)
  const { data: dbRoles } = useQuery<Record<string, string>>({
    queryKey: ['deck-roles', deckCode],
    queryFn: async () => {
      const res = await apiClient.get<Record<string, string>>(`/decks/code/${deckCode}/roles`);
      try { localStorage.setItem(storageKey, JSON.stringify(res.data)); } catch { /**/ }
      return res.data;
    },
    staleTime: 0,
  });

  // Local state: seeded from localStorage for instant rendering, then synced from DB
  const [localRoles, setLocalRoles] = useState<Map<string, PokemonRole>>(() => {
    if (typeof window === 'undefined') return new Map();
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) return new Map(Object.entries(JSON.parse(stored) as Record<string, PokemonRole>));
    } catch { /**/ }
    return new Map();
  });

  // Sync deck-specific DB roles → local state (merge: DB wins per-card, keep unrelated local entries)
  useEffect(() => {
    if (!dbRoles) return;
    setLocalRoles((prev) => {
      const next = new Map(prev);
      for (const [k, v] of Object.entries(dbRoles)) {
        const mapped = DB_TO_ROLE[v] ?? v as PokemonRole;
        if (mapped) next.set(k, mapped);
      }
      return next;
    });
  }, [dbRoles]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsertMutation = useMutation({
    mutationFn: async ({ cardId, role }: { cardId: string; role: PokemonRole }) => {
      await apiClient.put(`/decks/code/${deckCode}/roles/${cardId}`, { role: DB_ROLE[role] });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deck-roles', deckCode] }),
  });

  const handleRoleChange = (primaryKey: string, role: PokemonRole) => {
    setLocalRoles((prev) => {
      const next = new Map(prev);
      next.set(primaryKey, role);
      try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(next))); } catch { /**/ }
      return next;
    });
    upsertMutation.mutate({ cardId: primaryKey, role });
  };

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

  // Collect Pokémon primary IDs (prefer primaryCardId, fall back to canonical/webCardId)
  const pokemonPrimaryIds = [...new Set(
    (data?.cards ?? [])
      .filter((e) => e.card.supertype === 'POKEMON')
      .map((e) => e.card.primaryCardId ?? e.card.canonicalWebCardId ?? e.card.webCardId)
      .filter((id): id is string => !!id)
  )];

  // Cross-deck role lookup: fills defaults for cards not yet assigned in this deck
  const { data: globalRoles } = useQuery<Record<string, string>>({
    queryKey: ['global-roles', deckCode],
    queryFn: async () => {
      if (!pokemonPrimaryIds.length) return {};
      const res = await apiClient.get<Record<string, string>>(
        `/decks/roles/lookup?cards=${pokemonPrimaryIds.join(',')}`
      );
      return res.data;
    },
    enabled: !!data && pokemonPrimaryIds.length > 0,
    staleTime: 60_000,
  });

  // Apply cross-deck presets: global role wins when this deck has no deck-specific override
  useEffect(() => {
    if (!globalRoles || !dbRoles) return;
    setLocalRoles((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [cardId, dbRoleStr] of Object.entries(globalRoles)) {
        // Skip if this specific deck has an explicit saved role for this card
        if (dbRoles[cardId]) continue;
        const mapped = DB_TO_ROLE[dbRoleStr];
        if (mapped && next.get(cardId) !== mapped) { next.set(cardId, mapped); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [globalRoles, dbRoles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remap: force-apply all saved roles (clears local state, re-seeds from DB + global)
  const handleRemapRoles = () => {
    const fresh = new Map<string, PokemonRole>();
    for (const [k, v] of Object.entries(dbRoles ?? {})) {
      const mapped = DB_TO_ROLE[v]; if (mapped) fresh.set(k, mapped);
    }
    for (const [k, v] of Object.entries(globalRoles ?? {})) {
      if (!fresh.has(k)) { const mapped = DB_TO_ROLE[v]; if (mapped) fresh.set(k, mapped); }
    }
    setLocalRoles(fresh);
    try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(fresh))); } catch { /**/ }
  };

  // Fire-and-forget: persist computed archetype + ACE name to DB
  // Must be declared here (before early returns) to obey Rules of Hooks
  const cachedWritten = useRef(false);
  useEffect(() => {
    if (cachedWritten.current || !data?.deckCode) return;
    // Recompute archetype name from data available at effect run time
    const DRAW_ENGINE_JP_EFFECT = ['\u30ea\u30fc\u30ea\u30a8\u306e\u30d4\u30c3\u30d4ex', '\u30ce\u30b3\u30c3\u30c1ex', '\u30b2\u30ce\u30bb\u30af\u30c8ex', '\u30d5\u30fc\u30c7\u30a3\u30f3'];
    const dbCardsEffect = data.cards ?? [];
    const sectionsEffect = new Map<SectionKey, DeckCardEntry[]>();
    SECTION_ORDER.forEach((k) => sectionsEffect.set(k, []));
    for (const entry of dbCardsEffect) {
      const primaryKey = entry.card.primaryCardId ?? entry.card.canonicalWebCardId ?? entry.card.webCardId;
      const override = localRoles.get(primaryKey);
      const key: SectionKey = override ?? getSectionKey(entry);
      sectionsEffect.get(key)?.push(entry);
    }
    const mainNamesEffect = (sectionsEffect.get('pokemon-main') ?? [])
      .map((e) => e.card.zhName ?? e.card.name).filter((n): n is string => !!n)
      .filter((n, i, arr) => arr.indexOf(n) === i).slice(0, 2);
    const supportDrawEffect = (sectionsEffect.get('pokemon-support') ?? [])
      .filter(e => DRAW_ENGINE_JP_EFFECT.some(f => (e.card.name ?? '').includes(f)))
      .map((e) => e.card.zhName ?? e.card.name).filter((n): n is string => !!n)
      .filter((n, i, arr) => arr.indexOf(n) === i).slice(0, 1);
    const nameToSave = [...mainNamesEffect, ...supportDrawEffect].join(' + ') || null;
    const aceEntry = (sectionsEffect.get('ace') ?? [])[0];
    const aceToSave = aceEntry ? (aceEntry.card.zhName ?? aceEntry.card.name ?? null) : null;
    if (!nameToSave && !aceToSave) return;
    cachedWritten.current = true;
    apiClient.patch(`/decks/code/${data.deckCode}/meta`, { archetypeName: nameToSave, aceName: aceToSave })
      .catch(() => { /* non-critical */ });
  }, [data?.deckCode]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Merge: use DB cards first, then add any deckData entries whose webCardId has no DB match.
  // DB webCardIds use "jp12345" format; deckData cardIds use "12345" (numeric only).
  // Build a normalized set (numeric suffix) to correctly match across both formats.
  const dbCards = data.cards ?? [];
  // Extract numeric suffix from webCardId (e.g. "jp48778" → "48778", "hk00014744" → "00014744")
  const normalizeId = (id: string) => id.replace(/^[a-z]+0*/i, '') || id;
  const dbNormalizedIds = new Set(dbCards.map((e) => normalizeId(e.card.webCardId)));
  // Also dedupe by name — handles cases where deckData uses a different set's cardId for the same card
  const dbCardNames = new Set(dbCards.map((e) => e.card.name?.trim().toLowerCase()).filter(Boolean));
  const deckDataFallback: DeckCardEntry[] = (data.deckData ?? [])
    .filter((c: any) =>
      !dbNormalizedIds.has(normalizeId(String(c.cardId))) &&
      !dbCardNames.has((c.cardName ?? '').trim().toLowerCase())
    )
    .map((c: any) => {
      // Infer supertype from imageUrl suffix: _P_ = POKEMON, _T_ = TRAINER, _E_ = ENERGY
      const img: string = c.imageUrl ?? '';
      const supertype = img.includes('_P_') ? 'POKEMON'
                      : img.includes('_E_') ? 'ENERGY'
                      : img.includes('_T_') ? 'TRAINER'
                      : undefined;
      // Infer rarity for ACE SPEC trainers (card code or well-known JP name)
      const KNOWN_ACE_JP = new Set([
        'マキシマムベルト', 'プライムキャッチャー', 'テラスタルオーブ', 'マスターボール',
        'ライムのコスプレそうち', 'スターバース', 'はかせのロールプレイ', 'ハンディチップ',
        'コストダウン', 'スタークロイス', 'アドレナリンシリンジ', 'アクアキューブ',
        'スーパークロス', 'ドミネートガン', 'VIPパス',
        'アンフェアスタンプ', 'ヒーローマント', 'ネオアッパーエネルギー', 'シークレットボックス',
      ]);
      const isAceSpec = String(c.cardCode ?? '').toUpperCase().includes('ACE SPEC')
        || KNOWN_ACE_JP.has((c.cardName ?? '').trim());
      const subtypes: string[] = supertype === 'ENERGY'
        ? (c.cardName?.includes('エネルギー') && !c.cardName?.includes('特殊') ? ['BASIC_ENERGY'] : ['SPECIAL_ENERGY'])
        : [];
      return {
        quantity: c.quantity,
        card: {
          webCardId: c.cardId,
          name: c.cardName,
          imageUrl: c.imageUrl ?? null,
          supertype,
          subtypes,
          rarity: isAceSpec ? 'ACE_SPEC_RARE' : undefined,
        },
      };
    });
  const deckEntries: DeckCardEntry[] = [
    ...(dbCards.length > 0 ? dbCards : []),
    ...deckDataFallback,
  ];

  // Group into sections (role key: primaryCardId > canonicalWebCardId > webCardId)
  const sections = new Map<SectionKey, DeckCardEntry[]>();
  SECTION_ORDER.forEach((k) => sections.set(k, []));
  for (const entry of deckEntries) {
    const primaryKey = entry.card.primaryCardId ?? entry.card.canonicalWebCardId ?? entry.card.webCardId;
    const override = localRoles.get(primaryKey);
    const key: SectionKey = override ?? getSectionKey(entry);
    sections.get(key)!.push(entry);
  }

  // Derive archetype name: main attacker(s) + notable draw-engine support, prefer Chinese name
  // Exclude generic draw cards (キチキギスex/ラティアスex) that appear in nearly every deck
  const DRAW_ENGINE_JP = ['\u30ea\u30fc\u30ea\u30a8\u306e\u30d4\u30c3\u30d4ex', '\u30ce\u30b3\u30c3\u30c1ex', '\u30b2\u30ce\u30bb\u30af\u30c8ex', '\u30d5\u30fc\u30c7\u30a3\u30f3'];
  const mainNames = (sections.get('pokemon-main') ?? [])
    .map((e) => e.card.zhName ?? e.card.name)
    .filter((n): n is string => !!n)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 2);
  const supportDrawNames = (sections.get('pokemon-support') ?? [])
    .filter(e => DRAW_ENGINE_JP.some(f => (e.card.name ?? '').includes(f)))
    .map((e) => e.card.zhName ?? e.card.name)
    .filter((n): n is string => !!n)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 1);
  const archetypeName = [...mainNames, ...supportDrawNames].join(' + ');

  // ACE SPEC card from ace section
  const aceEntry = (sections.get('ace') ?? [])[0];
  const aceName = aceEntry ? (aceEntry.card.zhName ?? aceEntry.card.name ?? null) : null;

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
            onClick={handleRemapRoles}
            title="Reset sections using saved roles from deck_card_roles"
            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-200 text-sm rounded-lg transition"
          >
            ↺ 重設角色
          </button>
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
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-white text-xl font-bold">{data.name}</h1>
              {(archetypeName || aceName) && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {archetypeName && (
                    <span className="text-slate-300 text-sm">{archetypeName}</span>
                  )}
                  {aceName && (
                    <span className="bg-violet-700/50 text-violet-200 text-xs font-bold px-2 py-0.5 rounded border border-violet-500/50">
                      ACE · {aceName}
                    </span>
                  )}
                </div>
              )}
            </div>
            {data.tournamentResults?.[0] && (
              <div className="text-right text-slate-300 text-sm">
                <div className="text-slate-400 text-xs uppercase tracking-wide">Event Date</div>
                <div className="font-medium">
                  {new Date(data.tournamentResults[0].tournament.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
                {data.tournamentResults[0].tournament.location && (
                  <div className="text-slate-400 text-xs">{data.tournamentResults[0].tournament.location}</div>
                )}
              </div>
            )}
          </div>
          
          <DeckSummary entries={deckEntries} pricing={data.pricing} priceBreakdownHref={`/deck-builder/event/${deckCode}/prices`} />

          <div className="mt-4 pt-4 border-t border-slate-600 space-y-4">
            <div>
              <h3 className="text-slate-300 text-sm font-bold mb-3">效果標籤</h3>
              <EffectTagSummary entries={deckEntries} />
            </div>
            <div>
              <button
                onClick={() => setShowEffectsSummary((v) => !v)}
                className="flex items-center gap-2 text-slate-300 text-sm font-bold mb-3 hover:text-white transition-colors"
              >
                <span>效果摘要</span>
                <span className="text-slate-500 text-xs font-normal">{showEffectsSummary ? '▲ 收起' : '▼ 點擊查看'}</span>
              </button>
              {showEffectsSummary && <EffectsSummary entries={deckEntries} />}
            </div>
          </div>
        </div>

        {/* Pokémon: Main (主攻) + Evolution chain (same row) */}
        <PairedPokemonSection
          sectionA="pokemon-main"
          sectionB="pokemon-evolution"
          entriesA={sections.get('pokemon-main') ?? []}
          entriesB={sections.get('pokemon-evolution') ?? []}
          onCardClick={setSelectedCard}
          onRoleChange={handleRoleChange}
        />

        {/* Pokémon: Secondary attackers (副攻) */}
        <DeckSection
          section="pokemon-secondary"
          entries={sections.get('pokemon-secondary') ?? []}
          onCardClick={setSelectedCard}
          onRoleChange={handleRoleChange}
        />

        {/* Pokémon: Support / tech (輔助) */}
        <DeckSection
          section="pokemon-support"
          entries={sections.get('pokemon-support') ?? []}
          onCardClick={setSelectedCard}
          onRoleChange={handleRoleChange}
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

      </div>{/* /max-w-7xl */}

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

