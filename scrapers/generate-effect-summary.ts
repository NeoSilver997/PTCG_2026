/**
 * generate-effect-summary.ts
 *
 * Queries the DB for all Chinese cards (ZH_TW) and generates an HTML
 * report with charts showing effect tag distribution by category,
 * supertype breakdown, and top cards per tag.
 *
 * Usage:
 *   npx tsx scrapers/generate-effect-summary.ts
 *   → outputs: data/effect-summary.html
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// -------------------------------------------------------------------------
// Tag category groupings (must match filter-panel.tsx definitions)
// -------------------------------------------------------------------------
const TAG_GROUPS: Record<string, string[]> = {
  '資源 (Resources)': [
    '抽卡效果', '搜索效果', '能量操作', '能量回收', '能量附著',
    '手牌丟棄', '牌庫操作', '牌庫重洗',
  ],
  '傷害/戰鬥 (Damage & Battle)': [
    '傷害效果', '條件傷害', '連鎖傷害', '備戰傷害加成', '棄牌區傷害加成',
    '傷害指示物', '反噬傷害',
  ],
  '防禦/控制 (Defense & Control)': [
    '傷害防禦', '傷害減免', '高額傷害減免', '全體防禦', '效果免疫',
    '無視弱點/效果', 'HP提升',
  ],
  '狀態/干擾 (Status & Disruption)': [
    '狀態異常', '狀態恢復', '昏厥條件', '招式封鎖', '招式鎖定',
    '撤退封鎖', '撤退干擾', '道具消除', '物品卡封鎖', '附著干擾', '支援者限制',
  ],
  '其他 (Others)': [
    '切換效果', '回復效果', '進化支援', '招式複製', '硬幣判定',
    '連續技', '獎賞控制', '情報收集', '特殊能量', '弱點改變',
  ],
};

// Special tags
const SPECIAL_TAGS = ['大量抽卡', '搜索全能', '即時KO', '秒殺潛力'];

// Tier colors
const TIER_COLORS: Record<string, string> = {
  'S+': '#fbbf24', 'S': '#f59e0b',
  'A+': '#34d399', 'A': '#10b981',
  'B+': '#60a5fa', 'B': '#3b82f6',
  'C':  '#94a3b8', 'D': '#475569',
};

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------
async function main() {
  console.log('Querying database...');

  // 1. Tag counts for ZH_TW cards
  const tagCountsRaw = await prisma.$queryRaw<{ tag: string; card_count: bigint }[]>`
    SELECT
      tag,
      COUNT(DISTINCT pc.id) AS card_count
    FROM primary_cards pc
    JOIN cards c ON c."primaryCardId" = pc.id
    CROSS JOIN UNNEST(pc."effectTags") AS tag
    WHERE c.language = 'ZH_TW'
    GROUP BY tag
    ORDER BY card_count DESC
  `;

  // 2. Special tag counts
  const specialTagCountsRaw = await prisma.$queryRaw<{ tag: string; card_count: bigint }[]>`
    SELECT
      tag,
      COUNT(DISTINCT pc.id) AS card_count
    FROM primary_cards pc
    JOIN cards c ON c."primaryCardId" = pc.id
    CROSS JOIN UNNEST(pc."specialEffectTags") AS tag
    WHERE c.language = 'ZH_TW'
    GROUP BY tag
    ORDER BY card_count DESC
  `;

  // 3. Tier distribution for ZH_TW cards
  const tierDistRaw = await prisma.$queryRaw<{ tier: string | null; card_count: bigint }[]>`
    SELECT
      pc."cardTier" AS tier,
      COUNT(DISTINCT pc.id) AS card_count
    FROM primary_cards pc
    JOIN cards c ON c."primaryCardId" = pc.id
    WHERE c.language = 'ZH_TW'
    GROUP BY pc."cardTier"
    ORDER BY card_count DESC
  `;

  // 4. Supertype distribution for ZH_TW cards with effect tags
  const supertypeDistRaw = await prisma.$queryRaw<{ supertype: string | null; card_count: bigint }[]>`
    SELECT
      c."supertype",
      COUNT(DISTINCT pc.id) AS card_count
    FROM primary_cards pc
    JOIN cards c ON c."primaryCardId" = pc.id
    WHERE c.language = 'ZH_TW'
      AND array_length(pc."effectTags", 1) > 0
    GROUP BY c."supertype"
    ORDER BY card_count DESC
  `;

  // 5. Total ZH_TW card count
  const totalCountRaw = await prisma.$queryRaw<{ total: bigint; tagged: bigint; untagged: bigint }[]>`
    SELECT
      COUNT(DISTINCT pc.id) AS total,
      COUNT(DISTINCT CASE WHEN array_length(pc."effectTags", 1) > 0 THEN pc.id END) AS tagged,
      COUNT(DISTINCT CASE WHEN array_length(pc."effectTags", 1) IS NULL OR array_length(pc."effectTags", 1) = 0 THEN pc.id END) AS untagged
    FROM primary_cards pc
    JOIN cards c ON c."primaryCardId" = pc.id
    WHERE c.language = 'ZH_TW'
  `;

  // 6. Top cards per group (sample)
  const topCardsByTag: Record<string, { name: string; webCardId: string; tier: string | null; tags: string[] }[]> = {};
  const allTags = Object.values(TAG_GROUPS).flat().slice(0, 10); // top 10 for samples

  for (const tag of allTags) {
    const cards = await prisma.$queryRaw<{ name: string; webCardId: string; tier: string | null; tags: string[] }[]>`
      SELECT DISTINCT ON (c.name)
        c.name,
        c."webCardId",
        pc."cardTier" AS tier,
        pc."effectTags" AS tags
      FROM primary_cards pc
      JOIN cards c ON c."primaryCardId" = pc.id
      WHERE c.language = 'ZH_TW'
        AND pc."effectTags" @> ARRAY[${tag}]::text[]
        AND pc."cardTier" IS NOT NULL
        AND pc."cardTier" != 'D'
      ORDER BY c.name,
        CASE pc."cardTier"
          WHEN 'S+' THEN 1 WHEN 'S' THEN 2
          WHEN 'A+' THEN 3 WHEN 'A' THEN 4
          WHEN 'B+' THEN 5 WHEN 'B' THEN 6
          WHEN 'C'  THEN 7 ELSE 8
        END
      LIMIT 6
    `;
    if (cards.length > 0) topCardsByTag[tag] = cards;
  }

  // 7. Tag co-occurrence (most frequent 2-tag combos)
  const coOccurrenceRaw = await prisma.$queryRaw<{ tag1: string; tag2: string; cnt: bigint }[]>`
    SELECT
      t1.tag AS tag1,
      t2.tag AS tag2,
      COUNT(DISTINCT pc.id) AS cnt
    FROM primary_cards pc
    JOIN cards c ON c."primaryCardId" = pc.id
    CROSS JOIN UNNEST(pc."effectTags") AS t1(tag)
    CROSS JOIN UNNEST(pc."effectTags") AS t2(tag)
    WHERE c.language = 'ZH_TW'
      AND t1.tag < t2.tag
    GROUP BY t1.tag, t2.tag
    HAVING COUNT(DISTINCT pc.id) >= 20
    ORDER BY cnt DESC
    LIMIT 15
  `;

  await prisma.$disconnect();

  // -------------------------------------------------------------------------
  // Convert BigInt to numbers
  // -------------------------------------------------------------------------
  const tagCounts = tagCountsRaw.map(r => ({ tag: r.tag, count: Number(r.card_count) }));
  const specialTagCounts = specialTagCountsRaw.map(r => ({ tag: r.tag, count: Number(r.card_count) }));
  const tierDist = tierDistRaw.map(r => ({ tier: r.tier ?? '未分級', count: Number(r.card_count) }));
  const supertypeDist = supertypeDistRaw.map(r => ({ supertype: r.supertype ?? '未知', count: Number(r.card_count) }));
  const totals = totalCountRaw[0] ? {
    total: Number(totalCountRaw[0].total),
    tagged: Number(totalCountRaw[0].tagged),
    untagged: Number(totalCountRaw[0].untagged),
  } : { total: 0, tagged: 0, untagged: 0 };
  const coOccurrence = coOccurrenceRaw.map(r => ({ tag1: r.tag1, tag2: r.tag2, count: Number(r.cnt) }));

  // -------------------------------------------------------------------------
  // Build grouped data for charts
  // -------------------------------------------------------------------------
  const tagCountMap = Object.fromEntries(tagCounts.map(t => [t.tag, t.count]));

  const groupedData = Object.entries(TAG_GROUPS).map(([group, tags]) => ({
    group,
    total: tags.reduce((s, t) => s + (tagCountMap[t] ?? 0), 0),
    tags: tags
      .map(t => ({ tag: t, count: tagCountMap[t] ?? 0 }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count),
  })).filter(g => g.total > 0);

  // -------------------------------------------------------------------------
  // Generate HTML
  // -------------------------------------------------------------------------
  const tagColors = [
    '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316',
    '#eab308','#84cc16','#22c55e','#10b981','#14b8a6',
    '#06b6d4','#3b82f6','#a855f7','#d946ef','#ef4444',
  ];
  const getColor = (i: number) => tagColors[i % tagColors.length];

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PTCG 效果標籤摘要報告</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    header {
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a5f 100%);
      padding: 2rem 2.5rem;
      border-bottom: 1px solid #334155;
    }
    header h1 {
      font-size: 2rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.025em;
    }
    header p {
      color: #94a3b8;
      margin-top: 0.25rem;
      font-size: 0.9rem;
    }
    .badge {
      display: inline-block;
      background: #312e81;
      border: 1px solid #4f46e5;
      color: #a5b4fc;
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      margin-left: 0.5rem;
    }

    .container { max-width: 1400px; margin: 0 auto; padding: 2rem 1.5rem; }

    /* Stats row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1.25rem 1.5rem;
      text-align: center;
    }
    .stat-card .value {
      font-size: 2rem;
      font-weight: 800;
      color: #818cf8;
      line-height: 1;
    }
    .stat-card .label {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: 0.4rem;
    }

    /* Section */
    .section {
      margin-bottom: 2.5rem;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #1e293b;
    }
    .section-header h2 {
      font-size: 1.2rem;
      font-weight: 700;
      color: #f1f5f9;
    }
    .section-header .dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #6366f1;
    }

    /* Chart grid */
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      gap: 1.5rem;
    }
    .chart-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1.25rem;
    }
    .chart-card h3 {
      font-size: 0.9rem;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 1rem;
    }
    .chart-wrap { position: relative; height: 260px; }
    .chart-wrap-tall { position: relative; height: 340px; }

    /* Group breakdown */
    .groups-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.5rem;
    }
    .group-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1.25rem;
    }
    .group-card h3 {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 0.75rem;
    }
    .group-total {
      font-size: 0.75rem;
      color: #64748b;
      margin-left: 0.5rem;
    }
    .tag-bar-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .tag-label {
      width: 100px;
      font-size: 0.78rem;
      color: #94a3b8;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bar-bg {
      flex: 1;
      background: #0f172a;
      border-radius: 4px;
      height: 18px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .bar-count {
      font-size: 0.75rem;
      color: #64748b;
      min-width: 32px;
      text-align: right;
    }

    /* Co-occurrence */
    .co-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
    }
    .co-table th {
      background: #0f172a;
      color: #64748b;
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    .co-table td {
      padding: 0.45rem 0.75rem;
      border-bottom: 1px solid #1e293b;
      color: #cbd5e1;
    }
    .co-table tr:hover td { background: #263347; }
    .co-count {
      background: #312e81;
      color: #a5b4fc;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-weight: 600;
    }

    /* Top cards grid */
    .top-cards-section { margin-bottom: 2.5rem; }
    .top-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.25rem;
    }
    .tag-group-panel {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      padding: 1rem 1.25rem;
    }
    .tag-group-panel h4 {
      font-size: 0.85rem;
      font-weight: 600;
      color: #818cf8;
      margin-bottom: 0.6rem;
    }
    .card-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3rem 0;
      border-bottom: 1px solid #1e293b;
    }
    .card-item:last-child { border-bottom: none; }
    .tier-dot {
      width: 20px; height: 20px;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .card-name {
      font-size: 0.8rem;
      color: #cbd5e1;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Special tags */
    .special-tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .special-tag-chip {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      border-radius: 0.5rem;
      padding: 0.6rem 1rem;
      text-align: center;
    }
    .special-tag-chip .name { font-size: 0.85rem; font-weight: 600; color: #f1f5f9; }
    .special-tag-chip .num  { font-size: 1.4rem; font-weight: 800; color: #fbbf24; }

    footer {
      border-top: 1px solid #1e293b;
      padding: 1.5rem;
      text-align: center;
      font-size: 0.8rem;
      color: #475569;
    }
  </style>
</head>
<body>
<header>
  <h1>PTCG 效果標籤摘要報告
    <span class="badge">繁體中文牌</span>
  </h1>
  <p>生成時間: ${new Date().toLocaleString('zh-TW')} &nbsp;|&nbsp; 資料來源: PTCG CardDB PostgreSQL</p>
</header>

<div class="container">

  <!-- Stats -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="value">${totals.total.toLocaleString()}</div>
      <div class="label">繁中卡牌總數</div>
    </div>
    <div class="stat-card">
      <div class="value">${totals.tagged.toLocaleString()}</div>
      <div class="label">已標籤卡牌</div>
    </div>
    <div class="stat-card">
      <div class="value">${totals.untagged.toLocaleString()}</div>
      <div class="label">未標籤卡牌 (其他效果)</div>
    </div>
    <div class="stat-card">
      <div class="value">${tagCounts.length}</div>
      <div class="label">效果標籤種類</div>
    </div>
    <div class="stat-card">
      <div class="value">${Math.round(totals.tagged / totals.total * 100)}%</div>
      <div class="label">標籤覆蓋率</div>
    </div>
  </div>

  <!-- Overview Charts -->
  <div class="section">
    <div class="section-header">
      <div class="dot" style="background:#6366f1"></div>
      <h2>總覽圖表</h2>
    </div>
    <div class="chart-grid">
      <!-- All tags bar chart -->
      <div class="chart-card" style="grid-column: span 2;">
        <h3>所有效果標籤 — 卡牌數量</h3>
        <div class="chart-wrap-tall">
          <canvas id="allTagsChart"></canvas>
        </div>
      </div>
      <!-- Tier doughnut -->
      <div class="chart-card">
        <h3>評級分布 (Tier)</h3>
        <div class="chart-wrap">
          <canvas id="tierChart"></canvas>
        </div>
      </div>
      <!-- Supertype pie -->
      <div class="chart-card">
        <h3>卡種分布 (已標籤)</h3>
        <div class="chart-wrap">
          <canvas id="supertypeChart"></canvas>
        </div>
      </div>
      <!-- Group totals radar -->
      <div class="chart-card">
        <h3>效果分類群組對比</h3>
        <div class="chart-wrap">
          <canvas id="groupRadarChart"></canvas>
        </div>
      </div>
      <!-- Tagged vs untagged doughnut -->
      <div class="chart-card">
        <h3>標籤覆蓋率</h3>
        <div class="chart-wrap">
          <canvas id="coverageChart"></canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- Special Tags -->
  ${specialTagCounts.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="dot" style="background:#fbbf24"></div>
      <h2>特殊效果標籤 (高價值)</h2>
    </div>
    <div class="special-tags-row">
      ${specialTagCounts.map(st => `
      <div class="special-tag-chip">
        <div class="name">${st.tag}</div>
        <div class="num">${st.count}</div>
      </div>`).join('')}
    </div>
    <div class="chart-card">
      <div class="chart-wrap">
        <canvas id="specialTagsChart"></canvas>
      </div>
    </div>
  </div>` : ''}

  <!-- Per-group breakdown -->
  <div class="section">
    <div class="section-header">
      <div class="dot" style="background:#10b981"></div>
      <h2>效果分類細項</h2>
    </div>
    <div class="groups-grid">
      ${groupedData.map((g, gi) => {
        const maxCount = g.tags[0]?.count || 1;
        return `
      <div class="group-card">
        <h3>${g.group} <span class="group-total">共 ${g.total} 張</span></h3>
        ${g.tags.map((t, ti) => {
          const pct = Math.round(t.count / maxCount * 100);
          const color = getColor(gi * 3 + ti);
          return `
        <div class="tag-bar-row">
          <span class="tag-label" title="${t.tag}">${t.tag}</span>
          <div class="bar-bg">
            <div class="bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="bar-count">${t.count}</span>
        </div>`;
        }).join('')}
      </div>`;
      }).join('')}
    </div>
  </div>

  <!-- Tag Co-Occurrence -->
  ${coOccurrence.length > 0 ? `
  <div class="section">
    <div class="section-header">
      <div class="dot" style="background:#f59e0b"></div>
      <h2>標籤共現分析 (常見效果組合)</h2>
    </div>
    <div class="chart-card">
      <table class="co-table">
        <thead>
          <tr>
            <th>#</th>
            <th>效果標籤 1</th>
            <th>效果標籤 2</th>
            <th>共同卡牌數</th>
          </tr>
        </thead>
        <tbody>
          ${coOccurrence.map((co, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${co.tag1}</td>
            <td>${co.tag2}</td>
            <td><span class="co-count">${co.count}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- Top Cards by Tag -->
  ${Object.keys(topCardsByTag).length > 0 ? `
  <div class="top-cards-section">
    <div class="section-header">
      <div class="dot" style="background:#ec4899"></div>
      <h2>高評級代表卡牌 (依效果)</h2>
    </div>
    <div class="top-cards-grid">
      ${Object.entries(topCardsByTag).map(([tag, cards]) => `
      <div class="tag-group-panel">
        <h4>🏷 ${tag}</h4>
        ${cards.map(c => {
          const tier = c.tier || '';
          const tierColor = TIER_COLORS[tier] || '#475569';
          return `
        <div class="card-item">
          ${tier ? `<div class="tier-dot" style="background:${tierColor}20;color:${tierColor};border:1px solid ${tierColor}50">${tier}</div>` : ''}
          <span class="card-name" title="${c.name}">${c.name}</span>
        </div>`;
        }).join('')}
      </div>`).join('')}
    </div>
  </div>` : ''}

</div>

<footer>
  PTCG CardDB &copy; ${new Date().getFullYear()} &nbsp;|&nbsp; 資料基於 PostgreSQL 資料庫查詢
</footer>

<script>
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#1e293b';

const tagColors = ${JSON.stringify(tagColors)};
const getColor = (i) => tagColors[i % tagColors.length];

// All tags bar chart
(function(){
  const data = ${JSON.stringify(tagCounts)};
  const labels = data.map(d => d.tag);
  const counts = data.map(d => d.count);
  const colors = labels.map((_, i) => getColor(i));
  new Chart(document.getElementById('allTagsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: '卡牌數量', data: counts, backgroundColor: colors, borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 11 }, maxRotation: 45 }, grid: { display: false } },
        y: { beginAtZero: true, grid: { color: '#1e293b' }, ticks: { font: { size: 11 } } }
      }
    }
  });
})();

// Tier doughnut
(function(){
  const data = ${JSON.stringify(tierDist.filter(t => t.tier !== '未分級'))};
  const tierColorMap = ${JSON.stringify(TIER_COLORS)};
  new Chart(document.getElementById('tierChart'), {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.tier),
      datasets: [{ data: data.map(d => d.count), backgroundColor: data.map(d => tierColorMap[d.tier] || '#475569'), borderWidth: 2, borderColor: '#1e293b' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } }
    }
  });
})();

// Supertype pie
(function(){
  const data = ${JSON.stringify(supertypeDist)};
  const colors = ['#6366f1','#10b981','#f59e0b','#ef4444'];
  new Chart(document.getElementById('supertypeChart'), {
    type: 'pie',
    data: {
      labels: data.map(d => d.supertype),
      datasets: [{ data: data.map(d => d.count), backgroundColor: colors, borderWidth: 2, borderColor: '#1e293b' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 11 } } } }
    }
  });
})();

// Group radar chart
(function(){
  const groups = ${JSON.stringify(groupedData.map(g => ({ group: g.group.split(' ')[0], total: g.total })))};
  new Chart(document.getElementById('groupRadarChart'), {
    type: 'radar',
    data: {
      labels: groups.map(g => g.group),
      datasets: [{
        label: '卡牌數',
        data: groups.map(g => g.total),
        backgroundColor: 'rgba(99,102,241,0.2)',
        borderColor: '#6366f1',
        pointBackgroundColor: '#6366f1',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          grid: { color: '#334155' },
          ticks: { backdropColor: 'transparent', font: { size: 9 } },
          pointLabels: { font: { size: 11 }, color: '#94a3b8' }
        }
      }
    }
  });
})();

// Coverage doughnut
(function(){
  const data = [${totals.tagged}, ${totals.untagged}];
  new Chart(document.getElementById('coverageChart'), {
    type: 'doughnut',
    data: {
      labels: ['已標籤', '未標籤 (其他效果)'],
      datasets: [{ data, backgroundColor: ['#6366f1','#1e293b'], borderWidth: 2, borderColor: '#334155' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ${totals.total};
              return \` \${ctx.label}: \${ctx.raw} (\${Math.round(ctx.raw/total*100)}%)\`;
            }
          }
        }
      }
    }
  });
})();

${specialTagCounts.length > 0 ? `
// Special tags bar chart
(function(){
  const data = ${JSON.stringify(specialTagCounts)};
  new Chart(document.getElementById('specialTagsChart'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.tag),
      datasets: [{ label: '卡牌數量', data: data.map(d => d.count), backgroundColor: '#fbbf24', borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        y: { beginAtZero: true, grid: { color: '#1e293b' } }
      }
    }
  });
})();` : ''}

</script>
</body>
</html>`;

  // Write output
  const outDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'effect-summary.html');
  fs.writeFileSync(outPath, html, 'utf-8');

  console.log(`\n✅ Report generated: ${outPath}`);
  console.log(`   Total ZH_TW cards: ${totals.total}`);
  console.log(`   Tagged: ${totals.tagged} (${Math.round(totals.tagged / totals.total * 100)}%)`);
  console.log(`   Untagged: ${totals.untagged}`);
  console.log(`   Tags found: ${tagCounts.length}`);
  console.log(`   Top tag: ${tagCounts[0]?.tag} (${tagCounts[0]?.count} cards)`);
}

main().catch(console.error);
