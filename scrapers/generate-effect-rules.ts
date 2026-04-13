/**
 * generate-effect-rules.ts
 *
 * Generates an HTML reference page explaining every effect tag rule with:
 *  - Chinese trigger keywords
 *  - Japanese (JA_JP) equivalent keywords
 *  - 3 real sample cards per rule (regulation mark H / I / J — Standard legal)
 *
 * Usage:
 *   npx tsx scrapers/generate-effect-rules.ts
 *   → outputs: data/effect-rules.html
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Rule definitions  (tag → description + zh keywords + ja keywords)
// ---------------------------------------------------------------------------
interface RuleDef {
  tag: string;
  group: string;
  color: string;
  zhDesc: string;
  zhKeywords: string[];
  jaKeywords: string[];
  notes?: string;
}

const RULES: RuleDef[] = [
  // ── RESOURCES ──────────────────────────────────────────────────────────
  {
    tag: '抽卡效果',
    group: '資源',
    color: '#6366f1',
    zhDesc: '從牌庫抽取手牌 (非大量抽卡)',
    zhKeywords: ['抽取…牌庫', '抽出…牌庫', '加入手牌', '抽卡'],
    jaKeywords: ['山札から○枚引く', 'カードを引く', '手札に加える（山札から）'],
    notes: '大量抽卡 (4張以上) 會升為特殊標籤',
  },
  {
    tag: '搜索效果',
    group: '資源',
    color: '#8b5cf6',
    zhDesc: '搜尋牌庫或棄牌區取得特定牌',
    zhKeywords: ['從牌庫選擇…加入手牌', '從棄牌區…手牌', '探す'],
    jaKeywords: ['山札から…探す', '山札から…選び', 'トラッシュから…手札に加える'],
    notes: '不包含直接抽牌 (引く)',
  },
  {
    tag: '能量操作',
    group: '資源',
    color: '#ec4899',
    zhDesc: '移動、替換或丟棄場上能量卡',
    zhKeywords: ['附上能量', '附加能量', '移除能量'],
    jaKeywords: ['エネルギーをつけ替える', 'エネルギーをはがし', 'エネルギーカードをつける', 'エネルギーをトラッシュ'],
  },
  {
    tag: '能量附著',
    group: '資源',
    color: '#f97316',
    zhDesc: '從手牌直接附上能量卡到寶可夢',
    zhKeywords: ['從手牌選擇…能量卡…附於'],
    jaKeywords: ['手札のエネルギーカードを…つける', '手札からエネルギーをつける'],
    notes: '比能量操作更具體，指從手牌主動附能量',
  },
  {
    tag: '能量回收',
    group: '資源',
    color: '#eab308',
    zhDesc: '從棄牌區回收能量卡到手牌或直接附上',
    zhKeywords: ['從棄牌區抽出…能量卡', '棄牌區…能量…放回牌庫'],
    jaKeywords: ['トラッシュからエネルギーカードを手札に加える', 'トラッシュのエネルギーをつける', 'エネルギーカードを拾う'],
  },
  {
    tag: '手牌丟棄',
    group: '資源',
    color: '#84cc16',
    zhDesc: '將手牌丟棄到棄牌區',
    zhKeywords: ['手牌…丟棄', '從手牌將…丟棄', '將自己的1張手牌丟棄', '手牌選擇…丟棄'],
    jaKeywords: ['手札を…トラッシュ', '手札から○枚捨てる', '手札をすべてトラッシュ'],
    notes: '丟棄費用 (如能量卡丟棄) 也包含在內',

  },
  {
    tag: '牌庫操作',
    group: '資源',
    color: '#22c55e',
    zhDesc: '整理或調整牌庫（非重洗全場）',
    zhKeywords: ['放回牌庫並重洗', '各自從牌庫抽出'],
    jaKeywords: ['山札を引き直す', '山札をシャッフル', '山札を並べ替え', '山札に戻し'],
  },
  {
    tag: '牌庫重洗',
    group: '資源',
    color: '#14b8a6',
    zhDesc: '將場上所有寶可夢放回各自牌庫並重洗',
    zhKeywords: ['放回各自的牌庫並重洗', '全部放回牌庫並重洗'],
    jaKeywords: ['すべてのポケモンを山札に戻す', 'すべてを山札に戻してシャッフル'],
    notes: '強力場面清除效果',
  },

  // ── DAMAGE / BATTLE ────────────────────────────────────────────────────
  {
    tag: '傷害效果',
    group: '傷害/戰鬥',
    color: '#ef4444',
    zhDesc: '造成傷害或放置傷害指示物',
    zhKeywords: ['造成…傷害', '給予…傷害'],
    jaKeywords: ['ダメカンを○個のせる', 'ダメージを与える'],
  },
  {
    tag: '條件傷害',
    group: '傷害/戰鬥',
    color: '#f97316',
    zhDesc: '依條件 (數量×) 增加傷害',
    zhKeywords: ['若…增加…點傷害', '在這個回合…增加', '數量×10/20/30…傷害'],
    jaKeywords: ['の数×10', 'の枚数×', '×20ダメージ', '×30ダメージ', '×40ダメージ'],
  },
  {
    tag: '連鎖傷害',
    group: '傷害/戰鬥',
    color: '#f59e0b',
    zhDesc: '同時對備戰區寶可夢造成傷害',
    zhKeywords: ['備戰寶可夢也受到…傷害', '備戰區不計算弱點/效果'],
    jaKeywords: ['ベンチポケモンにも○ダメージ', 'ベンチにも', 'ベンチにダメカン'],
  },
  {
    tag: '備戰傷害加成',
    group: '傷害/戰鬥',
    color: '#84cc16',
    zhDesc: '依備戰寶可夢數量增加傷害值',
    zhKeywords: ['備戰寶可夢的數量', '數量×…傷害'],
    jaKeywords: ['ベンチのポケモンの数×', 'ベンチにいるポケモン…数×ダメージ'],
  },
  {
    tag: '棄牌區傷害加成',
    group: '傷害/戰鬥',
    color: '#22c55e',
    zhDesc: '依棄牌區牌張數量增加傷害值',
    zhKeywords: ['棄牌區…張數×…傷害'],
    jaKeywords: ['トラッシュの…枚数×ダメージ', 'トラッシュ…枚×'],
  },
  {
    tag: '傷害指示物',
    group: '傷害/戰鬥',
    color: '#10b981',
    zhDesc: '放置傷害指示物 (不直接造成傷害數值)',
    zhKeywords: ['傷害指示物…放置', '傷害指示物…增加'],
    jaKeywords: ['ダメカンを…のせる', 'ダメカンを乗せる', 'ダメカンをのせ直す'],
  },
  {
    tag: '反噬傷害',
    group: '傷害/戰鬥',
    color: '#06b6d4',
    zhDesc: '使用招式後自己也受到傷害',
    zhKeywords: ['這隻寶可夢也受到…傷害', '自己也受到…傷害'],
    jaKeywords: ['このポケモンにも○ダメージ', '自分自身にも…ダメージ'],
  },

  // ── DEFENCE / CONTROL ──────────────────────────────────────────────────
  {
    tag: '傷害防禦',
    group: '防禦/控制',
    color: '#3b82f6',
    zhDesc: '完全防禦招式傷害 (傷害歸零或無效)',
    zhKeywords: ['不會受到…傷害', '無法使用…傷害'],
    jaKeywords: ['ダメージを受けない', '受けるダメージは「0」', '受けるダメージを0にする'],
  },
  {
    tag: '傷害減免',
    group: '防禦/控制',
    color: '#6366f1',
    zhDesc: '受到招式傷害時減少 10–30 點',
    zhKeywords: ['受到招式的傷害…傷害「-10」', '-20', '-30'],
    jaKeywords: ['受けるダメージは「10」少なくなる', '「20」少なくなる', '「30」少なくなる'],
  },
  {
    tag: '高額傷害減免',
    group: '防禦/控制',
    color: '#8b5cf6',
    zhDesc: '受到招式傷害時減少 80 或 100 點以上',
    zhKeywords: ['傷害「-80」', '傷害「-100」'],
    jaKeywords: ['受けるダメージは「80」少なくなる', '「100」少なくなる', '受けるダメージを80少なく'],
    notes: '超高減免，通常配合特定條件',
  },
  {
    tag: '全體防禦',
    group: '防禦/控制',
    color: '#ec4899',
    zhDesc: '自己場上所有寶可夢受到傷害時都減少',
    zhKeywords: ['自己的所有寶可夢…受到傷害', '包含新上場'],
    jaKeywords: ['自分のポケモン全員…受けるダメージ…減る', '自分のポケモン全員…少なくなる'],
  },
  {
    tag: '效果免疫',
    group: '防禦/控制',
    color: '#14b8a6',
    zhDesc: '不受招式效果影響（傷害仍算）',
    zhKeywords: ['不會受到…效果的影響'],
    jaKeywords: ['ワザの効果を受けない', '効果を受けない', 'この特性の効果は受けない'],
  },
  {
    tag: '無視弱點/效果',
    group: '防禦/控制',
    color: '#f59e0b',
    zhDesc: '此招式造成傷害時不計算弱點、抵抗力或附加效果',
    zhKeywords: ['傷害不計算弱點', '不計算抵抗力', '不計算附加效果'],
    jaKeywords: ['弱点・抵抗力は計算しない', '弱点は計算しない', '弱点を使わない', 'ついている場合のダメージは計算しない'],
  },
  {
    tag: 'HP提升',
    group: '防禦/控制',
    color: '#22c55e',
    zhDesc: '增加寶可夢最大 HP',
    zhKeywords: ['最大HP…+10/+20/+30/+40/+50/+60/+70'],
    jaKeywords: ['最大HPが○多くなる', 'HPが○増える', 'HPが大きくなる'],
  },

  // ── STATUS / DISRUPTION ─────────────────────────────────────────────────
  {
    tag: '狀態異常',
    group: '狀態/干擾',
    color: '#a855f7',
    zhDesc: '讓對手寶可夢陷入中毒/燃燒/麻痺/睡眠/混亂',
    zhKeywords: ['中毒', '燃燒', '麻痺', '睡眠', '混亂'],
    jaKeywords: ['どくにする', 'やけどにする', 'ねむりにする', 'まひにする', 'こんらんにする'],
  },
  {
    tag: '狀態恢復',
    group: '狀態/干擾',
    color: '#10b981',
    zhDesc: '回復特殊狀態異常',
    zhKeywords: ['恢復特殊狀態', '回復…狀態'],
    jaKeywords: ['特殊状態を回復', '特殊状態がなおる', '状態異常を回復'],
  },
  {
    tag: '昏厥條件',
    group: '狀態/干擾',
    color: '#ef4444',
    zhDesc: '在特定條件成立時將寶可夢擊昏',
    zhKeywords: ['若…昏厥', '當…昏厥'],
    jaKeywords: ['きぜつなら', 'きぜつしたなら', 'きぜつしていたなら'],
  },
  {
    tag: '招式封鎖',
    group: '狀態/干擾',
    color: '#f97316',
    zhDesc: '讓對手寶可夢特定招式無法使用',
    zhKeywords: ['選擇1個招式…無法使用（下回合）'],
    jaKeywords: ['ワザを使えなくなる', '（次の番）ワザが使えない', 'ワザは使えない'],
  },
  {
    tag: '招式鎖定',
    group: '狀態/干擾',
    color: '#f43f5e',
    zhDesc: '在特定條件下讓寶可夢無法使用任何招式',
    zhKeywords: ['離開戰鬥場前無法使用招式'],
    jaKeywords: ['バトル場からいなくなるまでワザを使えない', 'ワザを使えなくなる（永久）'],
  },
  {
    tag: '撤退封鎖',
    group: '狀態/干擾',
    color: '#dc2626',
    zhDesc: '讓對手戰鬥寶可夢無法撤退',
    zhKeywords: ['無法撤退'],
    jaKeywords: ['逃げることができない', 'にげることができない', 'バトル場から離れられない'],
  },
  {
    tag: '撤退干擾',
    group: '狀態/干擾',
    color: '#b91c1c',
    zhDesc: '增加對手戰鬥寶可夢的撤退所需能量',
    zhKeywords: ['撤退…增加…所需的能量'],
    jaKeywords: ['にげるためのエネルギーが○個多く必要', 'にげるためのエネルギーを○増やす'],
  },
  {
    tag: '道具消除',
    group: '狀態/干擾',
    color: '#7c3aed',
    zhDesc: '消除或丟棄對手寶可夢的附帶道具',
    zhKeywords: ['道具…消除', '道具…移除', '物品…丟棄'],
    jaKeywords: ['ポケモンのどうぐをトラッシュ', 'どうぐを捨てる'],
  },
  {
    tag: '物品卡封鎖',
    group: '狀態/干擾',
    color: '#6d28d9',
    zhDesc: '禁止對手使用物品卡（グッズ）',
    zhKeywords: ['無法從手牌使出物品卡', '不能使用物品卡'],
    jaKeywords: ['グッズを使えない', 'グッズカードは使えない', 'グッズカードを手札から出せない'],
  },
  {
    tag: '附著干擾',
    group: '狀態/干擾',
    color: '#5b21b6',
    zhDesc: '允許或限制對手附能量的時機',
    zhKeywords: ['若對手…附能量…對手的回合結束'],
    jaKeywords: ['対戦相手のターンにエネルギーカードをつける', 'エネルギーをつけると…ターン終了'],
  },
  {
    tag: '支援者限制',
    group: '狀態/干擾',
    color: '#4c1d95',
    zhDesc: '限制對手這回合不可使用支援者卡',
    zhKeywords: ['支援者卡只可使用1張', '支援者不可使用'],
    jaKeywords: ['サポートは使えない', 'サポートを使えない', 'サポートを使うことができない'],
  },

  // ── OTHERS ─────────────────────────────────────────────────────────────
  {
    tag: '切換效果',
    group: '其他',
    color: '#0891b2',
    zhDesc: '強制切換對手或自己的戰鬥寶可夢',
    zhKeywords: ['切換', '互換', '將對手的戰鬥寶可夢切換'],
    jaKeywords: ['バトル場に呼び出す', 'ベンチポケモンと交代', 'バトル場のポケモンと入れ替える'],
  },
  {
    tag: '回復效果',
    group: '其他',
    color: '#059669',
    zhDesc: '回復寶可夢的 HP（移除傷害指示物）',
    zhKeywords: ['恢復…HP', '回復…HP', '回復…傷害'],
    jaKeywords: ['HPを○回復', 'ダメカンを○個取り除く', 'HPが○回復する'],
  },
  {
    tag: '進化支援',
    group: '其他',
    color: '#16a34a',
    zhDesc: '協助進化（跳過進化限制或從牌庫取進化卡）',
    zhKeywords: ['進化…跳過', '2階進化', '搜尋…進化卡'],
    jaKeywords: ['進化できる', 'このターン進化できる', '進化を1回多くすることができる', 'ポケモンのカードを手札に加える…進化'],
  },
  {
    tag: '招式複製',
    group: '其他',
    color: '#15803d',
    zhDesc: '複製對象寶可夢的招式並視為自己的招式使用',
    zhKeywords: ['選擇1個招式…作為這個招式使用'],
    jaKeywords: ['のワザを使う', 'このワザとして使う', 'ワザとして使う'],
  },
  {
    tag: '硬幣判定',
    group: '其他',
    color: '#ca8a04',
    zhDesc: '擲硬幣來決定效果（隨機性）',
    zhKeywords: ['擲硬幣', '硬幣…正面'],
    jaKeywords: ['コインを投げる', 'コイントス', 'オモテなら', 'コインが○枚オモテ'],
  },
  {
    tag: '連續技',
    group: '其他',
    color: '#b45309',
    zhDesc: '在上回合使用了指定招式才可使用的連段技',
    zhKeywords: ['在上個自己的回合…才可使用', '在上回合使用了'],
    jaKeywords: ['前の番にこのワザを使っていたなら', '前の番に…使っていた', 'このワザを使っていたなら'],
  },
  {
    tag: '獎賞控制',
    group: '其他',
    color: '#92400e',
    zhDesc: '影響獎賞卡的取得或數量',
    zhKeywords: ['獎賞卡…額外翻開', '獎賞卡…取'],
    jaKeywords: ['サイドカードを取る', 'サイドを○枚取る', 'サイドカードをさらに取る'],
  },
  {
    tag: '情報收集',
    group: '其他',
    color: '#78716c',
    zhDesc: '查看對手手牌或牌庫的牌（情報優勢）',
    zhKeywords: ['查看…手牌', '查看…牌庫的牌'],
    jaKeywords: ['相手の手札を見る', '手札を見る', '山札を見る'],
  },
  {
    tag: '特殊能量',
    group: '其他',
    color: '#65a30d',
    zhDesc: '能量卡可視為多種類型或多個能量使用',
    zhKeywords: ['視為提供…能量', '重新附於'],
    jaKeywords: ['エネルギー1個ぶんとしてはたらく', 'エネルギー2個ぶんとしてはたらく', 'すべてのタイプのエネルギー1個ぶん'],
  },
  {
    tag: '弱點改變',
    group: '其他',
    color: '#4d7c0f',
    zhDesc: '改變寶可夢的弱點屬性',
    zhKeywords: ['弱點改為', '弱點以…屬性計算'],
    jaKeywords: ['弱点を…タイプに変える', '弱点タイプを変え', '弱点がなくなる'],
  },
];
// ---------------------------------------------------------------------------
// Sample categories — fetch per rule: Pokémon ex / no-rule Pokémon / Trainer
// ---------------------------------------------------------------------------

type CardCategory = 'ex' | 'norule' | 'trainer';

interface SampleCard {
  name: string;
  webCardId: string;
  tier: string | null;
  regMark: string | null;
  attackName: string;
  effectText: string;
  category: CardCategory;
}

interface TagSamples {
  ex: SampleCard[];
  norule: SampleCard[];
  trainer: SampleCard[];
}

function parseRow(r: {
  name: string; web_card_id: string; tier: string | null; reg_mark: string | null;
  attacks: unknown; abilities: unknown; text: string | null;
}, category: CardCategory): SampleCard {
  let attackName = '';
  let effectText = '';
  try {
    const attacks = r.attacks as Array<{ name?: string; effect?: string; text?: string; damage?: string }> | null;
    const abs = r.abilities as Array<{ name?: string; text?: string; description?: string }> | null;
    if (attacks?.length) {
      const best = attacks.map(a => ({
        len: (a.effect ?? a.text ?? '').length,
        txt: (a.effect ?? a.text ?? '').trim(),
        name: a.name ?? '', dmg: a.damage ?? '',
      })).sort((a, b) => b.len - a.len)[0];
      attackName = best.name + (best.dmg ? ` (${best.dmg})` : '');
      effectText = best.txt.replace(/<[^>]+>/g, '').substring(0, 200);
    }
    if (!effectText && abs?.length) {
      attackName = `[特性] ${abs[0].name ?? ''}`;
      effectText = (abs[0].text ?? abs[0].description ?? '').replace(/<[^>]+>/g, '').substring(0, 200);
    }
    if (!effectText && r.text) effectText = r.text.replace(/<[^>]+>/g, '').substring(0, 200);
  } catch { /* ignore */ }
  return {
    name: r.name, webCardId: r.web_card_id, tier: r.tier, regMark: r.reg_mark,
    attackName, effectText: effectText || '（效果文字暫無）', category,
  };
}

