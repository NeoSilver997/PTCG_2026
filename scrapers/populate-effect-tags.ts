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
import fs from 'fs';

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
// Numeric extractors — derive actual counts/values from effect text
// ---------------------------------------------------------------------------

/**
 * Returns the number of cards drawn in a single draw effect, or 0 if unknown.
 * ZH: 抽出N張, 抽N張  |  JA: 山札からN枚引く, N枚引く
 */
/**
 * Returns the number of cards drawn in a single draw effect, or 0 if unknown.
 * ZH: 抽出N張, 抽N張  |  JA: 山札からN枚引く, N枚引く
 * Also handles "draw until hand = N" (Iono / N / タイム / パルデアの仲間たち style):
 *   ZH: 手牌有N張 / 手牌達到N張  |  JA: 手札がN枚になるように
 */
function extractDrawCount(effect: string): number {
  // Explicit "draw N" patterns (ZH + JA)
  const zhExplicit = effect.match(/抽出?(\d+)張/);
  if (zhExplicit) return parseInt(zhExplicit[1], 10);

  const ja1 = effect.match(/山札から(\d+)枚引く/);
  if (ja1) return parseInt(ja1[1], 10);

  const ja2 = effect.match(/(\d+)枚引く/);
  if (ja2) return parseInt(ja2[1], 10);

  // "Draw until hand = N" — Iono / N / タイム / パルデアの仲間たち style
  // ZH: 手牌有N張 / 手牌達到N張 / 手牌至少N張
  const zhHandSize = effect.match(/手牌[有達到至]{0,4}(\d+)張/);
  if (zhHandSize) return parseInt(zhHandSize[1], 10);

  // JA: 手札がN枚になるように
  const jaHandSize = effect.match(/手札が(\d+)枚になるように/);
  if (jaHandSize) return parseInt(jaHandSize[1], 10);

  // EN: "Draw 2 cards" / "Draw a card"
  const enExplicit = effect.match(/[Dd]raw (\d+) cards?/);
  if (enExplicit) return parseInt(enExplicit[1], 10);
  if (/[Dd]raw a card/.test(effect)) return 1;

  // EN: "draw cards until you have / they have N cards in your hand" (Iono / Rose Tower style)
  const enHandSize = effect.match(/have (\d+) cards? in (?:your|their) hand/);
  if (enHandSize) return parseInt(enHandSize[1], 10);

  return 0;
}

/**
 * Extracts the primary selection quantity from a search or recovery effect.
 * Used to encode "how many cards/Pokémon" into tag names for disambiguation.
 * Returns the number if found (≥1), or 0 if not found.
 *
 * ZH: 最多N張/隻/個, 選擇N張/隻
 * JA: 最大N枚まで, N枚まで選, N匹, N枚を選ぶ
 */
function extractQuantity(effect: string): number {
  // ZH: "最多N張/隻/個" (up to N)
  const zhUpTo = effect.match(/最多(\d+)[張隻個]/);
  if (zhUpTo) return parseInt(zhUpTo[1], 10);

  // ZH: "選擇N張/隻"
  const zhChoose = effect.match(/選擇(\d+)[張隻個]/);
  if (zhChoose) return parseInt(zhChoose[1], 10);

  // JA: "最大N枚まで" or "N枚まで(選/加える/戻す)"
  const jaUpTo = effect.match(/(?:最大)?(\d+)枚まで(?:選|加える|戻す|山札)/);
  if (jaUpTo) return parseInt(jaUpTo[1], 10);

  // JA: "N枚を選" or "N枚選ぶ"
  const jaChoose = effect.match(/(\d+)枚[をに]?選/);
  if (jaChoose) return parseInt(jaChoose[1], 10);

  // JA: "N匹まで" or "N匹選"
  const jaAnimal = effect.match(/(\d+)匹/);
  if (jaAnimal) return parseInt(jaAnimal[1], 10);

  // EN: "up to N" — standard English quantity phrase
  const enUpTo = effect.match(/up to (\d+)/i);
  if (enUpTo) return parseInt(enUpTo[1], 10);

  // EN: "Choose N" (when not inside "up to")
  if (!effect.toLowerCase().includes('up to')) {
    const enChoose = effect.match(/[Cc]hoose (\d+)/);
    if (enChoose) return parseInt(enChoose[1], 10);
  }

  return 0;
}

/**
 * Returns the theoretical max damage a variable-damage effect can deal.
 * Assumes realistic upper bounds per scaling type:
 *   Prize-based (×N): max 5 prizes  |  Damage counters (×N): max 12
 *   Bench count (×N): max 5 bench   |  Discard pile (×N): max 20 cards
 * Returns 0 if no variable damage detected.
 */
function extractMaxDamage(effect: string, baseDamage = 0): number {
  let maxVariable = 0;

  // Prize-based: 獎賞卡的張數×N / サイドの枚数×N  (max 5 prizes)
  const prizeZH = effect.match(/獎賞卡的張數[×x](\d+)/);
  if (prizeZH) maxVariable = Math.max(maxVariable, 5 * parseInt(prizeZH[1], 10));

  const prizeJA = effect.match(/サイドの枚数[×x](\d+)/);
  if (prizeJA) maxVariable = Math.max(maxVariable, 5 * parseInt(prizeJA[1], 10));

  // Damage counter-based: 傷害指示物的數量×N / のせているダメカンの数×N  (max 12)
  const counterZH = effect.match(/傷害指示物的數量[×x](\d+)/);
  if (counterZH) maxVariable = Math.max(maxVariable, 12 * parseInt(counterZH[1], 10));

  const counterJA = effect.match(/のせているダメカンの数[×x](\d+)/);
  if (counterJA) maxVariable = Math.max(maxVariable, 12 * parseInt(counterJA[1], 10));

  // Bench count: 備戰寶可夢的數量×N / ベンチポケモンの数×N  (max 5)
  const benchZH = effect.match(/備戰寶可夢的數量[×x](\d+)/);
  if (benchZH) maxVariable = Math.max(maxVariable, 5 * parseInt(benchZH[1], 10));

  const benchJA = effect.match(/ベンチポケモンの数[×x](\d+)/);
  if (benchJA) maxVariable = Math.max(maxVariable, 5 * parseInt(benchJA[1], 10));

  // Discard pile: 棄牌區.*張數×N / トラッシュ.*枚×N  (max 20 cards)
  const trashZH = effect.match(/棄牌區[^。]*張數[×x](\d+)/);
  if (trashZH) maxVariable = Math.max(maxVariable, 20 * parseInt(trashZH[1], 10));

  const trashJA = effect.match(/トラッシュ[^。]*枚[×x](\d+)/);
  if (trashJA) maxVariable = Math.max(maxVariable, 20 * parseInt(trashJA[1], 10));

  // EN: "N more damage for each Prize card remaining" (max 5 prizes)
  const enPrize = effect.match(/(\d+) (?:more )?damage for each.*Prize card/i);
  if (enPrize) maxVariable = Math.max(maxVariable, 5 * parseInt(enPrize[1], 10));

  // EN: "N more damage for each Benched Pokémon" (max 5 bench)
  const enBench = effect.match(/(\d+) (?:more )?damage for each.*[Bb]enched/i);
  if (enBench) maxVariable = Math.max(maxVariable, 5 * parseInt(enBench[1], 10));

  // EN: "N damage for each damage counter on" (max 12 counters)
  const enCounter = effect.match(/(\d+) (?:more )?damage for each damage counter/i);
  if (enCounter) maxVariable = Math.max(maxVariable, 12 * parseInt(enCounter[1], 10));

  // EN: "N more damage for each Energy attached" (max 10 energy)
  const enEnergy = effect.match(/(\d+) (?:more )?damage for each.*[Ee]nergy attached/i);
  if (enEnergy) maxVariable = Math.max(maxVariable, 10 * parseInt(enEnergy[1], 10));

  return maxVariable > 0 ? baseDamage + maxVariable : 0;
}

