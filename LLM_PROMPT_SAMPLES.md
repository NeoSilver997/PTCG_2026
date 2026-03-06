# Sample Prompts for Local LLM Battle Parsing

## 1. Basic Structured Parsing Prompt

```
You are a Pokemon TCG battle log parser. Parse this battle log and return ONLY a JSON object with this exact structure:

{
  "metadata": {
    "player1Name": "string",
    "player2Name": "string",
    "winnerName": "string or null",
    "turnCount": number
  },
  "actions": [
    {
      "actionType": "DRAW|PLAY_POKEMON|ATTACK|EVOLVE|KNOCKOUT|ATTACH_ENERGY|ABILITY|RETREAT|DISCARD|TURN_START",
      "player": "player1|player2",
      "cardName": "string",
      "details": "original line"
    }
  ]
}

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

JSON:
```

## 2. Step-by-Step Chain-of-Thought Prompt

```
Parse this Pokemon TCG battle log step by step:

STEP 1: Extract metadata
- Find player names from coin toss or first actions
- Count turns from lines containing "'s Turn"
- Identify winner from "wins" statements

STEP 2: Parse each action line
Map these patterns to action types:
- "drew" → DRAW
- "played.*to the.*Spot" → PLAY_POKEMON
- "attached.*Energy" → ATTACH_ENERGY
- "used.*on.*damage" → ATTACK
- "evolved" → EVOLVE
- "was Knocked Out" → KNOCKOUT
- "used" (abilities) → ABILITY
- "retreated" → RETREAT
- "discarded" → DISCARD
- "'s Turn" → TURN_START

STEP 3: Return structured JSON

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Final Answer (JSON only):
```

## 3. Few-Shot Learning with Examples

```
Parse Pokemon TCG battle logs like these examples:

Example 1:
Input: "NeoNeo123 drew Dratini."
Output: {"actionType": "DRAW", "player": "player1", "cardName": "Dratini"}

Example 2:
Input: "MCA0909 played Team Rocket's Murkrow to the Active Spot."
Output: {"actionType": "PLAY_POKEMON", "player": "player2", "cardName": "Team Rocket's Murkrow", "position": "active"}

Example 3:
Input: "NeoNeo123's Dragonair used Evolutionary Guidance."
Output: {"actionType": "ABILITY", "player": "player1", "cardName": "Dragonair", "abilityName": "Evolutionary Guidance"}

Now parse this battle log. Return an array of action objects:

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Actions array:
```

## 4. Detailed Action Classification Prompt

```
CLASSIFY each line in this Pokemon TCG battle log. For each line, determine:

- ACTION_TYPE: DRAW, PLAY_POKEMON, ATTACK, EVOLVE, KNOCKOUT, ATTACH_ENERGY, ABILITY, RETREAT, DISCARD, TURN_START, PRIZE, MULLIGAN, ACTIVE_CHANGE, PLAY_TRAINER
- PLAYER: player1 or player2 (based on name matching)
- CARD_NAME: the Pokemon/item name mentioned
- DETAILS: the full original line

Return format:
[
  {"line": 1, "actionType": "TURN_START", "player": "player1", "cardName": null, "details": "NeoNeo123's Turn"},
  {"line": 2, "actionType": "DRAW", "player": "player1", "cardName": "Dratini", "details": "NeoNeo123 drew Dratini."}
]

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Classification:
```

## 5. Battle State Tracking Prompt

```
Parse this Pokemon TCG battle log while tracking game state. For each action, include:

- Current turn number
- Active Pokemon for each player
- Action type and details
- Any state changes (HP, position, etc.)

Return format:
{
  "metadata": {"player1Name": "string", "player2Name": "string", "turns": number},
  "timeline": [
    {
      "turn": 1,
      "player": "player1",
      "action": "PLAY_POKEMON",
      "card": "Pikachu",
      "position": "active",
      "stateChange": {"player1Active": "Pikachu", "player1ActiveHP": 60}
    }
  ]
}

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Parsed battle:
```

## 6. Simple Regex-Based Prompt

```
Use these patterns to parse the Pokemon TCG battle log:

PATTERNS:
- Turn start: /(.+)'s Turn/ → TURN_START
- Draw: /(.+) drew (.+)/ → DRAW, card=$2
- Play Pokemon: /(.+) played (.+) to the (Active Spot|Bench)/ → PLAY_POKEMON, position=$3
- Attack: /(.+)'s (.+) used (.+) on (.+)'s (.+) for (\d+) damage/ → ATTACK, damage=$6
- Energy attach: /(.+) attached (.+Energy) to (.+)/ → ATTACH_ENERGY
- Evolve: /(.+) evolved (.+) to (.+)/ → EVOLVE
- Knockout: /(.+)'s (.+) was Knocked Out/ → KNOCKOUT

For each line, return: {"pattern": "name", "actionType": "TYPE", "player": "p1|p2", "data": {...}}

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Parsed actions:
```

## 7. Conversational Parsing Prompt

```
Let's parse this Pokemon TCG battle log together. I'll ask you questions and you answer with JSON.

First, who are the players in this battle? Look for names in coin toss or actions.

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Player names (JSON): {"player1": "name", "player2": "name"}

[Then ask: How many turns? What actions happened in turn 1? etc.]
```

## 8. Error-Resistant Prompt

```
Parse this Pokemon TCG battle log. If you're unsure about any part, use "UNKNOWN" for actionType.

Return format:
{
  "confidence": "HIGH|MEDIUM|LOW",
  "metadata": {"player1Name": "string", "player2Name": "string"},
  "actions": [
    {
      "actionType": "DRAW|PLAY_POKEMON|UNKNOWN",
      "player": "player1|player2",
      "cardName": "string or null",
      "confidence": "HIGH|MEDIUM|LOW",
      "originalLine": "string"
    }
  ]
}

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Parsed result:
```

## 9. Multi-Stage Parsing Prompt

```
PHASE 1: Extract basic information
- Player names: [list]
- Total turns: [number]
- Winner: [name or null]

PHASE 2: Parse actions by turn
Turn 1:
- Action 1: [description]
- Action 2: [description]

Turn 2:
- etc.

PHASE 3: Convert to structured format

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Final structured output:
```

## 10. Validation-Focused Prompt

```
Parse this Pokemon TCG battle log and validate your results.

Validation rules:
- Player names must appear in coin toss or first 3 actions
- Turn count must match number of "'s Turn" lines
- Each action must have a valid actionType
- Card names should be reasonable Pokemon TCG cards
- No duplicate actions in same turn without good reason

Return format with validation:
{
  "parsed": {
    "metadata": {...},
    "actions": [...]
  },
  "validation": {
    "passed": true/false,
    "issues": ["list of problems found"],
    "confidence": "HIGH|MEDIUM|LOW"
  }
}

Battle Log:
[PASTE YOUR BATTLE LOG HERE]

Validated result:
```

## Tips for Using These Prompts

1. **Start Simple**: Use Prompt #1 for basic testing
2. **Add Examples**: Prompt #3 works best with examples
3. **Be Specific**: Include exact JSON structure you want
4. **Use Temperature 0.1**: For consistent results
5. **Validate Output**: Always check the JSON structure
6. **Iterate**: If results aren't good, try a different prompt style
7. **Context Length**: Keep battle logs under 4000 tokens
8. **Rate Limiting**: Add delays between requests if batch processing

## Testing Your Prompts

```bash
# Test with Ollama directly
echo "Your prompt here" | ollama run deepseek-coder-v2:16b

# Or use the scripts I created
node local-battle-parser.js your-battle-log.txt
```