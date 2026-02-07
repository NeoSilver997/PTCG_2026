import Link from 'next/link';
import { CardInstance } from '@ptcg/shared-types';

interface CardSlotProps {
  pokemon: CardInstance | null;
  isActive?: boolean;
  benchIndex?: number;
}

export function CardSlot({ pokemon, isActive, benchIndex }: CardSlotProps) {
  if (!pokemon) {
    return (
      <div className="w-40 h-56 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-sm">
        {isActive ? 'Active' : 'Empty'}
      </div>
    );
  }

  const hpPercentage = (pokemon.hp / pokemon.maxHp) * 100;
  const hpColor =
    hpPercentage > 66 ? 'bg-green-500' : hpPercentage > 33 ? 'bg-yellow-500' : 'bg-red-500';

  const cardContent = (
    <div className="w-40 h-56 bg-gradient-to-br from-purple-600 to-indigo-600 border-3 border-purple-300 rounded-lg shadow-lg hover:shadow-2xl hover:scale-110 transition-all cursor-pointer overflow-hidden relative">
      {/* Card Name (always visible as fallback) */}
      <div className="absolute inset-0 flex items-center justify-center p-3 pointer-events-none">
        <span className="text-white text-sm font-bold text-center drop-shadow-lg line-clamp-3 max-w-full">{pokemon.name}</span>
      </div>
      
      {/* Card Image (overlays name when loaded) */}
      {pokemon.webCardId && (
        <img
          src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/storage/cards/${pokemon.webCardId}/image`}
          alt={pokemon.name}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            // Hide image on error to show card name
            e.currentTarget.style.opacity = '0';
          }}
        />
      )}

      {/* HP Bar Overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800/70">
        <div
          className={`h-full ${hpColor} transition-all`}
          style={{ width: `${hpPercentage}%` }}
        />
      </div>

      {/* HP Text */}
      <div className="absolute top-2 right-2 bg-black/80 text-white text-base px-2 py-1 rounded font-bold shadow">
        {pokemon.hp}/{pokemon.maxHp}
      </div>

      {/* Damage Counters */}
      {pokemon.damageCounters > 0 && (
        <div className="absolute top-2 left-2 bg-red-500 text-white text-sm px-2 py-1 rounded-full font-bold shadow-lg">
          -{pokemon.damageCounters * 10}
        </div>
      )}

      {/* Evolution Indicator */}
      {pokemon.evolution && (
        <div className="absolute bottom-5 left-2 bg-indigo-500 text-white text-xs px-2 py-1 rounded shadow-lg">
          ←{pokemon.evolution.length > 12 ? pokemon.evolution.substring(0, 11) + '…' : pokemon.evolution}
        </div>
      )}

      {/* Attached Energy/Tools */}
      {pokemon.attachedCards.length > 0 && (
        <div className="absolute bottom-5 right-2 flex flex-col gap-1 max-w-[70%]">
          {pokemon.attachedCards.slice(0, 6).map((attached: { name: string; webCardId?: string }, idx: number) => (
            <div
              key={idx}
              className="bg-yellow-400/95 text-black text-xs px-2 py-1 rounded shadow-lg font-semibold truncate"
              title={attached.name}
            >
              {attached.name.length > 12 ? attached.name.substring(0, 11) + '…' : attached.name}
            </div>
          ))}
          {pokemon.attachedCards.length > 6 && (
            <div className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-lg font-bold text-center shadow-lg">
              +{pokemon.attachedCards.length - 6}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (pokemon.webCardId) {
    return (
      <Link href={`/cards/${pokemon.webCardId}`} target="_blank">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
