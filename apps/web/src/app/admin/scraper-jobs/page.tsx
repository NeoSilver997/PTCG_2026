'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  RUNNING: 'bg-blue-100 text-blue-700 animate-pulse',
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED:  'bg-red-100 text-red-700',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  JP:                '🇯🇵 Japan Events',
  HK:                '🇭🇰 HK Events',
  EN:                '🇺🇸 EN Events',
  JP_CARDS:          '🇯🇵 JP Cards',
  HK_CARDS:          '🇭🇰 HK Cards',
  EN_CARDS:          '🇺🇸 EN Cards',
  CARD_IMPORT:       '📦 Card Import',
  MARKET_PRICES:     '💰 Market Prices',
  SEED_TOURNAMENTS:  '🌱 Seed Tournaments',
  RESYNC_DECKS:      '🔄 Resync Decks',
  REMAP_DECKS:       '🗺️ Remap Decks',
  REMOVE_DUPLICATES: '🧹 Remove Dupes',
  PROMO_RARITY:      '🎫 Promo Rarity',
  POPULATE_EFFECTS:  '🏷️ Effect Tags',
  POKEMON_SPECIES:   '🔢 Pokédex Import',
};

interface ScraperJob {
  id: string;
  source: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt?: string;
  completedAt?: string;
  successCount: number;
  failureCount: number;
  createdAt: string;
  logs?: Array<{ ts: string; line: string }>;
}

interface LogEntry { ts: string; line: string; }

interface CardScrapeInfo { region: 'HK' | 'JP' | 'EN'; cwd: string; files: string[]; }
interface FileVerifyResult { name: string; fullPath: string; exists: boolean; cardCount: number; fileSize: number; }
interface FileMoveResult { name: string; srcPath: string; destPath: string; }
interface FollowUpState { verifying: boolean; verifyResults?: FileVerifyResult[]; moving: boolean; moveResults?: FileMoveResult[]; error?: string; }

type TabKey = 'events' | 'cards' | 'import' | 'maintenance';

// ── Missing Effects Panel ────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  'S+': 'bg-yellow-400 text-yellow-900',
  'S':  'bg-yellow-300 text-yellow-900',
  'A+': 'bg-green-500 text-white',
  'A':  'bg-green-400 text-white',
  'B+': 'bg-blue-500 text-white',
  'B':  'bg-blue-400 text-white',
  'C+': 'bg-gray-400 text-white',
  'C':  'bg-gray-300 text-gray-700',
  'D':  'bg-gray-200 text-gray-500',
};

