import { GameState } from '@ptcg/shared-types';
import { PlayerZone } from './PlayerZone';
import { CardSlot } from './CardSlot';

interface BattleBoardProps {
  gameState: GameState;
  layout?: 'vertical' | 'horizontal';
}

export function BattleBoard({ gameState, layout = 'vertical' }: BattleBoardProps) {
  // Vertical Layout (Original - Top to Bottom)
  if (layout === 'vertical') {
    return (
      <div className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg shadow-inner p-4 max-w-6xl mx-auto">
        {/* Opponent (Top) */}
        <div className="bg-blue-50/50 rounded-lg p-4 mb-4">
          <PlayerZone 
            player={gameState.player2} 
            isOpponent 
            isCurrentPlayer={gameState.currentPlayer === 'player2'}
          />
        </div>

        {/* Stadium */}
        {gameState.stadium && (
          <div className="my-6 flex justify-center">
            <div className="bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-400 rounded-lg px-6 py-3 shadow-md">
              <div className="text-xs text-amber-700 font-semibold mb-1">STADIUM</div>
              <div className="text-sm font-bold text-amber-900">{gameState.stadium}</div>
            </div>
          </div>
        )}

        {/* VS Divider */}
        {!gameState.stadium && (
          <div className="my-6 flex items-center justify-center">
            <div className="h-px bg-gray-300 flex-1" />
            <div className="px-4 text-2xl font-bold text-gray-400">VS</div>
            <div className="h-px bg-gray-300 flex-1" />
          </div>
        )}

        {/* Player (Bottom) */}
        <div className="bg-red-50/50 rounded-lg p-4 mt-4">
          <PlayerZone 
            player={gameState.player1} 
            isCurrentPlayer={gameState.currentPlayer === 'player1'}
          />
        </div>
      </div>
    );
  }

  // Horizontal Layout (Right to Left - Desktop Two Columns)
  return (
    <div className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg shadow-inner p-6 max-w-[1800px] mx-auto overflow-x-auto">
      <div className="flex items-start justify-center gap-6 min-w-fit">
        {/* Player 1 Section (Left) - Bench Column + Active Column */}
        <div className="flex items-start gap-3 bg-red-50/50 rounded-lg p-4">
          {/* Player 1 Bench Column (reversed order 4,3,2,1,0) */}
          <div className="flex flex-col gap-2">
            {[4, 3, 2, 1, 0].map((benchIdx) => (
              <CardSlot key={`p1-bench-${benchIdx}`} pokemon={gameState.player1.bench[benchIdx] || null} benchIndex={benchIdx} />
            ))}
          </div>
          {/* Player 1 Active Column */}
          <div className="relative">
            <CardSlot pokemon={gameState.player1.active} isActive />
            {gameState.player1.active && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md whitespace-nowrap z-10">
                P1 ACTIVE
              </div>
            )}
          </div>
        </div>

        {/* Stadium/VS Divider (Center) */}
        <div className="flex items-center justify-center px-4">
          {gameState.stadium ? (
            <div className="bg-gradient-to-b from-amber-100 to-yellow-100 border-2 border-amber-400 rounded-lg px-6 py-8 shadow-md min-w-[100px]">
              <div className="text-xs text-amber-700 font-semibold mb-2 text-center">STADIUM</div>
              <div className="text-sm font-bold text-amber-900 text-center break-words">{gameState.stadium}</div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-px h-32 bg-gray-300" />
              <div className="px-4 text-3xl font-bold text-gray-400">VS</div>
              <div className="w-px h-32 bg-gray-300" />
            </div>
          )}
        </div>

        {/* Player 2 Section (Right) - Active Column + Bench Column */}
        <div className="flex items-start gap-3 bg-blue-50/50 rounded-lg p-4">
          {/* Player 2 Active Column */}
          <div className="relative">
            <CardSlot pokemon={gameState.player2.active} isActive />
            {gameState.player2.active && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md whitespace-nowrap z-10">
                P2 ACTIVE
              </div>
            )}
          </div>
          {/* Player 2 Bench Column (normal order 0,1,2,3,4) */}
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((benchIdx) => (
              <CardSlot key={`p2-bench-${benchIdx}`} pokemon={gameState.player2.bench[benchIdx] || null} benchIndex={benchIdx} />
            ))}
          </div>
        </div>
      </div>

      {/* Player Info Bars */}
      <div className="flex justify-between gap-4 mt-6 max-w-[1400px] mx-auto">
        <PlayerZone 
          player={gameState.player1} 
          isCurrentPlayer={gameState.currentPlayer === 'player1'}
          layout="horizontal"
          infoOnly
        />
        <PlayerZone 
          player={gameState.player2} 
          isOpponent 
          isCurrentPlayer={gameState.currentPlayer === 'player2'}
          layout="horizontal"
          infoOnly
        />
      </div>
    </div>
  );
}
