import { GameState } from '@ptcg/shared-types';
import { PlayerZone } from './PlayerZone';

interface BattleBoardProps {
  gameState: GameState;
}

export function BattleBoard({ gameState }: BattleBoardProps) {
  return (
    <div className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg shadow-inner p-8">
      {/* Opponent (Top) */}
      <PlayerZone 
        player={gameState.player2} 
        isOpponent 
        isCurrentPlayer={gameState.currentPlayer === 'player2'}
      />

      {/* Stadium */}
      {gameState.stadium && (
        <div className="my-8 flex justify-center">
          <div className="bg-gradient-to-r from-amber-100 to-yellow-100 border-2 border-amber-400 rounded-lg px-6 py-3 shadow-md">
            <div className="text-xs text-amber-700 font-semibold mb-1">STADIUM</div>
            <div className="text-sm font-bold text-amber-900">{gameState.stadium}</div>
          </div>
        </div>
      )}

      {/* VS Divider */}
      {!gameState.stadium && (
        <div className="my-8 flex items-center justify-center">
          <div className="h-px bg-gray-300 flex-1" />
          <div className="px-4 text-2xl font-bold text-gray-400">VS</div>
          <div className="h-px bg-gray-300 flex-1" />
        </div>
      )}

      {/* Player (Bottom) */}
      <PlayerZone 
        player={gameState.player1} 
        isCurrentPlayer={gameState.currentPlayer === 'player1'}
      />
    </div>
  );
}