type RawRow = Parameters<typeof parseRow>[0];

async function getSamplesForTag(tag: string): Promise<TagSamples> {
  const sel = [
    `SELECT DISTINCT ON (c.name)`,
    `  c.name, c."webCardId" AS web_card_id, pc."cardTier" AS tier,`,
    `  c."regulationMark" AS reg_mark, c.attacks, c.abilities, c.text`,
    `FROM primary_cards pc`,
    `JOIN cards c ON c."primaryCardId" = pc.id`,
    `WHERE c.language = 'ZH_TW'`,
    `  AND c."regulationMark" IN ('H','I','J')`,
    `  AND pc."effectTags" @> ARRAY[$1]::text[]`,
  ].join('\n');
  const ord = [
    `ORDER BY c.name,`,
    `  CASE pc."cardTier" WHEN 'S+' THEN 1 WHEN 'S' THEN 2`,
    `    WHEN 'A+' THEN 3 WHEN 'A' THEN 4 WHEN 'B+' THEN 5`,
    `    WHEN 'B' THEN 6 WHEN 'C' THEN 7 ELSE 8 END`,
    `LIMIT 2`,
  ].join('\n');

  const [exRows, noruleRows, trainerRows] = await Promise.all([
    prisma.$queryRawUnsafe<RawRow[]>(`${sel} AND c."ruleBox" = 'EX'\n${ord}`, tag),
    prisma.$queryRawUnsafe<RawRow[]>(`${sel} AND c.supertype = 'POKEMON' AND c."ruleBox" IS NULL\n${ord}`, tag),
    prisma.$queryRawUnsafe<RawRow[]>(`${sel} AND c.supertype = 'TRAINER'\n${ord}`, tag),
  ]);
  return {
    ex:      exRows.map(r => parseRow(r, 'ex')),
    norule:  noruleRows.map(r => parseRow(r, 'norule')),
    trainer: trainerRows.map(r => parseRow(r, 'trainer')),
  };
}

