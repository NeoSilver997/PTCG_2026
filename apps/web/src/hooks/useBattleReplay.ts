import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BattleLogDTO,
  BattleAction,
  GameState,
  PlayerState,
  CardInstance,
} from '@ptcg/shared-types';

export interface ReplayControls {
  play: () => void;
  pause: () => void;
  seekToAction: (index: number) => void;
  nextAction: () => void;
  prevAction: () => void;
  setSpeed: (speed: number) => void;
  restart: () => void;
}

export interface ReplayState {
  currentAction: BattleAction | null;
  currentActionIndex: number;
  gameState: GameState;
  isPlaying: boolean;
  playbackSpeed: number;
  progress: number;
  controls: ReplayControls;
}

const PLAYBACK_INTERVAL = 1000; // Base interval in ms

export function useBattleReplay(battleLog: BattleLogDTO | undefined): ReplayState {
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const totalActions = battleLog?.actions.length || 0;

  // Compute game state at current action
  const gameState = useMemo(() => {
    if (!battleLog) return getInitialGameState();
    return computeGameStateAtAction(battleLog, currentActionIndex);
  }, [battleLog, currentActionIndex]);

  const currentAction = battleLog?.actions[currentActionIndex] || null;
  const progress = totalActions > 0 ? currentActionIndex / totalActions : 0;

  // Auto-advance when playing
  useEffect(() => {
    if (!isPlaying || !battleLog) return;

    const interval = setInterval(() => {
      setCurrentActionIndex((prev) => {
        if (prev + 1 >= battleLog.actions.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, PLAYBACK_INTERVAL / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, battleLog]);

  const controls: ReplayControls = {
    play: useCallback(() => setIsPlaying(true), []),
    pause: useCallback(() => setIsPlaying(false), []),
    seekToAction: useCallback((index: number) => {
      setCurrentActionIndex(Math.max(0, Math.min(index, totalActions - 1)));
      setIsPlaying(false);
    }, [totalActions]),
    nextAction: useCallback(() => {
      setCurrentActionIndex((prev) => Math.min(prev + 1, totalActions - 1));
      setIsPlaying(false);
    }, [totalActions]),
    prevAction: useCallback(() => {
      setCurrentActionIndex((prev) => Math.max(prev - 1, 0));
      setIsPlaying(false);
    }, []),
    setSpeed: useCallback((speed: number) => setPlaybackSpeed(speed), []),
    restart: useCallback(() => {
      setCurrentActionIndex(0);
      setIsPlaying(false);
    }, []),
  };

  return {
    currentAction,
    currentActionIndex,
    gameState,
    isPlaying,
    playbackSpeed,
    progress,
    controls,
  };
}

function getInitialGameState(): GameState {
  return {
    player1: {
      name: '',
      active: null,
      bench: [],
      hand: [],
      deck: 60,
      prizes: 6,
      discardPile: [],
    },
    player2: {
      name: '',
      active: null,
      bench: [],
      hand: [],
      deck: 60,
      prizes: 6,
      discardPile: [],
    },
    stadium: null,
    currentTurn: 0,
    currentPlayer: 'player1',
  };
}

function computeGameStateAtAction(
  battleLog: BattleLogDTO,
  actionIndex: number
): GameState {
  const state: GameState = {
    player1: {
      name: battleLog.player1Name,
      active: null,
      bench: [],
      hand: [],
      deck: 60,
      prizes: 6,
      discardPile: [],
    },
    player2: {
      name: battleLog.player2Name,
      active: null,
      bench: [],
      hand: [],
      deck: 60,
      prizes: 6,
      discardPile: [],
    },
    stadium: null,
    currentTurn: 0,
    currentPlayer: 'player1',
  };

  // Process actions up to current index
  for (let i = 0; i <= actionIndex && i < battleLog.actions.length; i++) {
    const action = battleLog.actions[i];
    const player = state[action.player];

    state.currentTurn = action.turnNumber;
    state.currentPlayer = action.player;

    switch (action.actionType) {
      case 'DRAW':
        const drawCount = action.metadata?.count || 1;
        const drawnCardNames = action.metadata?.cardNames as string[] | undefined;
        
        if (drawnCardNames && drawnCardNames.length > 0) {
          // Add specific cards to hand
          drawnCardNames.forEach(cardName => {
            player.hand.push({ name: cardName, webCardId: action.cardWebId });
          });
        } else {
          // Add generic cards
          for (let i = 0; i < drawCount; i++) {
            player.hand.push({ name: 'Card', webCardId: undefined });
          }
        }
        player.deck = Math.max(0, player.deck - drawCount);
        break;

      case 'PLAY_POKEMON':
        const position = action.metadata?.position as 'active' | 'bench' | undefined;
        
        // Debug logging
        if (i <= 20) {
          console.log(`Action ${i}: PLAY_POKEMON`, {
            player: action.player,
            cardName: action.cardName,
            position,
            metadata: action.metadata,
            details: action.details
          });
        }
        
        const newPokemon: CardInstance = {
          webCardId: action.cardWebId,
          name: action.cardName,
          hp: 100, // Default, would need card data for actual HP
          maxHp: 100,
          damageCounters: 0,
          attachedCards: [],
          evolution: null,
          position: position || 'bench',
          benchIndex: position === 'bench' ? player.bench.length : undefined,
        };

        if (position === 'active') {
          player.active = newPokemon;
          console.log(`Set ${action.player} active:`, newPokemon.name);
        } else {
          player.bench.push(newPokemon);
          console.log(`Added to ${action.player} bench:`, newPokemon.name);
        }
        // Remove from hand
        if (player.hand.length > 0) {
          player.hand.pop();
        }
        break;

      case 'ATTACH_ENERGY':
      case 'ATTACH_TOOL':
        // Find target Pokémon and attach energy/tool
        const target = findPokemonByName(player, action.targetCardName || '');
        if (target) {
          target.attachedCards.push({ name: action.cardName, webCardId: action.cardWebId });
        }
        // Remove from hand
        if (player.hand.length > 0) {
          player.hand.pop();
        }
        break;

      case 'EVOLVE':
        // Replace Pokémon with evolution
        const evolveTarget = findPokemonByName(player, action.targetCardName || '');
        if (evolveTarget) {
          evolveTarget.name = action.cardName;
          evolveTarget.webCardId = action.cardWebId;
          evolveTarget.evolution = action.targetCardName || null;
        }
        // Remove from hand
        if (player.hand.length > 0) {
          player.hand.pop();
        }
        break;

      case 'ATTACK':
        // Apply damage to opponent's Pokémon
        const opponent = action.player === 'player1' ? state.player2 : state.player1;
        const defendingPokemon = findPokemonByName(opponent, action.targetCardName || '');
        if (defendingPokemon && action.damage) {
          defendingPokemon.damageCounters += action.damage / 10; // Damage counters = damage / 10
        }
        break;

      case 'KNOCKOUT':
        // Remove Pokémon from play and add to discard
        const knockedOut = removePokemon(player, action.cardName);
        if (knockedOut) {
          player.discardPile.push({ name: knockedOut.name, webCardId: knockedOut.webCardId });
          // Add attached cards to discard
          knockedOut.attachedCards.forEach((card: { name: string; webCardId?: string }) => {
            player.discardPile.push(card);
          });
          
          // If active was knocked out, look ahead to find next active or promote from bench
          if (!player.active && knockedOut.position === 'active') {
            // Look ahead in next few actions to find what becomes active
            for (let j = i + 1; j < Math.min(i + 5, battleLog.actions.length); j++) {
              const nextAction = battleLog.actions[j];
              if (nextAction.player !== action.player) continue;
              
              // Check if next action references a Pokémon
              if ((nextAction.actionType === 'ATTACK' || nextAction.actionType === 'ABILITY') && nextAction.cardName) {
                const benchPokemon = player.bench.find((p: CardInstance) => p.name === nextAction.cardName);
                if (benchPokemon) {
                  player.active = benchPokemon;
                  player.bench = player.bench.filter((p: CardInstance) => p !== benchPokemon);
                  player.active.position = 'active';
                  break;
                }
              }
            }
            
            // If no new active found, promote first bench Pokémon if available
            if (!player.active && player.bench.length > 0) {
              player.active = player.bench[0];
              player.bench.splice(0, 1);
              player.active.position = 'active';
            }
          }
        }
        break;

      case 'PRIZE':
        const prizeCount = action.metadata?.count || 1;
        const prizeCardNames = action.metadata?.cardNames as string[] | undefined;
        
        player.prizes = Math.max(0, player.prizes - prizeCount);
        
        // Add prize cards to hand
        if (prizeCardNames && prizeCardNames.length > 0) {
          prizeCardNames.forEach(cardName => {
            player.hand.push({ name: cardName, webCardId: undefined });
          });
        } else {
          for (let i = 0; i < prizeCount; i++) {
            player.hand.push({ name: 'Prize Card', webCardId: undefined });
          }
        }
        break;

      case 'RETREAT':
        // Move active to bench, then look ahead to see what becomes active
        if (player.active) {
          player.active.position = 'bench';
          player.bench.push(player.active);
          player.active = null;
        }
        
        // Look ahead in next few actions to find what becomes active
        for (let j = i + 1; j < Math.min(i + 5, battleLog.actions.length); j++) {
          const nextAction = battleLog.actions[j];
          if (nextAction.player !== action.player) continue;
          
          // Check if next action references a Pokémon (attack, ability, etc.)
          if ((nextAction.actionType === 'ATTACK' || nextAction.actionType === 'ABILITY') && nextAction.cardName) {
            const benchPokemon = player.bench.find((p: CardInstance) => p.name === nextAction.cardName);
            if (benchPokemon) {
              player.active = benchPokemon;
              player.bench = player.bench.filter((p: CardInstance) => p !== benchPokemon);
              player.active.position = 'active';
              break;
            }
          }
        }
        
        // If no new active found, promote first bench Pokémon if available
        if (!player.active && player.bench.length > 0) {
          player.active = player.bench[0];
          player.bench.splice(0, 1);
          player.active.position = 'active';
        }
        break;

      case 'PLAY_TRAINER':
        // Remove from hand
        if (player.hand.length > 0) {
          player.hand.pop();
        }
        // Add to discard
        player.discardPile.push({ name: action.cardName, webCardId: action.cardWebId });
        // Handle stadium
        if (action.details?.includes('Stadium')) {
          state.stadium = action.cardName;
        }
        break;

      case 'DISCARD':
        // Remove from hand and add to discard
        if (player.hand.length > 0) {
          player.hand.pop();
        }
        player.discardPile.push({ name: action.cardName, webCardId: action.cardWebId });
        break;

      case 'SHUFFLE':
        // No state change for shuffle
        break;

      case 'ABILITY':
      case 'CHECKUP':
        // Complex effects, would need detailed parsing
        break;
    }
  }

  // Debug: Log final state
  console.log(`Final state at action ${actionIndex}:`, {
    player1: {
      name: state.player1.name,
      active: state.player1.active?.name || 'NONE',
      benchCount: state.player1.bench.length,
      bench: state.player1.bench.map(p => p.name)
    },
    player2: {
      name: state.player2.name,
      active: state.player2.active?.name || 'NONE',
      benchCount: state.player2.bench.length,
      bench: state.player2.bench.map(p => p.name)
    }
  });

  return state;
}

function findPokemonByName(player: PlayerState, name: string): CardInstance | null {
  if (player.active?.name === name) {
    return player.active;
  }
  return player.bench.find((p: CardInstance) => p.name === name) || null;
}

function removePokemon(player: PlayerState, name: string): CardInstance | null {
  if (player.active?.name === name) {
    const removed = player.active;
    player.active = null;
    return removed;
  } else {
    const index = player.bench.findIndex((p: CardInstance) => p.name === name);
    if (index >= 0) {
      const removed = player.bench[index];
      player.bench.splice(index, 1);
      return removed;
    }
  }
  return null;
}
