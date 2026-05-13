'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownAZ,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Filter,
  GitMerge,
  Grip,
  Link2,
  MessageSquarePlus,
  RefreshCw,
  Tags,
  Unlink,
} from 'lucide-react';
import apiClient from '@/lib/api-client';

type LanguageCode = 'ZH_TW' | 'JA_JP' | 'EN_US' | string;

interface TrainerBrowserCard {
  id: string;
  webCardId: string;
  name: string;
  language: LanguageCode;
  variantType: string;
  imageUrl: string | null;
  rarity: string | null;
  text: string | null;
  abilities: unknown;
  subtypes: string[] | null;
  regulationMark: string | null;
  primaryCardId: string | null;
  primaryCard?: {
    id: string;
    name: string | null;
    cardNumber: string | null;
    skillsSignature: string | null;
    effectTags: string[] | null;
    specialEffectTags: string[] | null;
    effectScore: number | null;
    cardTier: string | null;
    primaryExpansion?: {
      code: string;
      nameEn: string;
      releaseDate?: string | null;
    } | null;
  } | null;
  regionalExpansion?: {
    code: string;
    name: string;
    region: string;
    primaryExpansion?: {
      code: string;
      nameEn: string;
      releaseDate?: string | null;
    } | null;
  } | null;
}

interface TrainerGroup {
  id: string;
  cards: TrainerBrowserCard[];
  displayCard: TrainerBrowserCard;
  displayName: string;
  displayText: string;
  tags: string[];
  subtypes: string[];
  regulationMarks: string[];
  releaseDate: string | null;
  releaseLabel: string;
  expansionCode: string;
  tier: string | null;
  effectScore: number | null;
  comboKey: string;
}

interface TagBucket {
  comboKey: string;
  comboTags: string[];
  groups: TrainerGroup[];
  latestRelease: string | null;
}

const STORAGE_KEY = 'trainer-browser-filters-v1';

const SUBTYPE_OPTIONS = ['ITEM', 'SUPPORTER', 'STADIUM', 'TOOL', 'TERA'];
const LANGUAGE_LABELS: Record<string, string> = {
  ZH_TW: 'ZH',
  JA_JP: 'JP',
  EN_US: 'EN',
};
const LANGUAGE_ORDER: Record<string, number> = { ZH_TW: 0, EN_US: 1, JA_JP: 2 };
const LANGUAGE_BADGE: Record<string, string> = {
  ZH_TW: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  EN_US: 'bg-sky-100 text-sky-800 border-sky-200',
  JA_JP: 'bg-rose-100 text-rose-800 border-rose-200',
};
const SUBTYPE_BADGE: Record<string, string> = {
  ITEM: 'bg-slate-900 text-white',
  SUPPORTER: 'bg-amber-500 text-slate-950',
  STADIUM: 'bg-cyan-600 text-white',
  TOOL: 'bg-fuchsia-600 text-white',
  TERA: 'bg-violet-600 text-white',
};

function normalizeText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => (value || '').trim()).filter(Boolean) as string[])];
}

function compareReleaseDate(a: string | null, b: string | null, descending: boolean): number {
  const aValue = a ? new Date(a).getTime() : 0;
  const bValue = b ? new Date(b).getTime() : 0;
  return descending ? bValue - aValue : aValue - bValue;
}