// ---------------------------------------------------------------------------
// Tier badge colours
// ---------------------------------------------------------------------------
const TIER_BG: Record<string, string> = {
  'S+': '#fbbf24', 'S': '#f59e0b',
  'A+': '#34d399', 'A': '#10b981',
  'B+': '#60a5fa', 'B': '#3b82f6',
  'C':  '#94a3b8', 'D': '#475569',
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Generating interactive effect rules HTML... (${RULES.length} rules)`);

  const allSamples: Record<string, TagSamples> = {};
  for (const rule of RULES) {
    process.stdout.write(`  Querying "${rule.tag}"...`);
    allSamples[rule.tag] = await getSamplesForTag(rule.tag);
    const ts = allSamples[rule.tag];
    console.log(` ex:${ts.ex.length} norule:${ts.norule.length} trainer:${ts.trainer.length}`);
  }

  await prisma.$disconnect();

  const groups = [...new Set(RULES.map(r => r.group))];
  const totalSampleCards = Object.values(allSamples).reduce(
    (s, ts) => s + ts.ex.length + ts.norule.length + ts.trainer.length, 0
  );

  // ── TOC ──────────────────────────────────────────────────────────────────
  const tocItems = RULES.map(r =>
    `<a href="#rule-${r.tag}" class="toc-item" style="--c:${r.color}">${r.tag}</a>`
  ).join('\n');

  // ── Helper: render one sample card ───────────────────────────────────────
  function renderSample(s: SampleCard): string {
    const tc = TIER_BG[s.tier ?? ''] ?? '#475569';
    const rc = s.regMark === 'J' ? '#818cf8' : s.regMark === 'I' ? '#34d399' : '#f59e0b';
    return `<div class="sample-card">
          <div class="sample-card-header">
            <span class="reg-badge" style="background:${rc}20;color:${rc};border-color:${rc}40">${s.regMark ?? '?'}</span>
            ${s.tier ? `<span class="tier-badge" style="background:${tc}20;color:${tc};border-color:${tc}40">${s.tier}</span>` : ''}
            <span class="card-name">${s.name}</span>
            <span class="card-id">${s.webCardId}</span>
          </div>
          ${s.attackName ? `<div class="attack-name">⚔ ${s.attackName}</div>` : ''}
          <div class="effect-text">${s.effectText}</div>
        </div>`;
  }

  // ── Rule cards ────────────────────────────────────────────────────────────
  const ruleHtmlByTag: Record<string, string> = {};
  for (const r of RULES) {
    const ts = allSamples[r.tag] ?? { ex: [], norule: [], trainer: [] };
    const hasEx      = ts.ex.length      > 0 ? '1' : '0';
    const hasNorule  = ts.norule.length  > 0 ? '1' : '0';
    const hasTrainer = ts.trainer.length > 0 ? '1' : '0';

    const exHtml      = ts.ex.length      ? ts.ex.map(renderSample).join('')
      : `<div class="no-sample">無符合樣本</div>`;
    const noruleHtml  = ts.norule.length  ? ts.norule.map(renderSample).join('')
      : `<div class="no-sample">無符合樣本</div>`;
    const trainerHtml = ts.trainer.length ? ts.trainer.map(renderSample).join('')
      : `<div class="no-sample">無符合樣本</div>`;

    const zhTagsHtml = r.zhKeywords.map(k => `<span class="kw-chip kw-zh">${k}</span>`).join('');
    const jaTagsHtml = r.jaKeywords.map(k => `<span class="kw-chip kw-ja">${k}</span>`).join('');
    const searchData = `${r.tag} ${r.group} ${r.zhDesc} ${r.zhKeywords.join(' ')}`.replace(/"/g, '');

    ruleHtmlByTag[r.tag] = `
  <div class="rule-card" id="rule-${r.tag}"
       data-search="${searchData}"
       data-has-ex="${hasEx}" data-has-norule="${hasNorule}" data-has-trainer="${hasTrainer}"
       style="--rc:${r.color}">
    <div class="rule-header">
      <div class="rule-tag-badge" style="background:${r.color}22;color:${r.color};border:1px solid ${r.color}44">${r.tag}</div>
      <span class="rule-group-label">${r.group}</span>
    </div>
    <p class="rule-desc">${r.zhDesc}</p>
    ${r.notes ? `<div class="rule-note">📌 ${r.notes}</div>` : ''}
    <div class="keywords-section">
      <div class="kw-row">
        <span class="kw-lang-label lang-zh">繁中關鍵詞</span>
        <div class="kw-chips">${zhTagsHtml}</div>
      </div>
      <div class="kw-row">
        <span class="kw-lang-label lang-ja">日文關鍵詞</span>
        <div class="kw-chips">${jaTagsHtml}</div>
      </div>
    </div>
    <div class="samples-label">📋 規格 H・I・J 樣本（依卡牌類別）</div>
    <div class="samples-cols">
      <div class="sample-col" data-cat="ex">
        <div class="col-label col-label-ex">⚡ 寶可夢 ex</div>
        ${exHtml}
      </div>
      <div class="sample-col" data-cat="norule">
        <div class="col-label col-label-norule">🔵 一般寶可夢</div>
        ${noruleHtml}
      </div>
      <div class="sample-col" data-cat="trainer">
        <div class="col-label col-label-trainer">🃏 訓練家</div>
        ${trainerHtml}
      </div>
    </div>
  </div>`;
  }

  // ── HTML template ─────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>PTCG 效果標籤規則手冊</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f172a; --surface: #1e293b; --surface2: #263347;
      --border: #334155; --text: #e2e8f0; --muted: #64748b; --subtle: #94a3b8;
    }
    body { font-family:'Segoe UI',system-ui,-apple-system,'Noto Sans TC',sans-serif; background:var(--bg); color:var(--text); line-height:1.6; }
    a { color:inherit; text-decoration:none; }

    /* HEADER */
    header { background:linear-gradient(135deg,#1e1b4b 0%,#1e3a5f 100%); padding:1.5rem 2.5rem 1.2rem; border-bottom:1px solid var(--border); position:sticky; top:0; z-index:100; }
    header h1 { font-size:1.5rem; font-weight:800; }
    header p  { color:var(--muted); font-size:0.82rem; margin-top:0.2rem; }
    .header-badges { display:flex; gap:0.5rem; margin-top:0.5rem; flex-wrap:wrap; }
    .hbadge { font-size:0.73rem; padding:0.18rem 0.6rem; border-radius:9999px; border:1px solid; font-weight:600; }
    .hbadge-h { background:#fbbf2420;color:#fbbf24;border-color:#fbbf2440; }
    .hbadge-i { background:#34d39920;color:#34d399;border-color:#34d39940; }
    .hbadge-j { background:#818cf820;color:#818cf8;border-color:#818cf840; }
    .hbadge-c { background:#94a3b820;color:#94a3b8;border-color:#94a3b840; }

    /* LAYOUT */
    .page { display:flex; max-width:1500px; margin:0 auto; }

    /* TOC */
    .toc { width:210px;min-width:210px;padding:1.2rem 0.75rem;border-right:1px solid var(--border);position:sticky;top:78px;height:calc(100vh - 78px);overflow-y:auto;flex-shrink:0; }
    .toc h3 { font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.75rem;padding-left:0.5rem; }
    .toc-item { display:block;font-size:0.77rem;padding:0.28rem 0.6rem;border-radius:6px;color:var(--subtle);margin-bottom:2px;transition:background 0.15s,color 0.15s;border-left:3px solid transparent; }
    .toc-item:hover { background:var(--surface2);color:var(--c,#818cf8);border-left-color:var(--c,#818cf8); }
    .toc-item.toc-hidden { display:none; }
    .back-top { display:block;text-align:center;padding:0.4rem;color:var(--muted);font-size:0.75rem;margin-top:1rem; }
    .back-top:hover { color:#818cf8; }
    .toc::-webkit-scrollbar { width:4px; }
    .toc::-webkit-scrollbar-thumb { background:var(--border);border-radius:4px; }

    /* MAIN */
    main { flex:1;padding:1.75rem 1.5rem;min-width:0; }

    /* Stats */
    .stats-bar { display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.25rem; }
    .stat { background:var(--surface);border:1px solid var(--border);border-radius:0.6rem;padding:0.7rem 1.2rem;text-align:center; }
    .stat .v { font-size:1.5rem;font-weight:800;color:#818cf8;line-height:1; }
    .stat .l { font-size:0.72rem;color:var(--muted);margin-top:0.2rem; }

    /* CONTROLS BAR */
    .controls-bar { display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;background:var(--surface);border:1px solid var(--border);padding:0.6rem 1rem;border-radius:0.75rem;margin-bottom:1.5rem; }
    .search-input { flex:1;min-width:200px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:0.4rem 0.8rem;border-radius:6px;font-size:0.85rem;outline:none;font-family:inherit; }
    .search-input:focus { border-color:#818cf8;box-shadow:0 0 0 2px #818cf820; }
    .cat-tabs { display:flex;gap:0.4rem;flex-wrap:wrap; }
    .cat-tab { padding:0.28rem 0.85rem;border-radius:999px;font-size:0.78rem;border:1px solid var(--border);background:transparent;color:var(--subtle);cursor:pointer;transition:all 0.15s;font-family:inherit; }
    .cat-tab:hover { background:var(--surface2);color:var(--text); }
    .cat-tab.active { font-weight:700; }
    .cat-tab[data-cat="all"].active    { background:#818cf820;color:#818cf8;border-color:#818cf860; }
    .cat-tab[data-cat="ex"].active     { background:#f9731620;color:#fb923c;border-color:#f9731660; }
    .cat-tab[data-cat="norule"].active { background:#3b82f620;color:#60a5fa;border-color:#3b82f660; }
    .cat-tab[data-cat="trainer"].active{ background:#a855f720;color:#c084fc;border-color:#a855f760; }
    .result-info { font-size:0.75rem;color:var(--muted);margin-left:auto;white-space:nowrap; }

    /* GROUP HEADERS */
    .group-header { font-size:1rem;font-weight:700;color:#f1f5f9;margin:2.25rem 0 1rem;padding-bottom:0.5rem;border-bottom:2px solid var(--border); }
    .group-header span { font-size:0.75rem;font-weight:400;color:var(--muted);margin-left:0.5rem; }
    .group-header.all-hidden { display:none; }

    /* RULE CARD */
    .rule-card { background:var(--surface);border:1px solid var(--border);border-left:4px solid var(--rc,var(--border));border-radius:0.75rem;padding:1.25rem 1.5rem;margin-bottom:1.5rem;scroll-margin-top:100px;transition:opacity 0.2s; }
    .rule-card.rule-hidden { display:none; }
    .rule-header { display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem; }
    .rule-tag-badge { font-size:0.9rem;font-weight:700;padding:0.25rem 0.7rem;border-radius:6px; }
    .rule-group-label { font-size:0.72rem;color:var(--muted);background:var(--surface2);padding:0.15rem 0.5rem;border-radius:4px; }
    .rule-desc { color:#cbd5e1;font-size:0.9rem;margin-bottom:0.6rem; }
    .rule-note { font-size:0.78rem;color:#fbbf24;background:#fbbf2410;border:1px solid #fbbf2430;border-radius:6px;padding:0.4rem 0.75rem;margin-bottom:0.75rem; }

    /* Keywords */
    .keywords-section { margin-bottom:1rem; }
    .kw-row { display:flex;align-items:flex-start;gap:0.6rem;margin-bottom:0.5rem;flex-wrap:wrap; }
    .kw-lang-label { font-size:0.7rem;font-weight:700;padding:0.2rem 0.5rem;border-radius:4px;white-space:nowrap;margin-top:2px; }
    .lang-zh { background:#dc262620;color:#fca5a5;border:1px solid #dc262640; }
    .lang-ja { background:#7c3aed20;color:#c4b5fd;border:1px solid #7c3aed40; }
    .kw-chips { display:flex;flex-wrap:wrap;gap:0.35rem; }
    .kw-chip { font-size:0.75rem;padding:0.2rem 0.55rem;border-radius:4px;font-family:'Noto Sans JP',monospace; }
    .kw-zh { background:#1e1921;color:#fca5a5;border:1px solid #7f1d1d; }
    .kw-ja { background:#1a1025;color:#c4b5fd;border:1px solid #4c1d95; }

    /* SAMPLES 3-COL */
    .samples-label { font-size:0.75rem;color:var(--muted);margin-bottom:0.5rem; }
    .samples-cols { display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-top:0.35rem; }
    .sample-col { min-width:0; }
    .sample-col.hide-cat { display:none; }
    .col-label { font-size:0.7rem;font-weight:700;padding:0.18rem 0.6rem;border-radius:4px;display:inline-block;margin-bottom:0.5rem;border:1px solid; }
    .col-label-ex      { background:#f9731615;color:#fb923c;border-color:#f9731640; }
    .col-label-norule  { background:#3b82f615;color:#60a5fa;border-color:#3b82f640; }
    .col-label-trainer { background:#a855f715;color:#c084fc;border-color:#a855f740; }
    .sample-card { background:#0f172a;border:1px solid var(--border);border-radius:8px;padding:0.7rem 1rem;margin-bottom:0.5rem; }
    .sample-card-header { display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem;flex-wrap:wrap; }
    .reg-badge,.tier-badge { font-size:0.68rem;font-weight:800;padding:0.1rem 0.4rem;border-radius:4px;border:1px solid;white-space:nowrap; }
    .card-name { font-size:0.83rem;font-weight:600;color:#e2e8f0;flex:1;min-width:0; }
    .card-id   { font-size:0.65rem;color:var(--muted); }
    .attack-name { font-size:0.72rem;color:#818cf8;margin-bottom:0.3rem;font-weight:600; }
    .effect-text { font-size:0.75rem;color:var(--subtle);line-height:1.55; }
    .no-sample { font-size:0.78rem;color:var(--muted);padding:0.4rem 0; }

    footer { border-top:1px solid var(--border);padding:1.5rem;text-align:center;font-size:0.78rem;color:var(--muted); }

    @media (max-width:900px) { .samples-cols { grid-template-columns:1fr; } }
    @media (max-width:768px) { .toc { display:none; } header { position:relative; } }
  </style>
</head>
<body>

<header>
  <h1>PTCG 效果標籤規則手冊</h1>
  <p>共 ${RULES.length} 條效果規則 ｜ 每條附寶可夢 ex、一般寶可夢、訓練家三類樣本</p>
  <div class="header-badges">
    <span class="hbadge hbadge-h">規格 H (SV1–SV4)</span>
    <span class="hbadge hbadge-i">規格 I (SV5–SV7)</span>
    <span class="hbadge hbadge-j">規格 J (SV8–SV9)</span>
    <span class="hbadge hbadge-c">Standard 合法</span>
  </div>
</header>

<div class="page">
  <nav class="toc">
    <h3>效果標籤索引</h3>
    ${tocItems}
    <a href="#top" class="back-top">↑ 返回頂部</a>
  </nav>

  <main id="top">
    <div class="stats-bar">
      <div class="stat"><div class="v">${RULES.length}</div><div class="l">效果規則</div></div>
      <div class="stat"><div class="v">${RULES.reduce((s, r) => s + r.zhKeywords.length, 0)}</div><div class="l">繁中關鍵詞</div></div>
      <div class="stat"><div class="v">${RULES.reduce((s, r) => s + r.jaKeywords.length, 0)}</div><div class="l">日文關鍵詞</div></div>
      <div class="stat"><div class="v">${totalSampleCards}</div><div class="l">H/I/J 樣本卡</div></div>
    </div>

    <div class="controls-bar">
      <input type="search" id="searchInput" placeholder="🔍 搜尋效果標籤、說明關鍵詞..." class="search-input" autocomplete="off">
      <div class="cat-tabs">
        <button class="cat-tab active" data-cat="all">全部</button>
        <button class="cat-tab" data-cat="ex">⚡ 寶可夢 ex</button>
        <button class="cat-tab" data-cat="norule">🔵 一般寶可夢</button>
        <button class="cat-tab" data-cat="trainer">🃏 訓練家</button>
      </div>
      <span class="result-info" id="resultCount">${RULES.length} / ${RULES.length} 條規則</span>
    </div>

    ${groups.map(g => {
      const groupRules = RULES.filter(r => r.group === g);
      const gc = groupRules[0]?.color ?? '#6366f1';
      return `
    <div class="group-header" id="group-${g}" style="border-color:${gc}60">
      <span style="color:${gc}">▍</span> ${g}
      <span>(${groupRules.length} 條規則)</span>
    </div>
    ${groupRules.map(r => ruleHtmlByTag[r.tag] ?? '').join('')}`;
    }).join('')}
  </main>
</div>

<footer>
  PTCG CardDB &copy; ${new Date().getFullYear()} ｜ 規格標記：H (SV1-SV4) I (SV5-SV7) J (SV8-SV9) ｜ 生成時間: ${new Date().toLocaleString('zh-TW')}
</footer>

<script>
(function () {
  var searchInput  = document.getElementById('searchInput');
  var resultCount  = document.getElementById('resultCount');
  var tabs         = Array.from(document.querySelectorAll('.cat-tab'));
  var ruleCards    = Array.from(document.querySelectorAll('.rule-card'));
  var groupHeaders = Array.from(document.querySelectorAll('.group-header'));
  var tocLinks     = Array.from(document.querySelectorAll('.toc-item[href^="#rule-"]'));
  var activeCat    = 'all';

  function applyFilters() {
    var q = searchInput.value.toLowerCase().trim();
    var visible = 0;
    var visibleIds = new Set();

    // Show/hide sample columns
    document.querySelectorAll('.sample-col').forEach(function (col) {
      col.classList.toggle('hide-cat', activeCat !== 'all' && col.dataset.cat !== activeCat);
    });

    // Show/hide rule cards
    ruleCards.forEach(function (card) {
      var txt    = (card.dataset.search || '').toLowerCase();
      var matchQ = !q || txt.includes(q);
      var hasCat = activeCat === 'all'
        || (activeCat === 'ex'      && card.dataset.hasEx      === '1')
        || (activeCat === 'norule'  && card.dataset.hasNorule  === '1')
        || (activeCat === 'trainer' && card.dataset.hasTrainer === '1');
      var show = matchQ && hasCat;
      card.classList.toggle('rule-hidden', !show);
      if (show) { visible++; visibleIds.add(card.id); }
    });

    // Hide group headers with no visible rules
    groupHeaders.forEach(function (hdr) {
      var el = hdr.nextElementSibling;
      var any = false;
      while (el && !el.classList.contains('group-header')) {
        if (el.classList.contains('rule-card') && !el.classList.contains('rule-hidden')) { any = true; break; }
        el = el.nextElementSibling;
      }
      hdr.classList.toggle('all-hidden', !any);
    });

    // Sync TOC
    tocLinks.forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      a.classList.toggle('toc-hidden', id ? !visibleIds.has(id) : false);
    });

    if (resultCount) resultCount.textContent = visible + ' / ' + ruleCards.length + ' 條規則';
  }

  searchInput.addEventListener('input', applyFilters);
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeCat = tab.dataset.cat;
      applyFilters();
    });
  });
})();
</script>
</body>
</html>`;

  const outPath = path.join(__dirname, '..', 'data', 'effect-rules.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`\n✅ Generated: ${outPath}`);
  console.log(`   Rules: ${RULES.length}`);
  console.log(`   Sample cards: ${totalSampleCards}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
