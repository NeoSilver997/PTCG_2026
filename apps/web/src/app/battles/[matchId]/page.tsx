'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { BattleLogDTO } from '@ptcg/shared-types';
import { useBattleReplay } from '@/hooks/useBattleReplay';
import { BattleBoard } from './components/BattleBoard';
import { ReplayControls } from './components/ReplayControls';
import { ActionLog } from './components/ActionLog';
import { DrawCardNotification } from './components/DrawCardNotification';
import { DeckViewer } from './components/DeckViewer';
import { ArrowLeft, Trophy } from 'lucide-react';

export default function BattleReplayPage() {
  const params = useParams();
  const matchId = params.matchId as string;

  const { data: battleLog, isLoading, error } = useQuery({
    queryKey: ['battles', matchId],
    queryFn: async () => {
      const response = await apiClient.get(`/battles/${matchId}`);
      return response.data as BattleLogDTO;
    },
    staleTime: 5 * 60 * 1000, // Battle logs are immutable
  });

  const replay = useBattleReplay(battleLog);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (error || !battleLog) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl font-semibold mb-4">
            Failed to load battle
          </div>
          <Link
            href="/battles"
            className="text-purple-600 hover:text-purple-700 underline"
          >
            Back to Battles
          </Link>
        </div>
      </div>
    );
  }

  const isPlayer1Winner = battleLog.winnerName === battleLog.player1Name;
  const isPlayer2Winner = battleLog.winnerName === battleLog.player2Name;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/battles"
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold">{battleLog.matchTitle}</h1>
                <div className="text-purple-100 text-sm mt-1">
                  {new Date(battleLog.createdAt).toLocaleString()} • {battleLog.turnCount} turns
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Deck Viewers */}
              <DeckViewer 
                playerName={battleLog.player1Name}
                deck={battleLog.player1Deck}
                playerColor="blue"
              />
              <DeckViewer 
                playerName={battleLog.player2Name}
                deck={battleLog.player2Deck}
                playerColor="red"
              />

              {/* Winner Badge */}
              {battleLog.winnerName && (
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
                  <Trophy className="w-5 h-5 text-yellow-300" />
                  <span className="font-semibold">{battleLog.winnerName} wins!</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Draw Card Notification */}
      <DrawCardNotification action={replay.currentAction} />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Battle Board (Left/Center) */}
        <div className="flex-1 overflow-y-auto p-6">
          <BattleBoard gameState={replay.gameState} />
          
          {/* Current Action Display */}
          {replay.currentAction && (
            <div className="mt-6 bg-white rounded-lg shadow-md p-4 max-w-2xl mx-auto">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <span className="font-semibold">Turn {replay.currentAction.turnNumber}</span>
                <span>•</span>
                <span className={replay.currentAction.player === 'player1' ? 'text-blue-600' : 'text-red-600'}>
                  {replay.gameState[replay.currentAction.player].name}
                </span>
              </div>
              <div className="text-gray-800 font-medium">
                {replay.currentAction.details || replay.currentAction.cardName}
              </div>
            </div>
          )}
        </div>

        {/* Action Log (Right Sidebar) */}
        <div className="w-80 flex flex-col">
          <ActionLog
            actions={battleLog.actions}
            currentActionIndex={replay.currentActionIndex}
            onActionClick={replay.controls.seekToAction}
          />
        </div>
      </div>

      {/* Fixed Controls at Bottom */}
      <div className="sticky bottom-0">
        <ReplayControls
          controls={replay.controls}
          isPlaying={replay.isPlaying}
          playbackSpeed={replay.playbackSpeed}
          progress={replay.progress}
          currentActionIndex={replay.currentActionIndex}
          totalActions={battleLog.actions.length}
        />
      </div>
    </div>
  );
}
