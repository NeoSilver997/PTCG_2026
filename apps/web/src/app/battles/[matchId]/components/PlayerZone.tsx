import { PlayerState } from '@ptcg/shared-types';
import { CardSlot } from './CardSlot';
import { Trophy } from 'lucide-react';

interface PlayerZoneProps {
  player: PlayerState;
  isOpponent?: boolean;
  isCurrentPlayer?: boolean;
}

export function PlayerZone({ player, isOpponent, isCurrentPlayer }: PlayerZoneProps) {
  const maxBench = 5;
  const benchSlots = Array.from({ length: maxBench }, (_, i) => player.bench[i] || null);
  
  const prizeCircles = Array.from({ length: 6 }, (_, i) => i < player.prizes);

  return (
    <div className={`${isOpponent ? 'rotate-180' : ''}`}>
      {/* Player Info */}
      <div className={`flex items-center justify-between mb-4 px-4 ${isOpponent ? 'rotate-180' : ''}`}>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-gray-800">{player.name}</h3>
          {isCurrentPlayer && (
            <div className="px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded">
              TURN
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          {/* Prizes */}
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <div className="flex gap-1">
              {prizeCircles.map((hasPrize, idx) => (
                <div
                  key={idx}
                  className={`w-3 h-3 rounded-full border-2 ${
                    hasPrize
                      ? 'bg-yellow-500 border-yellow-600'
                      : 'bg-gray-200 border-gray-300'
                  }`}
                  title={`Prize ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Deck */}
          <div className="text-gray-600">
            Deck: <span className="font-semibold">{player.deck}</span>
          </div>

          {/* Hand */}
          <div className="text-gray-600">
            Hand: <span className="font-semibold">{player.hand}</span>
          </div>

          {/* Discard */}
          <div className="text-gray-600">
            Discard: <span className="font-semibold">{player.discard}</span>
          </div>
        </div>
      </div>

      {/* Bench */}
      <div className="flex justify-center gap-2 mb-4">
        {benchSlots.map((pokemon, idx) => (
          <CardSlot key={idx} pokemon={pokemon} benchIndex={idx} />
        ))}
      </div>

      {/* Active Pokémon */}
      <div className="flex justify-center">
        <div className="relative">
          <CardSlot pokemon={player.active} isActive />
          {player.active && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
              ACTIVE
            </div>
          )}
        </div>
       </div>
    </div>
  );
}
