import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { GameState } from '@ptcg/shared-types';
import { PlayerZone } from './PlayerZone';
import { CardSlot } from './CardSlot';

interface BattleBoardProps {
  gameState: GameState;
  layout?: 'vertical' | 'horizontal';
}

type BattleAction = {
  id?: string;
  actionType: string;
  player?: string;
  cardName?: string;
  details?: string;
  timestamp?: string;
  metadata?: any;
};

export function BattleBoard({ gameState, layout = 'vertical' }: BattleBoardProps) {
  const params = useParams();
  const matchId = (params as any)?.matchId || '';

  const [actions, setActions] = useState<BattleAction[]>([]);
  const [query, setQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<BattleAction | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [filterPlayer, setFilterPlayer] = useState<'ALL' | 'player1' | 'player2'>('ALL');

  const fetchActions = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await fetch(`/api/v1/battles/${matchId}`);
      if (!res.ok) throw new Error('Failed to load actions');
      const payload = await res.json();
      setActions(payload.actions || []);
    } catch (err) {
      console.error('fetchActions error', err);
    }
  }, [matchId]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const replay = useCallback(async () => {
    if (!matchId) return;
    setIsReplaying(true);
    try {
      const res = await fetch(`/api/v1/battles/${matchId}/reparse`, { method: 'POST' });
      if (!res.ok) throw new Error('Replay failed');
      await fetchActions();
    } catch (err) {
      console.error('replay error', err);
    } finally {
      setIsReplaying(false);
    }
  }, [matchId, fetchActions]);

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (filterPlayer !== 'ALL' && a.player !== filterPlayer) return false;
      if (query && !`${a.actionType} ${a.cardName || ''} ${a.details || ''}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [actions, query, filterPlayer]);

  const getCardImageUrl = (cardName?: string) => {
    if (!cardName) return '/images/placeholder_card.png';
    // Use a best-effort safe filename mapping
    const safe = encodeURIComponent(cardName.replace(/\s+/g, '_').toLowerCase());
    return `/cards/${safe}.png`;
  };

  const onActionClick = (a: BattleAction) => {
    setSelectedAction(a);
  };

  // separate the board rendering so we can place it next to the actions column
  const board = (
    <div className="flex-1">
      {/* Vertical Layout (Original - Top to Bottom) */}
      {layout === 'vertical' ? (
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
      ) : (
        // Horizontal Layout
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
      )}
    </div>
  );

  // Main layout: board + actions sidebar
  return (
    <div className="flex gap-6 items-start">
      {board}

      {/* Actions Sidebar */}
      <aside className="w-96 bg-white border border-gray-200 rounded-lg p-4 h-[720px] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Actions</div>
          <div className="flex items-center gap-2">
            <select value={filterPlayer} onChange={(e) => setFilterPlayer(e.target.value as any)} className="border px-2 py-1 rounded">
              <option value="ALL">All</option>
              <option value="player1">Player 1</option>
              <option value="player2">Player 2</option>
            </select>
            <button onClick={replay} className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50" disabled={isReplaying}>
              {isReplaying ? 'Replaying...' : 'Replay'}
            </button>
          </div>
        </div>

        <input placeholder="Search actions" value={query} onChange={(e) => setQuery(e.target.value)} className="border rounded px-3 py-2 mb-3" />

        {/* Timeline */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
          {actions.slice(0, 12).map((ev, idx) => (
            <div key={idx} onClick={() => setSelectedAction(ev)} className="min-w-[110px] border rounded px-2 py-1 text-xs cursor-pointer">
              <div className="font-semibold">{ev.actionType}</div>
              <div className="text-gray-500 text-[11px]">{ev.timestamp || ''}</div>
            </div>
          ))}
        </div>

        {/* Action List */}
        <div className="flex-1 overflow-y-auto">
          {filteredActions.length === 0 && <div className="text-sm text-gray-500 mt-6">No actions</div>}
          <ul>
            {filteredActions.map((a, i) => (
              <li key={i} onClick={() => onActionClick(a)} className="p-2 border-b hover:bg-gray-50 cursor-pointer flex items-center gap-3">
                <div className="w-10 h-10 shrink-0 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-700">{(a.actionType || '').slice(0,2)}</div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{a.actionType}{a.cardName ? `: ${a.cardName}` : ''}</div>
                  <div className="text-xs text-gray-500">{a.details}</div>
                </div>
                <div className="text-xs text-gray-400">{a.timestamp || ''}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* Drawer (simple inline) */}
        {selectedAction && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{selectedAction.actionType}</div>
                <div className="text-xs text-gray-600">{selectedAction.player}</div>
              </div>
              <button className="text-xs text-blue-600" onClick={() => setSelectedAction(null)}>Close</button>
            </div>

            <div className="mt-2 text-sm text-gray-700">{selectedAction.details}</div>

            <div className="mt-3 flex gap-2">
              {/* Thumbnails from card names (best effort) */}
              {selectedAction.cardName ? (
                <img src={getCardImageUrl(selectedAction.cardName)} alt={selectedAction.cardName} className="w-20 h-28 object-cover border rounded" />
              ) : null}

              {/* related metadata */}
              <div className="text-xs text-gray-500">
                <pre className="whitespace-pre-wrap">{JSON.stringify(selectedAction.metadata || {}, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

