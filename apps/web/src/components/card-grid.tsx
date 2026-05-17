import Link from 'next/link';

interface CardGridProps {
  cards: any[];
  onCardImageClick?: (card: any, index: number) => void;
  onFilterByEffectTag?: (tag: string) => void;
  onFilterByType?: (type: string) => void;
  onFilterByWeakness?: (type: string) => void;
}

const TIER_COLORS: Record<string, string> = {
  'S+': 'bg-yellow-100 text-yellow-800 border-yellow-400',
  'S':  'bg-yellow-50 text-yellow-700 border-yellow-300',
  'A+': 'bg-green-100 text-green-800 border-green-400',
  'A':  'bg-green-50 text-green-700 border-green-300',
  'B+': 'bg-blue-100 text-blue-800 border-blue-400',
  'B':  'bg-blue-50 text-blue-700 border-blue-300',
  'C+': 'bg-gray-100 text-gray-700 border-gray-400',
  'C':  'bg-gray-50 text-gray-500 border-gray-300',
};

const TYPE_COLORS: Record<string, string> = {
  GRASS: 'bg-green-500', FIRE: 'bg-red-500', WATER: 'bg-blue-500',
  LIGHTNING: 'bg-yellow-400', PSYCHIC: 'bg-purple-500', FIGHTING: 'bg-orange-600',
  DARKNESS: 'bg-gray-800', METAL: 'bg-gray-500', DRAGON: 'bg-purple-600',
  FAIRY: 'bg-pink-400', COLORLESS: 'bg-gray-400',
};

