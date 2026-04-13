/**
 * update-tier-by-usage.ts
 *
 * Reviews and updates PrimaryCard.cardTier based on actual tournament deck usage
 * over the past 26 weeks.
 *
 * Tier assignment (usage-blended):
 *   usagePct = (weeks card appeared / 26) * avg weekly deck-usage %
 *
 *   S+  : usagePct >= 20%   (staple in most active decks)
 *   S   : usagePct >= 10%
 *   A+  : usagePct >= 5%
 *   A   : usagePct >= 2%
 *   B+  : usagePct >= 1%
 *   B   : usagePct >= 0.4%
 *   C+  : usagePct >= 0.1%
 *   C   : any tournament usage
 *   (no change if 0 decks — keeps existing effect-score tier)
 *
 * Usage:
 *   npx tsx scrapers/update-tier-by-usage.ts          # dry run — show report
 *   npx tsx scrapers/update-tier-by-usage.ts --apply  # write to DB
 *   npx tsx scrapers/update-tier-by-usage.ts --apply --top 100  # top N cards only
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Tier thresholds (usage %)
// ---------------------------------------------------------------------------
const TIER_THRESHOLDS: Array<{ tier: string; min: number }> = [
  { tier: 'S+', min: 20 },
  { tier: 'S',  min: 10 },
  { tier: 'A+', min: 5  },
  { tier: 'A',  min: 2  },
  { tier: 'B+', min: 1  },
  { tier: 'B',  min: 0.4 },
  { tier: 'C+', min: 0.1 },
  { tier: 'C',  min: 0  },
];

function usageToTier(usagePct: number): string | null {
  if (usagePct <= 0) return null; // no tournament data → don't override
  for (const { tier, min } of TIER_THRESHOLDS) {
    if (usagePct >= min) return tier;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apply  = process.argv.includes('--apply');
  const topArg = process.argv.indexOf('--top');
  const topN   = topArg >= 0 ? parseInt(process.argv[topArg + 1] ?? '0', 10) || 0 : 0;

  console.log(apply ? '▶ APPLY mode — writing to DB' : '📋 DRY-RUN — no writes');
  if (topN) console.log(`  Showing top ${topN} cards only`);
  console.log('  Lookback: 26 weeks (with 3-month recency floor)\n');

  // ── 1. Weekly total decks (denominator) ──────────────────────────────────
  const weekTotals = await prisma.$queryRaw<Array<{ week_start: Date; total_decks: bigint }>>`
    SELECT
      date_trunc('week', t.date)::date AS week_start,
      COUNT(DISTINCT tr."deckId")::bigint AS total_decks
    FROM tournament_results tr
    JOIN tournaments t ON t.id = tr."tournamentId"
    WHERE t.date >= now() - interval '26 weeks'
      AND tr."deckId" IS NOT NULL
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const totalByWeek = new Map<string, number>();
  let grandTotalDecks = 0;
  for (const r of weekTotals) {
    const k = new Date(r.week_start).toISOString().split('T')[0];
    const n = Number(r.total_decks);
    totalByWeek.set(k, n);
    grandTotalDecks += n;
  }

  const activeWeeks = totalByWeek.size;
  console.log(`Active weeks with tournament data: ${activeWeeks}`);
  console.log(`Grand total decks in period: ${grandTotalDecks}\n`);

  if (activeWeeks === 0) {
    console.log('No tournament data found — exiting.');
    return;
  }

  // ── 2. Per-primaryCard deck usage ─────────────────────────────────────────
  const usageRows = await prisma.$queryRaw<Array<{
    primaryCardId: string;
    card_name: string;
    expansion_code: string;
    weeks_used: bigint;
    total_deck_appearances: bigint;
    max_weekly_pct: number;
    avg_weekly_pct: number;
  }>>`
    WITH weekly_usage AS (
      SELECT
        c."primaryCardId",
        date_trunc('week', t.date)::date AS week_start,
        COUNT(DISTINCT d.id)             AS deck_count
      FROM deck_cards dc
      JOIN cards c  ON c.id  = dc."cardId"
      JOIN decks d  ON d.id  = dc."deckId"
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t  ON t.id  = tr."tournamentId"
      WHERE t.date >= now() - interval '26 weeks'
        AND c."primaryCardId" IS NOT NULL
      GROUP BY c."primaryCardId", date_trunc('week', t.date)::date
    )
    SELECT
      wu."primaryCardId",
      MIN(c2.name)                                              AS card_name,
      MIN(re.code)                                              AS expansion_code,
      COUNT(DISTINCT wu.week_start)::bigint                     AS weeks_used,
      SUM(wu.deck_count)::bigint                                AS total_deck_appearances,
      MAX(
        CASE
          WHEN tot.total_decks > 0
          THEN ROUND((wu.deck_count::numeric / tot.total_decks) * 1000) / 10
          ELSE 0
        END
      )                                                         AS max_weekly_pct,
      ROUND(
        AVG(
          CASE
            WHEN tot.total_decks > 0
            THEN (wu.deck_count::numeric / tot.total_decks) * 100
            ELSE 0
          END
        )::numeric, 2
      )                                                         AS avg_weekly_pct
    FROM weekly_usage wu
    JOIN (
      SELECT DISTINCT ON (c3."primaryCardId")
        c3."primaryCardId", c3.name, re3.code
      FROM cards c3
      LEFT JOIN "regional_expansions" re3 ON re3.id = c3."regionalExpansionId"
      ORDER BY c3."primaryCardId", c3.language
    ) c2 ON c2."primaryCardId" = wu."primaryCardId"
    LEFT JOIN "regional_expansions" re ON re.id = (
      SELECT "regionalExpansionId" FROM cards
      WHERE "primaryCardId" = wu."primaryCardId"
      ORDER BY language LIMIT 1
    )
    JOIN (
      SELECT
        date_trunc('week', t2.date)::date AS week_start,
        COUNT(DISTINCT tr2."deckId")::bigint AS total_decks
      FROM tournament_results tr2
      JOIN tournaments t2 ON t2.id = tr2."tournamentId"
      WHERE t2.date >= now() - interval '26 weeks'
        AND tr2."deckId" IS NOT NULL
      GROUP BY 1
    ) tot ON tot.week_start = wu.week_start
    GROUP BY wu."primaryCardId"
    ORDER BY avg_weekly_pct DESC
  `;

  // ── 2b. Last-3-month (13-week) average usage per card (recency floor) ──────
  const recent3mRows = await prisma.$queryRaw<Array<{
    primaryCardId: string;
    recent_avg_pct: number;
  }>>`
    WITH weekly_usage AS (
      SELECT
        c."primaryCardId",
        date_trunc('week', t.date)::date AS week_start,
        COUNT(DISTINCT d.id)             AS deck_count
      FROM deck_cards dc
      JOIN cards c  ON c.id  = dc."cardId"
      JOIN decks d  ON d.id  = dc."deckId"
      JOIN tournament_results tr ON tr."deckId" = d.id
      JOIN tournaments t  ON t.id  = tr."tournamentId"
      WHERE t.date >= now() - interval '13 weeks'
        AND c."primaryCardId" IS NOT NULL
      GROUP BY c."primaryCardId", date_trunc('week', t.date)::date
    ),
    weekly_totals AS (
      SELECT
        date_trunc('week', t2.date)::date AS week_start,
        COUNT(DISTINCT tr2."deckId")::bigint AS total_decks
      FROM tournament_results tr2
      JOIN tournaments t2 ON t2.id = tr2."tournamentId"
      WHERE t2.date >= now() - interval '13 weeks'
        AND tr2."deckId" IS NOT NULL
      GROUP BY 1
    )
    SELECT
      wu."primaryCardId",
      ROUND(
        AVG(
          CASE WHEN wt.total_decks > 0
          THEN (wu.deck_count::numeric / wt.total_decks) * 100
          ELSE 0 END
        )::numeric, 2
      ) AS recent_avg_pct
    FROM weekly_usage wu
    JOIN weekly_totals wt ON wt.week_start = wu.week_start
    GROUP BY wu."primaryCardId"
  `;
  const recentMap = new Map<string, number>(
    recent3mRows.map(r => [r.primaryCardId, Number(r.recent_avg_pct)])
  );

  // ── 3. Compute tier changes ───────────────────────────────────────────────
  // Also fetch current tier for comparison
  const currentTiers = await prisma.primaryCard.findMany({
    where: {
      id: { in: usageRows.map(r => r.primaryCardId) },
    },
    select: { id: true, cardTier: true },
  });
  const tierMap = new Map(currentTiers.map(t => [t.id, t.cardTier]));

  interface CardUsage {
    primaryCardId: string;
    cardName: string;
    expansionCode: string;
    weeksUsed: number;
    totalDecks: number;
    avgWeeklyPct: number;
    maxWeeklyPct: number;
    usageScore: number;
    newTier: string | null;
    oldTier: string | null;
    tierChanged: boolean;
  }

  const TIERS_BELOW_A  = ['B+', 'B', 'C+', 'C'];
  const RECENT_FLOOR_PCT = 2; // 3-month avg > 2% → at least A

  const results: CardUsage[] = usageRows.map(r => {
    const weeksUsed     = Number(r.weeks_used);
    const totalDecks    = Number(r.total_deck_appearances);
    const avgWeeklyPct  = Number(r.avg_weekly_pct);
    const maxWeeklyPct  = Number(r.max_weekly_pct);
    // Weighted score: avg % across active weeks (not just weeks it appeared)
    const usageScore    = parseFloat(((avgWeeklyPct * weeksUsed) / activeWeeks).toFixed(3));
    let newTier         = usageToTier(usageScore);
    // Recency floor: if last-3-month avg > 2%, ensure at least Tier A
    const recent3mPct   = recentMap.get(r.primaryCardId) ?? 0;
    if (newTier && TIERS_BELOW_A.includes(newTier) && recent3mPct > RECENT_FLOOR_PCT) {
      newTier = 'A';
    }
    const oldTier       = tierMap.get(r.primaryCardId) ?? null;
    return {
      primaryCardId: r.primaryCardId,
      cardName:      r.card_name,
      expansionCode: r.expansion_code,
      weeksUsed,
      totalDecks,
      avgWeeklyPct,
      maxWeeklyPct,
      usageScore,
      newTier,
      oldTier,
      tierChanged: newTier !== null && newTier !== oldTier,
    };
  });

  // ── 3b. No-tournament cards: cap S+/S/A+ → A ──────────────────────────────
  const TIERS_ABOVE_A = ['S+', 'S', 'A+'];
  const usageIds = new Set(usageRows.map(r => r.primaryCardId));
  const overRatedNoUsage = await prisma.primaryCard.findMany({
    where: {
      cardTier: { in: TIERS_ABOVE_A },
      NOT: { id: { in: [...usageIds] } },
    },
    select: { id: true, cardTier: true },
  });

  // ── 4. Print report ───────────────────────────────────────────────────────
  const display = topN > 0 ? results.slice(0, topN) : results;
  const changed = results.filter(r => r.tierChanged);

  console.log('='.repeat(90));
  console.log('CARD TIER REVIEW BY TOURNAMENT USAGE');
  console.log('='.repeat(90));
  console.log(
    `${'Card'.padEnd(28)} ${'Set'.padEnd(8)} ${'Wks'.padStart(4)} ${'Decks'.padStart(6)} ${'AvgPct%'.padStart(8)} ${'Score'.padStart(6)} ${'OldTier'.padStart(8)} ${'NewTier'.padStart(8)} ${'Change?'.padStart(8)}`
  );
  console.log('-'.repeat(90));

  for (const r of display) {
    const change = r.tierChanged ? `  ← ${r.oldTier ?? 'none'} → ${r.newTier}` : '';
    console.log(
      `${(r.cardName ?? '???').slice(0, 28).padEnd(28)} ` +
      `${(r.expansionCode ?? '').padEnd(8)} ` +
      `${String(r.weeksUsed).padStart(4)} ` +
      `${String(r.totalDecks).padStart(6)} ` +
      `${r.avgWeeklyPct.toFixed(2).padStart(8)} ` +
      `${r.usageScore.toFixed(2).padStart(6)} ` +
      `${(r.oldTier ?? '-').padStart(8)} ` +
      `${(r.newTier ?? '-').padStart(8)}` +
      change
    );
  }

  console.log('='.repeat(90));
  console.log(`\nCards with tournament data:  ${results.length}`);
  console.log(`Tier changes proposed:        ${changed.length}`);
  console.log(`No-usage cards to cap at A:   ${overRatedNoUsage.length}  (currently: ${overRatedNoUsage.map(c => `${c.cardTier}`).join(', ').slice(0, 120)})`);

  // Tier distribution of top cards
  const tierDist: Record<string, number> = {};
  for (const r of results) {
    if (r.newTier) tierDist[r.newTier] = (tierDist[r.newTier] ?? 0) + 1;
  }
  console.log('\nNew tier distribution (usage-based):');
  for (const t of ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C+', 'C']) {
    if (tierDist[t]) console.log(`  ${t.padStart(3)}: ${tierDist[t]}`);
  }

  if (changed.length > 0) {
    console.log('\nDetailed tier changes:');
    for (const r of changed) {
      console.log(`  ${r.cardName?.padEnd(30)} ${r.expansionCode?.padEnd(8)} ${r.oldTier ?? 'none'} → ${r.newTier}  (score=${r.usageScore.toFixed(2)}, avg=${r.avgWeeklyPct.toFixed(2)}%, weeks=${r.weeksUsed})`);
    }
  }

  // ── 5. Apply if requested ─────────────────────────────────────────────────
  const totalChanges = changed.length + overRatedNoUsage.length;
  if (apply && totalChanges > 0) {
    // 5a. Apply usage-based tier updates
    if (changed.length > 0) {
      console.log(`\nApplying ${changed.length} usage-based tier updates...`);
      const BATCH = 100;
      let done = 0;
      for (let i = 0; i < changed.length; i += BATCH) {
        const batch = changed.slice(i, i + BATCH);
        await prisma.$transaction(
          batch.map(r =>
            prisma.primaryCard.update({
              where: { id: r.primaryCardId },
              data: { cardTier: r.newTier! },
            })
          )
        );
        done += batch.length;
        process.stdout.write(`\r  Updated: ${done}/${changed.length}`);
      }
      console.log();
    }
    // 5b. Cap no-usage cards at A
    if (overRatedNoUsage.length > 0) {
      console.log(`Capping ${overRatedNoUsage.length} no-tournament cards to A...`);
      const BATCH = 100;
      let done = 0;
      for (let i = 0; i < overRatedNoUsage.length; i += BATCH) {
        const batch = overRatedNoUsage.slice(i, i + BATCH);
        await prisma.$transaction(
          batch.map(r =>
            prisma.primaryCard.update({
              where: { id: r.id },
              data: { cardTier: 'A' },
            })
          )
        );
        done += batch.length;
        process.stdout.write(`\r  Capped: ${done}/${overRatedNoUsage.length}`);
      }
      console.log();
    }
    console.log('\n✅ Done.');
  } else if (apply && totalChanges === 0) {
    console.log('\nAll tiers already up to date.');
  } else {
    console.log('\nRun with --apply to write changes.');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