// ---------------------------------------------------------------------------
// Effect Classifier (ported from ptcg_processor.py classify_single_effect)
// ---------------------------------------------------------------------------
function classifySingleEffect(effect: string): [Set<string>, Set<string>] {
  const primary = new Set<string>();
  const special = new Set<string>();

  // Normalize typographic apostrophes/quotes to ASCII for consistent substring matching.
  // EN card text scraped from HTML often uses curly apostrophes (U+2018/U+2019).
  effect = effect.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // Normalize scraper line-break artifacts: spaces injected between CJK characters.
  // e.g. "エネルギーは、すべてな くなる" → "エネルギーは、すべてなくなる"
  // This only removes spaces between non-ASCII (CJK) characters, leaving EN/mixed untouched.
  effect = effect.replace(/([^\x00-\x7F]) +([^\x00-\x7F])/g, '$1$2');

  const has = (...words: string[]) => words.some(w => effect.includes(w));

  // Deck shuffle signal appears in many Trainer cards after search/recovery.
  if (
    (has('牌庫') && has('重洗', '洗牌')) ||
    has('山札にもどして切', '山札に戻して切', '山札を切る', '山札をシャッフル') ||
    has('Shuffle your deck', 'shuffle your deck', 'shuffle that deck', 'shuffle your library')
  ) {
    primary.add('牌庫重洗');
  }

  // Reveal/show-to-opponent is informational utility and should not fall into generic tags.
  if (
    has('給對手看過後', '公開給對手', '向對手展示', '給對手看') ||
    has('相手に見せる', '相手に見せた', '相手に見せて') ||
    has('Reveal it', 'reveal it', 'Reveal them', 'reveal them', 'show it to your opponent', 'show them to your opponent')
  ) {
    primary.add('情報收集');
  }

  // --- Primary ---
  // Draw cards (ZH + JA)
  // Primary tag: 抽卡×N when count is known; else 抽卡効果 (unknown/variable)
  // Special tag: 大量抽卡 when N ≥ 3 (kept for effectScore/cardTier compatibility)
  const _isDrawEffect =
    (has('抽取', '抽出', '加入手牌', '抽卡') && has('牌庫')) ||
    (has('山札から') && has('引く', 'カードを引')) ||
    (has('手札に加える', '手札に入れる') && has('山札', '引く')) ||
    // JA: 山札をN枚引く (without から) — e.g. インフルエンサーの紹介, 殿堂の書
    // Also 山札を2枚引いてよい (プレイヤーズセレモニー, optional draw stadiums)
    /山札を\d+枚引/.test(effect) ||
    // JA: 数ぶん、山札を引く (variable draw by bench count etc. — ミツバ, ジェット, ジンダイ etc.)
    has('山札を引く') ||
    // JA: draw to hand size — 手札がN枚になるように引く (Lillie / N / アオキ style)
    // Also handles 引いてよい (Rose Tower) and other て-form inflections
    (has('手札が') && has('になるように') && has('引く', '引いて', '引い')) ||
    // EN: "Draw a card" / "Draw 2 cards" etc. / "draw cards until you have N cards in your hand"
    /[Dd]raw (?:a card|\d+ cards?)/.test(effect) ||
    (has('draw cards until', 'Draw cards until') && has('in your hand', 'in their hand'));
  if (_isDrawEffect) {
    const drawCount = extractDrawCount(effect);
    if (drawCount > 0) {
      primary.add(`抽卡×${drawCount}`);
      if (drawCount >= 3) special.add('大量抽卡');
    } else {
      // unknown / variable count (e.g. "draw until hand is full")
      primary.add('抽卡效果');
    }
  }

  // Search (ZH + JA)
  // Deck search — must involve "選擇" (choosing a card), not just drawing from deck
  if (
    (has('選擇') && has('牌庫') && !has('抽出', '抽卡') && !has('對手')) ||
    (has('山札から') && has('探す', '選び', '手札に加える') && !has('引く') && !has('對手')) ||
    // EN: generic deck search (not Basic Pokémon, not energy-only, not evolution — those have dedicated blocks)
    (has('Search your deck for', 'search your deck for') &&
      !has('Basic Pokémon', 'Basic {') && !has('Energy card', ' Energy card') &&
      !has('evolves from') && !has('Supporter card') && !has('Item card') && !has('Tool card')) ||
    // EN: Adaman-style — "Search your deck for up to N cards and put them into your hand"
    //     (blocked by Energy card guard above due to discard cost; add explicit match)
    (has('Search your deck for up to') && has('cards and put them into your hand')) ||
    // EN: stadium third-person search (Turffield Stadium — "search their deck for ... into their hand")
    (has('search their deck') && has('Pokémon') && has('into their hand')) ||
    // EN: Riley — reveal top N cards, opponent picks to discard, rest to hand
    (has('Reveal the top') && has('your opponent choose') && has('into your hand'))
  ) {
    const qty = extractQuantity(effect);
    primary.add(qty > 0 ? `牌庫搜索×${qty}` : '牌庫搜索');
  }
  // Discard-pile search
  if (
    (has('選擇') && has('棄牌區') && !has('抽卡')) ||
    (has('トラッシュから') && has('手札に加える', '手札に')) ||
    // EN: retrieve non-energy card from discard pile to hand
    (has('from your discard pile') && has('into your hand', 'to your hand') &&
      !has('Energy') && !has('attach')) ||
    // EN: shuffle cards from discard pile into own deck (Super Rod, Ordinary Rod, Team Yell's Cheer)
    (has('from your discard pile') && has('into your deck') && !has('Supporter') && !has('Energy')) ||
    // JA: recover non-energy cards from discard to deck
    (has('トラッシュから') && has('山札にもどして切', '山札に戻して切', '山札に戻す', '山札にもどす', '山札の上にもどす') &&
      !has('サポート') && !has('エネルギー'))
  ) {
    const qty = extractQuantity(effect);
    primary.add(qty > 0 ? `棄牌搜索×${qty}` : '棄牌搜索');
  }

  // Place Basic Pokémon onto Bench or search to hand from deck (放置基礎寶可夢) — ZH + JA
  // ZH patterns observed in DB:
  //   好友寶芬/巢穴球/貴重手推車: 【基礎】寶可夢 + 放置於備戰區
  //   戰鬥鑼: 【基礎】寶可夢 + 加入手牌 + 牌庫  (searches to hand, not bench directly)
  //   太晶珠:  「太晶」寶可夢 + 加入手牌 + 牌庫  (Tera keyword, not 【基礎】)
  //   寶可平板: 擁有規則的寶可夢 + 除外 + 加入手牌 + 牌庫  (non-rule-box = effectively Basic)
  // JA: 基本ポケモン (Nest Ball, Poffin) + テラスタルのポケモン (Tera Orb)
  if (
    // ZH: bench placement — e.g. 好友寶芬, 巢穴球, 貴重手推車
    (has('【基礎】寶可夢', '基本寶可夢') && (has('備戰區') || has('放置', '放到'))) ||
    // ZH: search Basic/Tera Pokémon to hand from deck — e.g. 戰鬥鑼, 太晶珠
    (has('【基礎】寶可夢', '基本寶可夢', '「太晶」寶可夢') && has('加入手牌') && has('牌庫')) ||
    // ZH: looser Tera token variant used by some scrapers/translations
    (has('「太晶」') && has('寶可夢') && has('加入手牌') && has('牌庫')) ||
    // ZH: search any non-rule-box Pokémon from deck — e.g. 寶可平板
    (has('擁有規則的寶可夢') && has('除外') && has('加入手牌') && has('牌庫')) ||
    // JA: bench/hand from deck — 基本ポケモン / たねポケモン (old sets) / テラスタルのポケモン
    ((has('基本ポケモン') || has('たねポケモン') || has('テラスタルのポケモン')) && (
      has('ベンチに出す', 'ベンチに置く', 'バトル場に出す', 'ベンチに出せる', 'ベンチに') ||
      has('手札に加える')
    ) && has('山札から', '山札を', '選び', '選んで')) ||
    // EN: "Search your deck for up to N Basic Pokémon and put them onto your Bench"
    ((has('Basic Pokémon') || has('Basic {')) &&
      (has('Search your deck', 'search your deck') || has('your deck for')) &&
      (has('Bench', 'your hand', 'put it onto'))) ||
    // EN: Tera Pokémon search phrasing
    (has('Tera Pokémon', 'Tera Pokemon') &&
      (has('Search your deck', 'search your deck') || has('your deck for')) &&
      has('into your hand', 'your hand', 'show it', 'reveal it'))
  ) {
    const qty = extractQuantity(effect);
    primary.add(qty > 0 ? `放置基礎×${qty}` : '放置基礎寶可夢');
  }

  // Energy operations (ZH + JA)
  if (
    (has('附上', '附加', '移除') && has('能量')) ||
    has('エネルギーをつけ替える', 'エネルギーをはがし', 'エネルギーを手札に戻す') ||
    // JA: energy rearrangement (カスミの水さばき, タッグスイッチ, マルチつけかえ, ポピー)
    (has('エネルギー') && has('つけ替える')) ||
    // EN: Fan of Waves — put opponent's Special Energy back to their deck
    (has('Special Energy') && has("your opponent's") && (has('their deck') || has('bottom of their deck'))) ||
    // EN: Exp. Share — move Energy on KO'd Active Pokémon to this one
    (has('move') && has('Energy') && has('Knocked Out') && has('Pokémon this card is attached to')) ||
    // EN: Rugged Helmet — put Energy from attacking Pokémon into opponent's hand
    (has('Attacking Pokémon') && has('Energy') && has("your opponent's hand")) ||
    (has('エネルギー') && has('トラッシュ') && has('ポケモン')) ||
    (has('エネルギーカード') && has('つける', 'はがす')) ||
    // JA: return opponent's Energy to hand / deck (Team Yell Grunt, Raihan style)
    (has('相手') && has('エネルギー') && (has('手札にもどす') || has('山札の上にもどす') || has('山札にもどす'))) ||
    // EN
    has('Move an Energy', 'Move a Basic Energy') ||
    (has('Discard') && has('Energy from this Pok\u00e9mon', 'Energy from your opponent')) ||
    (has('discard all') && has('Energy from')) ||
    // EN: discard a Special Energy from each of opponent's Pokémon (Giacomo)
    (has('Discard') && has('Special Energy') && has("opponent's Pok\u00e9mon", "opponent's")) ||
    // EN: "Discard 1 Energy card attached to that Pokémon" (Super Potion, Kiawe, etc.)
    (has('Discard') && has('Energy') && (has('attached to that', 'attached to 1 of', 'attached to this', 'attached to your'))) ||
    // EN: put attached Energy into opponent's hand / deck (Team Yell Grunt)
    (has('Energy attached') && (has('into their hand') || has('into their deck') || has("opponent's deck")))
  ) {
    primary.add('能量操作');
  }

  // Damage (ZH + JA)
  if (
    (has('造成', '給予') && has('傷害')) ||
    (has('ダメカン') && has('のせる', '乗せる')) ||
    (has('ダメージを与え'))
  ) {
    primary.add('傷害效果');
  }

  // Status conditions (ZH + JA)
  if (
    has('中毒', '燃燒', '麻痺', '睡眠', '混亂') ||
    has('どくにする', 'どくポケモン', 'やけどにする', 'やけどポケモン',
        'ねむりにする', 'まひにする', 'こんらんにする',
        'やけど', 'どく', 'ねむり', 'まひ', 'こんらん') ||
    // EN: status condition keywords
    has('is now Poisoned', 'is now Burned', 'is now Paralyzed', 'is now Asleep', 'is now Confused',
        'now Poisoned', 'now Burned', 'now Paralyzed', 'now Asleep', 'now Confused',
        'make your opponent\'s Active Pok\u00e9mon Burned',
        'make your opponent\'s Active Pok\u00e9mon Asleep',
        'make your opponent\'s Active Pok\u00e9mon Poisoned')
  ) {
    primary.add('狀態異常');
  }

  // Coin flip (ZH + JA)
  if (
    (has('硬幣') && has('擲')) ||
    has('コインを投げ', 'コイントス') ||
    // EN
    has('Flip a coin', 'Flip 2 coins', 'Flip 3 coins', 'Flip 4 coins', 'Flip 5 coins',
        'flip a coin', 'flip 2 coins')
  ) {
    primary.add('硬幣判定');
  }

  // Opponent forced-switch — "Boss's Orders / グズマ" gust effect (tier S)
  // ZH: 選擇對手的備戰寶可夢，與戰鬥寶可夢互換
  // JA: 相手のベンチポケモンをバトル場に呼び出す / 相手のバトルポケモンとベンチポケモンを入れ替える
  if (
    (has('對手') && has('互換') && has('戰鬥寶可夢')) ||
    (has('相手') && has('バトル場に呼び出す')) ||
    (has('相手') && has('バトルポケモンとベンチポケモンを入れ替え')) ||
    // JA: Lysandre / Guzma gust — バトルポケモンと入れ替える
    (has('相手') && has('バトルポケモンと入れ替える')) ||
    // EN: Boss's Orders / Gust of Wind style effects (after apostrophe normalization)
    (has("your opponent's Benched") && has('Active Spot', 'Active Pok\u00e9mon') && !has('damage')) ||
    has("Switch out your opponent's Active Pok\u00e9mon") ||
    (has('switch in') && has("opponent's Benched") && has('Active Spot'))
  ) {
    primary.add('對手切換');
  }

  // Switch (ZH + JA + EN) — general self-switch / retreat replacement
  if (
    has('切換', '互換') ||
    has('バトル場に呼び出す', 'バトル場のポケモンと入れ替える',
        'ベンチポケモンと交代', 'ベンチに下がる', '強制的に入れ替え') ||
    // JA: Guzma self-switch component
    has('バトルポケモンをベンチポケモンと入れ替える') ||
    // EN: self-switch effects
    has('Switch this Pok\u00e9mon with', 'switch it with your Active Pok\u00e9mon',
        'Switch out your Active Pok\u00e9mon', 'switch in 1 of your Benched',
        'switch this Pok\u00e9mon') ||
    // EN: Switch card — "Switch your Active Pok\u00e9mon with 1 of your Benched"
    has('Switch your Active Pok\u00e9mon with 1 of your Benched') ||
    // EN: Escape Rope — "Each player switches their Active Pok\u00e9mon"
    has('switches their Active Pok\u00e9mon', 'Each player switches') ||
    // JA: swap active with card in hand (スズキサン とりかえっこ)
    (has('バトルポケモン') && has('とりかえっこ')) ||
    // JA: swap field Pokémon with discard Pokémon (ネジキ, クチナシ)
    (has('トラッシュ') && has('ポケモン') && has('入れ替える') && !has('エネルギー'))
  ) {
    primary.add('切換效果');
  }

  // Recovery (ZH + JA + EN)
  if (
    (has('恢復', '回復') && has('HP', '傷害')) ||
    (has('HPを回復') || (has('回復') && has('HP', 'ダメカン'))) ||
    has('ダメカンをとり除く', 'ダメカンを取り除く', 'HPが回復') ||
    // EN
    /[Hh]eal \d+ damage|[Hh]eal from this|[Hh]eal all damage/.test(effect) ||
    // EN: "Restore N HP" / "restore N HP to" — alternate healing wording
    /[Rr]estore \d+ HP/.test(effect) ||
    // EN: "remove N damage counters" style (older sets)
    /remove \d+ damage counters?/i.test(effect)
  ) {
    primary.add('回復效果');
  }

  if (has('這張卡不會陷入特殊狀態')) {
    special.add('狀態免疫');
  }

  // Damage prevention (ZH + JA + EN)
  if (
    (has('不會受到', '無法使用') && has('傷害')) ||
    has('ダメージを受けない', '受けるダメージは「0」') ||
    (has('受けるダメージ') && has('受けない', '0にする')) ||
    // EN
    has('prevent all damage done to this Pokémon',
        'prevent all damage from and effects',
        'prevent all damage done to each of your')
  ) {
    primary.add('傷害防禦');
  }

  // Conditional damage (ZH + JA + EN)
  if (
    (has('若', '在這個回合', '在上個', '在下個') && has('增加', '點傷害')) ||
    (has('の数×', 'の枚数×', '×10', '×20', '×30', '×40', '×50') && has('ダメージ')) ||
    // JA: flat damage boost tools (プラスパワー, ちからのハチマキ, エレキパワー, etc.)
    (has('バトルポケモンへのダメージは') && /「[+＋]\d+」/.test(effect)) ||
    // JA: damage to バトル場のポケモン (older tool phrasing — おはらいグローブ, ファイティングスタジアム)
    (has('バトル場の') && has('へのダメージ') && /「[+＋]\d+」/.test(effect)) ||
    // EN: Supereffective Glasses — modify Weakness multiplier (adds bonus damage)
    (has('Weakness') && has('apply it as') && /×\d/.test(effect)) ||
    // EN: "does N more damage for each" / "does N damage for each"
    (has('more damage for each', 'damage for each') && !has('Benched Pok\u00e9mon (both yours')) ||
    (has('this attack does') && has('more damage') && (has('if ', 'during '))) ||
    // EN: flat damage boost to opponent's Active / Benched (Choice Belt, Leon, etc.)
    (has('more damage to your opponent') && has('Pok\u00e9mon') && !has('for each'))
  ) {
    primary.add('條件傷害');
  }

  // Status recovery (ZH + JA + EN)
  if (
    (has('恢復', '回復') && has('特殊狀態', '狀態')) ||
    has('特殊状態を回復', '特殊状態がなおる', '状態異常を回復',
        '特殊状態を、すべて回復', '特殊状態がすべて回復') ||
    // EN
    has('recover from a Special Condition', 'remove all Special Conditions',
        'isn\'t affected by any Special Condition', 'can\'t be affected by any Special Condition',
        'recovers from all Special Conditions', 'recovers from all of them')
  ) {
    primary.add('狀態恢復');
  }

  // Damage counters (ZH + JA + EN)
  if (
    (has('傷害指示物') && has('放置', '增加')) ||
    (has('ダメカン') && has('のせる', '乗せる', 'ダメカンを')) ||
    // EN: place damage counters
    (has('put') && has('damage counters on') && has('Pok\u00e9mon')) ||
    // EN: move damage counters (Agatha, Damage Pump)
    (has('Move', 'move') && has('damage counters') && has('Pok\u00e9mon'))
  ) {
    primary.add('傷害指示物');
  }

  // Tool removal (ZH + JA + EN)
  if (
    (has('道具', '物品') && has('消除', '移除') && !has('選擇最多')) ||
    has('ポケモンのどうぐをトラッシュ', 'ポケモンのどうぐを捨て', 'どうぐをトラッシュ') ||
    // EN: discard a single Pokémon Tool
    (has('discard') && has('Pokémon Tool') && !has('all Pokémon Tools')) ||
    // EN: Tool Jammer — opponent's Tool has no effect while this Pokémon is Active
    (has('Pokémon Tools') && has('no effect'))
  ) {
    primary.add('道具消除');
  }

  // Information (ZH + JA + EN)
  if (
    (has('查看', '看') && !primary.has('牌庫搜索') && !primary.has('棄牌搜索')) ||
    // JA: 見る (look at) as well as 見てよい (may look at) and other て-form inflections
    (has('手札を見る', '手札を見てよい', '相手の手札を見る', '相手の手札を見てよい', '相手の手札を見て') && !primary.has('牌庫搜索') && !primary.has('棄牌搜索')) ||
    // EN: peek at opponent's hand or top of deck
    ((has('look at', 'Look at') && (has("opponent's hand", 'their hand', 'the top'))) &&
      !primary.has('牌庫搜索') && !primary.has('棄牌搜索')) ||
    // EN: opponent reveals hand (Eri, Oleana, Riley)
    (has('reveals their hand', 'reveal their hand', 'reveals the top') && !primary.has('牌庫搜索'))
  ) {
    primary.add('情報收集');
  }

  // KO condition (ZH + JA + EN)
  if (
    (has('昏厥') && has('若', '當')) ||
    (has('きぜつ') && has('なら', 'したなら', 'していたなら')) ||
    // EN: effects that trigger when this Pokémon is Knocked Out
    (has('Knocked Out') && (has('your opponent takes') || has('instead of') || has('opponent takes 1 fewer')))
  ) {
    primary.add('昏厥條件');
  }

  // Evolution support (ZH + JA + EN)
  if (
    (has('進化', '2階進化', '跳過') && has('進化') && !has('從手牌使出這張卡並完成進化時')) ||
    (has('進化できる') || (has('進化') && has('このターン', '手札'))) ||
    // EN: evolution speed or search-to-evolve effects
    (has('evolve') && (has('your first turn', 'the turn you play it', 'during your turn') ||
      has('search your deck for a card that evolves', 'evolve it', 'to evolve',
          'put it onto that Pok\u00e9mon to evolve')))
  ) {
    primary.add('進化支援');
  }

  // Retreat disruption (ZH + JA + EN)
  if (
    (has('撤退') && has('增加', '所需的能量')) ||
    (has('にげるためのエネルギー') && has('多く', '必要')) ||
    // JA: Aqua's Secret Base / Moon's Altar — にげるために必要なエネルギー.*多く
    (has('にげるために必要なエネルギー') && has('多く')) ||
    // EN: Retreat Cost increases (not retreat lock, which is handled separately)
    (has('Retreat Cost') && (has(' more', 'increased') && !has('no Retreat Cost', 'Retreat Cost is 0')))
  ) {
    primary.add('撤退干擾');
  }

  // Prize control (ZH + JA + EN)
  if (
    has('獎賞卡') ||
    has('サイドカード', 'サイドを', 'サイドを取る') ||
    // EN
    has('Prize card', 'take 1 more Prize', 'take 2 Prize',
        'take an extra Prize', 'take 1 Prize card', 'take 2 Prize cards')
  ) {
    primary.add('獎賞控制');
  }

  // Recoil (ZH + JA + EN)
  if (
    (has('這隻寶可夢也受到', '自己也受到') && has('傷害')) ||
    (has('このポケモンにも') && has('ダメージ')) ||
    // EN
    has('damage to itself', 'does damage to itself', 'also does', 'to this Pok\u00e9mon as well')
  ) {
    primary.add('反噬傷害');
  }

  // Bench damage (ZH + JA + EN)
  if (
    (has('備戰寶可夢也受到', '備戰區不計算') && has('傷害')) ||
    (has('ベンチポケモンにも') && has('ダメージ')) ||
    has('ベンチにも', 'ベンチにダメカン') ||
    // EN: spread / bench damage
    (has("opponent's Benched Pok\u00e9mon") && has('damage') && has('also does', 'does')) ||
    (has('each of your opponent\'s Benched Pok\u00e9mon') && has('damage'))
  ) {
    primary.add('連鎖傷害');
  }

  // Ignore weakness/effect (ZH + JA)
  if (
    (has('傷害不計算', '不計算弱點', '不計算抵抗力') && has('弱點', '抵抗力', '附加效果') && !has('備戰區不計算')) ||
    has('弱点・抵抗力は計算しない', '弱点は計算しない', '弱点を使わない') ||
    has('ついている場合のダメージは計算しない') ||
    // JA: ignore effects applied to opponent's Active (フヨウ / Phantom Dreamer style)
    has('かかっている効果を計算しない') ||
    // EN: Phoebe — damage ignores all effects on opponent's Active Pokémon
    has("isn't affected by any effects on your opponent's Active Pok\u00e9mon") ||
    // EN: Single Strike Scroll of Piercing — ignore Weakness/Resistance
    has("isn't affected by Weakness or Resistance")
  ) {
    primary.add('無視弱點/效果');
  }

  // Use limit (ZH + JA + EN)
  if (
    (has('下個自己的回合') && has('無法使用招式')) ||
    has('この番は使えない', '次の自分の番は使えない', 'この番このワザは使えない') ||
    // EN: self-restriction on next turn
    (has('During your next turn') && (has("this Pok\u00e9mon can't use", "this Pok\u00e9mon can't attack")))
  ) {
    primary.add('使用限制');
  }

  // Fail condition (ZH + JA + EN)
  if (
    (has('若', '如果') && has('失敗', '則這個招式失敗')) ||
    has('このワザは失敗する', 'ワザは失敗') ||
    // EN
    has('this attack does nothing', 'this attack fails')
  ) {
    primary.add('條件失敗');
  }

  // Energy attachment (ZH + JA + EN)
  if (
    (has('從自己的手牌選擇', '選擇1張能量卡') && has('附於')) ||
    (has('手札のエネルギーカード') && has('つける', 'ポケモンにつける')) ||
    // JA: attach Energy from hand (various phrasings — Bede, Welder, etc.)
    (has('手札から基本エネルギー') && has('つける')) ||
    (has('手札にある') && has('エネルギー') && has('つける')) ||
    (has('手札') && has('エネルギー') && has('つける') && !has('山札から') && !has('トラッシュから')) ||
    // EN: attach Energy from hand (not from deck/discard, those are 附上搜索能量)
    (has('attach', 'Attach') && (has('Energy card from your hand', 'Basic Energy card from your hand',
        'Energy cards from your hand', 'basic Energy card from your hand')) && !has('discard pile') && !has('your deck'))
  ) {
    primary.add('能量附著');
  }

  // Search deck/discard for Energy and attach or take to hand (附上搜索能量) — ZH + JA
  // Covers: direct-attach from deck/discard (Flareon ex, Akamine, VIP Pass),
  //         search Basic Energy to hand from deck (Bug Catching Set, Akamine hand portion)
  // ZH patterns observed in DB:
  //   火伊布ex/赤松: 牌庫 + 基本能量卡 + 附於
  //   捕蟲組合:      牌庫 + 基本【草】能量卡 + 加入手牌  (to hand, qualifies as energy search)
  if (
    // ZH: deck/discard → attach energy
    (has('牌庫') && has('能量') && has('附加', '附上', '附於', '附到')) ||
    (has('棄牌區') && has('能量卡') && has('附加', '附上', '附於', '附到')) ||
    // ZH: search Basic Energy from deck to hand (Bug Catching Set pattern)
    (has('牌庫') && has('基本') && has('能量卡', '能量') && has('加入手牌')) ||
    // JA: deck/discard → attach energy
    (has('山札から') && has('エネルギー') && has('つける', 'ポケモンにつける', 'をつける')) ||
    // JA: energy from within deck (山札にある) — カキ, マツリカ, ビーストリング
    (has('山札にある') && has('エネルギー') && has('つける')) ||
    (has('トラッシュから') && has('エネルギー') && has('つける', 'ポケモンにつける', 'をつける')) ||
    // EN: attach Energy from discard pile or deck (cover both capital and lowercase, Bea pattern)
    ((has('attach', 'Attach')) && has('Energy') && (has('discard pile') || has('your deck') || has('from their discard pile'))) ||
    // EN: search Basic Energy to hand (Lady, Earthen Vessel)
    (has('Search your deck') && (has('basic Energy card', 'Basic Energy card')) && has('into your hand', 'your hand') && !has('attach', 'Attach'))
  ) {
    primary.add('附上搜索能量');
  }

  // Search for specific typed basic energy (搜索指定能量) — ZH + JA + EN
  // Matches cards that name a type-keyword energy: 「基本【X】能量」 (ZH) or type + 基本エネルギー (JA).
  // Distinct from 附上搜索能量 (which covers generic energy from deck/discard):
  //   these cards target a *specific type*, e.g. 「基本【鬥】能量」, 「基本【草】能量」.
  if (
    // ZH: 「基本【X】能量」 in a deck/discard operation context
    // NOTE: some scraped texts have a space: 「基 本【X】能量」 — match both forms
    ((has('「基本【') || has('「基 本【')) && has('能量') &&
      (has('牌庫') || has('棄牌區')) &&
      !has('手牌將', '手牌丟棄')) ||
    // ZH: typed energy symbol without explicit 基本 wording
    (has('【鬥】', '【草】', '【火】', '【水】', '【雷】', '【超】', '【鋼】', '【惡】', '【龍】') &&
      has('能量') && (has('牌庫', '棄牌區') || has('附上', '附於', '附加') || has('加入手牌')) &&
      !has('手札', '手牌將', '手牌丟棄')) ||
    // JA: typed Basic energy — type keyword before 基本エネルギー in deck/discard context
    ((has('タイプの') || has('闘') || has('草') || has('炎') || has('水') ||
      has('雷') || has('超') || has('鋼') || has('悪') || has('竜')) &&
      has('基本エネルギー') &&
      (has('山札', 'トラッシュ')) &&
      !has('手札から')) ||
    // EN: Basic {X} Energy search by type name (also match {W} without "Basic" prefix)
    (/(Basic )?\{[RGWLFPDMC]\} Energy/i.test(effect) &&
      (has('Search your deck', 'search your deck', 'from your discard pile', 'attach')) &&
      !has('from your hand'))
  ) {
    primary.add('搜索指定能量');
  }

  if (
    (has('灼傷', '中毒', '燃燒') && has('若')) ||
    // EN: conditional status application ("if heads, the Defending Pokémon is now Burned")
    (has('Flip a coin', 'flip a coin') &&
      has('is now Poisoned', 'is now Burned', 'is now Paralyzed', 'is now Asleep', 'is now Confused'))
  ) {
    primary.add('狀態施加');
  }

  if (
    (has('備戰寶可夢的數量', '數量×') && has('傷害')) ||
    // JA: damage boost targeting opponent's Bench (望遠スコープ, etc.)
    (has('ベンチ') && has('へのダメージ') && /「[+＋]\d+」/.test(effect))
  ) {
    primary.add('備戰傷害加成');
  }

  // Bench count damage scaling (EN)
  if (
    (has('for each Benched Pok\u00e9mon', 'for each of your Benched Pok\u00e9mon',
         'for each of your opponent\'s Benched Pok\u00e9mon') && has('damage'))
  ) {
    primary.add('備戰傷害加成');
  }

  // Deck operations (ZH + JA)
  if (
    (has('放回牌庫並重洗', '各自從牌庫抽出') && has('支援者卡')) ||
    has('山札を引き直す', '山札をシャッフル') ||
    (has('山札') && has('戻し', '並べ替え')) ||
    // JA: mill top cards from own deck (あなあけスコップ, 未開の祭壇 optional trash)
    (has('山札を上から') && has('トラッシュ')) ||
    // EN: discard top cards from deck (Hole-Digging Shovel, PokéStop)
    (has('Discard the top', 'discard the top') && has('of your deck', 'of their deck')) ||
    // EN: Switching Cups — swap a card in hand with top of deck
    (has('Switch') && has('from your hand') && has('top card of your deck'))
  ) {
    primary.add('牌庫操作');
  }

  // Chain moves / multi-Supporter play (ZH + JA + EN)
  if (
    // JA: use extra Supporters in one turn (マチスの作戦)
    (has('サポートの枚数は') && has('になる')) ||
    (has('在上個自己的回合', '在上個對手的回合', '在上個回合', '在上回合') && has('才可使用')) ||
    (has('前の番に') && has('使っていたなら', 'このワザを使っていた')) ||
    // EN
    (has('this Pok\u00e9mon used') && has('during your last turn', 'last turn'))
  ) {
    primary.add('連續技');
  }

  // Move lock (ZH + JA + EN)
  if (
    (has('選擇1個', '持有的招式') && has('無法使用') && !has('作為這個招式使用')) ||
    (has('ワザ') && has('使えない', '使えなくなる') && !has('この番') && !has('作為')) ||
    // EN: "the Defending Pokémon can't attack" / "can't use that attack"
    (has("can't attack") && has("your opponent's next turn", 'the Defending Pok\u00e9mon')) ||
    (has("can't use") && has('attack') && has("your opponent's next turn", 'the Defending Pok\u00e9mon'))
  ) {
    primary.add('招式封鎖');
  }

  // Energy condition (ZH + JA + EN)
  if (
    (has('若自己', '只需要') && has('能量即可使用')) ||
    (has('エネルギーが') && has('ついているなら', 'ついているポケモン', 'たりないなら')) ||
    // EN: attack requires a specific energy condition or scales with energy count
    (has('as long as this Pok\u00e9mon has') && has('Energy')) ||
    (has('if this Pok\u00e9mon has') && has('Energy')) ||
    (has('if there is no') && has('Energy attached'))
  ) {
    primary.add('能量條件');
  }

  // Attachment disruption (ZH + JA + EN)
  if (
    (has('若對手', '將能量卡附於') && has('對手的回合結束')) ||
    (has('対戦相手') && has('エネルギーカードをつけ') && has('ターン')) ||
    // EN: prevent opponent from attaching Energy
    (has("can't attach") && has('Energy') && has('opponent')) ||
    (has('your opponent') && has('can\'t attach') && has('Energy'))
  ) {
    primary.add('附著干擾');
  }

  // HP boost (ZH + JA + EN)
  if (
    (has('最大HP') && /\+\d+/.test(effect)) ||
    (has('最大HP') && has('多くなる', '増える', '大きくなる')) ||
    has('最大HPが') ||
    // EN: "+N HP" for each Pokémon in play
    (/gets? \+\d+ HP/.test(effect)) ||
    (has('maximum HP') && /\+\d+/.test(effect))
  ) {
    primary.add('HP提升');
  }

  // Stadium amplify (ZH + JA + EN)
  if (
    (has('場上所有', '最大HP各') && has('競技場')) ||
    (has('スタジアム') && has('HP', 'ダメージ', '効果')) ||
    // JA: bench size changes (スカイフィールド, 崩れたスタジアム)
    has('ベンチに出せるポケモンの数は') ||
    // EN: stadium cards that buff/debuff Pokémon in play
    (has('each Pok\u00e9mon in play') && (has('gets +', 'gets -', 'takes', 'more damage', 'less damage'))) ||
    (has('while this card is in play') && (has('HP', 'damage', 'Energy'))) ||
    // EN: bench size changes (Collapsed Stadium, Area Zero Underdepths, Sky Field)
    (has('Benched Pok\u00e9mon') && has("can't have more than", 'can have up to')) ||
    // JA: special energy suppression (シンオウ神殿)
    has('特殊エネルギーの効果はすべてなくなり') ||
    // JA: Lost Zone stadium (ロストシティ)
    (has('ロストゾーン') && has('きぜつ')) ||
    // JA: resistance removal (磁気嵐)
    has('抵抗力は、すべてなくなる') ||
    // JA: tool effect disable (フラダリラボ)
    (has('ポケモンのどうぐ') && has('効果は、すべてなくなる')) ||
    // EN: Path to the Peak — Pokémon with Rule Box have no Abilities
    (has('Rule Box') && has('no Abilities')) ||
    // EN: Dyna Tree Hill — prevents healing
    has("can't be healed") ||
    // EN: Glimwood Tangle — re-flip coins for attacks
    (has('ignore all results') && has('coin flip', 'coins again', 'flipping those coins')) ||
    // EN: PokéStop — discard top 3, gain any Item cards revealed
    (has('discard') && has('from the top of their deck') && has('Item cards') && has('their hand')) ||
    // EN: Turffield Stadium — search deck for Evolution Pokémon to hand
    (has('search their deck') && has('Pokémon') && has('into their hand')) ||
    // EN: Shopping Center — return a Tool to hand
    (has('Pokémon Tool') && has('put a Pok\u00e9mon Tool', 'may put') && has('into their hand'))
  ) {
    primary.add('場地增幅');
  }

  // Effect immunity (ZH + JA + EN)
  if (
    has('不會受到', '效果的影響') ||
    has('ワザの効果を受けない', '効果を受けない', 'この特性の効果は受けない') ||
    (has('効果') && has('受けない', '受けない。')) ||
    // JA: clear all active move effects (きとうし, ポケモンレンジャー)
    (has('かかっている') && has('ワザの効果') && has('なくなる')) ||
    // EN
    has('Prevent all effects of attacks',
        'prevent all effects of attacks',
        "isn't affected by any effects of",
        'not affected by any effects from') ||
    // EN: prevent all effects of opponent's Supporter targeting this Pokémon (Moon & Sun Badge, Leafy Camo Poncho)
    (has("your opponent plays a Supporter") && has('prevent all effects of that card')) ||
    // EN: Canceling Cologne — Active can't use Abilities this turn
    (has('no Abilities') && has("until the end of your turn", 'during that turn')) ||
    // EN: Windup Arm — attack even if Asleep or Paralyzed
    (has('can attack even if') && has('Asleep or Paralyzed'))
  ) {
    primary.add('效果免疫');
  }

  // Tool removal (mass) (ZH + JA + EN)
  if (
    (has('寶可夢道具', '將其丟棄') && has('選擇最多')) ||
    (has('どうぐ') && has('すべてトラッシュ', '全てトラッシュ')) ||
    // EN
    has('discard all Pok\u00e9mon Tools')
  ) {
    primary.add('道具移除');
  }

  // Move copy (ZH + JA + EN)
  if (
    (has('選擇1個', '持有的招式') && has('作為這個招式使用')) ||
    has('このワザとして使う', 'ワザとして使う', 'のワザを使う') ||
    // EN
    (has('use it as this attack', 'attacks and use it as this attack') ||
     (has('Choose 1 of your') && has('attacks') && has('use it as this attack', 'and use it'))) ||
    // EN: Memory Capsule — use attack from previous Evolution
    (has('attacks from its previous Evolutions') || has('attack from its previous Evolution')) ||
    // EN: Rapid Strike Scroll of Swirls — use the attack on this card
    has('can use the attack on this card')
  ) {
    primary.add('招式複製');
  }

  if (
    (effect.includes('將對手的戰鬥寶可夢【灼傷】') &&
      !has('若', '沒有', '失敗')) ||
    // EN: unconditional burn of opponent's Active Pokémon
    (has('is now Burned') && !has('Flip a coin', 'flip a coin', 'heads', 'tails'))
  ) {
    primary.add('簡單灼傷');
  }

  if (
    has('弱點全部消除', '弱點消除') ||
    // JA: Shadow Circle / Altar of the Sunne
    has('弱点は、すべてなくなる', '弱点がなくなる') ||
    // EN
    has('has no Weakness', 'this Pok\u00e9mon has no Weakness', 'no Weakness')
  ) {
    primary.add('弱點消除');
  }

  if (
    (has('受到對手的寶可夢招式的傷害') || /傷害「-?\d+/.test(effect)) &&
    has('【鋼】', '【鬥】')
  ) {
    primary.add('屬性防禦');
  }

  // Energy requirement increase (ZH + EN)
  if (
    (has('使用招式所需的能量') && has('增加')) ||
    /各增加\d+個/.test(effect) ||
    // EN
    (has('Retreat Cost') && has('more') && (has('for each', 'is {', 'costs'))) ||
    (has('costs') && has('more Energy') && has('to use', 'to attack'))
  ) {
    primary.add('能量需求增加');
  }

  // Energy requirement decrease (ZH + JA + EN) — e.g. Counter Gain (反擊増幅器)
  if (
    // ZH: also handles '使用那個招式所需的能量減少' (Sparkling Crystal)
    ((has('招式所需的能量') || has('使用招式所需的能量')) && has('減少')) ||
    /各減少\d+個/.test(effect) ||
    // JA
    (has('ワザに必要なエネルギー', 'ワザのエネルギー') && has('少なくなる', '少ない', '少なく')) ||
    (has('使用するためのエネルギー') && has('少なく')) ||
    // JA: Sparkling Crystal / other cost-reduction tools — ためのエネルギー.*少なく
    (has('ためのエネルギー') && has('少なく')) ||
    // JA: Float Stone / Fairy Garden — にげる.*エネルギーは、すべてなくなる
    (has('にげる') && has('エネルギーは、すべてなくなる')) ||
    // EN
    /\d+ less Energy/i.test(effect) ||
    /\d+ Energy less/i.test(effect) ||
    /fewer Energy/i.test(effect)
  ) {
    primary.add('能量需求減少');
  }

  if (
    (has('棄牌區') && has('張數×') && has('傷害')) ||
    // EN
    ((has('for each card in your discard pile', 'for each') &&
      has('in your discard pile') && has('damage')))
  ) {
    primary.add('棄牌區傷害加成');
  }

  // Max damage potential (ZH + JA + EN) — variable damage that can reach very high values
  if (
    (has('獎賞卡的張數×60', '獎賞卡的張數×50', '×60') && has('傷害')) ||
    (has('最大HP') && has('傷害') && has('相同', '一樣', '等同')) ||
    (has('傷害指示物的數量×') && has('×20', '×30', '×40', '×50')) ||
    has('サイドの枚数×60', 'サイドの枚数×50', 'のせているダメカンの数×40',
        'のせているダメカンの数×50') ||
    // EN: high prize/counter scaling
    (/(?:50|60|80|100) (?:more )?damage for each Prize card/i.test(effect)) ||
    (/\d+ damage for each damage counter.*?(?=\.|$)/i.test(effect) &&
      parseInt(effect.match(/(\d+) damage for each damage counter/i)?.[1] ?? '0', 10) >= 20)
  ) {
    special.add('最大傷害');
  }

  if (has('無法從手牌使出物品卡', '不能使用物品卡')) {
    primary.add('物品卡封鎖');
  }

  // Full defense (ZH + JA + EN)
  if (
    (has('自己的所有寶可夢', '受到對手的寶可夢招式的傷害') && has('包含新上場')) ||
    (has('自分のポケモン全員') && has('受けるダメージ') && has('減る', '少なくなる')) ||
    // EN
    (has('each of your Pokémon', 'all of your Pokémon') &&
      has('less damage', 'takes') && has('damage'))
  ) {
    primary.add('全體防禦');
  }

  // Retreat lock (ZH + JA + EN)
  if (
    has('無法撤退') ||
    has('逃げることができない', 'にげることができない', 'バトル場から離れられない') ||
    // EN
    has("can't retreat", 'cannot retreat', "the Defending Pok\u00e9mon can't retreat")
  ) {
    primary.add('撤退封鎖');
  }

  // Move lockout (ZH + JA + EN)
  if (
    (has('離開戰鬥場前無法使用', '無法使用') && !has('招式')) ||
    has('バトル場からいなくなるまでワザを使えない') ||
    // EN: can't use attacks until it moves away from Active Spot
    (has("can't use any attacks") && has('moves to the Bench', 'until it moves', 'leaves the Active'))
  ) {
    primary.add('招式鎖定');
  }

  // Energy recovery (ZH + JA + EN)
  if (
    (has('從自己的棄牌區抽出', '放回牌庫並重洗') && has('能量卡')) ||
    (has('トラッシュから') && has('エネルギーカード') && has('手札に加える', 'つける', '拾う')) ||
    // EN: retrieve Energy from discard pile to hand (not attaching, which is 附上搜索能量)
    (has('from your discard pile') && has('Energy card', 'Energy cards') &&
      has('into your hand', 'to your hand') && !has('attach')) ||
    // EN: Training Court (third-person: "from their discard pile into their hand")
    (has('from their discard pile') && has('Energy card') && has('into their hand')) ||
    // EN: shuffle Energy cards from discard into deck (Urn of Vitality, Ordinary Rod energy part)
    (has('from your discard pile') && has('Energy') && has('into your deck') && has('Shuffle', 'shuffle'))
  ) {
    primary.add('能量回收');
  }

  // Opponent interference — force opponent action / discard from hand / Target Whistle
  if (
    // JA: put opponent's Pokemon from their discard to their bench (ターゲットホイッスル)
    (has('相手のトラッシュ') && has('ポケモン') && has('ベンチに出す')) ||
    // JA: put cards from opponent's hand back to their deck (マツバ style)
    (has('相手の手札') && (has('山札にもどして切') || has('山札にもどす'))) ||
    // EN: Echoing Horn — put opponent's Basic from discard onto their Bench
    (has("your opponent's discard pile") && has('onto their Bench')) ||
    // EN: Spirit Mask — opponent discards from hand when this Pokémon takes damage
    (has('your opponent discards') && has('from their hand') && has('damaged by an attack')) ||
    // EN: Cursed Shovel — discard top cards of opponent's deck when this Pokémon is KO'd
    (has('Knocked Out') && has('discard the top') && has("your opponent's deck"))
  ) {
    primary.add('對手干擾');
  }

  // Deck reshuffle (ZH + JA + EN)
  if (
    has('放回各自的牌庫並重洗', '全部放回牌庫並重洗') ||
    has('すべてのポケモンを山札に戻し', 'すべてを山札に戻し') ||
    // EN: mass shuffle-all Pokémon back into decks (Lost World / Night March style)
    (has('each player shuffles all') && has('Pok\u00e9mon') && has('deck')) ||
    (has('return all') && has('Pok\u00e9mon') && has('deck') && has('shuffle')) ||
    (has("your opponent's Pok\u00e9mon") && has('return') && has('deck'))
  ) {
    if (has('對手') || has("your opponent's Pok\u00e9mon")){
      primary.add('對手干擾');
    }else{
      primary.add('牌庫重洗');
    }
  }

  // Specific Pokemon defense (ZH + JA + EN)
  if (
    (has('的所有「', '的寶可夢」') && /傷害「-?\d+/.test(effect)) ||
    // Team Rocket-specific naming in ZH/JA/EN variants
    ((has('「火箭隊的寶可夢」') || has('「ロケット団のポケモン」') || has("Team Rocket's Pokémon", "Team Rocket's Pokemon")) &&
      (has('傷害') || has('ダメージ') || has('damage')) &&
      /「-?\d+」/.test(effect)) ||
    (has('すべての「') && has('ダメージ') && has('少なくなる', '減る')) ||
    // EN: "each of your {Name} Pokémon" / "all of your {Name} Pokémon" + damage reduction
    (/each of your \"[^\"]+\" Pok\u00e9mon/i.test(effect) && has('less damage', 'takes')) ||
    (/all of your \"[^\"]+\" Pok\u00e9mon/i.test(effect) && has('less damage'))
  ) {
    primary.add('特定寶可夢防禦');
  }

  // Weakness change (ZH + JA + EN)
  if (
    has('弱點改為', '弱點以') ||
    has('弱点を', 'タイプに変える', '弱点タイプを変え') ||
    // EN: change Weakness type
    (has('Weakness') && (has('becomes', 'changes to', 'is changed to', 'instead of')))
  ) {
    primary.add('弱點改變');
  }

  // Copy opponent move (ZH + JA + EN)
  if (
    (has('對手選擇對手自己的', '作為這個招式使用') && primary.has('招式複製對手')) ||
    has('相手が選んだ', '相手のポケモンのワザ') && has('使う') ||
    // EN: choose one of opponent's attacks and use it
    (has("Choose 1 of your opponent's") && has('attacks') && has('use it as this attack', 'and use it'))
  ) {
    primary.add('招式複製對手');
  }

  // High damage reduction (ZH + JA + EN) — threshold ≥ 70
  {
    const _jaReductionDash = effect.match(/(?:受けるワザのダメージ|受けるダメージ)は「-(\d+)」/);
    const _zhReductionQuoted = effect.match(/傷害「-?(\d+)」/);
    if (
      (_zhReductionQuoted !== null && parseInt(_zhReductionQuoted[1] ?? '0', 10) >= 70) ||
      (/受けるダメージは?「?(\d+)」?少なく/.test(effect) &&
        parseInt(effect.match(/受けるダメージは?「?(\d+)」?少なく/)?.[1] ?? '0', 10) >= 70) ||
      // JA: 「-XX」 dash form (ガラルのむねあて, タケシのニビシティジム, リバースバレー, etc.)
      (_jaReductionDash !== null && parseInt(_jaReductionDash[1] ?? '0', 10) >= 70) ||
      // EN
      (/takes? (\d+) less damage/i.test(effect) &&
        parseInt(effect.match(/takes? (\d+) less damage/i)?.[1] ?? '0', 10) >= 70)
    ) {
      primary.add('高額傷害減免');
    }
  }

  // Damage reduction (ZH + JA + EN) — any positive reduction < 70
  {
    const _jaReductionDash = effect.match(/(?:受けるワザのダメージ|受けるダメージ)は「-(\d+)」/);
    const _zhReductionQuoted = effect.match(/傷害「-?(\d+)」/);
    if (
      ((has('受到招式的傷害') || has('傷害「-') || has('傷害「')) &&
        _zhReductionQuoted !== null &&
        parseInt(_zhReductionQuoted[1] ?? '0', 10) < 70 &&
        !has('【鋼】', '【鬥】', '所有寶可夢')) ||
      (/受けるダメージは?「?(\d+)」?少なく/.test(effect) &&
        parseInt(effect.match(/受けるダメージは?「?(\d+)」?少なく/)?.[1] ?? '0', 10) < 70) ||
      // JA: 「-XX」 dash form < 70 (ガラルのむねあて, タケシのニビシティジム, リバースバレー)
      (_jaReductionDash !== null && parseInt(_jaReductionDash[1] ?? '0', 10) < 70) ||
      // EN
      (/takes? (\d+) less damage/i.test(effect) &&
        parseInt(effect.match(/takes? (\d+) less damage/i)?.[1] ?? '0', 10) < 70) ||
      // EN: Panic Mask — prevent all damage from low-HP opponents (conditional damage block)
      (has('Prevent all damage') && has('HP or less remaining'))
    ) {
      primary.add('傷害減免');
    }
  }

  // Supporter restriction (ZH + JA + EN)
  if (
    has('支援者卡只可使用', '支援者卡只可使用1張') ||
    has('サポートは使えない', 'サポートを使えない') ||
    // EN
    has("can't use any Supporter cards", "can't play any Supporter cards")
  ) {
    primary.add('支援者限制');
  }

  // Recover KO'd Pokémon (KO回收×N) — ZH + JA + EN
  if (
    (has('昏厥') && has('寶可夢') && (has('加入手牌') || has('放入牌庫') || has('放回牌庫') || has('備戰區'))) ||
    (has('きぜつした') && has('ポケモン') && (has('手札に加える') || has('山札に戻す') || has('ベンチに出す'))) ||
    // JA: recover Pokemon from discard to bench (げんきのかけら, ターゲットホイッスル opponent bench)
    (has('トラッシュから') && has('ポケモン') && has('ベンチに出す') && !has('相手のトラッシュ')) ||
    // JA: return all discarded Pokemon to deck (カリン, スイレンのつりざお)
    (has('トラッシュにある') && has('ポケモン') && (has('山札にもどす') || has('山札に戻す') || has('山札にもどして切'))) ||
    // EN
    (has('Knocked Out') && has('Pokémon') &&
      (has('put it into your hand', 'into your hand', 'onto your Bench', 'into your deck'))) ||
    // EN: Ordinary Rod (Pokemon part), Thorton — shuffle/swap Basic Pokémon from discard to deck/field
    (has('Pokémon') && has('discard pile') && has('into your deck') && has('Shuffle', 'shuffle')) ||
    (has('discard pile') && has('switch it with') && has('in play'))
  ) {
    const qty = extractQuantity(effect);
    primary.add(qty > 0 ? `KO回收×${qty}` : 'KO回收');
  }

  // New hand draw — shuffle hand into deck then draw N (重新抽牌×N) — ZH + JA + EN
  if (
    (has('手牌') && (has('放回牌庫並重洗') || has('洗入牌庫') || has('放入牌庫並重洗')) && (has('抽出', '抽取', '抽卡'))) ||
    (has('手札') && (has('山札に加えてシャッフル') || has('山札に戻してシャッフル')) && has('引く')) ||
    // JA: Marnie / Kabu / コトブキムラ style — shuffle hand into deck (bottom or shuffled), then draw
    (has('手札') && (has('山札の下にもどす') || has('山札にもどして切') || has('山札に戻して切')) && has('引く')) ||
    // EN: Iono / N-style hand shuffle and redraw
    (has('shuffle your hand') && has('draw') && has('deck')) ||
    (has('shuffle') && has('hand') && has('deck') && has('draw') && !has('your opponent')) ||
    // EN: draw cards until they have N (Rose Tower stadium)
    (has('draw cards until') && has('cards in their hand')) ||
    // EN: Caitlin — put N cards from hand to deck then draw that many
    (has('from your hand') && has('deck') && has('draw that many cards'))
  ) {
    const drawCount = extractDrawCount(effect);
    primary.add(drawCount > 0 ? `重新抽牌×${drawCount}` : '重新抽牌');
  }

  // Search for evolved Pokémon from deck (搜索進化×N) — ZH + JA + EN
  if (
    (has('進化') && has('寶可夢') && has('牌庫') && (has('加入手牌') || has('備戰區')) && !has('基礎')) ||
    (has('進化ポケモン') && has('山札') && (has('手札に加える') || has('ベンチに出す')) && !has('基本')) ||
    // EN
    ((has('search your deck', 'Search your deck') &&
      (has('evolves from', 'Evolution card', 'Stage 1', 'Stage 2')) &&
      (has('into your hand', 'put it onto', 'onto that Pok\u00e9mon to evolve'))))
  ) {
    const qty = extractQuantity(effect);
    primary.add(qty > 0 ? `搜索進化×${qty}` : '搜索進化寶可夢');
  }

  // Search for any Pokémon from deck (搜索任意×N) — ZH + JA + EN
  // e.g. Ultra Ball (any), Quick Ball-like unlimited search; guarded to avoid overlap with 放置基礎寶可夢
  if (
    (has('任意') && has('寶可夢') && has('牌庫') && (has('加入手牌') || has('備戰區'))) ||
    (has('ポケモン') && has('山札') && has('何でも', 'どんな', '1枚') && (has('手札に加える') || has('ベンチに出す')) &&
      !has('基本', '進化', 'たね')) ||
    // EN: generic Pokémon search — Ultra Ball / Nest Ball variants not already covered
    (has('Search your deck for', 'search your deck for') &&
      has('Pok\u00e9mon') &&
      has('into your hand', 'your hand') &&
      !has('Basic Pok\u00e9mon', 'Basic {') && !has('evolves from') && !has('Evolution card') &&
      !has('Stage 1') && !has('Stage 2'))
  ) {
    const qty = extractQuantity(effect);
    primary.add(qty > 0 ? `搜索任意×${qty}` : '搜索任意寶可夢');
  }

  // Search for Trainer / Item / Tool card from deck (搜索訓練師卡) — ZH + JA + EN
  if (
    ((has('物品卡') || has('道具卡') || has('訓練師卡')) && has('牌庫') && has('加入手牌') && !has('使用', '昏厥')) ||
    ((has('グッズカード') || has('どうぐカード') || has('トレーナーズカード')) && has('山札') && has('手札に加える') && !has('使う')) ||
    // EN
    (has('Search your deck', 'search your deck') &&
      (has('Item card', 'Tool card', 'Trainer card', 'an Item', 'a Tool', 'a Trainer')) &&
      has('into your hand', 'your hand') &&
      !has('Supporter', 'Pokémon') && !has('Energy'))
  ) {
    primary.add('搜索訓練師卡');
  }

  // Search for Supporter card from deck or discard (搜索支援者) — ZH + JA + EN
  if (
    (has('支援者卡') && (has('牌庫') || has('棄牌區')) && has('加入手牌') && !has('使用')) ||
    (has('サポートカード') && (has('山札') || has('トラッシュ')) && has('手札に加える')) ||
    // EN
    (has('Search your deck', 'search your deck') && has('Supporter card') &&
      has('into your hand', 'your hand'))
  ) {
    primary.add('搜索支援者');
  }

  // Peek at top N cards of deck (查看牌庫頂×N) — ZH + JA + EN
  // e.g. Pokédex, various scouting cards
  if (
    (has('牌庫頂') && (has('查看') || has('觀看') || has('翻開'))) ||
    (has('山札の上') && (has('見る') || has('見て') || has('確認'))) ||
    // JA: 山札を上から (いたずらスコップ, ビクトリーリング, マクワ style)
    (has('山札を上から') && (has('見る') || has('見て'))) ||
    // EN
    (has('look at the top') && has('of your deck', 'of their deck')) ||
    // EN: look at bottom N cards and put on top (Expedition Uniform)
    (has('the bottom') && has('cards of your deck') && has('put them on top'))
  ) {
    const zhTop = effect.match(/牌庫頂[的]?(\d+)張/);
    const jaTop = effect.match(/山札(?:の上|を上から)(\d+)枚/);
    const enTop = effect.match(/look at the top (\d+) cards? of/i);
    const topN = zhTop ? parseInt(zhTop[1], 10) : jaTop ? parseInt(jaTop[1], 10) : enTop ? parseInt(enTop[1], 10) : 0;
    primary.add(topN > 0 ? `查看牌庫頂×${topN}` : '查看牌庫頂');
  }

  // Retrieve Trainer card from discard (回收訓練師) — ZH + JA + EN
  if (
    (has('棄牌區') && (has('物品卡') || has('支援者卡') || has('道具卡')) && has('加入手牌') && !has('附', '能量')) ||
    (has('トラッシュ') && (has('グッズ') || has('サポート') || has('どうぐ')) && has('手札に加える') && !has('エネルギー')) ||
    // EN: from discard pile to hand (Item Retrieval, Superior Energy Retrieval, etc.)
    (has('from your discard pile') &&
      (has('Item card', 'Supporter card', 'Tool card', 'Trainer card')) &&
      has('into your hand', 'your hand') && !has('Energy')) ||
    // EN: from discard pile into deck (Pal Pad)
    (has('from your discard pile') &&
      (has('Supporter card', 'Trainer card')) &&
      has('into your deck'))
  ) {
    primary.add('回收訓練師');
  }

  // --- Japanese-only patterns (JA_JP cards without Chinese translations) ---

  // Hand discard (手牌丟棄) - ZH + JA + EN
  if (
    (has('手牌') && has('丟棄')) ||
    (has('手札') && has('トラッシュ')) ||
    // EN: "Discard your hand" (Prof Research, Iris's Fighting Spirit, AZ, etc.)
    has('Discard your hand', 'discard your hand') ||
    // EN: "Discard N cards from your hand" / "Discard a card from your hand"
    (has('Discard') && has('from your hand', 'cards from your hand', 'a card from your hand'))
  ) {
    primary.add('手牌丟棄');
  }

  // Field removal / bounce (ZH + JA + EN)
  if (
    (has('手札に戻す') && has('ポケモン')) ||
    // JA: hiragana version (手札にもどす = same word as 手札に戻す)
    (has('手札にもどす') && has('ポケモン')) ||
    // ZH: 將寶可夢返回備戰區 / 手牌
    (has('寶可夢') && (has('返回備戰區') || has('放回所有者的手牌'))) ||
    // EN
    (has('return') && has('to your hand') && has('Pok\u00e9mon')) ||
    // EN: capital P "Put 1 of your Pokémon...into your hand" (Prof Turo, Scoop Up Cyclone, Penny)
    (has('put', 'Put') && has('into your hand') && has('Pok\u00e9mon') && !has('Knocked Out')) ||
    // JA: bounce Pokemon from field back to deck (クロケア)
    (has('ポケモン') && has('山札にもどす', '山札に戻す') && !has('トラッシュ') && !has('エネルギー') && !has('サポート'))
  ) {
    primary.add('手牌回收');
  }

  // Item lock (JA + EN)
  if (
    has('グッズを使えない', 'グッズカードは使えない', 'グッズカードを手札から出せない') ||
    // EN
    has("can't play any Item cards from their hand", "can't use any Item cards",
        "can't play Item cards")
  ) {
    primary.add('物品卡封鎖');
  }

  // Energy requirement increase (JA)
  if (has('使用するためのエネルギー') && has('多く')) {
    primary.add('能量需求增加');
  }

  // Energy requirement decrease (JA + EN) — e.g. Counter Gain (カウンターゲイン), Elemental Badge
  if (
    (has('使用するためのエネルギー') && has('少なく', '少ない')) ||
    (has('招式所需的能量') && has('少')) ||
    // EN: attacks cost less Energy (Elemental Badge, Jet Badge, etc.)
    (has('attacks cost') && has('less')) ||
    // EN: cost reduction phrasing — e.g. "its attacks cost {C} less"
    (has('cost') && has('less') && has('Energy'))
  ) {
    primary.add('能量需求減少');
  }

  // Graveyard damage bonus (JA + EN)
  if (
    (has('トラッシュ') && has('枚数×', '枚×', '数×') && has('ダメージ')) ||
    // EN
    ((has('for each card in your discard pile', 'for each') &&
      has('in your discard pile') && has('damage')))
  ) {
    primary.add('棄牌區傷害加成');
  }

  // --- Special ---
  if (
    (has('丟棄') && has('對手')) ||
    // EN
    (has('Discard') && has("your opponent's"))
  ) {
    special.add('丟棄效果');
  }

  if (
    has('撤退') ||
    // EN
    has('Retreat Cost', 'retreat', 'no Retreat Cost')
  ) {
    special.add('撤退效果');
  }

  if (
    (has('放置') && has('備戰區', '場上')) ||
    // EN
    (has('put') && has('onto your Bench', 'Bench') && !has('damage counters'))
  ) {
    special.add('放置效果');
  }

  if (
    has('從手牌使出這張卡並完成進化時') ||
    // EN
    has('when this Pok\u00e9mon evolves',
        'When you play this Pok\u00e9mon from your hand to evolve')
  ) {
    special.add('進化效果');
  }

  if (has('競技場') || has('スタジアム') || has('Stadium')) {
    special.add('競技場效果');
  }

  if (
    has('特性') ||
    has('このポケモンの特性', 'この特性') ||
    // EN: ability-related descriptions
    has('this Ability', 'use this Ability')
  ) {
    special.add('特性效果');
  }

  if (
    (has('特殊狀態', '狀態') && has('不會', '不能', '無法')) ||
    has('特殊状態にならない', '状態異常にならない', '特殊状態を受けない') ||
    // EN
    has("can't be affected by any Special Condition",
        "isn't affected by any Special Condition",
        'not affected by Special Conditions')
  ) {
    special.add('狀態免疫');
  }

  // Fallback
  if (
    primary.size === 0 &&
    special.size === 0 &&
    !has('可不限張數使用', '可使用', '只能使用', '使えない場合', 'ことはできない')
  ) {
    primary.add('其他效果');
  }

  return [primary, special];
}

function classifyCard(
  attacks: Attack[],
  abilities: Ability[],
  cardText?: string | null,
): [string[], string[], number, number] {
  const primary = new Set<string>();
  const special = new Set<string>();
  let maxDrawCount = 0;
  let maxDamage = 0;

  const processText = (text: string, baseDamage = 0) => {
    if (!text?.trim()) return;
    const [p, s] = classifySingleEffect(text.trim());
    p.forEach(t => primary.add(t));
    s.forEach(t => special.add(t));

    const dc = extractDrawCount(text);
    if (dc > maxDrawCount) maxDrawCount = dc;

    const md = extractMaxDamage(text, baseDamage);
    if (md > maxDamage) maxDamage = md;
  };

  for (const ab of abilities ?? []) {
    processText(ab.description ?? ab.text ?? '');
  }
  for (const atk of attacks ?? []) {
    const base = parseInt((atk.damage ?? '').replace(/\D.*/, '') || '0', 10);
    processText(atk.effect ?? atk.text ?? '', base);
  }
  // Also process root card text (used by ENERGY and TRAINER cards)
  if (cardText) processText(cardText);

  return [
    [...primary].sort(),
    [...special].sort(),
    maxDrawCount,
    maxDamage,
  ];
}

// ---------------------------------------------------------------------------
// Effect score (simplified — based on primary tag weights from ptcg_processor.py)
// ---------------------------------------------------------------------------
const PRIMARY_SCORES: Record<string, number> = {
  // Draw
  '少量抽卡': 1, '抽卡效果': 3, '牌庫搜索': 3, '棄牌搜索': 3,
  // Resources
  '資源獲取': 4, '資源管理': 3, '牌庫操作': 2, '牌庫重洗': 1,
  // Energy
  '能量操作': 3, '能量附著': 2, '能量回收': 3, '能量條件': 2,
  '附上搜索能量': 3, '放置基礎寶可夢': 3, '搜索指定能量': 2,
  // Damage
  '傷害輸出': 4, '傷害效果': 3, '條件傷害': 3, '連鎖傷害': 4,
  '傷害指示物': 2, '備戰傷害加成': 3, '棄牌區傷害加成': 3, '反噬傷害': 2,
  // Status
  '狀態異常': 3, '狀態控制': 3, '狀態施加': 2, '狀態恢復': 1,
  // Defense
  '傷害防禦': 3, '效果免疫': 4, '全體防禦': 3, '傷害減免': 2,
  '高額傷害減免': 4, '特定寶可夢防禦': 2, '屬性防禦': 2,
  '無視弱點/效果': 3, '弱點消除': 3, '弱點改變': 2,
  // Control / Disruption
  '道具消除': 3, '道具移除': 3, '招式封鎖': 3, '招式鎖定': 2,
  '招式複製': 3, '招式複製對手': 3, '物品卡封鎖': 3,
  '撤退封鎖': 2, '撤退干擾': 2, '附著干擾': 3, '支援者限制': 1,
  '能量需求增加': 3, '能量需求減少': 3,
  // Positioning / Utility
  '對手切換': 9, '位置控制': 3, '切換效果': 2, '情報收集': 2, '情報效果': 2,
  '進化支援': 3, '進化效果': 3, '獎賞控制': 2,
  '昏厥條件': 3, '連續技': 2, '硬幣判定': 1,
  // Misc
  'HP提升': 2, '場地增幅': 3, '場地效果': 2,
  '簡單灼傷': 2, '使用限制': 1, '條件失敗': 1,
  '手牌丟棄': 1, '手牌回收': 2, '特殊效果': 2,
  '支援效果': 3, '物品效果': 2, '增幅效果': 2, '限制效果': 1,
  '恢復效果': 2, '回復效果': 2, '防禦效果': 3, '干擾效果': 4,
  '其他效果': 1,
};

const SPECIAL_SCORES: Record<string, number> = {
  '大量抽卡': 5, '最大傷害': 5, '丟棄效果': 4, '撤退效果': 3, '放置效果': 3,
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
// Manual overrides — tags to forcibly remove per primary card name
// These correct cases where the classifier generates false positives
// ---------------------------------------------------------------------------
const MANUAL_REMOVE_TAGS: Record<string, string[]> = {
  'スペシャルレッドカード': ['抽卡効果', '牌庫搜索', '棄牌搜索', '牌庫搜索×1', '棄牌搜索×1'],  // 特殊紅牌 (hk18898): Only disrupts opponent's hand
  'メガピクシーex': ['棄牌區傷害加成'],         // 超級皮可西ex: Discard-pile mention is not damage scaling
  '変化の書': ['棄牌區傷害加成'],               // 變化之書: Same
  // ガラスのラッパ attaches energy from discard to bench — not a "discard search" card
  'ガラスのラッパ': ['棄牌搜索', '棄牌搜索×1', '棄牌搜索×2', '棄牌搜索×3'],
};

// Name-based fallback for cards whose effect text is missing across all variants.
// Keep this intentionally narrow to avoid false positives.
function getNameFallbackTags(cardName: string): { primary: string[]; special: string[]; maxDrawCount?: number } | null {
  const normalized = (cardName || '').replace(/[\u2018\u2019]/g, "'");

  // Professor's Research has a stable effect: discard your hand, then draw 7 cards.
  if (/Professor'?s Research/i.test(normalized)) {
    return {
      primary: ['手牌丟棄', '抽卡×7'],
      special: [],
      maxDrawCount: 7,
    };
  }

  return null;
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
            text: true,
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
      maxDrawCount: number | null;
      maxDamage: number | null;
    }> = [];

    for (const pc of primaryCards) {
      if (!pc.cards.length) {
        processed++;
        continue;
      }

      // Detect cards that have only scraper artifact / boilerplate text, not actual effect text.
      const TOOL_BOILERPLATE_PREFIXES = [
        'ポケモンのどうぐは、自分のポケモンにつけて使う。',
        '自分の番に何枚でも、自分のポケモンにつけられる。',
        '寶可夢道具卡，附於自己的寶可夢使用。',
        '1隻寶可夢只可附上1張寶可夢道具卡',
      ];
      const TOOL_BOILERPLATE_REGEX = [
        /寶可夢道具卡.*附於自己的寶可夢使用/,
        /1隻寶可夢只可附上1張寶可夢道具卡/,
      ];
      const isBoilerplateOnly = (text: string | null | undefined) => {
        if (!text) return true;
        // Copyright-only text: scraper captured legal boilerplate instead of card effect
        if (text.includes('©Pokémon') || text.includes('©Nintendo')) return true;
        // TOOL boilerplate: generic tool rules text without actual effect
        if (TOOL_BOILERPLATE_PREFIXES.some(p => text.includes(p) && text.length < p.length + 60)) return true;
        return TOOL_BOILERPLATE_REGEX.some(r => r.test(text) && text.length < 160);
      };

      // Pick best representative card per language:
      // 1. Non-boilerplate cards come before boilerplate-only cards
      // 2. Among non-boilerplate, prefer the MOST COMMON text (handles reprints where one
      //    variant has a different effect — e.g. フラダリ Lost Zone variant vs 12x gust copies)
      const pickBestPerLang = (lang: string) => {
        const langCards = pc.cards.filter(c => c.language === lang);
        if (!langCards.length) return undefined;

        // Count text frequency across all cards of this language
        const textFreq = new Map<string, number>();
        for (const c of langCards) {
          const t = (c as { text?: string | null }).text ?? '';
          textFreq.set(t, (textFreq.get(t) ?? 0) + 1);
        }

        return langCards.sort((a, b) => {
          const ta = (a as { text?: string | null }).text ?? '';
          const tb = (b as { text?: string | null }).text ?? '';
          const aBoiler = isBoilerplateOnly(ta);
          const bBoiler = isBoilerplateOnly(tb);
          if (aBoiler !== bBoiler) return aBoiler ? 1 : -1; // non-boilerplate first
          // Among non-boilerplate, prefer most common text (frequency desc)
          return (textFreq.get(tb) ?? 0) - (textFreq.get(ta) ?? 0);
        })[0];
      };

      // Prefer ZH_TW > JA_JP > EN_US, skipping boilerplate-only cards
      const cardCandidates = [
        pickBestPerLang('ZH_TW'),
        pickBestPerLang('JA_JP'),
        pickBestPerLang('EN_US'),
      ].filter(Boolean);

      // Primary card: first non-boilerplate candidate (ZH_TW → JA_JP → EN_US)
      const card = cardCandidates[0] ?? pc.cards[0];

      const attacks = (card.attacks ?? []) as Attack[];
      const abilities = (card.abilities ?? []) as Ability[];
      const cardText = (card as { text?: string | null }).text ?? null;

      let [primaryTags, specialTags, maxDrawCount, maxDamage] = classifyCard(attacks, abilities, cardText);

      // If the result is only 其他效果 AND there are other language cards to try,
      // run classifyCard on each unique text until we get a better result.
      if (
        primaryTags.length === 1 &&
        primaryTags[0] === '其他效果' &&
        cardCandidates.length > 1
      ) {
        for (const altCard of cardCandidates.slice(1)) {
          const altText = (altCard as { text?: string | null }).text ?? null;
          if (!altText || altText === cardText || isBoilerplateOnly(altText)) continue;
          const [altPrimary, altSpecial, altDraw, altDmg] = classifyCard(
            (altCard.attacks ?? []) as Attack[],
            (altCard.abilities ?? []) as Ability[],
            altText,
          );
          if (altPrimary.length > 1 || (altPrimary.length === 1 && altPrimary[0] !== '其他效果')) {
            primaryTags = altPrimary;
            specialTags = altSpecial;
            maxDrawCount = altDraw;
            maxDamage = altDmg;
            break;
          }
        }
      }

      // Final fallback for missing-text cards: use conservative name-based mapping.
      if (primaryTags.length === 0) {
        const fallback = getNameFallbackTags(pc.name);
        if (fallback) {
          primaryTags = fallback.primary;
          specialTags = fallback.special;
          if (typeof fallback.maxDrawCount === 'number') {
            maxDrawCount = Math.max(maxDrawCount, fallback.maxDrawCount);
          }
        }
      }

      // Apply manual overrides
      const tagsToRemove = MANUAL_REMOVE_TAGS[pc.name];
      if (tagsToRemove?.length) {
        primaryTags = primaryTags.filter(t => !tagsToRemove.includes(t));
      }

      const effectScore = computeEffectScore(primaryTags, specialTags);
      const cardTier = computeTier(effectScore);

      for (const t of primaryTags) tagFreq[t] = (tagFreq[t] ?? 0) + 1;
      for (const t of specialTags) tagFreq[t] = (tagFreq[t] ?? 0) + 1;

      updates.push({
        id: pc.id,
        effectTags: primaryTags,
        specialEffectTags: specialTags,
        effectScore,
        cardTier,
        maxDrawCount: maxDrawCount || null,
        maxDamage: maxDamage || null,
      });
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
              maxDrawCount: u.maxDrawCount,
              maxDamage: u.maxDamage,
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

async function runEntrypoint() {
  const shouldExportCsv = process.argv.includes('--export-csv');
  if (shouldExportCsv) {
    await exportPokemonAndTrainerCards();
    return;
  }
  await main();
}

async function exportPokemonAndTrainerCards() {
  const normalizeText = (value: string | null | undefined): string => (value || '').replace(/\r?\n/g, ' ').trim();

  const pickPokemonText = (variant: { abilities: any; attacks: any; text: string | null } | undefined, fieldType: 'ability' | 'attack' | ''): string => {
    if (!variant) return '';

    if (fieldType === 'ability' && Array.isArray(variant.abilities)) {
      const abilityText = variant.abilities
        .map((a: any) => normalizeText(a?.description || a?.text || ''))
        .filter((t: string) => t.length > 0)
        .join(' | ');
      if (abilityText) return abilityText;
    }

    if (fieldType === 'attack' && Array.isArray(variant.attacks)) {
      const attackText = variant.attacks
        .map((a: any) => normalizeText(a?.effect || a?.text || ''))
        .filter((t: string) => t.length > 0)
        .join(' | ');
      if (attackText) return attackText;
    }

    const fallbackText = normalizeText(variant.text);
    return fallbackText;
  };

  const pickTrainerText = (
    variant: { text: string | null; abilities?: any; attacks?: any; rules?: string[] | null } | undefined,
  ): string => {
    if (!variant) return '';

    const directText = normalizeText(variant.text);
    if (directText) return directText;

    if (Array.isArray(variant.abilities)) {
      const abilityText = variant.abilities
        .map((a: any) => normalizeText(a?.description || a?.text || ''))
        .filter((t: string) => t.length > 0)
        .join(' | ');
      if (abilityText) return abilityText;
    }

    if (Array.isArray(variant.attacks)) {
      const attackText = variant.attacks
        .map((a: any) => normalizeText(a?.effect || a?.text || ''))
        .filter((t: string) => t.length > 0)
        .join(' | ');
      if (attackText) return attackText;
    }

    if (Array.isArray(variant.rules)) {
      const rulesText = variant.rules
        .map((rule: string) => normalizeText(rule))
        .filter((t: string) => t.length > 0)
        .join(' | ');
      if (rulesText) return rulesText;
    }

    return '';
  };

  const pickBestVariant = <T extends { language: string }>(
    variants: T[],
    language: 'ZH_TW' | 'JA_JP' | 'EN_US',
    extractText: (variant: T) => string,
  ): T | undefined => {
    const candidates = variants.filter(v => v.language === language);
    if (candidates.length === 0) return undefined;

    // Prefer the variant with the richest non-empty text payload.
    return candidates
      .map(v => ({ variant: v, text: extractText(v) }))
      .sort((a, b) => b.text.length - a.text.length)[0].variant;
  };

  // --- Pokémon cards ---
  const pokemonCards = await prisma.card.findMany({
    where: { supertype: 'POKEMON', language: 'ZH_TW' },
    select: {
      primaryCardId: true,
      name: true,
      primaryCard: {
        select: {
          pokemonSpecies: { select: { dexNumber: true } },
        },
      },
      abilities: true,
      attacks: true,
      regulationMark: true,
      text: true,
    },
  });

  const pokemonPrimaryIds = [...new Set(pokemonCards.map(c => c.primaryCardId))];
  const pokemonVariants = await prisma.card.findMany({
    where: {
      primaryCardId: { in: pokemonPrimaryIds },
      language: { in: ['ZH_TW', 'JA_JP', 'EN_US'] },
    },
    select: {
      primaryCardId: true,
      language: true,
      text: true,
      abilities: true,
      attacks: true,
    },
  });
  const pokemonVariantsByPrimary = new Map<string, typeof pokemonVariants>();
  for (const variant of pokemonVariants) {
    const existing = pokemonVariantsByPrimary.get(variant.primaryCardId) ?? [];
    existing.push(variant);
    pokemonVariantsByPrimary.set(variant.primaryCardId, existing);
  }

  const pokemonRows = [];
  const seenPokemonPrimary = new Set<string>();
  for (const card of pokemonCards) {
    if (seenPokemonPrimary.has(card.primaryCardId)) {
      continue;
    }
    const dexNumber = card.primaryCard?.pokemonSpecies?.dexNumber || '';
    const hasAbility = Array.isArray(card.abilities) && card.abilities.length > 0;
    const hasAttack = Array.isArray(card.attacks) && card.attacks.length > 0;
    const fieldType: 'ability' | 'attack' | '' = hasAbility ? 'ability' : hasAttack ? 'attack' : '';

    if (!fieldType) {
      continue;
    }

    const variants = pokemonVariantsByPrimary.get(card.primaryCardId) ?? [];
    const zhVariant = pickBestVariant(variants, 'ZH_TW', v => pickPokemonText(v, fieldType));
    const jaVariant = pickBestVariant(variants, 'JA_JP', v => pickPokemonText(v, fieldType));
    const enVariant = pickBestVariant(variants, 'EN_US', v => pickPokemonText(v, fieldType));

    const chineseText = pickPokemonText(zhVariant, fieldType);
    const jpText = pickPokemonText(jaVariant, fieldType);
    const engText = pickPokemonText(enVariant, fieldType);

    // Exclude rows without usable Chinese value and without any translated value.
    if (chineseText && (chineseText || jpText || engText)) {
      seenPokemonPrimary.add(card.primaryCardId);
      pokemonRows.push([
        card.primaryCardId,
        card.name,
        dexNumber,
        fieldType,
        card.regulationMark,
        chineseText,
        jpText,
        engText,
      ]);
    }
  }
  const pokemonCsv = [
    ['primary card id', 'chinese name', 'pokedex id', 'field type', '規格標記', 'chinese text', 'jp text', 'eng text'],
    ...pokemonRows,
  ]
    .map(row => row.map(x => '"' + (x ?? '').toString().replace(/"/g, '""') + '"').join(',')).join('\n');
  fs.writeFileSync('pokemon.csv', pokemonCsv);

  // --- Trainer cards ---
  const trainerCards = await prisma.card.findMany({
    where: { supertype: 'TRAINER', language: 'ZH_TW' },
    select: {
      primaryCardId: true,
      name: true,
      subtypes: true,
      regulationMark: true,
      text: true,
    },
  });

  const trainerPrimaryIds = [...new Set(trainerCards.map(c => c.primaryCardId))];
  const trainerVariants = await prisma.card.findMany({
    where: {
      primaryCardId: { in: trainerPrimaryIds },
      language: { in: ['ZH_TW', 'JA_JP', 'EN_US'] },
    },
    select: {
      primaryCardId: true,
      language: true,
      text: true,
      abilities: true,
      attacks: true,
      rules: true,
    },
  });
  const trainerVariantsByPrimary = new Map<string, typeof trainerVariants>();
  for (const variant of trainerVariants) {
    const existing = trainerVariantsByPrimary.get(variant.primaryCardId) ?? [];
    existing.push(variant);
    trainerVariantsByPrimary.set(variant.primaryCardId, existing);
  }

  const trainerRows = [];
  const seenTrainerPrimary = new Set<string>();
  for (const card of trainerCards) {
    if (seenTrainerPrimary.has(card.primaryCardId)) {
      continue;
    }

    const subtype = Array.isArray(card.subtypes) ? card.subtypes.join(';') : (card.subtypes || '');
    const variants = trainerVariantsByPrimary.get(card.primaryCardId) ?? [];
    const chineseText = pickTrainerText(pickBestVariant(variants, 'ZH_TW', pickTrainerText));
    const jpText = pickTrainerText(pickBestVariant(variants, 'JA_JP', pickTrainerText));
    const engText = pickTrainerText(pickBestVariant(variants, 'EN_US', pickTrainerText));
    // Only include if at least one text field is non-empty
    if ((chineseText || jpText || engText).trim() !== '') {
      seenTrainerPrimary.add(card.primaryCardId);
      trainerRows.push([
        card.primaryCardId,
        card.name,
        subtype,
        card.regulationMark,
        (chineseText || '').replace(/\r?\n/g, ' '),
        (jpText || '').replace(/\r?\n/g, ' '),
        (engText || '').replace(/\r?\n/g, ' '),
      ]);
    }
  }
  const trainerCsv = [
    ['primary card id', 'trainer chinese name', 'subtype', '規格標記', 'chinese text', 'jp text', 'eng text'],
    ...trainerRows,
  ]
    .map(row => row.map(x => '"' + (x ?? '').toString().replace(/"/g, '""') + '"').join(',')).join('\n');
  fs.writeFileSync('trainer.csv', trainerCsv);

  console.log('pokemon.csv and trainer.csv exported successfully!');
}

runEntrypoint().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
