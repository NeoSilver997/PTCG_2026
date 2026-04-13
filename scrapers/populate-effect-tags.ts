/**
 * populate-effect-tags.ts
 *
 * Reads each PrimaryCard, finds its best ZH_HK (or fallback ZH_TW) language
 * variant, extracts attack effects + ability descriptions, classifies them
 * using the same logic as ptcg_processor.py, then writes
 * effectTags / specialEffectTags / effectScore / cardTier back to PrimaryCard.
 *
 * Usage:
 *   npx tsx scrapers/populate-effect-tags.ts            # dry-run (print stats)
 *   npx tsx scrapers/populate-effect-tags.ts --apply    # write to DB
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Attack {
  name?: string;
  cost?: string | string[];
  damage?: string;
  effect?: string;
  text?: string;
}

interface Ability {
  name?: string;
  type?: string;
  text?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Effect Classifier (ported from ptcg_processor.py classify_single_effect)
// ---------------------------------------------------------------------------
function classifySingleEffect(effect: string): [Set<string>, Set<string>] {
  const primary = new Set<string>();
  const special = new Set<string>();

  const has = (...words: string[]) => words.some(w => effect.includes(w));

  // --- Primary ---
  if (has('抽取', '抽出', '加入手牌', '抽卡') && has('牌庫')) {
    if (has('抽4張', '抽5張', '抽6張', '抽出4張', '抽出5張', '抽出6張')) {
      special.add('大量抽卡');
    } else {
      primary.add('抽卡效果');
    }
  }

  if (has('從', '選擇') && has('牌庫', '棄牌區') && !has('抽卡')) {
    primary.add('搜索效果');
  }

  if (has('附上', '附加', '移除') && has('能量')) {
    primary.add('能量操作');
  }

  if (has('造成', '給予') && has('傷害')) {
    primary.add('傷害效果');
  }

  if (has('中毒', '燃燒', '麻痺', '睡眠', '混亂')) {
    primary.add('狀態異常');
  }

  if (has('硬幣') && has('擲')) {
    primary.add('硬幣判定');
  }

  if (has('切換', '互換')) {
    primary.add('切換效果');
  }

  if (has('恢復', '回復') && has('HP', '傷害')) {
    primary.add('回復效果');
  }

  if (has('這張卡不會陷入特殊狀態')) {
    special.add('狀態免疫');
  }

  if (has('不會受到', '無法使用') && has('傷害')) {
    primary.add('傷害防禦');
  }

  if (has('若', '在這個回合', '在上個', '在下個') && has('增加', '點傷害')) {
    primary.add('條件傷害');
  }

  if (has('恢復', '回復') && has('特殊狀態', '狀態')) {
    primary.add('狀態恢復');
  }

  if (has('傷害指示物') && has('放置', '增加')) {
    primary.add('傷害指示物');
  }

  if (has('道具', '物品') && has('消除', '移除') && !has('選擇最多')) {
    primary.add('道具消除');
  }

  if (has('查看', '看') && !primary.has('搜索效果')) {
    primary.add('情報收集');
  }

  if (has('昏厥') && has('若', '當')) {
    primary.add('昏厥條件');
  }

  if (
    has('進化', '2階進化', '跳過') &&
    has('進化') &&
    !has('從手牌使出這張卡並完成進化時')
  ) {
    primary.add('進化支援');
  }

  if (has('撤退') && has('增加', '所需的能量')) {
    primary.add('撤退干擾');
  }

  if (has('獎賞卡')) {
    primary.add('獎賞控制');
  }

  if (has('這隻寶可夢也受到', '自己也受到') && has('傷害')) {
    primary.add('反噬傷害');
  }

  if (has('備戰寶可夢也受到', '備戰區不計算') && has('傷害')) {
    primary.add('連鎖傷害');
  }

  if (
    has('傷害不計算', '不計算弱點', '不計算抵抗力') &&
    has('弱點', '抵抗力', '附加效果') &&
    !has('備戰區不計算')
  ) {
    primary.add('無視弱點/效果');
  }

  if (has('下個自己的回合') && has('無法使用招式')) {
    primary.add('使用限制');
  }

  if (has('若', '如果') && has('失敗', '則這個招式失敗')) {
    primary.add('條件失敗');
  }

  if (has('從自己的手牌選擇', '選擇1張能量卡') && has('附於')) {
    primary.add('能量附著');
  }

  if (
    has('灼傷', '將對手的戰鬥寶可夢') &&
    has('灼傷', '中毒', '燃燒') &&
    has('若')
  ) {
    primary.add('狀態施加');
  }

  if (has('備戰寶可夢的數量', '數量×') && has('傷害')) {
    primary.add('備戰傷害加成');
  }

  if (has('視為提供', '重新附於') && has('能量')) {
    primary.add('特殊能量');
  }

  if (has('放回牌庫並重洗', '各自從牌庫抽出') && has('支援者卡')) {
    primary.add('牌庫操作');
  }

  if (
    has('在上個自己的回合', '在上個對手的回合', '在上個回合', '在上回合') &&
    has('才可使用')
  ) {
    primary.add('連續技');
  }

  if (has('選擇1個', '持有的招式') && has('無法使用') && !has('作為這個招式使用')) {
    primary.add('招式封鎖');
  }

  if (has('若自己', '只需要') && has('能量即可使用')) {
    primary.add('能量條件');
  }

  if (has('若對手', '將能量卡附於') && has('對手的回合結束')) {
    primary.add('附著干擾');
  }

  if (has('最大HP', '+50', '+70', '+30')) {
    primary.add('HP提升');
  }

  if (has('場上所有', '最大HP各') && has('競技場')) {
    primary.add('場地增幅');
  }

  if (has('不會受到', '效果的影響')) {
    primary.add('效果免疫');
  }

  if (has('寶可夢道具', '將其丟棄') && has('選擇最多')) {
    primary.add('道具移除');
  }

  if (has('選擇1個', '持有的招式') && has('作為這個招式使用')) {
    primary.add('招式複製');
  }

  if (
    effect.includes('將對手的戰鬥寶可夢【灼傷】') &&
    !has('若', '沒有', '失敗')
  ) {
    primary.add('簡單灼傷');
  }

  if (has('弱點全部消除', '弱點消除')) {
    primary.add('弱點消除');
  }

  if (has('受到對手的寶可夢招式的傷害', '傷害「-30」點') && has('【鋼】', '【鬥】')) {
    primary.add('屬性防禦');
  }

  if (has('使用招式所需的能量', '各增加1個')) {
    primary.add('能量需求增加');
  }

  if (has('棄牌區', '張數×') && has('傷害')) {
    primary.add('棄牌區傷害加成');
  }

  if (has('無法從手牌使出物品卡', '不能使用物品卡')) {
    primary.add('物品卡封鎖');
  }

  if (
    has('自己的所有寶可夢', '受到對手的寶可夢招式的傷害') &&
    has('包含新上場')
  ) {
    primary.add('全體防禦');
  }

  if (has('無法撤退')) {
    primary.add('撤退封鎖');
  }

  if (has('離開戰鬥場前無法使用', '無法使用') && !has('招式')) {
    primary.add('招式鎖定');
  }

  if (has('從自己的棄牌區抽出', '放回牌庫並重洗') && has('能量卡')) {
    primary.add('能量回收');
  }

  if (has('放回各自的牌庫並重洗', '全部放回牌庫並重洗')) {
    primary.add('牌庫重洗');
  }

  if (has('的所有「', '的寶可夢」') && has('傷害「-30」點')) {
    primary.add('特定寶可夢防禦');
  }

  if (has('弱點改為', '弱點以')) {
    primary.add('弱點改變');
  }

  if (has('對手選擇對手自己的', '作為這個招式使用') && primary.has('招式複製對手')) {
    primary.add('招式複製對手');
  }

  if (has('傷害「-80', '傷害「-100')) {
    primary.add('高額傷害減免');
  }

  if (
    has('受到招式的傷害', '傷害「-') &&
    has('-10', '-20', '-30') &&
    !has('【鋼】', '【鬥】', '所有寶可夢')
  ) {
    primary.add('傷害減免');
  }

  if (has('支援者卡只可使用', '支援者卡只可使用1張')) {
    primary.add('支援者限制');
  }

  // --- Special ---
  if (has('丟棄') && has('對手')) {
    special.add('丟棄效果');
  }

  if (has('撤退')) {
    special.add('撤退效果');
  }

  if (has('放置') && has('備戰區', '場上')) {
    special.add('放置效果');
  }

  if (has('從手牌使出這張卡並完成進化時')) {
    special.add('進化效果');
  }

  if (has('競技場')) {
    special.add('競技場效果');
  }

  if (has('特性')) {
    special.add('特性效果');
  }

  if (has('特殊狀態', '狀態') && has('不會', '不能', '無法')) {
    special.add('狀態免疫');
  }

  // Fallback
  if (
    primary.size === 0 &&
    special.size === 0 &&
    !has('可不限張數使用', '可使用', '只能使用')
  ) {
    primary.add('其他效果');
  }

  return [primary, special];
}

function classifyCard(attacks: Attack[], abilities: Ability[]): [string[], string[]] {
  const primary = new Set<string>();
  const special = new Set<string>();

  const processText = (text: string) => {
    if (!text?.trim()) return;
    const [p, s] = classifySingleEffect(text.trim());
    p.forEach(t => primary.add(t));
    s.forEach(t => special.add(t));
  };

  for (const ab of abilities ?? []) {
    processText(ab.description ?? ab.text ?? '');
  }
  for (const atk of attacks ?? []) {
    processText(atk.effect ?? atk.text ?? '');
  }

  return [
    [...primary].sort(),
    [...special].sort(),
  ];
}

// ---------------------------------------------------------------------------
// Effect score (simplified — based on primary tag weights from ptcg_processor.py)
// ---------------------------------------------------------------------------
const PRIMARY_SCORES: Record<string, number> = {
  '資源獲取': 4, '抽卡效果': 3, '搜索效果': 3, '能量回收': 3,
  '資源管理': 3, '能量操作': 3, '能量附著': 2, '牌庫操作': 2,
  '傷害輸出': 4, '傷害效果': 3, '條件傷害': 3, '連鎖傷害': 4,
  '狀態控制': 3, '狀態異常': 3, '傷害指示物': 2,
  '隨機效果': 2, '硬幣判定': 1,
  '支援效果': 3, '物品效果': 2,
  '位置控制': 3, '切換效果': 2,
  '恢復效果': 2, '回復效果': 2,
  '防禦效果': 3, '傷害防禦': 3, '效果免疫': 4,
  '干擾效果': 4, '道具消除': 3, '招式封鎖': 3,
  '情報效果': 2, '進化效果': 3, '資源控制': 2, '條件效果': 2,
  '限制效果': 1, '增幅效果': 2, '場地效果': 2, '特殊效果': 2,
  // fine-grained tags
  '昏厥條件': 3, '反噬傷害': 2, '無視弱點/效果': 3,
  '使用限制': 1, '條件失敗': 1, '能量附著': 2, '狀態施加': 2,
  '備戰傷害加成': 3, '特殊能量': 3, '牌庫重洗': 1,
  '連續技': 2, '能量條件': 2, '附著干擾': 3,
  'HP提升': 2, '場地增幅': 3, '道具移除': 3, '招式複製': 3,
  '簡單灼傷': 2, '弱點消除': 3, '屬性防禦': 2, '能量需求增加': 3,
  '棄牌區傷害加成': 3, '物品卡封鎖': 3, '全體防禦': 3,
  '撤退封鎖': 2, '招式鎖定': 2, '能量回收': 3,
  '傷害減免': 2, '支援者限制': 1, '特定寶可夢防禦': 2,
  '弱點改變': 2, '招式複製對手': 3, '高額傷害減免': 4,
  '进化支援': 3, '撤退干擾': 2, '獎賞控制': 2, '其他效果': 1,
};

const SPECIAL_SCORES: Record<string, number> = {
  '大量抽卡': 5, '丟棄效果': 4, '撤退效果': 3, '放置效果': 3,
  '競技場效果': 4, '特性效果': 3, '狀態免疫': 4, '進化效果': 3,
};

function computeEffectScore(primaryTags: string[], specialTags: string[]): number {
  let score = 0;
  for (const t of primaryTags) score += PRIMARY_SCORES[t] ?? 1;
  for (const t of specialTags) score += SPECIAL_SCORES[t] ?? 1;
  return Math.min(score, 12);
}

function computeTier(effectScore: number): string {
  // Simple tier based on effect score alone (full rating needs DB queries per card)
  if (effectScore >= 11) return 'S+';
  if (effectScore >= 9)  return 'S';
  if (effectScore >= 7)  return 'A+';
  if (effectScore >= 5)  return 'A';
  if (effectScore >= 4)  return 'B+';
  if (effectScore >= 3)  return 'B';
  if (effectScore >= 2)  return 'C+';
  if (effectScore >= 1)  return 'C';
  return 'D';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '▶ APPLY mode — writing to DB' : '📋 DRY-RUN mode — no writes');

  // Load all primary cards with their ZH_HK cards first, fallback to any card
  const BATCH = 500;
  let skip = 0;
  let processed = 0;
  let updated = 0;

  const tagFreq: Record<string, number> = {};

  while (true) {
    const primaryCards = await prisma.primaryCard.findMany({
      skip,
      take: BATCH,
      select: {
        id: true,
        name: true,
        cards: {
          // Prefer ZH_HK, then ZH_TW, then any
          orderBy: [{ language: 'asc' }],
          select: {
            language: true,
            attacks: true,
            abilities: true,
          },
        },
      },
    });

    if (primaryCards.length === 0) break;

    const updates: Array<{
      id: string;
      effectTags: string[];
      specialEffectTags: string[];
      effectScore: number;
      cardTier: string;
    }> = [];

    for (const pc of primaryCards) {
      // Pick best card: prefer ZH_HK > ZH_TW > others
      const card =
        pc.cards.find(c => c.language === 'ZH_HK') ??
        pc.cards.find(c => c.language === 'ZH_TW') ??
        pc.cards[0];

      if (!card) {
        processed++;
        continue;
      }

      const attacks = (card.attacks ?? []) as Attack[];
      const abilities = (card.abilities ?? []) as Ability[];

      const [primaryTags, specialTags] = classifyCard(attacks, abilities);
      const effectScore = computeEffectScore(primaryTags, specialTags);
      const cardTier = computeTier(effectScore);

      for (const t of primaryTags) tagFreq[t] = (tagFreq[t] ?? 0) + 1;
      for (const t of specialTags) tagFreq[t] = (tagFreq[t] ?? 0) + 1;

      updates.push({ id: pc.id, effectTags: primaryTags, specialEffectTags: specialTags, effectScore, cardTier });
      processed++;
    }

    if (apply && updates.length > 0) {
      // Batch update using individual updateMany (Prisma doesn't support bulk upsert with different values)
      await prisma.$transaction(
        updates.map(u =>
          prisma.primaryCard.update({
            where: { id: u.id },
            data: {
              effectTags: u.effectTags,
              specialEffectTags: u.specialEffectTags,
              effectScore: u.effectScore,
              cardTier: u.cardTier,
            },
          })
        )
      );
      updated += updates.length;
    } else if (!apply) {
      updated += updates.length;
    }

    skip += BATCH;
    process.stdout.write(`\r  processed: ${processed}`);
  }

  console.log(`\n\n=== Effect Tag Population ${apply ? 'COMPLETE' : 'DRY-RUN'} ===`);
  console.log(`  Primary cards processed : ${processed}`);
  console.log(`  Records updated         : ${updated}`);

  console.log('\nTop 20 most common effect tags:');
  const sorted = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [tag, count] of sorted) {
    console.log(`  ${count.toString().padStart(5)}  ${tag}`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
