import { BattleAction } from '@ptcg/shared-types';
import { 
  Sword, 
  Zap, 
  ArrowRightLeft, 
  Heart, 
  Trophy,
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ActionLogProps {
  actions: BattleAction[];
  currentActionIndex: number;
  onActionClick: (index: number) => void;
}

export function ActionLog({ actions, currentActionIndex, onActionClick }: ActionLogProps) {
  const currentActionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    currentActionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [currentActionIndex]);

  return (
    <div className="bg-white border-l border-gray-200 overflow-y-auto h-full">
      <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 font-semibold">
        Action Log
      </div>
      
      <div className="p-4 space-y-2">
        {actions.map((action, index) => (
          <div
            key={action.id}
            ref={index === currentActionIndex ? currentActionRef : null}
            onClick={() => onActionClick(index)}
            className={`p-3 rounded-lg cursor-pointer transition-all ${
              index === currentActionIndex
                ? 'bg-purple-100 border-2 border-purple-600 shadow-md'
                : index < currentActionIndex
                ? 'bg-gray-50 border border-gray-200 opacity-60 hover:opacity-100'
                : 'bg-white border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                {getActionIcon(action.actionType)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-500">
                    Turn {action.turnNumber}
                  </span>
                  <span className={`text-xs font-semibold ${
                    action.player === 'player1' ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {action.player === 'player1' ? 'P1' : 'P2'}
                  </span>
                </div>
                
                <div className="text-sm font-medium text-gray-800 break-words">
                  {getActionDescription(action)}
                </div>
                
                {action.damage && (
                  <div className="mt-1 text-xs text-red-600 font-semibold">
                    -{action.damage} damage
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getActionIcon(actionType: string) {
  const iconClass = "w-4 h-4";
  
  switch (actionType) {
    case 'ATTACK':
      return <Sword className={`${iconClass} text-red-500`} />;
    case 'PLAY_POKEMON':
      return <Layers className={`${iconClass} text-purple-500`} />;
    case 'ATTACH_ENERGY':
      return <Zap className={`${iconClass} text-yellow-500`} />;
    case 'EVOLVE':
      return <Sparkles className={`${iconClass} text-blue-500`} />;
    case 'RETREAT':
      return <ArrowRightLeft className={`${iconClass} text-gray-500`} />;
    case 'KNOCKOUT':
      return <Heart className={`${iconClass} text-black`} />;
    case 'PRIZE':
      return <Trophy className={`${iconClass} text-yellow-600`} />;
    case 'ABILITY':
      return <Sparkles className={`${iconClass} text-indigo-500`} />;
    case 'SHUFFLE':
      return <RefreshCw className={`${iconClass} text-gray-400`} />;
    default:
      return <div className={`${iconClass} bg-gray-300 rounded-full`} />;
  }
}

function getActionDescription(action: BattleAction): string {
  switch (action.actionType) {
    case 'DRAW':
      return `Drew ${action.metadata?.count || 1} card${action.metadata?.count > 1 ? 's' : ''}`;
    
    case 'PLAY_POKEMON':
      return `Played ${action.cardName} to ${action.metadata?.position === 'active' ? 'Active' : 'Bench'}`;
    
    case 'ATTACH_ENERGY':
      return `Attached ${action.cardName} to ${action.targetCardName}`;
    
    case 'ATTACK':
      return `${action.cardName} used ${action.metadata?.attackName || 'attack'} on ${action.targetCardName}`;
    
    case 'EVOLVE':
      return `Evolved ${action.targetCardName} to ${action.cardName}`;
    
    case 'KNOCKOUT':
      return `${action.cardName} was Knocked Out!`;
    
    case 'PRIZE':
      return `Took ${action.metadata?.count || 1} Prize card${action.metadata?.count > 1 ? 's' : ''}`;
    
    case 'RETREAT':
      return `Retreated ${action.cardName}`;
    
    case 'ABILITY':
      return `${action.cardName} used ${action.metadata?.abilityName || 'ability'}`;
    
    case 'PLAY_TRAINER':
      return `Played ${action.cardName}`;
    
    case 'DISCARD':
      return `Discarded ${action.cardName}`;
    
    case 'SHUFFLE':
      return 'Shuffled deck';
    
    default:
      return action.details || action.cardName;
  }
}
