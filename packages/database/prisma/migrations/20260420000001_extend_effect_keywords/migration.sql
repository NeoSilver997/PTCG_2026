-- Extend effect_keywords with all categories derived from PTCG effect classification system
-- Patterns are JS RegExp strings; colorClass are Tailwind utility classes
-- INSERT OR DO NOTHING so re-running is safe

INSERT INTO "effect_keywords" ("id","pattern","isRegex","flags","colorClass","category","sortOrder","updatedAt") VALUES

-- ── Resource Acquisition ────────────────────────────────────────────────────
-- Mass draw (4-6 cards) — stronger blue than regular draw, catches "抽4張/抽出5張" etc.
('ek_draw_mass',   '抽[456]張|抽出[456]張',                                          true,'g','bg-blue-200 text-blue-900','draw',       5, NOW()),

-- Deck search (separate from draw)
('ek_deck_search', '從.*?棄牌區.*?选|查看.*?牌庫頂|查看.*?張',                       true,'g','bg-blue-100 text-blue-800','search',    25, NOW()),

-- ── Resource Management ─────────────────────────────────────────────────────
-- Energy recovery (from discard pile)
('ek_energy_rec',  '從.*?棄牌區.*?能量|能量卡.*?放回牌庫|回收.*?能量',               true,'g','bg-yellow-200 text-yellow-900','energy',   35, NOW()),
-- Special energy ("視為提供X個能量")
('ek_energy_spc',  '視為提供.*?能量|重新附於.*?能量',                                 true,'g','bg-yellow-100 text-yellow-800','energy',   36, NOW()),
-- Energy requirement increase (disruption)
('ek_energy_inc',  '使用招式所需.*?能量.*?增加|各增加1個.*?能量',                     true,'g','bg-yellow-100 text-yellow-800','energy',   37, NOW()),
-- Deck shuffle
('ek_deck_shuffle','放回牌庫並重洗|全部放回牌庫|各自.*?牌庫.*?重洗',                 true,'g','bg-blue-100 text-blue-800','deck',      170, NOW()),

-- ── Damage Output ───────────────────────────────────────────────────────────
-- General damage phrase ("造成Xpoint傷害")
('ek_dmg_direct',  '造成\s*\d+\s*點.*?傷害|給予.*?傷害',                             true,'g','bg-red-100 text-red-700','damage',     85, NOW()),
-- Conditional damage (若…每增加/點傷害)
('ek_dmg_cond',    '若.*?點傷害|在.*?回合.*?增加.*?傷害|每.*?張.*?傷害\+',           true,'g','bg-red-100 text-red-700','damage',     86, NOW()),
-- Bench/chain damage
('ek_dmg_chain',   '備戰寶可夢也受到|備戰.*?各受到.*?傷害',                          true,'g','bg-red-100 text-red-700','damage',     87, NOW()),
-- Recoil damage (self-damage)
('ek_dmg_recoil',  '這隻寶可夢也受到.*?傷害|自己也受到.*?傷害',                      true,'g','bg-red-100 text-red-700','damage',     88, NOW()),
-- Bench multiplier ("備戰寶可夢的數量×")
('ek_dmg_bench',   '備戰寶可夢的數量.*?×|數量\s*×\s*\d+.*?傷害',                    true,'g','bg-red-100 text-red-700','damage',     89, NOW()),
-- Discard pile damage multiplier
('ek_dmg_disc_mul','棄牌區.*?張.*?×.*?傷害|張數.*?×.*?傷害',                         true,'g','bg-red-100 text-red-700','damage',     89, NOW()),
-- Ignore weakness / effects
('ek_dmg_ignore',  '不計算弱點|不計算抵抗力|傷害不計算|不受.*?附加效果',             true,'g','bg-amber-200 text-amber-900','weakness', 82, NOW()),

-- ── Status Control ──────────────────────────────────────────────────────────
-- Explicit status brackets 【中毒】【燒傷】etc. (Japanese/Chinese TCG notation)
('ek_status_brkt', '【灼傷】|【中毒】|【麻痺】|【睡眠】|【混亂】|【燒傷】',         true,'g','bg-orange-100 text-orange-800','status',  51, NOW()),
-- KO / faint condition
('ek_ko_cond',     '昏厥',                                                             true,'g','bg-orange-200 text-orange-900','status',  52, NOW()),
-- Status recovery
('ek_status_rec',  '恢復.*?特殊狀態|回復.*?特殊狀態|解除.*?狀態',                    true,'g','bg-green-100 text-green-800','recovery',122, NOW()),

