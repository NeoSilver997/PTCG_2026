interface CardGridProps {
  cards: any[];
  onCardClick?: (card: any) => void;
}

export function CardGrid({ cards, onCardClick }: CardGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.id}
          className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow cursor-pointer overflow-hidden"
          onClick={() => onCardClick?.(card)}
        >
          <div className="aspect-[2.5/3.5] bg-gray-100 relative">
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
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
              {card.name}
            </h3>
            <div className="flex items-center justify-between mt-2">
              {card.hp && (
                <span className="text-xs font-bold text-red-600">HP {card.hp}</span>
              )}
              {card.types && card.types.length > 0 && (
                <div className="flex gap-1">
                  {card.types.slice(0, 2).map((type: string, idx: number) => (
                    <TypeIcon key={idx} type={type} size="sm" />
                  ))}
                </div>
              )}
            </div>
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

function TypeIcon({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' | 'lg' }) {
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
  
  const color = typeColors[type] || 'bg-gray-300';
  const sizeClass = sizeClasses[size];
  
  return (
    <div className={`${color} ${sizeClass} rounded-full flex items-center justify-center text-white font-bold`}>
      {type[0]}
    </div>
  );
}