function MissingEffectsPanel({ onRunJob }: { onRunJob: () => void }) {
  const [open, setOpen] = useState(true);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cards-missing-effects'],
    queryFn: () => apiClient.get('/cards/admin/missing-effects'),
    staleTime: 60_000,
  });
  const stats = data?.data;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border-l-4 border-orange-400">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-orange-500 font-bold text-lg">⚠</span>
          <h3 className="font-semibold text-gray-800 text-sm">Missing Effects Review</h3>
          {stats && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
              {stats.missingEffectTags.toLocaleString()} missing
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); refetch(); }}
            disabled={isFetching}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
          >
            {isFetching ? '⟳' : '↻ Refresh'}
          </button>
          <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {isLoading && <p className="text-sm text-gray-400 py-2">Loading stats…</p>}

          {stats && (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-gray-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">Total Primary Cards</p>
                  <p className="font-bold text-gray-800">{stats.total.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">With Effect Tags</p>
                  <p className="font-bold text-green-700">{stats.withEffectTags.toLocaleString()}</p>
                </div>
                <div className="bg-orange-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">Missing Tags</p>
                  <p className="font-bold text-orange-600">{stats.missingEffectTags.toLocaleString()}</p>
                </div>
                <div className="bg-orange-50 rounded p-2 text-center">
                  <p className="text-xs text-gray-500">Missing Tier</p>
                  <p className="font-bold text-orange-600">{stats.missingTier.toLocaleString()}</p>
                </div>
              </div>

              {/* Tier distribution */}
              {stats.tierDistribution.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Tier Distribution</p>
                  <div className="flex flex-wrap gap-2">
                    {stats.tierDistribution.map(({ tier, count }: { tier: string | null; count: number }) => (
                      <span key={tier ?? 'null'} className={`px-2 py-0.5 rounded text-xs font-medium ${tier ? (TIER_COLORS[tier] ?? 'bg-gray-100 text-gray-600') : 'bg-gray-100 text-gray-400 italic'}`}>
                        {tier ?? 'no tier'}: {count.toLocaleString()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Action button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onRunJob}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-700 text-white rounded hover:bg-slate-800"
                >
                  🏷 Run Effect Tagger
                </button>
                <span className="text-xs text-gray-400">Runs populate-effect-tags.ts --apply on all PrimaryCards</span>
              </div>

              {/* Sample cards missing effects */}
              {stats.samples.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                    Sample Cards Missing EffectTags ({stats.samples.length} shown)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500">
                          <th className="text-left px-2 py-1.5 font-semibold">Card</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Expansion</th>
                          <th className="text-left px-2 py-1.5 font-semibold">No.</th>
                          <th className="text-left px-2 py-1.5 font-semibold">webCardId</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Lang</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {stats.samples.map((s: any) => (
                          <tr key={s.id} className="hover:bg-gray-50">
                            <td className="px-2 py-1.5">
                              <a
                                href={s.card ? `/cards/${s.card.webCardId}` : '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {s.card?.name ?? '—'}
                              </a>
                            </td>
                            <td className="px-2 py-1.5 text-gray-600">{s.expansionCode ?? '—'}</td>
                            <td className="px-2 py-1.5 text-gray-500 font-mono">{s.cardNumber}</td>
                            <td className="px-2 py-1.5 font-mono text-gray-500">{s.card?.webCardId ?? '—'}</td>
                            <td className="px-2 py-1.5 text-gray-500">{s.card?.language ?? '—'}</td>
                            <td className="px-2 py-1.5">
                              {s.cardTier ? (
                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${TIER_COLORS[s.cardTier] ?? 'bg-gray-100 text-gray-600'}`}>{s.cardTier}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared tiny components ──────────────────────────────────────────────────

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1 font-mono">{hint}</p>}
    </div>
  );
}

function Check({ id, label, hint, checked, onChange }: {
  id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <input type="checkbox" id={id} checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded mt-0.5 shrink-0" />
      <label htmlFor={id} className="text-sm text-gray-600 leading-tight cursor-pointer">
        <span className="font-medium">{label}</span>
        <p className="text-xs text-gray-400 mt-0.5 font-mono">{hint}</p>
      </label>
    </div>
  );
}

function Num({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <input type="number" value={value} min={min} max={max}
      onChange={(e) => onChange(parseInt(e.target.value) || min)}
      className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white" />
  );
}

function Text({ value, placeholder, onChange }: {
  value: string; placeholder?: string; onChange: (v: string) => void;
}) {
  return (
    <input type="text" value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400" />
  );
}

function SectionDivider({ label }: { label: string }) {
  return <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider border-t pt-2 mt-1">{label}</p>;
}

// ── Tab: Events ────────────────────────────────────────────────────────────

interface EventsState {
  source: string; skipRecent: number; maxEvents: number;
  forceReimport: boolean; reloadInfo: boolean;
}

function EventsForm({ s, set }: { s: EventsState; set: (p: Partial<EventsState>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Region">
        <select value={s.source} onChange={(e) => set({ source: e.target.value })}
          className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white">
          <option value="JP">🇯🇵 Japan</option>
          <option value="HK">🇭🇰 Hong Kong</option>
          <option value="EN">🇺🇸 English</option>
        </select>
      </Field>
      <Field label="Skip Recent Events" hint="--skip-recent N">
        <Num value={s.skipRecent} min={0} max={500} onChange={(v) => set({ skipRecent: v })} />
      </Field>
      <Field label="Max Events to Scrape" hint="--max-events N (default 50)">
        <Num value={s.maxEvents} min={1} max={200} onChange={(v) => set({ maxEvents: v })} />
      </Field>
      <SectionDivider label="Options" />
      <Check id="ev-force"  label="Force re-import"   hint="--force-reimport: re-download even if on disk"         checked={s.forceReimport} onChange={(v) => set({ forceReimport: v })} />
      <Check id="ev-reload" label="Reload event info" hint="--reload-info: re-scrape metadata; skip deck downloads" checked={s.reloadInfo}    onChange={(v) => set({ reloadInfo: v })} />
    </div>
  );
}

// ── Tab: Cards ─────────────────────────────────────────────────────────────

interface CardsState {
  region: 'JP' | 'HK' | 'EN';
  idRangeStart: string; idRangeCount: string; cardIds: string;
  cacheHtml: boolean; cacheOnly: boolean; refreshCache: boolean;
  threads: number; minRequestInterval: number;
  expansions: string; compactJson: boolean;
  quiet: boolean; htmlCacheDir: string; outputFile: string;
}

function CardsForm({ s, set }: { s: CardsState; set: (p: Partial<CardsState>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(['JP', 'HK', 'EN'] as const).map((r) => (
          <button key={r} onClick={() => set({ region: r })}
            className={`flex-1 py-1 text-xs rounded border font-medium ${
              s.region === r ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 hover:bg-gray-50'}` }>
            {r === 'JP' ? '🇯🇵 JP' : r === 'HK' ? '🇭🇰 HK' : '🇺🇸 EN'}
          </button>
        ))}
      </div>
      <Field label="ID Range" hint="--id-range &lt;start&gt; &lt;count&gt;">
        <div className="flex gap-2">
          <input type="number" placeholder="Start ID" value={s.idRangeStart}
            onChange={(e) => set({ idRangeStart: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400" />
          <input type="number" placeholder="Count" value={s.idRangeCount}
            onChange={(e) => set({ idRangeCount: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white placeholder:text-gray-400" />
        </div>
      </Field>
      <Field label="Specific IDs (comma-separated)" hint="--ids 48717,48879">
        <Text value={s.cardIds} placeholder="e.g. 48717,48879,49536" onChange={(v) => set({ cardIds: v })} />
      </Field>
      <Field label="Threads" hint="--threads 1-20">
        <Num value={s.threads} min={1} max={20} onChange={(v) => set({ threads: v })} />
      </Field>
      {s.region === 'JP' && <>
        <Field label="Min Request Interval (s)" hint="--min-request-interval (default 2.0)">
          <input type="number" step="0.5" min={0.5} max={10} value={s.minRequestInterval}
            onChange={(e) => set({ minRequestInterval: parseFloat(e.target.value) || 2.0 })}
            className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white" />
        </Field>
        <Field label="Expansions filter" hint="--expansions sv8,sv9">
          <Text value={s.expansions} placeholder="e.g. sv8,sv9" onChange={(v) => set({ expansions: v })} />
        </Field>
      </>}
      {s.region === 'HK' && (
        <Field label="HTML Cache Dir" hint="--html-cache-dir">
          <Text value={s.htmlCacheDir} placeholder="D:/ptcg_cache/hk" onChange={(v) => set({ htmlCacheDir: v })} />
        </Field>
      )}
      <Field label="Output File" hint="--output (optional)">
        <Text value={s.outputFile} placeholder="Leave blank for auto" onChange={(v) => set({ outputFile: v })} />
      </Field>
      <SectionDivider label="Options" />
      <Check id="c-html"   label="Cache HTML"    hint="--cache-html: save raw HTML to disk"       checked={s.cacheHtml}    onChange={(v) => set({ cacheHtml: v })} />
      <Check id="c-only"   label="Cache only"     hint="--cache-only: parse from cache, no HTTP" checked={s.cacheOnly}    onChange={(v) => set({ cacheOnly: v })} />
      <Check id="c-ref"    label="Refresh cache"  hint="--refresh-cache: force re-fetch HTML"    checked={s.refreshCache} onChange={(v) => set({ refreshCache: v })} />
      {s.region === 'JP' && (
        <Check id="c-compact" label="Compact JSON" hint="--compact-json"                          checked={s.compactJson} onChange={(v) => set({ compactJson: v })} />
      )}
      <Check id="c-quiet"  label="Quiet mode"     hint="--quiet: suppress per-card logging"     checked={s.quiet}        onChange={(v) => set({ quiet: v })} />
    </div>
  );
}

// ── Tab: Import ────────────────────────────────────────────────────────────

interface ImportState {
  tool: 'card_import' | 'market_prices';
  baseDir: string; regionOrPattern: string;
  marketFile: string; marketDir: string; dryRun: boolean; verbose: boolean;
}

function ImportForm({ s, set }: { s: ImportState; set: (p: Partial<ImportState>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {([['card_import', '📦 Card Import'], ['market_prices', '💰 Market Prices']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => set({ tool: k })}
            className={`flex-1 py-1 text-xs rounded border font-medium ${
              s.tool === k ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {lbl}
          </button>
        ))}
      </div>
      {s.tool === 'card_import' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">import-cards-direct.ts</code> — writes directly to DB via Prisma</p>
        <Field label="Base Dir" hint="1st arg (default: data/cards)">
          <Text value={s.baseDir} placeholder="data/cards" onChange={(v) => set({ baseDir: v })} />
        </Field>
        <Field label="Region / Pattern" hint="2nd arg: japan · english · hongkong · china">
          <Text value={s.regionOrPattern} placeholder="japan" onChange={(v) => set({ regionOrPattern: v })} />
        </Field>
      </>}
      {s.tool === 'market_prices' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">import-market-prices.ts</code></p>
        <Field label="Directory (bulk)" hint="--dir= folder with market-prices-*.json files">
          <div className="space-y-1">
            <button
              onClick={() => set({ marketDir: 'C:/AI_Server/Coding/PTCG_CardDB/data', marketFile: '' })}
              className={`w-full text-left text-xs px-2 py-1 rounded border truncate ${
                s.marketDir === 'C:/AI_Server/Coding/PTCG_CardDB/data'
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              📁 PTCG_CardDB/data (market-prices-*.json)
            </button>
            <Text value={s.marketDir} placeholder="C:/path/to/data" onChange={(v) => set({ marketDir: v, marketFile: '' })} />
          </div>
        </Field>
        <Field label="Single File" hint="--file= override (clears directory)">
          <Text value={s.marketFile} placeholder="Leave blank to use directory above" onChange={(v) => set({ marketFile: v, marketDir: '' })} />
        </Field>
      </>}
      <SectionDivider label="Options" />
      <Check id="i-dry"  label="Dry run" hint="--dry-run: preview without writing" checked={s.dryRun}   onChange={(v) => set({ dryRun: v })} />
      <Check id="i-verb" label="Verbose" hint="--verbose: extra logging"           checked={s.verbose} onChange={(v) => set({ verbose: v })} />
    </div>
  );
}

// ── Tab: Maintenance ───────────────────────────────────────────────────────

type MaintenanceTool = 'seed_tournaments' | 'resync_decks' | 'remap_decks' | 'remove_duplicates' | 'promo_rarity' | 'pokemon_species';

interface MaintenanceState {
  tool: MaintenanceTool;
  seedAll: boolean; seedLimit: string; eventId: string;
  refreshExisting: boolean; sourceRoot: string;
  processLimit: string; reportFile: string; deckId: string;
  dryRun: boolean; verbose: boolean;
}

function MaintenanceForm({ s, set }: { s: MaintenanceState; set: (p: Partial<MaintenanceState>) => void }) {
  const tools: [MaintenanceTool, string][] = [
    ['seed_tournaments',  '🌱 Seed'],
    ['resync_decks',      '🔄 Resync'],
    ['remap_decks',       '🗺️ Remap'],
    ['remove_duplicates', '🧹 Dupes'],
    ['promo_rarity',      '🎫 Promo Rarity'],
    ['pokemon_species',   '🔢 Pokédex'],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1">
        {tools.map(([k, lbl]) => (
          <button key={k} onClick={() => set({ tool: k })}
            className={`py-1 text-xs rounded border font-medium ${
              s.tool === k ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {s.tool === 'seed_tournaments' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">seed-tournaments.ts</code></p>

        {/* Quick-source presets */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Quick source:</p>
          <div className="flex flex-col gap-1">
            {[
              { label: '📁 PTCG_CardDB (scraped)', path: 'C:/AI_Server/Coding/PTCG_CardDB/1_Webscraper/event_data' },
              { label: '📁 PTCG_CardDB (root)',    path: 'C:/AI_Server/Coding/PTCG_CardDB/event_data' },
            ].map(({ label, path }) => (
              <button key={path} onClick={() => set({ sourceRoot: path })}
                className={`text-left text-xs px-2 py-1 rounded border truncate ${
                  s.sourceRoot === path ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Event ID (single event)" hint="--event-id=952769">
          <Text value={s.eventId} placeholder="Leave blank for batch" onChange={(v) => set({ eventId: v })} />
        </Field>
        <Field label="Limit" hint="--limit= (ignored when All events is on)">
          <input type="number" value={s.seedLimit} min={1} max={500}
            onChange={(e) => set({ seedLimit: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white" />
        </Field>
        <Field label="Source Root" hint="--source-root= (auto-detect if blank)">
          <Text value={s.sourceRoot} placeholder="C:/AI_Server/Coding/PTCG_CardDB/event_data" onChange={(v) => set({ sourceRoot: v })} />
        </Field>
        <SectionDivider label="Options" />
        <Check id="m-all"  label="All events"       hint="--all: no limit"                    checked={s.seedAll}         onChange={(v) => set({ seedAll: v })} />
        <Check id="m-re"   label="Refresh existing" hint="--refresh-existing"                  checked={s.refreshExisting} onChange={(v) => set({ refreshExisting: v })} />
        <Check id="m-dry"  label="Dry run"           hint="--dry-run"                          checked={s.dryRun}          onChange={(v) => set({ dryRun: v })} />
        <Check id="m-verb" label="Verbose"           hint="--verbose"                          checked={s.verbose}         onChange={(v) => set({ verbose: v })} />
      </>}

      {s.tool === 'resync_decks' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">resync-deck-cards.ts</code> — re-links deck card references</p>
        <Field label="Limit (decks)" hint="--limit=N (blank = all)">
          <input type="number" value={s.processLimit} min={1}
            onChange={(e) => set({ processLimit: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm text-gray-900 bg-white" />
        </Field>
        <Field label="Report File" hint="--report-file=missing_cards.json">
          <Text value={s.reportFile} placeholder="missing_cards.json" onChange={(v) => set({ reportFile: v })} />
        </Field>
        <SectionDivider label="Options" />
        <Check id="r-dry" label="Dry run" hint="--dry-run: preview without writing" checked={s.dryRun} onChange={(v) => set({ dryRun: v })} />
      </>}

      {s.tool === 'remap_decks' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">remap-deck-cards.ts</code> — remaps card FK after merges</p>
        <Field label="Deck ID (single deck)" hint="--deck-id=UUID">
          <Text value={s.deckId} placeholder="Leave blank for all decks" onChange={(v) => set({ deckId: v })} />
        </Field>
        <SectionDivider label="Options" />
        <Check id="rp-dry"  label="Dry run" hint="--dry-run"  checked={s.dryRun}   onChange={(v) => set({ dryRun: v })} />
        <Check id="rp-verb" label="Verbose" hint="--verbose" checked={s.verbose} onChange={(v) => set({ verbose: v })} />
      </>}

      {s.tool === 'remove_duplicates' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">remove-duplicates.ts</code> — deletes duplicate card records</p>
        <SectionDivider label="Options" />
        <Check id="d-dry" label="Dry run" hint="--dry-run: show what would be deleted" checked={s.dryRun} onChange={(v) => set({ dryRun: v })} />
      </>}

      {s.tool === 'promo_rarity' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">update-promo-rarity.ts --apply</code></p>
        <p className="text-xs text-gray-400">Sets PROMO rarity on cards in promo expansion products. Cards with "ex" in name are set to DOUBLE_RARE (RR) instead.</p>
      </>}

      {s.tool === 'pokemon_species' && <>
        <p className="text-xs text-gray-500">Runs <code className="bg-gray-100 px-1 rounded">import-pokemon-species.ts</code></p>
        <p className="text-xs text-gray-400">Upserts all Pokémon species from <span className="font-mono">data/pokemon_names.json</span> and re-links PrimaryCards to their species.</p>
      </>}
    </div>
  );
}

// ── Pokédex Species Panel ──────────────────────────────────────────────────

function PokedexPanel({ onRunJob }: { onRunJob: () => void }) {
  const [open, setOpen] = useState(true);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pokedex-species-stats'],
    queryFn: () => apiClient.get('/cards/species-summary'),
    staleTime: 60_000,
    select: (res) => ({
      total: (res.data as any[]).length,
      linked: (res.data as any[]).filter((s: any) =>
        Object.values(s.cardCounts as Record<string, number>).some((v) => v > 0)
      ).length,
    }),
  });

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border-l-4 border-teal-400">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-teal-500 font-bold text-lg">🔢</span>
          <h3 className="font-semibold text-gray-800 text-sm">Pokédex Species</h3>
          {data && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
              {data.total.toLocaleString()} species · {data.linked.toLocaleString()} with cards
            </span>
          )}
          {isLoading && <span className="text-xs text-gray-400">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); refetch(); }}
            disabled={isFetching}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
          >
            {isFetching ? '⟳' : '↻ Refresh'}
          </button>
          <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {data && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-xs text-gray-500">Species in DB</p>
                <p className="font-bold text-gray-800">{data.total.toLocaleString()}</p>
              </div>
              <div className="bg-teal-50 rounded p-2 text-center">
                <p className="text-xs text-gray-500">With Cards</p>
                <p className="font-bold text-teal-700">{data.linked.toLocaleString()}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={onRunJob}
              className="px-3 py-1.5 text-xs font-medium bg-teal-700 text-white rounded hover:bg-teal-800"
            >
              🔢 Reimport Pokédex
            </button>
            <span className="text-xs text-gray-400">Runs import-pokemon-species.ts — upserts all species &amp; relinks PrimaryCards</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Import Panel ───────────────────────────────────────────────────

function ProductImportPanel() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<string | null>(null);

  const { data: countData, refetch: refetchCount } = useQuery({
    queryKey: ['products-count'],
    queryFn: () => apiClient.get('/products?take=1'),
    staleTime: 30_000,
    retry: false,
  });
  const total: number = (countData?.data as any)?.pagination?.total ?? 0;

  const handleRun = async () => {
    setStatus('running');
    setResult(null);
    try {
      const res = await apiClient.post('/products/import', {});
      const r = res.data;
      setResult(
        typeof r?.imported === 'number'
          ? `Imported ${r.imported} products (${r.errors} errors)`
          : 'Done',
      );
      setStatus('done');
      refetchCount();
    } catch (e: unknown) {
      setResult(String((e as any)?.response?.data?.message ?? e));
      setStatus('error');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border-l-4 border-orange-400">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-orange-500 font-bold text-lg">📦</span>
          <h3 className="font-semibold text-gray-800 text-sm">Products</h3>
          {total > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
              {total} total
            </span>
          )}
        </div>
        <button onClick={() => refetchCount()} className="text-xs text-gray-400 hover:text-gray-600">↻</button>
      </div>
      <div className="px-4 pb-4 space-y-3">
        {total === 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">No products in database — reimport needed.</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={status === 'running'}
            className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-40"
          >
            {status === 'running' ? '⟳ Importing...' : '📦 Reimport Products'}
          </button>
          <span className="text-xs text-gray-400">Loads <code className="bg-gray-100 px-1 rounded">data/chinese_products.json</code> → DB</span>
        </div>
        {result && (
          <p className={`text-xs px-2 py-1 rounded ${status === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {result}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Deck Price Cache Panel ─────────────────────────────────────────────────

function DeckPriceCachePanel() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<string | null>(null);

  const { data: statsData, refetch: refetchStats, isFetching: isFetchingStats } = useQuery({
    queryKey: ['deck-price-cache-stats'],
    queryFn: () => apiClient.get('/decks/admin/price-cache-stats'),
    staleTime: 30_000,
    retry: false,
  });
  const stats = statsData?.data ?? null;

  const handleRun = async () => {
    setStatus('running');
    setResult(null);
    try {
      const res = await apiClient.post('/decks/admin/refresh-price-cache', {});
      const r = res.data;
      setResult(
        typeof r?.updated === 'number'
          ? `Updated ${r.updated} decks in ${r.durationMs ?? '?'}ms`
          : 'Done',
      );
      setStatus('done');
      refetchStats();
    } catch (e: unknown) {
      setResult(String((e as any)?.response?.data?.message ?? e));
      setStatus('error');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border-l-4 border-violet-400">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-violet-500 font-bold text-lg">💰</span>
          <h3 className="font-semibold text-gray-800 text-sm">Event Deck Price Cache</h3>
          {stats?.cachedCount != null && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
              {stats.cachedCount} decks cached
            </span>
          )}
          {stats?.pendingCount != null && stats.pendingCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
              {stats.pendingCount} stale
            </span>
          )}
        </div>
        <button
          onClick={() => refetchStats()}
          disabled={isFetchingStats}
          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
        >
          {isFetchingStats ? '⟳' : '↻'}
        </button>
      </div>

      <div className="px-4 pb-4 space-y-2">
        {stats?.lastUpdatedAt && (
          <p className="text-xs text-gray-500">
            Last run: <span className="font-mono text-gray-700">{new Date(stats.lastUpdatedAt).toLocaleString()}</span>
          </p>
        )}
        <p className="text-xs text-gray-400">
          Computes <code className="bg-gray-100 px-1 rounded">cachedBudgetMin</code> / <code className="bg-gray-100 px-1 rounded">cachedBudgetMax</code> for all event decks from the last 7 days.
          Runs automatically every 6 hours on startup.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={status === 'running'}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${
              status === 'running'
                ? 'bg-violet-300 text-violet-800 cursor-wait'
                : 'bg-violet-700 text-white hover:bg-violet-800'
            }`}
          >
            {status === 'running' ? '⟳ Running…' : '▶ Run Now'}
          </button>
          {result && (
            <span className={`text-xs font-mono ${status === 'error' ? 'text-red-500' : 'text-green-600'}`}>
              {status === 'done' ? '✓ ' : '✗ '}{result}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function usePersistedState<T>(key: string, defaults: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaults;
    try {
      const stored = localStorage.getItem(key);
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch { return defaults; }
  });
  const setAndPersist: React.Dispatch<React.SetStateAction<T>> = useCallback((action) => {
    setState((prev) => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, [key]);
  return [state, setAndPersist];
}

export default function ScraperJobsPage() {
  const [activeTab, setActiveTabRaw] = usePersistedState<TabKey>('scraper-jobs:tab', 'events');
  const setActiveTab = useCallback((t: TabKey) => setActiveTabRaw(t), [setActiveTabRaw]);

  const [eventsState, setEventsStateRaw] = usePersistedState<EventsState>('scraper-jobs:events', {
    source: 'JP', skipRecent: 50, maxEvents: 50, forceReimport: false, reloadInfo: false,
  });
  const [cardsState, setCardsStateRaw] = usePersistedState<CardsState>('scraper-jobs:cards', {
    region: 'JP', idRangeStart: '', idRangeCount: '', cardIds: '',
    cacheHtml: false, cacheOnly: false, refreshCache: false,
    threads: 1, minRequestInterval: 2.0,
    expansions: '', compactJson: false, quiet: false, htmlCacheDir: '', outputFile: '',
  });
  const [importState, setImportStateRaw] = usePersistedState<ImportState>('scraper-jobs:import', {
    tool: 'card_import', baseDir: '', regionOrPattern: '', marketFile: '', marketDir: '', dryRun: false, verbose: false,
  });
  const [maintenanceState, setMaintenanceStateRaw] = usePersistedState<MaintenanceState>('scraper-jobs:maintenance', {
    tool: 'seed_tournaments', seedAll: false, seedLimit: '50', eventId: '',
    refreshExisting: false, sourceRoot: '', processLimit: '', reportFile: '',
    deckId: '', dryRun: true, verbose: false,
  });

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [liveLogs, setLiveLogs]    = useState<LogEntry[]>([]);
  const [streamDone, setStreamDone] = useState(false);
  const [followUp, setFollowUp]    = useState<FollowUpState>({ verifying: false, moving: false });
  const logsEndRef      = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient    = useQueryClient();

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['scraper-jobs'],
    queryFn: () => apiClient.get('/scraper-jobs'),
    refetchInterval: 5000,
  });

  const jobs: ScraperJob[] = jobsData?.data ?? [];

  const buildPayload = () => {
    switch (activeTab) {
      case 'events': {
        const e = eventsState;
        return { jobType: 'TOURNAMENT_EVENTS', source: e.source, skipRecentCount: e.skipRecent, maxEvents: e.maxEvents, forceReimport: e.forceReimport, reloadInfo: e.reloadInfo };
      }
      case 'cards': {
        const c = cardsState;
        return {
          jobType: c.region === 'JP' ? 'JP_CARDS' : c.region === 'HK' ? 'HK_CARDS' : 'EN_CARDS',
          source: 'JP',
          ...(c.idRangeStart && c.idRangeCount ? { idRangeStart: Number(c.idRangeStart), idRangeCount: Number(c.idRangeCount) } : {}),
          ...(c.cardIds ? { cardIds: c.cardIds } : {}),
          cacheHtml: c.cacheHtml, cacheOnly: c.cacheOnly, refreshCache: c.refreshCache, threads: c.threads,
          ...(c.region === 'JP' ? { minRequestInterval: c.minRequestInterval, ...(c.expansions ? { expansions: c.expansions } : {}), compactJson: c.compactJson } : {}),
          ...(c.region === 'HK' && c.htmlCacheDir ? { htmlCacheDir: c.htmlCacheDir } : {}),
          quiet: c.quiet,
          ...(c.outputFile ? { outputFile: c.outputFile } : {}),
        };
      }
      case 'import': {
        const i = importState;
        if (i.tool === 'card_import') return { jobType: 'CARD_IMPORT', source: 'JP', ...(i.baseDir ? { baseDir: i.baseDir } : {}), ...(i.regionOrPattern ? { regionOrPattern: i.regionOrPattern } : {}), dryRun: i.dryRun, verbose: i.verbose };
        return { jobType: 'MARKET_PRICES', source: 'JP', ...(i.marketDir ? { marketDir: i.marketDir } : i.marketFile ? { marketFile: i.marketFile } : {}), dryRun: i.dryRun, verbose: i.verbose };
      }
      case 'maintenance': {
        const m = maintenanceState;
        const base = { dryRun: m.dryRun, verbose: m.verbose };
        switch (m.tool) {
          case 'seed_tournaments': return { jobType: 'SEED_TOURNAMENTS', source: 'JP', ...base, seedAll: m.seedAll, ...(m.seedLimit && !m.seedAll ? { seedLimit: parseInt(m.seedLimit) } : {}), ...(m.eventId ? { eventId: m.eventId } : {}), refreshExisting: m.refreshExisting, ...(m.sourceRoot ? { sourceRoot: m.sourceRoot } : {}) };
          case 'resync_decks':     return { jobType: 'RESYNC_DECKS',     source: 'JP',     ...base, ...(m.processLimit ? { processLimit: parseInt(m.processLimit) } : {}), ...(m.reportFile ? { reportFile: m.reportFile } : {}) };
          case 'remap_decks':      return { jobType: 'REMAP_DECKS',      source: 'JP',      ...base, ...(m.deckId ? { deckId: m.deckId } : {}) };
          case 'remove_duplicates':return { jobType: 'REMOVE_DUPLICATES', source: 'JP', dryRun: m.dryRun };
          case 'promo_rarity':     return { jobType: 'PROMO_RARITY',      source: 'JP' };
          case 'pokemon_species':  return { jobType: 'POKEMON_SPECIES',   source: 'JP' };
        }
      }
    }
  };

  const startMutation = useMutation({
    mutationFn: () => apiClient.post('/scraper-jobs', buildPayload()),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] });
      setSelectedJobId(res.data.id);
      openSSEStream(res.data.id);
    },
  });

  const startImportMutation = useMutation({
    mutationFn: (payload: object) => apiClient.post('/scraper-jobs', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] });
      setSelectedJobId(res.data.id);
      openSSEStream(res.data.id);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/scraper-jobs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] }),
  });

  const openSSEStream = useCallback((jobId: string) => {
    eventSourceRef.current?.close();
    setLiveLogs([]);
    setStreamDone(false);
    const es = new EventSource(`${BASE_URL}/scraper-jobs/${jobId}/stream`);
    eventSourceRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.log) { setLiveLogs((prev) => [...prev, data.log]); }
        if (data.done) { setStreamDone(true); queryClient.invalidateQueries({ queryKey: ['scraper-jobs'] }); es.close(); }
      } catch { /* ignore */ }
    };
    es.onerror = () => { setStreamDone(true); es.close(); };
  }, [queryClient]);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const displayLogs = liveLogs.length > 0 ? liveLogs : selectedJob?.logs ?? [];

  // Auto-scroll to bottom whenever new live log lines arrive
  useEffect(() => {
    const el = logsContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [liveLogs.length]);

  // ESC key cancels a running job
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedJobId && selectedJob?.status === 'RUNNING') {
        cancelMutation.mutate(selectedJobId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedJobId, selectedJob, cancelMutation]);

  // Reset follow-up state when switching jobs
  useEffect(() => {
    setFollowUp({ verifying: false, moving: false });
  }, [selectedJobId]);

  // Detect card scraping info from job logs (only for succeeded card scraper jobs)
  const cardScrapeInfo: CardScrapeInfo | null = useMemo(() => {
    if (selectedJob?.status !== 'SUCCESS') return null;
    const cmdLine = displayLogs[0]?.line ?? '';
    let region: 'HK' | 'JP' | 'EN' | null = null;
    if (cmdLine.includes('hk_card_scraper.py')) region = 'HK';
    else if (cmdLine.includes('japanese_card_scraper.py')) region = 'JP';
    else if (cmdLine.includes('english_card_scraper.py')) region = 'EN';
    if (!region) return null;
    const cwd = (displayLogs[1]?.line ?? '').replace(/^cwd:\s*/i, '').trim();
    const files: string[] = [];
    for (const { line } of displayLogs) {
      const m = line.match(/Saved \d+ cards to (.+\.json)/i);
      if (m) files.push(m[1].trim().replace(/^\.[\\/]/, ''));
    }
    return { region, cwd, files: [...new Set(files)] };
  }, [selectedJob?.status, displayLogs]);

  const handleVerifyAll = useCallback(async () => {
    if (!cardScrapeInfo) return;
    setFollowUp((p) => ({ ...p, verifying: true, error: undefined }));
    try {
      const sep = cardScrapeInfo.cwd.includes('\\') ? '\\' : '/';
      const results: FileVerifyResult[] = await Promise.all(
        cardScrapeInfo.files.map(async (f) => {
          const isAbs = /^[A-Za-z]:[\\\/]/.test(f) || f.startsWith('/');
          const fullPath = isAbs ? f : (cardScrapeInfo.cwd ? `${cardScrapeInfo.cwd}${sep}${f}` : f);
          try {
            const res = await apiClient.post('/scraper-jobs/file-action', { action: 'verify', filePath: fullPath });
            return { name: f, fullPath, ...res.data };
          } catch {
            return { name: f, fullPath, exists: false, cardCount: 0, fileSize: 0 };
          }
        })
      );
      setFollowUp((p) => ({ ...p, verifying: false, verifyResults: results }));
    } catch (e: unknown) {
      setFollowUp((p) => ({ ...p, verifying: false, error: String(e) }));
    }
  }, [cardScrapeInfo]);

  const handleMoveAll = useCallback(async () => {
    if (!cardScrapeInfo || !followUp.verifyResults) return;
    const destDirMap = { HK: 'data/cards/hongkong', JP: 'data/cards/japan', EN: 'data/cards/english' };
    const destDir = destDirMap[cardScrapeInfo.region];
    setFollowUp((p) => ({ ...p, moving: true, error: undefined }));
    try {
      const toMove = followUp.verifyResults.filter((r) => r.exists);
      const results: FileMoveResult[] = await Promise.all(
        toMove.map(async (r) => {
          const res = await apiClient.post('/scraper-jobs/file-action', { action: 'move', filePath: r.fullPath, destDir });
          return { name: r.name, srcPath: r.fullPath, destPath: res.data.destPath };
        })
      );
      setFollowUp((p) => ({ ...p, moving: false, moveResults: results }));
    } catch (e: unknown) {
      setFollowUp((p) => ({ ...p, moving: false, error: String(e) }));
    }
  }, [cardScrapeInfo, followUp.verifyResults]);

  const handleImportFromFollowUp = useCallback(() => {
    if (!cardScrapeInfo) return;
    const regionDirMap = { HK: 'hongkong', JP: 'japan', EN: 'english' };
    startImportMutation.mutate({
      jobType: 'CARD_IMPORT',
      source: 'JP',
      baseDir: 'data/cards',
      regionOrPattern: regionDirMap[cardScrapeInfo.region],    });
  }, [cardScrapeInfo, startImportMutation]);

  const handleRunEffectTagger = useCallback(() => {
    startImportMutation.mutate({ jobType: 'POPULATE_EFFECTS', source: 'JP' });
  }, [startImportMutation]);

  const handleRunPokedex = useCallback(() => {
    startImportMutation.mutate({ jobType: 'POKEMON_SPECIES', source: 'JP' });
  }, [startImportMutation]);

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return '-';
    const secs = Math.floor((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'events',      label: '🏆 Events' },
    { key: 'cards',       label: '🃏 Cards'  },
    { key: 'import',      label: '📦 Import' },
    { key: 'maintenance', label: '🔧 Tools'  },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-slate-700 to-gray-600 text-white p-6">
        <h1 className="text-3xl font-bold">Scraper Jobs</h1>
        <p className="text-slate-300 mt-1">Manage all data pipeline jobs</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-4">
        {/* Left panel */}
        <div className="w-80 shrink-0 space-y-4">
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-800">Start New Job</h2>

            {/* Tab bar */}
            <div className="flex gap-1">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex-1 py-1 px-1 text-xs rounded border font-medium ${
                    activeTab === key ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-600 hover:bg-gray-50'}` }>
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'events'      && <EventsForm      s={eventsState}      set={(p) => setEventsStateRaw((prev) => ({ ...prev, ...p }))} />}
            {activeTab === 'cards'       && <CardsForm        s={cardsState}       set={(p) => setCardsStateRaw((prev) => ({ ...prev, ...p }))} />}
            {activeTab === 'import'      && <ImportForm       s={importState}      set={(p) => setImportStateRaw((prev) => ({ ...prev, ...p }))} />}
            {activeTab === 'maintenance' && <MaintenanceForm  s={maintenanceState} set={(p) => setMaintenanceStateRaw((prev) => ({ ...prev, ...p }))} />}

            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
              className="w-full px-4 py-2 bg-slate-700 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-40">
              {startMutation.isPending ? 'Starting...' : '▶ Start Job'}
            </button>
          </div>

          {/* Job list */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-3 border-b"><h3 className="font-medium text-gray-700 text-sm">Recent Jobs</h3></div>
            {isLoading && <p className="text-center py-4 text-gray-400 text-sm">Loading...</p>}
            {jobs.length === 0 && !isLoading && <p className="text-center py-6 text-gray-400 text-sm">No jobs yet.</p>}
            <div className="divide-y max-h-[50vh] overflow-y-auto">
              {jobs.map((job) => (
                <div key={job.id}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-50 ${selectedJobId === job.id ? 'bg-slate-50 border-l-2 border-slate-600' : ''}`}
                  onClick={() => { setSelectedJobId(job.id); setLiveLogs([]); if (job.status === 'RUNNING') openSSEStream(job.id); }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-700 truncate">{JOB_TYPE_LABELS[job.source] ?? job.source}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(job.createdAt).toLocaleString()}</p>
                  {(job.successCount > 0 || job.failureCount > 0) && (
                    <p className="text-xs text-gray-500 mt-0.5">✓{job.successCount} ✗{job.failureCount}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 space-y-4">
          {!selectedJobId && (
            <div className="bg-white rounded-lg shadow-sm flex items-center justify-center h-64 text-gray-400">Select a job to view details</div>
          )}

          {selectedJob && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-800 text-lg">{JOB_TYPE_LABELS[selectedJob.source] ?? selectedJob.source}</h2>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedJob.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[selectedJob.status]}`}>{selectedJob.status}</span>
                  {selectedJob.status === 'RUNNING' && (
                    <button onClick={() => cancelMutation.mutate(selectedJob.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded text-sm hover:bg-red-200">Cancel</button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <div className="bg-gray-50 rounded p-2 text-center"><p className="text-xs text-gray-500">Duration</p><p className="font-semibold text-sm">{formatDuration(selectedJob.startedAt, selectedJob.completedAt)}</p></div>
                <div className="bg-green-50 rounded p-2 text-center"><p className="text-xs text-gray-500">Imported</p><p className="font-semibold text-sm text-green-700">{selectedJob.successCount}</p></div>
                <div className="bg-red-50 rounded p-2 text-center"><p className="text-xs text-gray-500">Failed</p><p className="font-semibold text-sm text-red-600">{selectedJob.failureCount}</p></div>
                <div className="bg-gray-50 rounded p-2 text-center"><p className="text-xs text-gray-500">Started</p><p className="font-semibold text-xs">{selectedJob.startedAt ? new Date(selectedJob.startedAt).toLocaleTimeString() : '-'}</p></div>
              </div>
            </div>
          )}

          {selectedJobId && (
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <h3 className="text-sm font-medium text-gray-300">Live Logs {selectedJob?.status === 'RUNNING' && !streamDone ? '⟳' : ''}</h3>
                <span className="text-xs text-gray-500">{displayLogs.length} lines</span>
              </div>
              <div ref={logsContainerRef} className="h-96 overflow-y-auto p-4 font-mono text-xs space-y-0.5" style={{ fontFamily: 'ui-monospace, "Cascadia Code", "Consolas", "Courier New", "Noto Sans CJK SC", "Microsoft JhengHei", sans-serif' }}>
                {displayLogs.length === 0 && (
                  <p className="text-gray-500">{selectedJob?.status === 'RUNNING' ? 'Waiting for output...' : 'No logs available.'}</p>
                )}
                {displayLogs
                  .filter((entry) => !entry.line.includes('miss\\') && !entry.line.includes('miss/'))
                  .map((entry, i) => (
                  <div key={i} className={`flex gap-2 ${entry.line.includes('[STDERR]') ? 'text-red-400' : 'text-green-400'}`}>
                    <span className="text-gray-600 shrink-0">{new Date(entry.ts).toLocaleTimeString()}</span>
                    <span className="break-words whitespace-pre-wrap">{entry.line}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
              {selectedJob?.status === 'RUNNING' && (
                <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Running… press <kbd className="bg-gray-700 text-gray-300 px-1 rounded text-xs">Esc</kbd> to cancel</span>
                  <button onClick={() => cancelMutation.mutate(selectedJob.id)}
                    className="px-3 py-1 bg-red-700 text-red-100 rounded text-xs font-medium hover:bg-red-600">
                    ✕ Cancel Job
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Follow-up: verify → move → import after a card scraping job */}
          {cardScrapeInfo && (
            <div className="bg-white rounded-lg shadow-sm p-4 space-y-3 border-l-4 border-slate-500">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-800 text-sm">📥 Follow-up Actions</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  cardScrapeInfo.region === 'HK' ? 'bg-red-100 text-red-700' :
                  cardScrapeInfo.region === 'JP' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>{cardScrapeInfo.region}</span>
                <span className="text-xs text-gray-400 flex-1 font-mono truncate">→ data/cards/{
                  cardScrapeInfo.region === 'HK' ? 'hongkong' : cardScrapeInfo.region === 'JP' ? 'japan' : 'english'
                }</span>
              </div>

              {/* Detected output files */}
              {cardScrapeInfo.files.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No output files detected in logs.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {cardScrapeInfo.files.map((f) => {
                    const vr = followUp.verifyResults?.find((r) => r.name === f);
                    const mr = followUp.moveResults?.find((r) => r.name === f);
                    return (
                      <div key={f} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1.5">
                        <span className="font-mono text-gray-700 flex-1 min-w-0 truncate">{f}</span>
                        {vr && (
                          <span className={`shrink-0 ${vr.exists ? 'text-green-600' : 'text-red-500'}`}>
                            {vr.exists ? `✓ ${vr.cardCount} cards · ${(vr.fileSize / 1024).toFixed(0)} KB` : '✗ Not found'}
                          </span>
                        )}
                        {mr && <span className="shrink-0 text-blue-600 font-medium">→ moved</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleVerifyAll}
                  disabled={followUp.verifying || cardScrapeInfo.files.length === 0}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-40"
                >
                  {followUp.verifying ? '⟳ Verifying…' : '🔍 Verify Files'}
                </button>
                <button
                  onClick={handleMoveAll}
                  disabled={followUp.moving || !followUp.verifyResults?.some((r) => r.exists)}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-40"
                >
                  {followUp.moving ? '⟳ Moving…' : '→ Move to Data Folder'}
                </button>
                <button
                  onClick={handleImportFromFollowUp}
                  disabled={startImportMutation.isPending || (!followUp.moveResults?.length && !followUp.verifyResults?.some((r) => r.exists))}
                  className="px-3 py-1.5 text-xs font-medium bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-40"
                >
                  {startImportMutation.isPending ? '⟳ Starting…' : '📦 Import to DB'}
                </button>
              </div>

              {followUp.error && (
                <p className="text-xs text-red-500 font-mono">{followUp.error}</p>
              )}
              {followUp.moveResults && followUp.moveResults.length > 0 && (
                <p className="text-xs text-green-600">✓ {followUp.moveResults.length} file{followUp.moveResults.length > 1 ? 's' : ''} moved — ready to import.</p>
              )}
            </div>
          )}

          {/* Missing Effects Review */}
          <MissingEffectsPanel onRunJob={handleRunEffectTagger} />

          {/* Pokédex Species */}
          <PokedexPanel onRunJob={handleRunPokedex} />

          {/* Products */}
          <ProductImportPanel />

          {/* Deck Price Cache */}
          <DeckPriceCachePanel />
        </div>
      </div>
    </div>
  );
}
