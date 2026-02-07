import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BattleAction, BattleActionType } from '@ptcg/shared-types';

interface ParsedMetadata {
  player1Name: string;
  player2Name: string;
  winnerName: string | null;
  turnCount: number;
}

interface ParseResult {
  metadata: ParsedMetadata;
  actions: BattleAction[];
}

@Injectable()
export class BattleLogParser {
  private readonly logger = new Logger(BattleLogParser.name);
  private readonly cardNameCache = new Map<string, string>();

  constructor(private prisma: PrismaService) {}

  async parseLogText(rawLog: string): Promise<ParseResult> {
    const lines = rawLog.split('\n').map((line) => line.trim()).filter(Boolean);
    
    const metadata = this.extractMetadata(rawLog);
    const actions: BattleAction[] = [];
    
    let currentTurn = 0;
    let currentPlayer: 'player1' | 'player2' = 'player1';
    let actionCounter = 0;
    let timestamp = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect turn changes
      if (line.includes("'s Turn")) {
        currentTurn++;
        const playerName = line.replace("'s Turn", '').trim();
        currentPlayer = playerName === metadata.player1Name ? 'player1' : 'player2';
        continue;
      }
      
      // Parse setup phase
      if (line.includes('Setup')) {
        currentTurn = 0;
        currentPlayer = 'player1';
        continue;
      }
      
      // Parse various actions
      const action = this.parseAction(
        line,
        currentTurn,
        currentPlayer,
        timestamp,
        actionCounter++,
        metadata
      );
      
      if (action) {
        actions.push(action);
        timestamp += 200; // 200ms between actions for replay
      }
    }
    
    // Enrich with card data
    await this.enrichWithCardData(actions);
    
