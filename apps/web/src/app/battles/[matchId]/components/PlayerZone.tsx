'use client';

import { PlayerState } from '@ptcg/shared-types';
import { CardSlot } from './CardSlot';
import { Trophy, Layers, Eye } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

interface PlayerZoneProps {
  player: PlayerState;
  isOpponent?: boolean;
  isCurrentPlayer?: boolean;
  layout?: 'vertical' | 'horizontal';
  infoOnly?: boolean;
}

export function PlayerZone({ player, isOpponent, isCurrentPlayer, layout = 'vertical', infoOnly = false }: PlayerZoneProps) {
  const [showHand, setShowHand] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  
  const maxBench = 5;
  const benchSlots = Array.from({ length: maxBench }, (_, i) => player.bench[i] || null);
  
  const prizeCircles = Array.from({ length: 6 }, (_, i) => i < player.prizes);

  // Info Only Mode (for horizontal layout)
  if (infoOnly) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-white rounded-lg shadow-sm">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-gray-800">{player.name}</h3>
          {isCurrentPlayer && (
            <div className="px-2 py-1 bg-green-500 text-white text-xs font-semibold rounded shadow-md">
              TURN
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          {/* Prizes */}
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <div className="flex gap-1">
              {prizeCircles.map((hasPrize, idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 ${
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
          <div className="text-gray-600 flex items-center gap-1">
            <Layers className="w-5 h-5" />
            <span className="font-semibold">{player.deck}</span>
          </div>

          {/* Hand - Clickable */}
          <button
            onClick={() => setShowHand(true)}
            className="text-gray-600 hover:text-purple-600 flex items-center gap-1 transition-colors"
            title="View hand"
          >
            <Eye className="w-5 h-5" />
            Hand: <span className="font-semibold">{player.hand.length}</span>
          </button>

          {/* Discard - Clickable */}
          <button
            onClick={() => setShowDiscard(true)}
            className="text-gray-600 hover:text-red-600 flex items-center gap-1 transition-colors"
            title="View discard pile"
          >
            <Layers className="w-5 h-5" />
            Discard: <span className="font-semibold">{player.discardPile.length}</span>
          </button>
        </div>
        
        {/* Modals */}
        {showHand && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowHand(false)}
          >
            <div
              className="bg-white rounded-lg p-6 max-w-5xl max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold mb-4">{player.name}&apos;s Hand ({player.hand.length})</h3>
              <div className="grid grid-cols-6 gap-4">
                {player.hand.map((card, idx) => (
                  <div key={idx} className="bg-gray-100 rounded-lg p-4 text-center hover:bg-gray-200 transition-colors">
                    {card.webCardId ? (
                      <Link
                        href={`/cards/${card.webCardId}`}
                        target="_blank"
                        className="text-purple-600 hover:text-purple-800 font-semibold text-base block truncate"
                      >
                        {card.name}
                      </Link>
                    ) : (
                      <div className="text-gray-600 text-base font-medium truncate" title={card.name}>
                        {card.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowHand(false)}
                className="mt-6 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showDiscard && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowDiscard(false)}
          >
            <div
              className="bg-white rounded-lg p-6 max-w-5xl max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold mb-4">{player.name}&apos;s Discard Pile ({player.discardPile.length})</h3>
              <div className="grid grid-cols-6 gap-4">
                {player.discardPile.map((card, idx) => (
                  <div key={idx} className="bg-red-50 rounded-lg p-4 text-center border border-red-200 hover:bg-red-100 transition-colors">
                    {card.webCardId ? (
                      <Link
                        href={`/cards/${card.webCardId}`}
                        target="_blank"
                        className="text-red-600 hover:text-red-800 font-semibold text-base block truncate"
                      >
                        {card.name}
                      </Link>
                    ) : (
                      <div className="text-gray-600 text-base font-medium truncate" title={card.name}>
                        {card.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowDiscard(false)}
                className="mt-6 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Player Info */}
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-gray-800">{player.name}</h3>
          {isCurrentPlayer && (
            <div className="px-3 py-1.5 bg-green-500 text-white text-sm font-semibold rounded shadow-md">
              TURN
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4 text-base">
          {/* Prizes */}
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <div className="flex gap-1">
              {prizeCircles.map((hasPrize, idx) => (
                <div
                  key={idx}
                  className={`w-5 h-5 rounded-full border-2 ${
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
          <div className="text-gray-600 flex items-center gap-1">
            <Layers className="w-6 h-6" />
            <span className="font-semibold">{player.deck}</span>
          </div>

          {/* Hand - Clickable */}
          <button
            onClick={() => setShowHand(true)}
            className="text-gray-600 hover:text-purple-600 flex items-center gap-1 transition-colors"
            title="View hand"
          >
            <Eye className="w-6 h-6" />
            Hand: <span className="font-semibold">{player.hand.length}</span>
          </button>

          {/* Discard - Clickable */}
          <button
            onClick={() => setShowDiscard(true)}
            className="text-gray-600 hover:text-red-600 flex items-center gap-1 transition-colors"
            title="View discard pile"
          >
            <Layers className="w-6 h-6" />
            Discard: <span className="font-semibold">{player.discardPile.length}</span>
          </button>
        </div>
      </div>

      {/* Cards Layout - Horizontal or Vertical */}
      {layout === 'horizontal' ? (
        /* Vertical Stack for Horizontal Board */
        <div className="flex flex-col items-center gap-3">
          {/* Active Pokémon */}
          <div className="flex justify-center">
            <div className="relative">
              <CardSlot pokemon={player.active} isActive />
              {player.active && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md z-10">
                  ACTIVE
                </div>
              )}
            </div>
          </div>

          {/* Bench - Vertical Stack */}
          <div className="flex flex-col gap-3">
            {benchSlots.map((pokemon, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="text-xs font-semibold text-gray-500 w-6">{idx + 1}</div>
                <CardSlot pokemon={pokemon} benchIndex={idx} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Normal Layout for Vertical Board */
        <>
          {/* Bench */}
          <div className="flex justify-center gap-4 mb-4">
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
        </>
      )}

      {/* Hand Modal */}
      {showHand && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowHand(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-5xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold mb-4">{player.name}&apos;s Hand ({player.hand.length})</h3>
            <div className="grid grid-cols-6 gap-4">
              {player.hand.map((card, idx) => (
                <div key={idx} className="bg-gray-100 rounded-lg p-4 text-center hover:bg-gray-200 transition-colors">
                  {card.webCardId ? (
                    <Link
                      href={`/cards/${card.webCardId}`}
                      target="_blank"
                      className="text-purple-600 hover:text-purple-800 font-semibold text-base block truncate"
                    >
                      {card.name}
                    </Link>
                  ) : (
                    <div className="text-gray-600 text-base font-medium truncate" title={card.name}>
                      {card.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowHand(false)}
              className="mt-6 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Discard Modal */}
      {showDiscard && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowDiscard(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-5xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold mb-4">{player.name}&apos;s Discard Pile ({player.discardPile.length})</h3>
            <div className="grid grid-cols-6 gap-4">
              {player.discardPile.map((card, idx) => (
                <div key={idx} className="bg-red-50 rounded-lg p-4 text-center border border-red-200 hover:bg-red-100 transition-colors">
                  {card.webCardId ? (
                    <Link
                      href={`/cards/${card.webCardId}`}
                      target="_blank"
                      className="text-red-600 hover:text-red-800 font-semibold text-base block truncate"
                    >
                      {card.name}
                    </Link>
                  ) : (
                    <div className="text-gray-600 text-base font-medium truncate" title={card.name}>
                      {card.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowDiscard(false)}
              className="mt-6 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
