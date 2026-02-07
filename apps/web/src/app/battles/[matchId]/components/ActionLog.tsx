import { BattleAction } from '@ptcg/shared-types';
import { 
  Sword, 
  Zap, 
  ArrowRightLeft, 
  Heart, 
  Trophy,
  Layers,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ActionLogProps {
  actions: BattleAction[];
  currentActionIndex: number;
  onActionClick: (index: number) => void;
}

export function ActionLog({ actions, currentActionIndex, onActionClick }: ActionLogProps) {
  const currentActionRef = useRef<HTMLDivElement>(null);
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

  const toggleExpand = (actionId: string) => {
    setExpandedActions(prev => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else {
        next.add(actionId);
      }
      return next;
    });
  };

  useEffect(() => {
    currentActionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [currentActionIndex]);

  return (
    <div className="bg-white border-l border-gray-200 overflow-y-auto h-full">
      <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 font-bold text-lg shadow-md">
        Action Log
      </div>
      
      <div className="p-4 space-y-3">
        {actions.map((action, index) => {
          const isExpanded = expandedActions.has(action.id);
          const hasExpandableContent = action.damage || action.metadata?.attackName || action.metadata?.abilityName || action.metadata?.cardNames;
          
          return (
          <div
            key={action.id}
            ref={index === currentActionIndex ? currentActionRef : null}
            className={`rounded-lg border-2 transition-all ${
              index === currentActionIndex
                ? 'bg-purple-100 border-purple-600 shadow-md'
                : index < currentActionIndex
                ? 'bg-gray-50 border-gray-200 opacity-70 hover:opacity-100'
                : 'bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            <div
              onClick={() => onActionClick(index)}
              className="p-4 cursor-pointer"
            >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                {getActionIcon(action.actionType)}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-500">
                    Turn {action.turnNumber}
                  </span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                    action.player === 'player1' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {action.player === 'player1' ? 'P1' : 'P2'}
                  </span>
                </div>
                
                <div className="text-base font-semibold text-gray-800 break-words">
                  {getActionDescription(action)}
                </div>
              </div>
              
              {hasExpandableContent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(action.id);
                  }}
                  className="ml-2 p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              )}
              </div>
            </div>
            
            {/* Expanded Details */}
            {isExpanded && hasExpandableContent && (
              <div className="px-4 pb-4 border-t border-gray-200 mt-2 pt-3 space-y-2">
                {action.damage && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-gray-600">Damage:</span>
                    <span className="text-red-600 font-bold text-base">-{action.damage}</span>
                  </div>
                )}
                {action.metadata?.attackName && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-gray-600">Attack:</span>
                    <span className="text-gray-800 font-semibold">{action.metadata.attackName}</span>
                  </div>
                )}
                {action.metadata?.abilityName && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-gray-600">Ability:</span>
                    <span className="text-gray-800 font-semibold">{action.metadata.abilityName}</span>
                  </div>
                )}
                {action.metadata?.cardNames && action.metadata.cardNames.length > 0 && (
                  <div className="text-sm">
                    <span className="font-semibold text-gray-600 block mb-1">Cards:</span>
                    <div className="flex flex-wrap gap-1">
                      {action.metadata.cardNames.map((cardName: string, idx: number) => (
                        <span 
                          key={idx} 
                          className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-medium max-w-[200px] truncate inline-block"
                          title={cardName}
                        >
                          {cardName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
  );
}

function getActionIcon(actionType: string) {
  const iconClass = "w-6 h-6";
  
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
