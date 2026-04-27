'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Calendar, Trophy, Users, Sword, Shield, Zap, MapPin } from 'lucide-react';
import apiClient from '@/lib/api-client';

interface DeckCard {
  cardId: string;
  cardName: string;
  quantity: number;
  imageUrl?: string;
}

interface DeckInfo {
  id: string;
  deckCode?: string;
  deckData?: DeckCard[];
}

interface TournamentResult {
  id: string;
  placement: number;
  playerName: string;
  deckName?: string;
  deck?: DeckInfo;
}

interface Tournament {
  id: string;
  eventId: string;
  name: string;
  date: string;
  location?: string;
  region: string;
  results: TournamentResult[];
}

interface DeckAnalysis {
  mainAttacker: string;
  supporter: string;
  energyMethod: string;
  setupMethod: string;
}

function analyzeDeck(deckData?: DeckCard[]): DeckAnalysis {
  if (!deckData) {
    return {
      mainAttacker: 'Unknown',
      supporter: 'Unknown',
      energyMethod: 'Unknown',
      setupMethod: 'Unknown',
    };
  }

  // Find Pokemon cards (exclude energy and trainer cards)
  const pokemonCards = deckData.filter(card =>
    card.cardName &&
    !card.cardName.toLowerCase().includes('energy') &&
    !card.cardName.toLowerCase().includes('stadium') &&
    !card.cardName.toLowerCase().includes('supporter') &&
    !card.cardName.toLowerCase().includes('item') &&
    !card.cardName.toLowerCase().includes('tool') &&
    !card.cardName.toLowerCase().includes('trainer')
  );

  // Sort Pokemon by priority: EX first, then evolution stage, then quantity
  const sortedPokemon = pokemonCards
    .sort((a, b) => {
      const aIsEx = a.cardName.toLowerCase().includes('ex');
      const bIsEx = b.cardName.toLowerCase().includes('ex');
      if (aIsEx && !bIsEx) return -1;
      if (!aIsEx && bIsEx) return 1;

      // Then by quantity
      return b.quantity - a.quantity;
    });

  const mainAttacker = sortedPokemon[0]?.cardName || 'Unknown';
  const supporter = sortedPokemon[1]?.cardName || sortedPokemon[0]?.cardName || 'Unknown';

  // Energy method based on energy cards
  const energyCards = deckData.filter(card =>
    card.cardName && card.cardName.toLowerCase().includes('energy')
  );

  let energyMethod = 'Basic Energy';
  if (energyCards.length > 0) {
    const specialEnergy = energyCards.filter(c => !c.cardName.toLowerCase().includes('basic'));
    if (specialEnergy.length > 0) {
      energyMethod = specialEnergy.map(c => `${c.cardName} (${c.quantity})`).join(', ');
    } else {
      energyMethod = `${energyCards.length} Basic Energy types`;
    }
  }

  // Setup method based on trainer cards
  const trainerCards = deckData.filter(card =>
    card.cardName && (
      card.cardName.toLowerCase().includes('stadium') ||
      card.cardName.toLowerCase().includes('supporter') ||
      card.cardName.toLowerCase().includes('item') ||
      card.cardName.toLowerCase().includes('tool')
    )
  );

  let setupMethod = 'Standard Setup';
  if (trainerCards.length > 0) {
    const stadiums = trainerCards.filter(c => c.cardName.toLowerCase().includes('stadium'));
    const supporters = trainerCards.filter(c => c.cardName.toLowerCase().includes('supporter'));
    const items = trainerCards.filter(c => c.cardName.toLowerCase().includes('item') || c.cardName.toLowerCase().includes('tool'));

    const parts = [];
    if (stadiums.length > 0) parts.push(`${stadiums.length} Stadium${stadiums.length > 1 ? 's' : ''}`);
    if (supporters.length > 0) parts.push(`${supporters.length} Supporter${supporters.length > 1 ? 's' : ''}`);
    if (items.length > 0) parts.push(`${items.length} Item${items.length > 1 ? 's' : ''}`);

    if (parts.length > 0) {
      setupMethod = parts.join(', ');
    }
  }

  return {
    mainAttacker,
    supporter,
    energyMethod,
    setupMethod,
  };
}

export default function TournamentSummaryPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tournament-summary'],
    queryFn: async () => {
      // Get recent tournaments
      const tournamentsResponse = await apiClient.get('/tournaments', {
        params: { take: 3, sortBy: 'date', sortOrder: 'desc' },
      });

      const tournaments: Tournament[] = tournamentsResponse.data?.data || [];

      // For each tournament, get full details
      const detailedTournaments = await Promise.all(
        tournaments.map(async (tournament) => {
          try {
            const detailResponse = await apiClient.get(`/tournaments/${tournament.id}`);
            return detailResponse.data;
          } catch {
            // Fallback to basic info if detail API fails
            return tournament;
          }
        })
      );

      return detailedTournaments;
    },
  });

  const tournaments: Tournament[] = data || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading tournament summary...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <p className="text-red-800">Failed to load tournament summary</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tournament Summary</h1>
          <p className="text-gray-600">Last 3 tournaments - Top 3 decks analysis</p>
        </div>

        <div className="space-y-8">
          {tournaments.map((tournament) => {
            // Get top 3 results
            const topResults = tournament.results
              ?.sort((a, b) => a.placement - b.placement)
              ?.slice(0, 3) || [];

            return (
              <div key={tournament.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-blue-600 text-white p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">{tournament.name}</h2>
                      <div className="flex items-center gap-4 mt-2 text-blue-100">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(tournament.date).toLocaleDateString()}
                        </div>
                        {tournament.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {tournament.location}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {tournament.results?.length || 0} players
                        </div>
                      </div>
                    </div>
                    <Link
                      href={`/deck-builder/tournaments/${tournament.eventId}`}
                      className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      View Full Results
                    </Link>
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Top 3 Decks
                  </h3>

                  <div className="space-y-4">
                    {topResults.map((result, index) => {
                      const analysis = analyzeDeck(result.deck?.deckData);

                      return (
                        <div key={result.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                                index === 0 ? 'bg-yellow-500' :
                                index === 1 ? 'bg-gray-400' :
                                'bg-orange-600'
                              }`}>
                                {result.placement}
                              </div>
                              <div>
                                <p className="font-semibold">{result.playerName}</p>
                                {result.deckName && (
                                  <p className="text-sm text-gray-600">{result.deckName}</p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <Sword className="h-4 w-4 text-blue-600" />
                                <span className="text-sm font-medium text-blue-800">主攻寶可夢</span>
                              </div>
                              <p className="text-sm text-blue-700">{analysis.mainAttacker}</p>
                            </div>

                            <div className="bg-green-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <Shield className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-medium text-green-800">輔助寶可夢</span>
                              </div>
                              <p className="text-sm text-green-700">{analysis.supporter}</p>
                            </div>

                            <div className="bg-purple-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <Zap className="h-4 w-4 text-purple-600" />
                                <span className="text-sm font-medium text-purple-800">填能方式</span>
                              </div>
                              <p className="text-sm text-purple-700">{analysis.energyMethod}</p>
                            </div>

                            <div className="bg-orange-50 p-3 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <MapPin className="h-4 w-4 text-orange-600" />
                                <span className="text-sm font-medium text-orange-800">鋪場方式</span>
                              </div>
                              <p className="text-sm text-orange-700">{analysis.setupMethod}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {tournaments.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No tournaments found</p>
          </div>
        )}
      </div>
    </div>
  );
}