function formatReleaseDate(value: string | null): string {
  if (!value) return 'No release date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No release date';
  return date.toLocaleDateString('zh-HK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function truncateText(text: string, maxLength = 180): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function buildCountSummary(values: Array<string | null | undefined>, order?: string[]): string {
  const countMap = new Map<string, number>();
  for (const value of values) {
    const key = (value || '').trim();
    if (!key) continue;
    countMap.set(key, (countMap.get(key) || 0) + 1);
  }

  let entries = [...countMap.entries()];
  if (order && order.length > 0) {
    const rank = new Map(order.map((key, index) => [key, index]));
    entries = entries.sort((a, b) => {
      const aRank = rank.get(a[0]) ?? 999;
      const bRank = rank.get(b[0]) ?? 999;
      if (aRank !== bRank) return aRank - bRank;
      return a[0].localeCompare(b[0]);
    });
  } else {
    entries = entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  return entries.length > 0 ? entries.map(([key, count]) => `${key}:${count}`).join(' / ') : '-';
}

function sortCards(cards: TrainerBrowserCard[]): TrainerBrowserCard[] {
  return [...cards].sort((left, right) => {
    const languageDiff = (LANGUAGE_ORDER[left.language] ?? 99) - (LANGUAGE_ORDER[right.language] ?? 99);
    if (languageDiff !== 0) return languageDiff;
    return left.webCardId.localeCompare(right.webCardId);
  });
}

function getDisplayCard(cards: TrainerBrowserCard[]): TrainerBrowserCard {
  return (
    cards.find((card) => card.language === 'ZH_TW' && normalizeText(card.text)) ??
    cards.find((card) => card.language === 'ZH_TW') ??
    cards.find((card) => normalizeText(card.text)) ??
    cards[0]
  );
}

function groupTrainerCards(cards: TrainerBrowserCard[]): TrainerGroup[] {
  const grouped = new Map<string, TrainerBrowserCard[]>();

  for (const card of cards) {
    const key = card.primaryCardId || `solo:${card.id}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.push(card);
    } else {
      grouped.set(key, [card]);
    }
  }

  return [...grouped.entries()].map(([id, groupCards]) => {
    const sortedCards = sortCards(groupCards);
    const displayCard = getDisplayCard(sortedCards);
    const displayText =
      normalizeText(displayCard.text) ||
      sortedCards.map((card) => normalizeText(card.text)).find(Boolean) ||
      'No description available';
    const tags = uniqueStrings([
      ...(displayCard.primaryCard?.effectTags || []),
      ...(displayCard.primaryCard?.specialEffectTags || []),
    ]).sort((left, right) => left.localeCompare(right, 'zh-HK'));
    const releaseDate =
      displayCard.regionalExpansion?.primaryExpansion?.releaseDate ||
      displayCard.primaryCard?.primaryExpansion?.releaseDate ||
      sortedCards
        .map((card) => card.regionalExpansion?.primaryExpansion?.releaseDate || card.primaryCard?.primaryExpansion?.releaseDate || null)
        .find(Boolean) ||
      null;
    const expansionCode =
      displayCard.regionalExpansion?.primaryExpansion?.code ||
      displayCard.primaryCard?.primaryExpansion?.code ||
      displayCard.regionalExpansion?.code ||
      '-';

    return {
      id,
      cards: sortedCards,
      displayCard,
      displayName: displayCard.name || sortedCards[0]?.name || 'Unnamed trainer',
      displayText,
      tags,
      subtypes: uniqueStrings(sortedCards.flatMap((card) => card.subtypes || [])),
      regulationMarks: uniqueStrings(sortedCards.map((card) => card.regulationMark)).sort(),
      releaseDate,
      releaseLabel: formatReleaseDate(releaseDate),
      expansionCode,
      tier: displayCard.primaryCard?.cardTier || null,
      effectScore: displayCard.primaryCard?.effectScore ?? null,
      comboKey: tags.length > 0 ? tags.join(' / ') : '無標籤',
    };
  });
}

export default function TrainersPage() {
  const queryClient = useQueryClient();
  const [subtype, setSubtype] = useState('');
  const [regulationMark, setRegulationMark] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [hideTriLanguageGroups, setHideTriLanguageGroups] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [hiddenGroupIds, setHiddenGroupIds] = useState<string[]>([]);
  const [tempRemovedCardIds, setTempRemovedCardIds] = useState<string[]>([]);
  const [tagRequestCardIds, setTagRequestCardIds] = useState<string[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as {
        subtype?: string;
        regulationMark?: string;
        selectedTag?: string;
        sortOrder?: 'desc' | 'asc';
        hideTriLanguageGroups?: boolean;
      };
      setSubtype(saved.subtype || '');
      setRegulationMark(saved.regulationMark || '');
      setSelectedTag(saved.selectedTag || '');
      setSortOrder(saved.sortOrder === 'asc' ? 'asc' : 'desc');
      setHideTriLanguageGroups(Boolean(saved.hideTriLanguageGroups));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ subtype, regulationMark, selectedTag, sortOrder, hideTriLanguageGroups }),
    );
  }, [subtype, regulationMark, selectedTag, sortOrder, hideTriLanguageGroups]);

  const browserQuery = useQuery<{ data: TrainerBrowserCard[] }>({
    queryKey: ['trainer-browser', subtype, regulationMark],
    queryFn: async () => {
      const response = await apiClient.get('/cards/trainers/browser', {
        params: {
          subtype: subtype || undefined,
          regulationMark: regulationMark || undefined,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });

  const allGroups = useMemo(
    () => groupTrainerCards((browserQuery.data?.data || []).filter((card) => !tempRemovedCardIds.includes(card.id))),
    [browserQuery.data, tempRemovedCardIds],
  );

  const availableMarks = useMemo(
    () => uniqueStrings(allGroups.flatMap((group) => group.regulationMarks)).sort(),
    [allGroups],
  );

  const availableTags = useMemo(() => {
    const sourceGroups = selectedTag
      ? allGroups.filter((group) => group.tags.includes(selectedTag))
      : allGroups;
    const counts = new Map<string, number>();
    for (const group of sourceGroups) {
      for (const tag of group.tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, 'zh-HK'));
  }, [allGroups, selectedTag]);

  useEffect(() => {
    if (!selectedTag) return;
    const stillExists = allGroups.some((group) => group.tags.includes(selectedTag));
    if (!stillExists) {
      setSelectedTag('');
    }
  }, [allGroups, selectedTag]);

  const visibleGroups = useMemo(() => {
    const filtered = selectedTag
      ? allGroups.filter((group) => group.tags.includes(selectedTag))
      : allGroups;

    const notHidden = filtered.filter((group) => !hiddenGroupIds.includes(group.id));
    const languageFiltered = hideTriLanguageGroups
      ? notHidden.filter((group) => {
          const langs = new Set(group.cards.map((card) => card.language));
          const hasZh = [...langs].some((lang) => String(lang).startsWith('ZH_'));
          const hasEn = langs.has('EN_US');
          const hasJa = langs.has('JA_JP');
          return !(hasZh && hasEn && hasJa);
        })
      : notHidden;

    return [...languageFiltered].sort((left, right) => {
      const releaseDiff = compareReleaseDate(left.releaseDate, right.releaseDate, sortOrder === 'desc');
      if (releaseDiff !== 0) return releaseDiff;
      return left.displayName.localeCompare(right.displayName, 'zh-HK');
    });
  }, [allGroups, selectedTag, sortOrder, hiddenGroupIds, hideTriLanguageGroups]);

  const tagBuckets = useMemo<TagBucket[]>(() => {
    const buckets = new Map<string, TagBucket>();

    for (const group of visibleGroups) {
      const existing = buckets.get(group.comboKey);
      if (existing) {
        existing.groups.push(group);
        if (compareReleaseDate(existing.latestRelease, group.releaseDate, true) < 0) {
          existing.latestRelease = group.releaseDate;
        }
      } else {
        buckets.set(group.comboKey, {
          comboKey: group.comboKey,
          comboTags: group.tags,
          groups: [group],
          latestRelease: group.releaseDate,
        });
      }
    }

    return [...buckets.values()].sort((left, right) => {
      const releaseDiff = compareReleaseDate(left.latestRelease, right.latestRelease, sortOrder === 'desc');
      if (releaseDiff !== 0) return releaseDiff;
      return right.groups.length - left.groups.length;
    });
  }, [visibleGroups, sortOrder]);

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
      await apiClient.post('/cards/primary-cards/merge', { sourceId, targetId });
    },
    onSuccess: () => {
      setPendingMerge(null);
      setDragSourceId(null);
      queryClient.invalidateQueries({ queryKey: ['trainer-browser'] });
    },
  });

  const mergeComboMutation = useMutation({
    mutationFn: async (bucket: TagBucket) => {
      if (bucket.groups.length < 2) return;
      const targetId = bucket.groups[0].id;
      for (const source of bucket.groups.slice(1)) {
        await apiClient.post('/cards/primary-cards/merge', { sourceId: source.id, targetId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainer-browser'] });
    },
  });

  const unlinkCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      await apiClient.post(`/cards/primary-cards/unlink-card/${cardId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainer-browser'] });
    },
  });

  const pendingSource = pendingMerge ? allGroups.find((group) => group.id === pendingMerge.sourceId) || null : null;
  const pendingTarget = pendingMerge ? allGroups.find((group) => group.id === pendingMerge.targetId) || null : null;

  function toggleExpanded(groupId: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  function resetFilters() {
    setSubtype('');
    setRegulationMark('');
    setSelectedTag('');
    setSortOrder('desc');
    setHideTriLanguageGroups(false);
    setHiddenGroupIds([]);
    setTempRemovedCardIds([]);
    setTagRequestCardIds([]);
  }

  function handleDragStart(groupId: string) {
    setDragSourceId(groupId);
  }

  function handleDrop(targetId: string) {
    if (!dragSourceId || dragSourceId === targetId) return;
    setPendingMerge({ sourceId: dragSourceId, targetId });
  }

  function handleDragEnd() {
    setDragSourceId(null);
  }

  function handleMergeTagCombination(bucket: TagBucket) {
    if (bucket.groups.length < 2) return;
    const shouldMerge = window.confirm(`Merge all ${bucket.groups.length} groups in this tag combination?`);
    if (!shouldMerge) return;
    mergeComboMutation.mutate(bucket);
  }

  function handleUnlinkCard(card: TrainerBrowserCard) {
    const confirmed = window.confirm(`Unlink ${card.webCardId} from current primary group?`);
    if (!confirmed) return;
    unlinkCardMutation.mutate(card.id);
  }

  function handleTempHideGroup(groupId: string) {
    setHiddenGroupIds((current) => (current.includes(groupId) ? current : [...current, groupId]));
  }

  function handleRequestMoreTags(card: TrainerBrowserCard) {
    const shouldRequest = window.confirm(`Request more tags for ${card.webCardId} and temporarily remove it from this group view?`);
    if (!shouldRequest) return;

    setTagRequestCardIds((current) => (current.includes(card.id) ? current : [...current, card.id]));
    setTempRemovedCardIds((current) => (current.includes(card.id) ? current : [...current, card.id]));
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed,_#f8fafc_42%,_#e2e8f0)] px-3 py-5 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                <Tags className="h-3.5 w-3.5" />
                Trainer Browser
              </p>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">主卡群組 Trainer 管理頁</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  以 Primary Card 分組顯示 Trainer，預設依發售日排序。可用 subtype、規格標記與剩餘標籤快速篩選，並直接拖曳群組合併。
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">Subtype</span>
                <select
                  value={subtype}
                  onChange={(event) => setSubtype(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">All trainer subtypes</option>
                  {SUBTYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">Regulation Mark</span>
                <select
                  value={regulationMark}
                  onChange={(event) => setRegulationMark(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">All marks</option>
                  {availableMarks.map((mark) => (
                    <option key={mark} value={mark}>
                      {mark}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc'))}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-300"
              >
                <ArrowDownAZ className="h-4 w-4" />
                發售日 {sortOrder === 'desc' ? '新到舊' : '舊到新'}
              </button>

              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                <RefreshCw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 font-semibold text-orange-900">
              <Filter className="h-4 w-4" />
              {visibleGroups.length} primary groups
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {browserQuery.data?.data.length || 0} trainer variants loaded
            </span>
            {selectedTag && (
              <button
                type="button"
                onClick={() => setSelectedTag('')}
                className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white"
              >
                Tag: {selectedTag} x
              </button>
            )}
            {hiddenGroupIds.length > 0 && (
              <button
                type="button"
                onClick={() => setHiddenGroupIds([])}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700"
              >
                Hidden groups: {hiddenGroupIds.length} (restore)
              </button>
            )}
            {tagRequestCardIds.length > 0 && (
              <button
                type="button"
                onClick={() => setTempRemovedCardIds([])}
                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 font-semibold text-amber-800"
              >
                Tag requests: {tagRequestCardIds.length} (show removed)
              </button>
            )}
            <button
              type="button"
              onClick={() => setHideTriLanguageGroups((current) => !current)}
              className={`rounded-full border px-3 py-1 font-semibold ${
                hideTriLanguageGroups
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {hideTriLanguageGroups ? 'Hiding ZH+EN+JP groups' : 'Hide ZH+EN+JP groups'}
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Tags className="h-4 w-4" />
              Remaining Tags
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTags.length === 0 && (
                <span className="text-sm text-slate-500">No tags in the current result.</span>
              )}
              {availableTags.map(({ tag, count }) => {
                const active = tag === selectedTag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag((current) => (current === tag ? '' : tag))}
                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950'
                    }`}
                  >
                    {tag} <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {browserQuery.isLoading && (
          <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 text-center text-slate-600 shadow-sm">
            Loading trainer groups...
          </section>
        )}

        {browserQuery.isError && (
          <section className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700 shadow-sm">
            Failed to load trainer groups.
          </section>
        )}

        {!browserQuery.isLoading && !browserQuery.isError && tagBuckets.length === 0 && (
          <section className="rounded-3xl border border-slate-200 bg-white/90 p-8 text-center text-slate-600 shadow-sm">
            No trainer groups match the current filters.
          </section>
        )}

        {tagBuckets.map((bucket) => (
          <section key={bucket.comboKey} className="space-y-3 rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Tag Combination</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{bucket.comboKey}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-800">
                  {bucket.groups.length} primary groups
                </span>
                <button
                  type="button"
                  disabled={bucket.groups.length < 2 || mergeComboMutation.isPending}
                  onClick={() => handleMergeTagCombination(bucket)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <GitMerge className="h-3.5 w-3.5" />
                  Combine Same Tags
                </button>
                {bucket.comboTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-orange-100 px-3 py-1 font-semibold text-orange-900">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {bucket.groups.map((group) => {
                const expanded = Boolean(expandedGroups[group.id]);
                const isDragSource = dragSourceId === group.id;
                const languageSummary = buildCountSummary(
                  group.cards.map((card) => LANGUAGE_LABELS[card.language] || card.language),
                  ['ZH', 'EN', 'JP'],
                );
                const raritySummary = buildCountSummary(group.cards.map((card) => card.rarity));
                return (
                  <article
                    key={group.id}
                    draggable
                    onDragStart={() => handleDragStart(group.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(group.id)}
                    className={`rounded-3xl border bg-white p-3 shadow-sm transition ${
                      isDragSource
                        ? 'border-slate-900 ring-2 ring-slate-900/15'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col gap-3 xl:flex-row">
                      <div className="flex items-start gap-4 xl:w-[52%]">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(group.id)}
                          className="mt-1 rounded-full border border-slate-200 p-2 text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>

                        <div className="relative h-32 w-24 overflow-hidden rounded-2xl bg-slate-100 shadow-sm">
                          {group.displayCard.imageUrl ? (
                            <img
                              src={group.displayCard.imageUrl}
                              alt={group.displayName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">
                              NO IMAGE
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
                              <Grip className="h-3.5 w-3.5" />
                              Drag to merge
                            </span>
                            {group.subtypes.map((value) => (
                              <span key={value} className={`rounded-full px-3 py-1 text-xs font-bold ${SUBTYPE_BADGE[value] || 'bg-slate-200 text-slate-800'}`}>
                                {value}
                              </span>
                            ))}
                            {group.tier && (
                              <span className="rounded-full bg-lime-100 px-3 py-1 text-xs font-bold text-lime-900">
                                Tier {group.tier}
                              </span>
                            )}
                          </div>

                          <div>
                            <h3 className="text-2xl font-black tracking-tight text-slate-950">{group.displayName}</h3>
                            <p className="mt-1 text-sm text-slate-500">
                              Primary {group.id} · {group.expansionCode} · {group.releaseLabel}
                            </p>
                          </div>

                          <p className="text-sm leading-6 text-slate-700">{truncateText(group.displayText)}</p>

                          <div className="flex flex-wrap gap-2">
                            {group.tags.length === 0 && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                                無標籤
                              </span>
                            )}
                            {group.tags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setSelectedTag((current) => (current === tag ? '' : tag))}
                                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                                  selectedTag === tag
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-orange-100 text-orange-900 hover:bg-orange-200'
                                }`}
                              >
                                {tag}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => handleTempHideGroup(group.id)}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-slate-400"
                            >
                              <EyeOff className="h-4 w-4" />
                              Temp hide group
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:w-[48%]">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Summary</p>
                          <dl className="mt-3 space-y-2 text-sm text-slate-700">
                            <div className="flex items-center justify-between gap-4">
                              <dt>Variants</dt>
                              <dd className="font-semibold text-slate-950">{group.cards.length}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <dt>Regulation</dt>
                              <dd className="font-semibold text-slate-950">{group.regulationMarks.join(', ') || '-'}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <dt>Effect score</dt>
                              <dd className="font-semibold text-slate-950">{group.effectScore ?? '-'}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <dt>Lang count</dt>
                              <dd className="font-semibold text-slate-950">{languageSummary}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <dt>Rarity count</dt>
                              <dd className="font-semibold text-slate-950">{raritySummary}</dd>
                            </div>
                          </dl>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Actions</p>
                          <div className="mt-3 space-y-2 text-sm">
                            <Link
                              href={`/cards/${group.displayCard.webCardId}`}
                              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800 transition hover:border-slate-400"
                            >
                              Open default card
                              <Link2 className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => toggleExpanded(group.id)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800 transition hover:border-slate-400"
                            >
                              {expanded ? 'Hide linked cards' : 'Expand linked cards'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 border-t border-slate-200 pt-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">All related cards</p>
                          <p className="text-sm text-slate-500">Drop another primary group onto this card to merge into it.</p>
                        </div>

                        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                          {group.cards.map((card) => (
                            <div key={card.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
                              <div className="flex gap-3">
                                <div className="h-24 w-[4.5rem] overflow-hidden rounded-xl bg-white shadow-sm">
                                  {card.imageUrl ? (
                                    <img src={card.imageUrl} alt={card.name} className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-[10px] font-semibold text-slate-400">
                                      NO IMAGE
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${LANGUAGE_BADGE[card.language] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                      {LANGUAGE_LABELS[card.language] || card.language}
                                    </span>
                                    {card.regulationMark && (
                                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                                        {card.regulationMark}
                                      </span>
                                    )}
                                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                      {card.variantType}
                                    </span>
                                  </div>

                                  <p className="mt-2 text-sm font-bold text-slate-950">{card.name}</p>
                                  <p className="mt-1 text-xs leading-5 text-slate-600">
                                    {truncateText(normalizeText(card.text) || 'No description available', 120)}
                                  </p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <Link href={`/cards/${card.webCardId}`} className="inline-flex text-xs font-semibold text-slate-900 underline-offset-4 hover:underline">
                                      {card.webCardId}
                                    </Link>
                                    {group.cards.length > 1 && (
                                      <button
                                        type="button"
                                        disabled={unlinkCardMutation.isPending}
                                        onClick={() => handleUnlinkCard(card)}
                                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        <Unlink className="h-3 w-3" />
                                        Unlink
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRequestMoreTags(card)}
                                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100"
                                    >
                                      <MessageSquarePlus className="h-3 w-3" />
                                      Request tag+
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {pendingMerge && pendingSource && pendingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white p-6 shadow-[0_32px_90px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Confirm Merge</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Merge {pendingSource.displayName} into {pendingTarget.displayName}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  All related cards under the source Primary Card will be moved into the target Primary Card. Review both linked-card sets before confirming.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingMerge(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Cancel
              </button>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {[{ label: 'Source', group: pendingSource }, { label: 'Target', group: pendingTarget }].map(({ label, group }) => (
                <section key={label} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                      <h3 className="text-xl font-black text-slate-950">{group.displayName}</h3>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700">
                      {group.cards.length} variants
                    </span>
                  </div>

                  <div className="space-y-2">
                    {group.cards.map((card) => (
                      <div key={card.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-slate-950">{card.name}</span>
                          <span className="text-xs text-slate-500">
                            {LANGUAGE_LABELS[card.language] || card.language} · {card.webCardId}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {truncateText(normalizeText(card.text) || 'No description available', 140)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingMerge(null)}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mergeMutation.isPending}
                onClick={() => mergeMutation.mutate({ sourceId: pendingMerge.sourceId, targetId: pendingMerge.targetId })}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {mergeMutation.isPending ? 'Merging...' : 'Confirm merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}