function CardTooltip({ card }: { card: any }) {
  const abilities: any[] = Array.isArray(card.abilities) ? card.abilities : [];
  const attacks: any[] = Array.isArray(card.attacks) ? card.attacks : [];
  const weaknesses: any[] = Array.isArray(card.weaknesses) ? card.weaknesses : [];
  const resistances: any[] = Array.isArray(card.resistances) ? card.resistances : [];

  if (abilities.length === 0 && attacks.length === 0 && weaknesses.length === 0) return null;

  return (
    <div className="absolute left-full top-0 ml-2 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-3 pointer-events-none text-xs">
      {abilities.map((ability: any, i: number) => (
        <div key={i} className="mb-2 last:mb-0">
          <div className="font-semibold text-blue-700 text-[11px]">
            {ability.name && <span className="mr-1 px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px]">特性</span>}
            {ability.name}
          </div>
          {(ability.text || ability.description) && (
            <div className="mt-0.5 text-gray-700 leading-snug">{ability.text || ability.description}</div>
          )}
        </div>
      ))}
      {abilities.length > 0 && attacks.length > 0 && <hr className="my-2 border-gray-100" />}
      {attacks.map((attack: any, i: number) => (
        <div key={i} className="mb-2 last:mb-0">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              {attack.cost && (Array.isArray(attack.cost) ? attack.cost : []).map((c: string, idx: number) => (
                <span key={idx} className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold ${TYPE_COLORS[c] || 'bg-gray-400'}`} style={{ fontSize: '7px' }}>
                  {c.charAt(0)}
                </span>
              ))}
              <span className="font-semibold text-gray-900 text-[11px] truncate">{attack.name}</span>
            </div>
            {attack.damage && (
              <span className="font-bold text-red-600 text-[11px] flex-shrink-0">{attack.damage}</span>
            )}
          </div>
          {(attack.effect || attack.text) && (
            <div className="mt-0.5 text-gray-700 leading-snug">{attack.effect || attack.text}</div>
          )}
        </div>
      ))}
      {weaknesses.length > 0 && (attacks.length > 0 || abilities.length > 0) && <hr className="my-2 border-gray-100" />}
      {weaknesses.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {weaknesses.map((w: any, i: number) => (
            <span key={i} className="text-[10px] text-gray-600">弱點: <span className={`px-1 rounded text-white font-bold ${TYPE_COLORS[w.type] || 'bg-gray-400'}`}>{w.type}</span> {w.value}</span>
          ))}
          {resistances.map((r: any, i: number) => (
            <span key={i} className="text-[10px] text-gray-600">抵抗: <span className={`px-1 rounded text-white font-bold ${TYPE_COLORS[r.type] || 'bg-gray-400'}`}>{r.type}</span> {r.value}</span>
          ))}
          {card.retreatCost != null && (
            <span className="text-[10px] text-gray-600">退場: {card.retreatCost}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function CardGrid({
  cards,
  onCardImageClick,
  onFilterByEffectTag,
  onFilterByType,
  onFilterByWeakness,
}: CardGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
      {cards.map((card, index) => (
        <div
          key={card.id}
          className="group bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow overflow-visible relative"
        >
          <div className="overflow-hidden rounded-lg">
          <div className="aspect-[2.5/3.5] bg-gray-100 relative">
            {card.imageUrl ? (
              <button
                type="button"
                className="w-full h-full block cursor-zoom-in"
                onClick={() => onCardImageClick?.(card, index)}
                title="點擊開啟卡片預覽"
              >
                <img
                  src={card.imageUrl}
                  alt={card.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                No Image
              </div>
            )}
            
            {/* Rarity Badge */}
            {card.rarity && (
              <div className="absolute top-2 right-2">
                <RarityBadge rarity={card.rarity} />
              </div>
            )}
          </div>
          
          <div className="p-3">
            <h3 className="font-semibold text-sm text-gray-900 truncate" title={card.name}>
              <Link
                href={`/cards/${card.webCardId}`}
                className="hover:text-blue-700 hover:underline"
                title="點擊前往卡片詳細頁"
              >
                {card.name}
              </Link>
            </h3>
            <div className="flex items-center justify-between mt-2">
              {card.hp && (
                <span className="text-xs font-bold text-red-600">HP {card.hp}</span>
              )}
              {card.types && (
                <button
                  type="button"
                  onClick={() => {
                    const mainType = Array.isArray(card.types) ? card.types[0] : card.types;
                    if (mainType) onFilterByType?.(mainType);
                  }}
                  title="點擊以此屬性篩選"
                  className="rounded"
                >
                  <TypeIcon type={card.types} size="sm" />
                </button>
              )}
            </div>
            {/* Weakness badge */}
            {Array.isArray(card.weaknesses) && card.weaknesses.length > 0 && (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-[9px] text-gray-500">弱:</span>
                {card.weaknesses.map((w: any, i: number) => (
                  <button
                    key={i}
                    type="button"
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-white font-bold text-[7px] ${TYPE_COLORS[w.type] || 'bg-gray-400'}`}
                    title={`點擊以弱點 ${w.type} 篩選`}
                    onClick={() => w.type && onFilterByWeakness?.(w.type)}
                  >
                    {w.type?.charAt(0)}
                  </button>
                ))}
                {card.weaknesses[0]?.value && (
                  <span className="text-[9px] text-gray-500">{card.weaknesses[0].value}</span>
                )}
              </div>
            )}
            {/* Effect tag pills */}
            {card.primaryCard?.effectTags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(card.primaryCard.effectTags as string[])
                  .filter(t => t !== '其他效果')
                  .slice(0, 3)
                  .map((tag: string) => (
                    <button
                      type="button"
                      key={tag}
                      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-700 border border-blue-200 leading-tight hover:bg-blue-100"
                      onClick={() => onFilterByEffectTag?.(tag)}
                      title={`點擊以標籤 ${tag} 篩選`}
                    >
                      {tag}
                    </button>
                  ))}
                {card.primaryCard?.cardTier && card.primaryCard.cardTier !== 'D' && (
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold leading-tight border ${TIER_COLORS[card.primaryCard.cardTier] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                    {card.primaryCard.cardTier}
                  </span>
                )}
              </div>
            )}
          </div>
          </div>

          {/* Skill tooltip on hover */}
          <div className="hidden group-hover:block">
            <CardTooltip card={card} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RarityBadge({ rarity }: { rarity: string }) {
  const rarityColors: Record<string, string> = {
    COMMON: 'bg-gray-500',
    UNCOMMON: 'bg-green-500',
    RARE: 'bg-blue-500',
    ULTRA_RARE: 'bg-purple-500',
    ILLUSTRATION_RARE: 'bg-yellow-500',
    SPECIAL_ILLUSTRATION_RARE: 'bg-pink-500',
    HYPER_RARE: 'bg-red-500',
  };
  
  const color = rarityColors[rarity] || 'bg-gray-400';
  const label = rarity.split('_')[0];
  
  return (
    <span className={`${color} text-white text-xs font-bold px-2 py-1 rounded`}>
      {label}
    </span>
  );
}

function TypeIcon({ type, size = 'md' }: { type: string | string[]; size?: 'sm' | 'md' | 'lg' }) {
  const typeColors: Record<string, string> = {
    COLORLESS: 'bg-gray-400',
    DARKNESS: 'bg-gray-800',
    DRAGON: 'bg-purple-600',
    FAIRY: 'bg-pink-400',
    FIGHTING: 'bg-orange-600',
    FIRE: 'bg-red-500',
    GRASS: 'bg-green-500',
    LIGHTNING: 'bg-yellow-400',
    METAL: 'bg-gray-500',
    PSYCHIC: 'bg-purple-500',
    WATER: 'bg-blue-500',
  };
  
  const sizeClasses = {
    sm: 'w-5 h-5 text-[8px]',
    md: 'w-6 h-6 text-xs',
    lg: 'w-8 h-8 text-sm',
  };
  
  const mainType = Array.isArray(type) ? type[0] : type;
  const color = mainType ? typeColors[mainType] || 'bg-gray-300' : 'bg-gray-300';
  const sizeClass = sizeClasses[size];
  const label = mainType ? mainType[0] : '';
  
  return (
    <div className={`${color} ${sizeClass} rounded-full flex items-center justify-center text-white font-bold`}>
      {label}
    </div>
  );
}
