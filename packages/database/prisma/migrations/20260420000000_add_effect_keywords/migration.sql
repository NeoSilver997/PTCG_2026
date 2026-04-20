-- CreateTable
CREATE TABLE "effect_keywords" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "isRegex" BOOLEAN NOT NULL DEFAULT true,
    "flags" TEXT NOT NULL DEFAULT 'g',
    "colorClass" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "effect_keywords_pkey" PRIMARY KEY ("id")
);

-- Seed default highlight keywords
INSERT INTO "effect_keywords" ("id", "pattern", "isRegex", "flags", "colorClass", "category", "sortOrder", "updatedAt") VALUES
('ek_draw1',    '抽\d*張?(?:手牌|卡)?|抽(?:取|出)\d*張?',      true, 'g', 'bg-blue-100 text-blue-800',   'draw',      10, NOW()),
('ek_search',   '從牌庫搜索|搜索牌庫|從牌庫中選|從牌庫找出',  true, 'g', 'bg-blue-100 text-blue-800',   'search',    20, NOW()),
('ek_energy',   '附著.*?能量|能量附著|附上能量|能量卡?',        true, 'g', 'bg-yellow-100 text-yellow-800','energy',    30, NOW()),
('ek_ability',  '特性',                                          true, 'g', 'bg-purple-100 text-purple-800','ability',   40, NOW()),
('ek_status',   '中毒|燒傷|麻痺|睡眠|混亂',                    true, 'g', 'bg-orange-100 text-orange-800','status',    50, NOW()),
('ek_retreat',  '撤退費用?|強制撤退|切換.*?寶可夢',             true, 'g', 'bg-teal-100 text-teal-800',   'retreat',   60, NOW()),
('ek_discard',  '棄牌',                                          true, 'g', 'bg-gray-200 text-gray-700',   'discard',   70, NOW()),
('ek_weakness', '弱點',                                          true, 'g', 'bg-amber-100 text-amber-800', 'weakness',  80, NOW()),
('ek_damage',   '傷害指示物|回復\s*\d+\s*點?HP?',               true, 'g', 'bg-red-100 text-red-700',     'damage',    90, NOW()),
('ek_evolve',   '進化',                                          true, 'g', 'bg-green-100 text-green-800', 'evolution', 100, NOW()),
('ek_coin',     '硬幣|正面|反面',                                true, 'g', 'bg-pink-100 text-pink-800',   'coin',      110, NOW());
