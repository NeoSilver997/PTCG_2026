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

    // Find player names from coin toss
    let coinTossWinner = '';
    let coinTossChooser = '';

    for (const line of lines) {
      // Coin toss winner
      if (line.includes('won the coin toss')) {
        const match = line.match(/^(\w+)\s+won/);
        if (match) {
          coinTossWinner = match[1];
        }
      }

      // Coin toss chooser
      if (line.includes('chose heads') || line.includes('chose tails')) {
        const match = line.match(/^(\w+)\s+chose/);
        if (match) {
          coinTossChooser = match[1];
        }
      }

      // Winner detection
      if (line.includes('wins')) {
        const match = line.match(/(\w+)\s+wins\.?/);
        if (match) {
          winnerName = match[1];
        }
      }

      // Count turns
      if (line.includes("'s Turn")) {
        turnCount++;
      }
    }

    // Determine player1 and player2
    if (coinTossWinner && coinTossChooser && coinTossWinner !== coinTossChooser) {
      player1Name = coinTossWinner;
      player2Name = coinTossChooser;
    }

    // Fallback: Extract player names from action lines if coin toss info is missing or invalid
    if (!player1Name || !player2Name || player1Name === player2Name) {
      const playerNames = new Set<string>();
      
      for (const line of lines) {
        // Extract player names from action patterns
        const patterns = [
          /^(\w+)\s+(played|drew|attached|used|took|put|discarded|retreated)/i,
          /^(\w+)'s\s+(.*?)\s+(was|used|attacked|took|received)/i,
        ];
        
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match) {
            playerNames.add(match[1]);
            if (playerNames.size >= 2) break;
          }
        }
        
        if (playerNames.size >= 2) break;
      }
      
      const namesArray = Array.from(playerNames);
      if (namesArray.length >= 2) {
        player1Name = namesArray[0];
        player2Name = namesArray[1];
      }
    }

    // Adjust turn count (divide by 2 since each turn is counted per player)
    turnCount = Math.ceil(turnCount / 2);

    console.log('Extracted metadata:', { player1Name, player2Name, winnerName, turnCount });

    return { player1Name, player2Name, winnerName, turnCount };
  }
  
  /**
   * Helper function to determine which player performed an action by extracting the player name from the action line
   * @param line The action line (e.g., "Silver_Poke played Terapagos ex to the Active Spot")
   * @param metadata Metadata containing player names
   * @param fallbackPlayer Fallback player if name can't be extracted (usually turn-based player)
   */
  private getPlayerFromActionLine(
    line: string, 
    metadata: ParsedMetadata, 
    fallbackPlayer: 'player1' | 'player2'
  ): 'player1' | 'player2' {
    // Try to extract player name from common action patterns
    const patterns = [
      /^(\w+)\s+(played|drew|attached|used|took|put|discarded|retreated)/i,
      /^(\w+)'s\s+(.*?)\s+(was|used|attacked|took|received)/i,
      /^-\s+(\w+)\s+(played|drew|attached|used|took|put|discarded|retreated)/i,
      /^-\s+(\w+)'s\s+(.*?)\s+(was|used|attacked|took|received)/i,
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const playerName = match[1];
        if (playerName === metadata.player1Name) {
          return 'player1';
        } else if (playerName === metadata.player2Name) {
          return 'player2';
        }
      }
    }
    
    // If we can't determine from the line, use the fallback (turn-based player)
    return fallbackPlayer;
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
    // Skip continuation lines that start with "-" - they should be handled by the main action
    if (line.startsWith('-')) {
      return null;
    }
    
    // Determine the actual player from the action line
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    // Drew cards
    if (line.includes('drew') && line.includes('card')) {
      return this.parseDrawAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata, lines, currentIndex);
    }
    
    // Took prize cards
    if (line.includes('took') && line.includes('Prize')) {
      return this.parsePrizeAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata, lines, currentIndex);
    }
    
    // Played Pokémon
    if (line.match(/played .+ to the (Active Spot|Bench)/)) {
      return this.playPokemonAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Attached energy
    if (line.includes('attached') && line.includes('Energy')) {
      return this.parseAttachEnergyAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Used attack
    if (line.includes('used') && line.includes('on') && line.includes('damage')) {
      return this.parseAttackAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Evolved
    if (line.includes('evolved')) {
      return this.parseEvolveAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Knocked out
    if (line.includes('was Knocked Out')) {
      return this.parseKnockoutAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Played trainer (Item/Supporter/Stadium)
    if (line.match(/played \w+\./)) {
      return this.parseTrainerAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Retreated
    if (line.includes('retreated')) {
      return this.parseRetreatAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Ability used
    if (line.includes('used') && !line.includes('damage')) {
      return this.parseAbilityAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
    }
    
    // Discarded
    if (line.includes('discarded')) {
      return this.parseDiscardAction(line, turnNumber, actualPlayer, timestamp, actionId, metadata);
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
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    
    // Determine the actual player from the action line (player1Name's Pokemon attacked)
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    // Check if this might be an evolution card play (Pokémon card) rather than a trainer card
    // Evolution cards are played without position info and often follow evolve actions
    const isLikelyEvolution = !['Dawn', 'Hilda', 'Iono', 'Arven', 'Artazon', 'Nest Ball', 'Ultra Ball', 'Rare Candy', 'Energy Switch', 'Air Balloon', 'Buddy-Buddy Poffin', 'Battle Cage', 'Explorer\'s Guidance', 'Boss\'s Orders', 'Janine\'s Secret Art', 'Team Rocket\'s Venture Bomb', 'Thick Scale', 'Luminous Energy', 'Munkidori', 'Tynamo', 'Eelektrik', 'Budew', 'Froslass', 'Iron Bundle', 'Snorunt', 'Dratini', 'Dragonair'].includes(cardName);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
      actionType: isLikelyEvolution ? 'PLAY_POKEMON' : 'PLAY_TRAINER',
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
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    const match = line.match(/(.+?)'s\s+(.+?)\s+used\s+(.+?\.)/);
    if (!match) return null;
    
    const cardName = match[2].trim();
    const abilityName = match[3].trim();
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
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
    // Skip generic "X cards were discarded from..." messages
    if (line.match(/\d+\s+cards?\s+were\s+discarded\s+from/i)) {
      return null;
    }
    
    // Skip "from xxx's yyy" patterns (these are descriptions, not card names)
    if (line.match(/discarded\s+from\s+/i)) {
      return null;
    }
    
    const match = line.match(/discarded\s+(.+?)(?:\.|$)/);
    if (!match) return null;
    
    let cardName = match[1].trim();
    
    // Clean up "from xxx's yyy" if it slipped through
    cardName = cardName.replace(/^from\s+.*?'s\s+/i, '');
    
    // Determine the actual player from the action line, not the turn
    const actualPlayer = this.getPlayerFromActionLine(line, metadata, player);
    
    return {
      id: `action-${actionId}`,
      turnNumber,
      timestamp,
      player: actualPlayer,
      actionType: 'DISCARD',
      cardName,
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
   * Extract deck lists for both players based on cards seen in actions
   * Note: This tracks cards used during battle with quantity estimation
   * Quantities are estimated based on TCG rules (max 4 of non-basic energy)
   */
  private async extractDeckLists(
    actions: BattleAction[],
    metadata: ParsedMetadata,
  ): Promise<{ player1Deck: DeckCard[]; player2Deck: DeckCard[] }> {
    const player1Cards = new Map<string, Set<string>>(); // Card name -> Set of action types
    const player2Cards = new Map<string, Set<string>>();

    // Scan all actions to find unique cards used by each player
    for (const action of actions) {
      const player = action.player;
      const cardMap = player === 'player1' ? player1Cards : player2Cards;
      
      // Track main card from action (only count once per card name)
      // Filter out generic placeholders and invalid card names
      if (action.cardName && 
          action.cardName !== 'Unknown Card' &&
          action.cardName !== 'Card' &&
          action.cardName !== 'A card' &&
          !action.cardName.match(/^\d+\s+cards?$/i) &&  // "1 card", "2 cards", etc.
          !action.cardName.match(/^Prize\s+cards?$/i) &&  // "Prize card", "Prize cards"
          !action.cardName.match(/^from\s+.*?'s\s+/i)) {  // "from Silver_Poke's Mega Absol ex"
        if (!cardMap.has(action.cardName)) {
          cardMap.set(action.cardName, new Set());
        }
        cardMap.get(action.cardName)!.add(action.actionType);
      }
      
      // Track cards from metadata (e.g., drawn cards, revealed cards)
      if (action.metadata?.cardNames && Array.isArray(action.metadata.cardNames)) {
        for (const cardName of action.metadata.cardNames) {
          // Filter out generic placeholders and invalid card names
          if (cardName && 
              cardName !== 'Card' &&
              cardName !== 'A card' &&
              !cardName.match(/^\d+\s+cards?$/i) &&
              !cardName.match(/^Prize\s+cards?$/i) &&
              !cardName.match(/^from\s+.*?'s\s+/i)) {
            if (!cardMap.has(cardName)) {
              cardMap.set(cardName, new Set());
            }
            cardMap.get(cardName)!.add('revealed');
          }
        }
      }
    }

    // Convert maps to DeckCard arrays with quantity estimation
    const player1Deck = await this.buildDeckList(player1Cards);
    const player2Deck = await this.buildDeckList(player2Cards);

    const player1Total = player1Deck.reduce((sum, c) => sum + c.quantity, 0);
    const player2Total = player2Deck.reduce((sum, c) => sum + c.quantity, 0);

    this.logger.log(
      `Extracted cards used: ${metadata.player1Name} (${player1Deck.length} unique, ${player1Total} total), ${metadata.player2Name} (${player2Deck.length} unique, ${player2Total} total)`,
    );

    return { player1Deck, player2Deck };
  }

  /**
   * Build a deck list from card name sets and resolve webCardIds
   * Estimates quantities based on TCG rules (max 4 of non-energy, unlimited basic energy)
   */
  private async buildDeckList(cardSets: Map<string, Set<string>>): Promise<DeckCard[]> {
    const deckList: DeckCard[] = [];

    for (const [cardName, actionTypes] of cardSets.entries()) {
      // Resolve card to webCardId
      const webCardId = await this.resolveCardName(cardName);
      
      // Estimate quantity based on card type and frequency
      // Basic Energy: Typically run 4-10 copies, estimate 4 as baseline
      // Other cards: Max 4 per TCG rules, estimate based on usage
      const isBasicEnergy = cardName.includes('Basic') && cardName.includes('Energy');
      
      let quantity = 1; // Default: assume 1 copy if we only saw it once
      
      if (isBasicEnergy) {
        // Basic energy can have more copies - estimate 4-8 based on usage
        quantity = actionTypes.has('attach') ? 4 : 2;
      } else if (actionTypes.size >= 3) {
        // If card was used in multiple ways (drawn, played, evolved, etc), likely 3-4 copies
        quantity = 3;
      } else if (actionTypes.size === 2) {
        // Used in 2 different ways, likely 2 copies
        quantity = 2;
      }
      
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
