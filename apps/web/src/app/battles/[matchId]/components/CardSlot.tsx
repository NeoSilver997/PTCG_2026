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
    <div className="w-24 h-32 bg-gradient-to-br from-purple-100 to-indigo-100 border-2 border-purple-300 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer overflow-hidden">
      {/* Card Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-2 py-1">
        <div className="text-xs font-semibold truncate">{pokemon.name}</div>
      </div>

      {/* Card Body */}
      <div className="p-2 flex flex-col justify-between h-[calc(100%-28px)]">
        {/* HP Bar */}
        <div>
          <div className="text-xs text-gray-600 mb-1">
            HP: {pokemon.hp}/{pokemon.maxHp}
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full ${hpColor} transition-all`}
              style={{ width: `${hpPercentage}%` }}
            />
          </div>
        </div>

        {/* Damage Counters */}
        {pokemon.damageCounters > 0 && (
          <div className="text-center">
            <div className="inline-block bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              -{pokemon.damageCounters * 10}
            </div>
          </div>
        )}

        {/* Attached Cards */}
        {pokemon.attachedCards.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pokemon.attachedCards.slice(0, 3).map((card, idx) => (
              <div
                key={idx}
                className="w-4 h-4 bg-yellow-400 rounded-full border border-yellow-600"
                title={card}
              />
            ))}
            {pokemon.attachedCards.length > 3 && (
              <div className="text-xs text-gray-500">
                +{pokemon.attachedCards.length - 3}
              </div>
            )}
          </div>
        )}

        {/* Evolution Indicator */}
        {pokemon.evolution && (
          <div className="text-xs text-purple-600 truncate" title={`Evolved from ${pokemon.evolution}`}>
            ← {pokemon.evolution}
          </div>
        )}
      </div>
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
