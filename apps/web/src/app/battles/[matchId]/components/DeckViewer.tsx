'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DeckCard } from '@ptcg/shared-types';
import { X, Eye, FileText } from 'lucide-react';

interface DeckViewerProps {
  playerName: string;
  deck?: DeckCard[];
  playerColor?: 'blue' | 'red';
}

export function DeckViewer({ playerName, deck, playerColor = 'blue' }: DeckViewerProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!deck || deck.length === 0) {
    return null;
  }

  const colorClasses = playerColor === 'blue'
    ? 'bg-blue-600 hover:bg-blue-700 text-white'
    : 'bg-red-600 hover:bg-red-700 text-white';

  const totalCards = deck.reduce((sum, card) => sum + card.quantity, 0);

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${colorClasses}`}
        title={`View cards used by ${playerName}`}
      >
        <FileText className="w-4 h-4" />
        <span className="text-sm font-medium">
          Cards ({totalCards})
        </span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className={`${playerColor === 'blue' ? 'bg-blue-600' : 'bg-red-600'} text-white px-6 py-4 rounded-t-lg flex items-center justify-between`}>
              <div>
                <h2 className="text-xl font-bold">{playerName}'s Cards Used</h2>
                <p className="text-sm opacity-90 mt-1">
                  {deck.length} unique cards • {totalCards} estimated total
                </p>
                <p className="text-xs opacity-75 mt-1">
                  Based on cards seen during battle (quantities estimated)
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Deck List */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {deck.map((card, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {/* Quantity Badge */}
                      <div className={`${playerColor === 'blue' ? 'bg-blue-600' : 'bg-red-600'} text-white font-bold text-sm px-3 py-1 rounded-md min-w-[2.5rem] text-center`}>
                        {card.quantity}×
                      </div>

                      {/* Card Name */}
                      <div className="flex-1">
                        {card.webCardId ? (
                          <Link
                            href={`/cards/${card.webCardId}`}
                            className="text-gray-800 hover:text-purple-600 font-medium transition-colors"
                            onClick={() => setIsOpen(false)}
                          >
                            {card.name}
                          </Link>
                        ) : (
                          <span className="text-gray-800 font-medium">
                            {card.name}
                          </span>
                        )}
                      </div>

                      {/* View Card Link */}
                      {card.webCardId && (
                        <Link
                          href={`/cards/${card.webCardId}`}
                          className="text-purple-600 hover:text-purple-700 p-2 rounded-lg hover:bg-purple-50 transition-colors"
                          title="View card details"
                          onClick={() => setIsOpen(false)}
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Statistics Footer */}
              <div className="mt-6 pt-4 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="bg-slate-100 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-800">{deck.length}</div>
                    <div className="text-sm text-gray-600">Unique Cards</div>
                  </div>
                  <div className="bg-slate-100 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-800">{totalCards}</div>
                    <div className="text-sm text-gray-600">Total Cards</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 rounded-b-lg">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