-- ── Defense / Mitigation ────────────────────────────────────────────────────
-- Defense: cannot be damaged
('ek_def_nodmg',   '不會受到.*?傷害|無法對.*?使用招式',                              true,'g','bg-teal-100 text-teal-800','defense',  125, NOW()),
-- Effect immunity
('ek_def_immune',  '效果的影響.*?不受|不受.*?效果的影響|不會受到效果',               true,'g','bg-teal-100 text-teal-800','defense',  126, NOW()),
-- Damage reduction value ("傷害「-30」")
('ek_def_reduce',  '傷害「\s*-\d+\s*」',                                              true,'g','bg-teal-200 text-teal-900','defense',  127, NOW()),
-- Weakness removal / change
('ek_def_weakrm',  '弱點全部消除|弱點消除|弱點改為|弱點以',                          true,'g','bg-amber-100 text-amber-800','weakness', 83, NOW()),
-- HP boost
('ek_hp_boost',    '最大HP.*?增加|HP\+\d+|\+\d+\s*HP',                               true,'g','bg-yellow-100 text-yellow-800','defense',128, NOW()),

-- ── Recovery ────────────────────────────────────────────────────────────────
('ek_recover_hp',  '回復\s*\d+\s*點?\s*HP|恢復\s*\d+\s*點?\s*HP|HP.*?恢復',         true,'g','bg-green-100 text-green-800','recovery',121, NOW()),

-- ── Position Control ────────────────────────────────────────────────────────
-- Bench placement
('ek_place_bench', '放置.*?備戰區|放到.*?備戰區|移到.*?備戰區|將.*?放入備戰區',      true,'g','bg-teal-100 text-teal-800','position', 63, NOW()),
-- Retreat lock
('ek_retreat_lock','無法撤退',                                                         true,'g','bg-teal-100 text-teal-800','position',  64, NOW()),

-- ── Disruption ──────────────────────────────────────────────────────────────
-- Item / tool removal
('ek_disrupt_item','道具.*?消除|道具.*?移除|物品卡.*?消除|寶可夢道具.*?丟棄',        true,'g','bg-purple-100 text-purple-800','disruption',155, NOW()),
-- Attack / move lock
('ek_disrupt_lock','無法使用招式|招式.*?封鎖|選擇.*?持有的招式.*?無法',               true,'g','bg-purple-100 text-purple-800','disruption',156, NOW()),
-- Item card usage lock
('ek_disrupt_item2','無法從手牌使出物品卡|不能使用物品卡',                            true,'g','bg-purple-100 text-purple-800','disruption',157, NOW()),
-- Discard opponent's hand
('ek_discard_opp', '丟棄.*?對手.*?手牌|對手.*?隨機丟棄',                              true,'g','bg-gray-200 text-gray-700','disruption',  72, NOW()),

-- ── Field Effects ───────────────────────────────────────────────────────────
('ek_stadium',     '競技場',                                                           true,'g','bg-amber-100 text-amber-800','field',   145, NOW()),
-- Prize card control
('ek_prize',       '獎賞卡',                                                           true,'g','bg-amber-100 text-amber-800','prize',   140, NOW()),

-- ── Special / Conditional ───────────────────────────────────────────────────
-- Attack copy
('ek_atk_copy',    '作為這個招式使用|複製.*?招式',                                    true,'g','bg-purple-100 text-purple-800','special', 175, NOW()),
-- Combo (must use previous turn)
('ek_combo',       '在上個.*?回合.*?才可使用|才可使用這個招式',                       true,'g','bg-pink-100 text-pink-800','restriction',185, NOW()),
-- Restriction (cannot use next turn)
('ek_restrict',    '下個自己的回合.*?無法使用',                                        true,'g','bg-pink-100 text-pink-800','restriction',186, NOW()),
-- Conditional failure
('ek_cond_fail',   '若.*?則這個招式失敗|若.*?失敗',                                   true,'g','bg-pink-100 text-pink-800','restriction',187, NOW())

ON CONFLICT ("id") DO NOTHING;
