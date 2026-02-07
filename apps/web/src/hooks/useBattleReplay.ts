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
      hand: 7,
      deck: 60,
      prizes: 6,
      discard: 0,
    },
    player2: {
      name: '',
      active: null,
      bench: [],
      hand: 7,
      deck: 60,
      prizes: 6,
      discard: 0,
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
      hand: 7,
      deck: 60,
      prizes: 6,
      discard: 0,
    },
    player2: {
      name: battleLog.player2Name,
      active: null,
      bench: [],
      hand: 7,
      deck: 60,
      prizes: 6,
      discard: 0,
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
        player.hand += drawCount;
        player.deck = Math.max(0, player.deck - drawCount);
        break;

      case 'PLAY_POKEMON':
        const position = action.metadata?.position as 'active' | 'bench';
        const newPokemon: CardInstance = {
          webCardId: action.cardWebId,
          name: action.cardName,
          hp: 100, // Default, would need card data for actual HP
          maxHp: 100,
          damageCounters: 0,
          attachedCards: [],
          evolution: null,
          position,
          benchIndex: position === 'bench' ? player.bench.length : undefined,
        };

        if (position === 'active') {
          player.active = newPokemon;
        } else {
          player.bench.push(newPokemon);
        }
        player.hand = Math.max(0, player.hand - 1);
        break;

      case 'ATTACH_ENERGY':
        // Find target Pokémon and attach energy
        const target = findPokemonByName(player, action.targetCardName || '');
        if (target) {
          target.attachedCards.push(action.cardName);
        }
        player.hand = Math.max(0, player.hand - 1);
        break;

      case 'EVOLVE':
        // Replace Pokémon with evolution
        const evolveTarget = findPokemonByName(player, action.targetCardName || '');
        if (evolveTarget) {
          evolveTarget.name = action.cardName;
          evolveTarget.evolution = action.targetCardName || null;
        }
        player.hand = Math.max(0, player.hand - 1);
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
        // Remove Pokémon from play
        removePokemon(player, action.cardName);
        player.discard++;
        break;

      case 'PRIZE':
        const prizeCount = action.metadata?.count || 1;
        player.prizes = Math.max(0, player.prizes - prizeCount);
        player.hand += prizeCount;
        break;

      case 'RETREAT':
        // Move active to bench, new active should be in next action
        if (player.active) {
          player.active.position = 'bench';
          player.bench.push(player.active);
          player.active = null;
        }
        break;

      case 'PLAY_TRAINER':
        player.hand = Math.max(0, player.hand - 1);
        player.discard++;
        break;

      case 'DISCARD':
        player.hand = Math.max(0, player.hand - 1);
        player.discard++;
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

  return state;
}

function findPokemonByName(player: PlayerState, name: string): CardInstance | null {
  if (player.active?.name === name) {
    return player.active;
  }
  return player.bench.find((p) => p.name === name) || null;
}

function removePokemon(player: PlayerState, name: string): void {
  if (player.active?.name === name) {
    player.active = null;
  } else {
    player.bench = player.bench.filter((p) => p.name !== name);
  }
}
