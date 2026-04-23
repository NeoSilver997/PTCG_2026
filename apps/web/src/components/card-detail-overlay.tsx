import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface CardDetailOverlayProps {
  card: any;
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  GRASS: 'bg-green-500',
  FIRE: 'bg-red-500',
  WATER: 'bg-blue-500',
  LIGHTNING: 'bg-yellow-500',
  PSYCHIC: 'bg-purple-500',
  FIGHTING: 'bg-orange-700',
  DARKNESS: 'bg-gray-800',
  METAL: 'bg-gray-400',
  DRAGON: 'bg-gradient-to-r from-blue-500 to-red-500',
  FAIRY: 'bg-pink-400',
  COLORLESS: 'bg-gray-300',
};

const RARITY_COLORS: Record<string, string> = {
  COMMON: 'bg-gray-500',
  UNCOMMON: 'bg-green-500',
  RARE: 'bg-blue-500',
  ULTRA_RARE: 'bg-purple-500',
  ILLUSTRATION_RARE: 'bg-yellow-500',
  SPECIAL_ILLUSTRATION_RARE: 'bg-pink-500',
  HYPER_RARE: 'bg-red-500',
};

export function CardDetailOverlay({ card, onClose }: CardDetailOverlayProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">{card.name}</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/cards/${card.webCardId}`}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              title="查看完整詳細頁面"
            >
              <ExternalLink className="w-4 h-4" />
              完整頁面
            </Link>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card Image */}
            <div className="flex justify-center">
              <div className="relative">
                {card.imageUrl ? (
                  <img
                    src={card.imageUrl}
                    alt={card.name}
                    className="max-w-full h-auto rounded-lg shadow-lg"
                    style={{ maxHeight: '500px' }}
                  />
                ) : (
                  <div className="w-64 h-80 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                    No Image
                  </div>
                )}

                {/* Rarity Badge */}
                {card.rarity && (
                  <div className="absolute top-2 right-2">
                    <span className={`${RARITY_COLORS[card.rarity] || 'bg-gray-400'} text-white text-xs font-bold px-2 py-1 rounded`}>
                      {card.rarity.split('_')[0]}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Card Details */}
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-gray-700">Web Card ID:</span>
                  <p className="text-gray-900">{card.webCardId}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Language:</span>
                  <p className="text-gray-900">{card.language}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Supertype:</span>
                  <p className="text-gray-900">{card.supertype}</p>
                </div>
                {card.variantType && (
                  <div>
                    <span className="font-semibold text-gray-700">Variant:</span>
                    <p className="text-gray-900">{card.variantType}</p>
                  </div>
                )}
                {card.hp && (
                  <div>
                    <span className="font-semibold text-gray-700">HP:</span>
                    <p className="text-red-600 font-bold">{card.hp}</p>
                  </div>
                )}
                {card.types && (
                  <div>
                    <span className="font-semibold text-gray-700">Types:</span>
                    <div className="flex gap-1 mt-1">
                      {(Array.isArray(card.types) ? card.types : [card.types]).map((type: string) => (
                        <span
                          key={type}
                          className={`${TYPE_COLORS[type] || 'bg-gray-400'} text-white text-xs px-2 py-1 rounded-full font-bold`}
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Expansion Info */}
              {card.primaryCard?.primaryExpansion && (
                <div>
                  <span className="font-semibold text-gray-700">Expansion:</span>
                  <p className="text-gray-900">
                    {card.primaryCard.primaryExpansion.code} - {card.primaryCard.primaryExpansion.nameEn}
                  </p>
                </div>
              )}

              {/* Subtypes */}
              {card.subtypes && card.subtypes.length > 0 && (
                <div>
                  <span className="font-semibold text-gray-700">Subtypes:</span>
                  <p className="text-gray-900">{card.subtypes.join(', ')}</p>
                </div>
              )}

              {/* Artist */}
              {card.artist && (
                <div>
                  <span className="font-semibold text-gray-700">Artist:</span>
                  <p className="text-gray-900">{card.artist}</p>
                </div>
              )}

              {/* Regulation Mark */}
              {card.regulationMark && (
                <div>
                  <span className="font-semibold text-gray-700">Regulation Mark:</span>
                  <p className="text-gray-900">{card.regulationMark}</p>
                </div>
              )}

              {/* Abilities */}
              {card.abilities && Array.isArray(card.abilities) && card.abilities.length > 0 && (
                <div>
                  <span className="font-semibold text-gray-700">Abilities:</span>
                  <div className="mt-2 space-y-2">
                    {card.abilities.map((ability: any, index: number) => (
                      <div key={index} className="bg-blue-50 p-3 rounded-lg">
                        <div className="font-semibold text-blue-800">
                          {ability.name}
                          {ability.type && <span className="text-sm ml-2">({ability.type})</span>}
                        </div>
                        {(ability.text || ability.description) && (
                          <div className="text-blue-700 mt-1 text-sm">
                            {ability.text || ability.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attacks */}
              {card.attacks && Array.isArray(card.attacks) && card.attacks.length > 0 && (
                <div>
                  <span className="font-semibold text-gray-700">Attacks:</span>
                  <div className="mt-2 space-y-2">
                    {card.attacks.map((attack: any, index: number) => (
                      <div key={index} className="bg-red-50 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-red-800">{attack.name}</div>
                          {attack.damage && (
                            <span className="font-bold text-red-600">{attack.damage}</span>
                          )}
                        </div>
                        {attack.cost && Array.isArray(attack.cost) && (
                          <div className="flex gap-1 mt-1">
                            {attack.cost.map((cost: string, costIndex: number) => (
                              <span
                                key={costIndex}
                                className={`${TYPE_COLORS[cost] || 'bg-gray-400'} text-white text-xs px-1.5 py-0.5 rounded-full font-bold`}
                              >
                                {cost.charAt(0)}
                              </span>
                            ))}
                          </div>
                        )}
                        {(attack.effect || attack.text) && (
                          <div className="text-red-700 mt-2 text-sm">
                            {attack.effect || attack.text}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weaknesses, Resistances, Retreat */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                {card.weaknesses && Array.isArray(card.weaknesses) && card.weaknesses.length > 0 && (
                  <div>
                    <span className="font-semibold text-gray-700">Weaknesses:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {card.weaknesses.map((w: any, i: number) => (
                        <span key={i} className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {w.type} {w.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {card.resistances && Array.isArray(card.resistances) && card.resistances.length > 0 && (
                  <div>
                    <span className="font-semibold text-gray-700">Resistances:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {card.resistances.map((r: any, i: number) => (
                        <span key={i} className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {r.type} {r.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {card.retreatCost != null && (
                  <div>
                    <span className="font-semibold text-gray-700">Retreat Cost:</span>
                    <p className="text-gray-900">{card.retreatCost}</p>
                  </div>
                )}
              </div>

              {/* Effect Tags and Tier */}
              {(card.primaryCard?.effectTags?.length > 0 || card.primaryCard?.cardTier) && (
                <div>
                  <span className="font-semibold text-gray-700">Meta Information:</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {card.primaryCard.effectTags?.map((tag: string) => (
                      <span key={tag} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                        {tag}
                      </span>
                    ))}
                    {card.primaryCard.cardTier && card.primaryCard.cardTier !== 'D' && (
                      <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-bold">
                        Tier {card.primaryCard.cardTier}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Rule Box */}
              {card.ruleBox && (
                <div>
                  <span className="font-semibold text-gray-700">Rule Box:</span>
                  <p className="text-gray-900 mt-1 text-sm bg-gray-50 p-2 rounded">
                    {card.ruleBox}
                  </p>
                </div>
              )}

              {/* Text (for Trainer/Energy cards) */}
              {card.text && (
                <div>
                  <span className="font-semibold text-gray-700">Description:</span>
                  <p className="text-gray-900 mt-1 text-sm bg-gray-50 p-2 rounded">
                    {card.text}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}