    return { metadata, actions };
  }
  
  private extractMetadata(rawLog: string): ParsedMetadata {
    const lines = rawLog.split('\n');
    let player1Name = '';
    let player2Name = '';
    let winnerName: string | null = null;
    let turnCount = 0;
    
    // Find player names from initial setup
    for (const line of lines) {
      // Coin flip winner pattern
      if (line.includes('won the coin toss') || line.includes('chose heads')) {
        const match = line.match(/^(\w+)\s+(chose|won)/);
        if (match && !player1Name) {
          player1Name = match[1];
        }
      }
      
      // Second player from turn marker
      if (line.includes("'s Turn") && player1Name) {
        const match = line.match(/^(\w+)'s Turn/);
        if (match && match[1] !== player1Name && !player2Name) {
          player2Name = match[1];
        }
      }
      
      // Winner detection
      if (line.includes('wins')) {
        const match = line.match(/(\w+)\s+wins/);
        if (match) {
          winnerName = match[1];
        }
      }
      
      // Count turns
      if (line.includes("'s Turn")) {
        turnCount++;
      }
    }
    
    // Adjust turn count (divide by 2 since each turn is counted per player)
    turnCount = Math.ceil(turnCount / 2);
    
    return { player1Name, player2Name, winnerName, turnCount };
  }
  
  private parseAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    // Drew cards
    if (line.includes('drew') && line.includes('card')) {
      return this.parseDrawAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Played Pokémon
    if (line.match(/played .+ to the (Active Spot|Bench)/)) {
      return this.playPokemonAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Attached energy
    if (line.includes('attached') && line.includes('Energy')) {
      return this.parseAttachEnergyAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Used attack
    if (line.includes('used') && line.includes('on') && line.includes('damage')) {
      return this.parseAttackAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Evolved
    if (line.includes('evolved')) {
      return this.parseEvolveAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Knocked out
    if (line.includes('was Knocked Out')) {
      return this.parseKnockoutAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Took prize
    if (line.includes('took a Prize card') || line.includes('took') && line.includes('Prize cards')) {
      return this.parsePrizeAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Played trainer (Item/Supporter/Stadium)
    if (line.match(/played \w+\./)) {
      return this.parseTrainerAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Retreated
    if (line.includes('retreated')) {
      return this.parseRetreatAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Ability used
    if (line.includes('used') && !line.includes('damage')) {
      return this.parseAbilityAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    // Discarded
    if (line.includes('discarded')) {
      return this.parseDiscardAction(line, turnNumber, player, timestamp, actionId, metadata);
    }
    
    return null;
  }
  
  private parseDrawAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction {
    const match = line.match(/(\w+)\s+drew\s+(\d+)?\s*(?:a\s+)?(card)/i);
    const count = match && match[2] ? parseInt(match[2]) : 1;
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'DRAW',
      cardName: `${count} card${count > 1 ? 's' : ''}`,
      details: line,
      metadata: { count }
    };
  }
  
  private playPokemonAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/(\w+)\s+played\s+([^t]+?)\s+to the (Active Spot|Bench)/);
    if (!match) return null;
    
    const cardName = match[2].trim();
    const position = match[3] === 'Active Spot' ? 'active' : 'bench';
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'PLAY_POKEMON',
      cardName,
      details: line,
      metadata: { position }
    };
  }
  
  private parseAttachEnergyAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/attached\s+(.+?Energy)\s+to\s+(.+?)\s+(?:in the Active Spot|on the Bench)/);
    if (!match) return null;
    
    const energyName = match[1].trim();
    const targetName = match[2].trim();
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'ATTACH_ENERGY',
      cardName: energyName,
      targetCardName: targetName,
      details: line
    };
  }
  
  private parseAttackAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/(.+?)'s\s+(.+?)\s+used\s+(.+?)\s+on\s+(.+?)'s\s+(.+?)\s+for\s+(\d+)\s+damage/);
    if (!match) return null;
    
    const attackerName = match[2].trim();
    const attackName = match[3].trim();
    const targetName = match[5].trim();
    const damage = parseInt(match[6]);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'ATTACK',
      cardName: attackerName,
      targetCardName: targetName,
      damage,
      details: line,
      metadata: { attackName }
    };
  }
  
  private parseEvolveAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/evolved\s+(.+?)\s+to\s+(.+?)\s+(?:in the Active Spot|on the Bench)/);
    if (!match) return null;
    
    const fromName = match[1].trim();
    const toName = match[2].trim();
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'EVOLVE',
      cardName: toName,
      targetCardName: fromName,
      details: line
    };
  }
  
  private parseKnockoutAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/(.+?)'s\s+(.+?)\s+was Knocked Out/);
    if (!match) return null;
    
    const ownerName = match[1].trim();
    const cardName = match[2].trim();
    
    // Determine which player's Pokémon was knocked out
    const knockedOutPlayer = ownerName === metadata.player1Name ? 'player1' : 'player2';
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: knockedOutPlayer,
      actionType: 'KNOCKOUT',
      cardName,
      details: line
    };
  }
  
  private parsePrizeAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/(\w+)\s+took\s+(?:a\s+Prize\s+card|(\d+)\s+Prize\s+cards)/);
    if (!match) return null;
    
    const count = match[2] ? parseInt(match[2]) : 1;
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'PRIZE',
      cardName: `${count} Prize card${count > 1 ? 's' : ''}`,
      details: line,
      metadata: { count }
    };
  }
  
  private parseTrainerAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/played\s+(.+?)\./);
    if (!match) return null;
    
    const cardName = match[1].trim();
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'PLAY_TRAINER',
      cardName,
      details: line
    };
  }
  
  private parseRetreatAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/retreated\s+(.+?)\s+to the Bench/);
    if (!match) return null;
    
    const cardName = match[1].trim();
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'RETREAT',
      cardName,
      details: line
    };
  }
  
  private parseAbilityAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/(.+?)'s\s+(.+?)\s+used\s+(.+?)\./);
    if (!match) return null;
    
    const cardName = match[2].trim();
    const abilityName = match[3].trim();
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'ABILITY',
      cardName,
      details: line,
      metadata: { abilityName }
    };
  }
  
  private parseDiscardAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata
  ): BattleAction | null {
    const match = line.match(/discarded\s+(.+?)(?:\.|$)/);
    if (!match) return null;
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'DISCARD',
      cardName: match[1].trim(),
      details: line
    };
  }
  
  async enrichWithCardData(actions: BattleAction[]): Promise<void> {
    for (const action of actions) {
      if (action.cardName && !action.cardWebId) {
        const webCardId = await this.resolveCardName(action.cardName);
        if (webCardId) {
          action.cardWebId = webCardId;
        }
      }
      
      if (action.targetCardName && !action.targetWebId) {
        const webCardId = await this.resolveCardName(action.targetCardName);
        if (webCardId) {
          action.targetWebId = webCardId;
        }
      }
    }
  }
  
  async resolveCardName(cardName: string): Promise<string | null> {
    // Check cache first
    if (this.cardNameCache.has(cardName)) {
      return this.cardNameCache.get(cardName);
    }
    
    try {
      // Search for card by name (case-insensitive, partial match)
      // Priority: EN > JP > HK
      const card = await this.prisma.card.findFirst({
        where: {
          name: {
            contains: cardName,
            mode: 'insensitive',
          },
        },
        orderBy: [
          { language: 'asc' },  // EN first (Language enum order)
          { createdAt: 'desc' },
        ],
        select: {
          webCardId: true,
        },
      });
      
      const webCardId = card?.webCardId ?? null;
      
      // Cache the result
      this.cardNameCache.set(cardName, webCardId);
      
      return webCardId;
    } catch (error) {
      this.logger.warn(`Failed to resolve card name: ${cardName}`, error);
      return null;
    }
  }
}
