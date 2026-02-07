import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BattleAction, BattleActionType, DeckCard } from '@ptcg/shared-types';

interface ParsedMetadata {
  player1Name: string;
  player2Name: string;
  winnerName: string | null;
  turnCount: number;
}

interface ParseResult {
  metadata: ParsedMetadata;
  actions: BattleAction[];
  player1Deck: DeckCard[];
  player2Deck: DeckCard[];
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
        metadata,
        lines,
        i
      );
      
      if (action) {
        actions.push(action);
        timestamp += 200; // 200ms between actions for replay
      }
    }
    
    // Enrich with card data
    await this.enrichWithCardData(actions);
    
    // Extract deck lists from actions
    const { player1Deck, player2Deck } = await this.extractDeckLists(actions, metadata);
    
    return { metadata, actions, player1Deck, player2Deck };
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
    metadata: ParsedMetadata,
    lines: string[],
    currentIndex: number
  ): BattleAction | null {
    // Drew cards
    if (line.includes('drew') && line.includes('card')) {
      return this.parseDrawAction(line, turnNumber, player, timestamp, actionId, metadata, lines, currentIndex);
    }
    
    // Took prize cards
    if (line.includes('took') && line.includes('Prize')) {
      return this.parsePrizeAction(line, turnNumber, player, timestamp, actionId, metadata, lines, currentIndex);
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
    metadata: ParsedMetadata,
    lines: string[],
    currentIndex: number
  ): BattleAction {
    // Extract specific card name if format is "drew CardName"
    const specificCardMatch = line.match(/drew\s+([A-Z][^.]+?)\s*\./i);
    const countMatch = line.match(/(\w+)\s+drew\s+(\d+)?\s*(?:a\s+)?(card)/i);
    const count = countMatch && countMatch[2] ? parseInt(countMatch[2]) : 1;
    
    let cardNames: string[] = [];
    
    // Check if specific card name is mentioned in draw line
    if (specificCardMatch && !line.includes('drew a card') && !line.includes('drew card')) {
      cardNames = [specificCardMatch[1].trim()];
    } else {
      // Look ahead for bullet point list of cards
      for (let i = currentIndex + 1; i < Math.min(currentIndex + 10, lines.length); i++) {
        const nextLine = lines[i];
        if (nextLine.startsWith('•')) {
          // Parse card names from bullet list: "• Card1, Card2, Card3"
          const cardsLine = nextLine.replace('•', '').trim();
          cardNames = cardsLine.split(',').map(c => c.trim());
          break;
        }
        // Stop looking if we hit another action or turn
        if (!nextLine.startsWith('-') && !nextLine.includes('drawn cards')) {
          break;
        }
      }
    }
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'DRAW',
      cardName: cardNames.length > 0 ? cardNames[0] : `${count} card${count > 1 ? 's' : ''}`,
      details: line,
      metadata: { count, cardNames: cardNames.length > 0 ? cardNames : undefined }
    };
  }
  
  private parsePrizeAction(
    line: string,
    turnNumber: number,
    player: 'player1' | 'player2',
    timestamp: number,
    actionId: number,
    metadata: ParsedMetadata,
    lines: string[],
    currentIndex: number
  ): BattleAction | null {
    const match = line.match(/(\d+)\s+Prize/i);
    const count = match ? parseInt(match[1]) : 1;
    
    // Look for cards revealed from prize
    let cardNames: string[] = [];
    for (let i = currentIndex + 1; i < Math.min(currentIndex + count + 5, lines.length); i++) {
      const nextLine = lines[i];
      if (nextLine.includes('was added to') && nextLine.includes('hand')) {
        const cardMatch = nextLine.match(/([A-Z][^w]+)\s+was added/i);
        if (cardMatch) {
          cardNames.push(cardMatch[1].trim());
        }
      }
      if (nextLine.includes("'s Turn") || nextLine.includes('is now in the Active Spot')) {
        break;
      }
    }
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player,
      actionType: 'PRIZE',
      cardName: `Prize card${count > 1 ? 's' : ''}`,
      details: line,
      metadata: { count, cardNames: cardNames.length > 0 ? cardNames : undefined }
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
      return this.cardNameCache.get(cardName) ?? null;
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
      
      // Cache the result (only cache if found)
      if (webCardId) {
        this.cardNameCache.set(cardName, webCardId);
      }
      
      return webCardId;
    } catch (error) {
      this.logger.warn(`Failed to resolve card name: ${cardName}`, error);
      return null;
    }
  }

  /**
   * Extract complete deck lists for both players from battle actions
   */
  private async extractDeckLists(
    actions: BattleAction[],
    metadata: ParsedMetadata,
  ): Promise<{ player1Deck: DeckCard[]; player2Deck: DeckCard[] }> {
    const player1Cards = new Map<string, number>();
    const player2Cards = new Map<string, number>();

    // Scan all actions to find cards used by each player
    for (const action of actions) {
      const player = action.player;
      const cardMap = player === 'player1' ? player1Cards : player2Cards;
      
      // Add main card from action
      if (action.cardName && action.cardName !== 'Unknown Card') {
        const currentCount = cardMap.get(action.cardName) || 0;
        cardMap.set(action.cardName, currentCount + 1);
      }
      
      // Add cards from metadata (e.g., drawn cards, revealed cards)
      if (action.metadata?.cardNames && Array.isArray(action.metadata.cardNames)) {
        for (const cardName of action.metadata.cardNames) {
          if (cardName && cardName !== 'Card') {
            const currentCount = cardMap.get(cardName) || 0;
            cardMap.set(cardName, currentCount + 1);
          }
        }
      }
    }

    // Convert maps to DeckCard arrays and resolve webCardIds
    const player1Deck = await this.buildDeckList(player1Cards);
    const player2Deck = await this.buildDeckList(player2Cards);

    this.logger.log(
      `Extracted decks: ${metadata.player1Name} (${player1Deck.length} unique cards), ${metadata.player2Name} (${player2Deck.length} unique cards)`,
    );

    return { player1Deck, player2Deck };
  }

  /**
   * Build a deck list from card name counts and resolve webCardIds
   */
  private async buildDeckList(cardCounts: Map<string, number>): Promise<DeckCard[]> {
    const deckList: DeckCard[] = [];

    for (const [cardName, quantity] of cardCounts.entries()) {
      // Resolve card to webCardId
      const webCardId = await this.resolveCardName(cardName);
      
      deckList.push({
        name: cardName,
        quantity,
        webCardId: webCardId ?? undefined,
      });
    }

    // Sort by quantity (descending), then by name
    deckList.sort((a, b) => {
      if (b.quantity !== a.quantity) {
        return b.quantity - a.quantity;
      }
      return a.name.localeCompare(b.name);
    });

    return deckList;
  }
}
