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
      <div className="w-24 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs">
        {isActive ? 'Active' : 'Empty'}
      </div>
    );
  }

  const hpPercentage = (pokemon.hp / pokemon.maxHp) * 100;
  const hpColor =
    hpPercentage > 66 ? 'bg-green-500' : hpPercentage > 33 ? 'bg-yellow-500' : 'bg-red-500';

  const cardContent = (
    <div className="w-24 h-32 bg-gradient-to-br from-purple-600 to-indigo-600 border-2 border-purple-300 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden relative">
      {/* Card Name (always visible as fallback) */}
      <div className="absolute inset-0 flex items-center justify-center p-2 pointer-events-none">
        <span className="text-white text-xs font-bold text-center drop-shadow-lg">{pokemon.name}</span>
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
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-gray-800/70">
        <div
          className={`h-full ${hpColor} transition-all`}
          style={{ width: `${hpPercentage}%` }}
        />
      </div>

      {/* HP Text */}
      <div className="absolute top-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-bold">
        {pokemon.hp}/{pokemon.maxHp}
      </div>

      {/* Damage Counters */}
      {pokemon.damageCounters > 0 && (
        <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold shadow">
          -{pokemon.damageCounters * 10}
        </div>
      )}

      {/* Evolution Indicator */}
      {pokemon.evolution && (
        <div className="absolute bottom-3 left-1 bg-indigo-500 text-white text-[10px] px-1 py-0.5 rounded shadow">
          ←{pokemon.evolution.length > 8 ? pokemon.evolution.substring(0, 8) : pokemon.evolution}
        </div>
      )}

      {/* Attached Energy/Tools */}
      {pokemon.attachedCards.length > 0 && (
        <div className="absolute bottom-3 right-1 flex flex-col gap-0.5 max-w-[70%]">
          {pokemon.attachedCards.slice(0, 4).map((attached, idx) => (
            <div
              key={idx}
              className="bg-yellow-400/90 text-black text-[9px] px-1 py-0.5 rounded shadow font-semibold truncate"
              title={attached.name}
            >
              {attached.name.length > 8 ? attached.name.substring(0, 7) + '…' : attached.name}
            </div>
          ))}
          {pokemon.attachedCards.length > 4 && (
            <div className="bg-yellow-500 text-white text-[9px] px-1 py-0.5 rounded font-bold text-center">
              +{pokemon.attachedCards.length - 4}
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
