'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { BattleLogDTO } from '@ptcg/shared-types';
import { Play, Upload, Trophy, Calendar } from 'lucide-react';

export default function BattlesPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['battles'],
    queryFn: async () => {
      const response = await apiClient.get('/battles', {
        params: { take: 50 },
      });
      return response.data;
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold mb-4">Battle Replays</h1>
          <p className="text-purple-100 text-lg">
            Watch and analyze Pokémon TCG battle logs
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Action Bar */}
        <div className="flex justify-between items-center mb-8">
          <div className="text-sm text-gray-600">
            {data?.meta?.total ? (
              <span>
                Showing {data.data.length} of {data.meta.total} battles
              </span>
            ) : null}
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
          >
            <Upload className="w-5 h-5" />
            Upload Battle Log
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            Failed to load battles. Please try again.
          </div>
        )}

        {/* Battles Grid */}
        {data?.data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.data.map((battle: BattleLogDTO) => (
              <BattleCard key={battle.id} battle={battle} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {data?.data && data.data.length === 0 && (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No battles yet
            </h3>
            <p className="text-gray-500 mb-6">
              Upload your first battle log to get started
            </p>
            <button
              onClick={() => setUploadOpen(true)}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all"
            >
              Upload Battle Log
            </button>
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      {uploadOpen && (
        <UploadLogDialog onClose={() => setUploadOpen(false)} />
      )}
    </div>
  );
}

function BattleCard({ battle }: { battle: BattleLogDTO }) {
  const isPlayer1Winner = battle.winnerName === battle.player1Name;
  const isPlayer2Winner = battle.winnerName === battle.player2Name;

  return (
    <Link
      href={`/battles/${battle.id}`}
      className="block bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group"
    >
      <div className="p-6">
        {/* Players */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold ${
                  isPlayer1Winner ? 'text-green-600' : 'text-gray-700'
                }`}
              >
                {battle.player1Name}
              </span>
              {isPlayer1Winner && (
                <Trophy className="w-4 h-4 text-yellow-500" />
              )}
            </div>
          </div>
          <div className="text-center text-gray-400 font-bold">VS</div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold ${
                  isPlayer2Winner ? 'text-green-600' : 'text-gray-700'
                }`}
              >
                {battle.player2Name}
              </span>
              {isPlayer2Winner && (
                <Trophy className="w-4 h-4 text-yellow-500" />
              )}
            </div>
          </div>
        </div>

        {/* Battle Info */}
        <div className="space-y-2 text-sm text-gray-600 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {new Date(battle.createdAt).toLocaleDateString()}
          </div>
          <div>Turns: {battle.turnCount}</div>
          <div>Actions: {battle.actions.length}</div>
        </div>

        {/* Play Button */}
        <div className="flex items-center justify-center gap-2 text-purple-600 group-hover:text-purple-700 font-semibold">
          <Play className="w-5 h-5" />
          Watch Replay
        </div>
      </div>
    </Link>
  );
}

function UploadLogDialog({ onClose }: { onClose: () => void }) {
  const [rawLog, setRawLog] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!rawLog.trim()) {
      setError('Please paste a battle log');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await apiClient.post('/battles', { rawLog });
      
      // Redirect to the new battle
      window.location.href = `/battles/${response.data.id}`;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload battle log');
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Upload Battle Log</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <p className="text-gray-600 mb-4">
            Paste your PTCG Live battle log text below:
          </p>

          <textarea
            value={rawLog}
            onChange={(e) => setRawLog(e.target.value)}
            placeholder="Setup&#10;Miarte chose heads for the opening coin flip.&#10;Miarte won the coin toss.&#10;..."
            className="w-full h-96 p-4 border border-gray-300 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          />

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            disabled={isUploading}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
