'use client';

import { useEffect, useState } from 'react';
import { BattleAction } from '@ptcg/shared-types';
import { Layers, Zap, X } from 'lucide-react';
import { CardImage } from './CardImage';

interface DrawCardNotificationProps {
  action: BattleAction | null;
}

interface CardToShow {
  name: string;
  webCardId?: string;
  visible: boolean;
}

export function DrawCardNotification({ action }: DrawCardNotificationProps) {
  const [visible, setVisible] = useState(false);
  const [drawInfo, setDrawInfo] = useState<{ 
    player: string; 
    count: number; 
    type: string;
    cards: CardToShow[];
  } | null>(null);

  useEffect(() => {
    if (action && (action.actionType === 'DRAW' || action.actionType === 'PRIZE')) {
      const count = action.metadata?.count || 1;
      const playerName = action.player === 'player1' ? 'Player 1' : 'Player 2';
      const cardNames = action.metadata?.cardNames as string[] | undefined;
      
      // Create cards array with webCardId if available
      const cards: CardToShow[] = cardNames?.map(name => ({
        name,
        webCardId: undefined, // Could resolve from database in future
        visible: false,
      })) || [];
      
      setDrawInfo({
        player: playerName,
        count,
        type: action.actionType,
        cards,
      });
      setVisible(true);

      // Stagger card visibility with 300ms delay between each
      if (cards.length > 0) {
        cards.forEach((_, index) => {
          setTimeout(() => {
            setDrawInfo(prev => {
              if (!prev) return prev;
              const updated = { ...prev };
              updated.cards[index].visible = true;
              return updated;
            });
          }, index * 300);
        });
      }

      // Auto-hide after duration: 300ms per card + 2000ms base
      const duration = cards.length > 0 ? (cards.length * 300) + 2000 : 1500;
      const timeout = setTimeout(() => {
        setVisible(false);
      }, duration);

      return () => clearTimeout(timeout);
    }
  }, [action]);

  if (!visible || !drawInfo) return null;

  const isPrize = drawInfo.type === 'PRIZE';
  const Icon = isPrize ? Zap : Layers;
  const bgGradient = isPrize 
    ? 'from-yellow-500 to-orange-600' 
    : 'from-blue-500 to-purple-600';

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className={`bg-gradient-to-br ${bgGradient} text-white px-8 py-6 rounded-2xl shadow-2xl border-4 border-white/30 animate-bounce-once max-w-4xl`}>
        <div className="flex items-start gap-4">
          <Icon className="w-12 h-12 animate-pulse flex-shrink-0 mt-1" />
          <div className="flex-1">
            <div className="text-2xl font-bold mb-1">{drawInfo.player}</div>
            <div className="text-xl mb-3">
              {isPrize ? 'Took' : 'Drew'} {drawInfo.count} {isPrize ? 'Prize' : 'card'}{drawInfo.count !== 1 ? 's' : ''}!
            </div>
            
            {/* Show card images with staggered animation */}
            {drawInfo.cards.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/30">
                <div className="flex flex-wrap gap-3 justify-center">
                  {drawInfo.cards.map((card, idx) => (
                    <div 
                      key={idx}
                      className={`transition-all duration-500 ${
                        card.visible ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                      }`}
                    >
                      {card.webCardId ? (
                        <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm">
                          <CardImage
                            webCardId={card.webCardId}
                            cardName={card.name}
                            size="small"
                            className="shadow-lg"
                          />
                          <div className="text-center mt-2 text-sm font-semibold bg-white/20 px-2 py-1 rounded">
                            {card.name}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white/20 backdrop-blur-sm px-3 py-2 rounded-lg text-base font-semibold border border-white/30 shadow-lg min-w-[120px] text-center">
                          {card.name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Manual dismiss button */}
          <button
            onClick={() => setVisible(false)}
            className="pointer-events-auto p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
