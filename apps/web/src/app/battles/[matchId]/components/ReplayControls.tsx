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
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-600">
              Action {currentActionIndex + 1} / {totalActions}
            </span>
          </div>
          <div
            className="h-2 bg-gray-200 rounded-full cursor-pointer relative"
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
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-purple-600 rounded-full shadow-md cursor-grab active:cursor-grabbing"
              style={{ left: `calc(${progress * 100}% - 8px)` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Restart */}
            <button
              onClick={controls.restart}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Restart"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* Previous */}
            <button
              onClick={controls.prevAction}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Previous Action"
              disabled={currentActionIndex === 0}
            >
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={isPlaying ? controls.pause : controls.play}
              className="p-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6" />
              )}
            </button>

            {/* Next */}
            <button
              onClick={controls.nextAction}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Next Action"
              disabled={currentActionIndex >= totalActions - 1}
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Speed:</span>
            <div className="flex gap-1">
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
