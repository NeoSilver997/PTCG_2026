import { Play, Pause, SkipForward, SkipBack, RotateCcw } from 'lucide-react';
import { ReplayControls as Controls } from '@/hooks/useBattleReplay';

interface ReplayControlsProps {
  controls: Controls;
  isPlaying: boolean;
  playbackSpeed: number;
  progress: number;
  currentActionIndex: number;
  totalActions: number;
}

export function ReplayControls({
  controls,
  isPlaying,
  playbackSpeed,
  progress,
  currentActionIndex,
  totalActions,
}: ReplayControlsProps) {
  const speeds = [0.5, 1, 2, 4];

  return (
    <div className="bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Timeline */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-base font-semibold text-gray-700">
              Action {currentActionIndex + 1} / {totalActions}
            </span>
            <span className="text-sm text-gray-500">
              Keyboard: Space=Play/Pause, ←/→=Step, R=Restart
            </span>
          </div>
          <div
            className="h-4 bg-gray-200 rounded-full cursor-pointer relative shadow-inner"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const percentage = x / rect.width;
              const actionIndex = Math.floor(percentage * totalActions);
              controls.seekToAction(actionIndex);
            }}
          >
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full transition-all"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-3 border-purple-600 rounded-full shadow-lg cursor-grab active:cursor-grabbing"
              style={{ left: `calc(${progress * 100}% - 12px)` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Restart */}
            <button
              onClick={controls.restart}
              className="p-3 hover:bg-gray-100 rounded-lg transition-colors"
              title="Restart (R)"
            >
              <RotateCcw className="w-8 h-8" />
            </button>

            {/* Previous */}
            <button
              onClick={controls.prevAction}
              className="p-3 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
              title="Previous Action (←)"
              disabled={currentActionIndex === 0}
            >
              <SkipBack className="w-8 h-8" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={isPlaying ? controls.pause : controls.play}
              className="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8" />
              )}
            </button>

            {/* Next */}
            <button
              onClick={controls.nextAction}
              className="p-3 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
              title="Next Action (→)"
              disabled={currentActionIndex >= totalActions - 1}
            >
              <SkipForward className="w-8 h-8" />
            </button>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-3">
            <span className="text-base text-gray-600 font-medium">Speed:</span>
            <div className="flex gap-2">
              {speeds.map((speed) => (
                <button
                  key={speed}
                  onClick={() => controls.setSpeed(speed)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    playbackSpeed === speed
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
