# Sample Battle Log — Step-by-step Parsing Walkthrough

This document walks through `sample-battle-log-2.txt` and explains how the battle log parser processes the file into structured actions and metadata. Each step shows log excerpts, the parser's interpretation, the resulting parsed action(s), and notable edge cases.

---

## 1. File-level metadata extraction

Sample lines:

> Setup
> Metal713 chose tails for the opening coin flip.
> Metal713 won the coin toss.
> Metal713 decided to go first.

Parser behavior:
- extractMetadata() looks for coin toss lines and explicit "won the coin toss" to populate players and determine who goes first.
- When coin toss data is present, it sets `player1` and `player2` (canonical assignment may depend on ordering in DB). Here `Metal713` is identified as the coin-toss winner and as the first player.

Parsed metadata example (partial):

```json
{
  "coinToss": { "winner": "Metal713", "choice": "tails" },
  "startingPlayer": "Metal713",
  "players": ["Metal713","NeoNeo123"]
}
```

Edge-case handling:
- If coin toss lines are missing or malformed, the parser scans early action lines for player names as a fallback.

---

## 2. Mulligan handling (opening hands)

Excerpt:

> Metal713 took a mulligan.
> - Cards revealed from Mulligan 1
>    • Lillie's Determination, Basic Fire Energy, Arven, ...
> NeoNeo123 drew 1 more card because Metal713 took at least 1 mulligan.

Parser behavior:
- Recognizes the mulligan action and records the effect (other player draws additional card(s)).
- These are stored as `MULLIGAN` or `DRAW` style actions in sequence.

Parsed actions (example):

```json
{ "actionType": "MULLIGAN", "player": "Metal713", "details": "revealed: Lillie's Determination, Basic Fire Energy, ..." }
{ "actionType": "DRAW", "player": "NeoNeo123", "details": "drew 1 due to opponent mulligan" }
```

---

## 3. Setup plays — playing Active/Bench Pokémon and initial board state

Excerpt:

> Metal713 played Mega Kangaskhan ex to the Active Spot.
> Metal713 played Fezandipiti ex to the Bench.
> NeoNeo123 played Charmander to the Active Spot.

Parser behavior:
- Classifies `played ... to the Active Spot` as `PLAY_POKEMON` with `zone: ACTIVE`.
- `played ... to the Bench` becomes `PLAY_POKEMON` with `zone: BENCH`.

Parsed action examples:

```json
{ "actionType": "PLAY_POKEMON", "player": "Metal713", "cardName": "Mega Kangaskhan ex", "details": "Active" }
{ "actionType": "PLAY_POKEMON", "player": "Metal713", "cardName": "Fezandipiti ex", "details": "Bench" }
{ "actionType": "PLAY_POKEMON", "player": "NeoNeo123", "cardName": "Charmander", "details": "Active" }
```

Special parsing notes:
- The parser normalizes "Mega Kangaskhan ex" and similar names (keeps exact text from log as `cardName`).

---

## 4. Turn structure and sequential actions

The log uses explicit "Turn # N - <Player>'s Turn" headers. The parser uses these to group subsequent actions into turns and to attach timestamps or ordinal positions.

Excerpt:

> Turn # 1 - Metal713's Turn
> Metal713 drew a card.
> Metal713 played Artazon to the Stadium spot.
> Metal713's Mega Kangaskhan ex used Run Errand.
> - Metal713 drew 2 cards.
> Metal713 ended their turn.

Parser behavior:
- On seeing `Turn # 1` the parser begins a new turn object and records the contained actions in order.
- Lines starting with `-` are treated as sub-effects (e.g., results of an action) and are attached to the nearest parent action as `details` or added as separate `DRAW` actions depending on the content.

Parsed actions (sequence):

1. { actionType: 'DRAW', player: 'Metal713', details: 'drew a card' }
2. { actionType: 'PLAY_STADIUM', player: 'Metal713', cardName: 'Artazon' }
3. { actionType: 'ATTACK' | 'ABILITY', player: 'Metal713', source: 'Mega Kangaskhan ex', ability: 'Run Errand', details: 'drew 2 cards' }
4. { actionType: 'END_TURN', player: 'Metal713' }

Notes:
- The parser prefers to keep sub-lines (`- ...`) attached to the action that caused them when context is clear.

---

## 5. Energy attachment and retreat/active changes

Excerpt:

> NeoNeo123 attached Air Balloon to Charmander in the Active Spot.
> NeoNeo123 attached Basic Fire Energy to Moltres on the Bench.
> NeoNeo123 retreated Charmander to the Bench.
> NeoNeo123's Moltres is now in the Active Spot.

Parser behavior:
- `attached ... to <pokemon>` → `ATTACH_ENERGY` or `PLAY_TOOL` action (depending on the card name).
- `retreated ...` + `is now in the Active Spot` sequence becomes a `RETREAT` and `ACTIVE_CHANGE` event.

Parsed examples:

```json
{ "actionType": "ATTACH_TOOL", "player": "NeoNeo123", "cardName": "Air Balloon", "target": "Charmander (Active)" }
{ "actionType": "ATTACH_ENERGY", "player": "NeoNeo123", "cardName": "Basic Fire Energy", "target": "Moltres (Bench)" }
{ "actionType": "RETREAT", "player": "NeoNeo123", "details": "Charmander -> Bench" }
{ "actionType": "ACTIVE_CHANGE", "player": "NeoNeo123", "details": "Moltres now Active" }
```

---

## 6. Attacks, damage calculation and KOs

Excerpt:

> NeoNeo123's Moltres used Fighting Wings on Metal713's Mega Kangaskhan ex for 110 damage.
> - Damage breakdown:
>    • Base damage: 20 damage
>    • Pokémon ex: 90 damage
>    • Total damage: 110 damage

Parser behavior:
- Recognizes the `used <attack>` pattern as an `ATTACK` action, extracts attacker, target and damage.
- When a KO occurs (e.g., "was Knocked Out!" later in the log), parser emits a `KNOCKOUT` action and triggers a `PRIZE` action for the player taking a prize.

Parsed example sequence for a KO:

```json
{ "actionType": "ATTACK", "player": "NeoNeo123", "source": "Moltres", "attack": "Fighting Wings", "damage": 110 }
{ "actionType": "KNOCKOUT", "player": "NeoNeo123", "target": "Mega Kangaskhan ex" }
{ "actionType": "PRIZE", "player": "NeoNeo123", "details": "took 3 Prize cards" }
```

Notes:
- The parser may attach the damage breakdown as `metadata` so applications can show component damage sources.

---

## 7. Evolution & transformation actions

Example:

> Metal713 evolved Charmander to Charmeleon on the Bench.
> NeoNeo123 played Rare Candy.
> - NeoNeo123 evolved Charmander to Mega Charizard X ex on the Bench.

Parser behavior:
- Lines containing `evolved` are mapped to `EVOLVE` actions, with `from` and `to` inferred (if the log provides both names). Rare Candy usage that immediately evolves is represented as `PLAY_TRAINER` followed by `EVOLVE` effect(s).

Parsed example:

```json
{ "actionType": "EVOLVE", "player": "NeoNeo123", "from": "Charmander", "to": "Mega Charizard X ex", "zone": "Bench" }
```

Caveats:
- Distinguishing between Trainer plays that cause evolution vs direct evolution plays requires contextual parsing (we added `parseTrainerAction()` logic).

---

## 8. Card draw effects and searches

The log contains many effects that draw cards, search, or manipulate the deck (e.g., `Ultra Ball`, `Nest Ball`, `Lillie's Determination`, `Arven`, `Dawn`). Parser rules:
- Lines like `played <card>` become `PLAY_TRAINER` or `PLAY_ITEM` depending on name and known lists.
- Resulting `- <player> drew X cards` lines are attached as `DRAW` actions with details.
- If a draw line indicates the drawn cards were immediately played to the Bench/Active (e.g., `drew 2 cards and played them to the Bench` or `drew Charmander and played it to the Bench`), the parser sets `DRAW.metadata.playedTo` to `bench` or `active` and includes `metadata.cardNames` for the played cards. This allows the GameState builder or UI to place the drawn cards directly into the bench/active spots.

Example:

> Metal713 played Ultra Ball.
> - Metal713 discarded 2 cards.
>    • Buddy-Buddy Poffin, Oricorio ex
> - Metal713 drew Charmeleon.

Parsed sequence:

```json
{ "actionType": "PLAY_ITEM", "player": "Metal713", "cardName": "Ultra Ball" }
{ "actionType": "DISCARD", "player": "Metal713", "details": "Buddy-Buddy Poffin, Oricorio ex" }
{ "actionType": "DRAW", "player": "Metal713", "details": "drew Charmeleon" }
```

---

## 9. Prize-taking and winner determination

Examples:

> Metal713 took a Prize card.
> NeoNeo123 took 3 Prize cards.

Parser behavior:
- Each `took X Prize cards` line is parsed as a `PRIZE` action, incrementing that player's prize count in metadata.
- The match end is detected by explicit phrases like `Opponent conceded` or when one player's prize pool reaches 0 (depending on how prizes are tracked).

Final outcome lines:

> Opponent conceded. NeoNeo123 wins.

Parsed final metadata:

```json
{ "winner": "NeoNeo123", "result": "conceded" }
```

---

## 10. Putting it all together — example parsed action stream (first few actions)

1. { actionType: 'MULLIGAN', player: 'Metal713', details: 'cards revealed: ...' }
2. { actionType: 'DRAW', player: 'NeoNeo123', details: 'drew 1 due to opponent mulligan' }
3. { actionType: 'PLAY_POKEMON', player: 'Metal713', cardName: 'Mega Kangaskhan ex', details: 'Active' }
4. { actionType: 'PLAY_POKEMON', player: 'Metal713', cardName: 'Fezandipiti ex', details: 'Bench' }
5. { actionType: 'PLAY_POKEMON', player: 'NeoNeo123', cardName: 'Charmander', details: 'Active' }
6. { actionType: 'TURN_START', player: 'Metal713', turn: 1 }
7. { actionType: 'DRAW', player: 'Metal713' }
8. { actionType: 'PLAY_STADIUM', player: 'Metal713', cardName: 'Artazon' }
9. { actionType: 'ABILITY', player: 'Metal713', source: 'Mega Kangaskhan ex', ability: 'Run Errand', details: 'drew 2 cards' }
10. { actionType: 'END_TURN', player: 'Metal713' }

---

## 11. Edge cases observed in this log
- Multiple evolutions in a single turn (Rare Candy + direct evolution): parser uses context to connect `PLAY_TRAINER` -> `EVOLVE` actions.
- Repeated similar named cards (many "Charmander" instances): parser keeps `cardName` verbatim and the frontend should map names to canonical IDs when possible.
- Damage breakdown blocks are multi-line (`- Damage breakdown:` + bullets). Parser collects these into a `metadata.damageBreakdown` object for each `ATTACK`.

---

## 12. Recommended improvements
- Use the canonical card DB to map `cardName` to `cardId` and image path (improves Trainer/Evolution classification and thumbnail resolution).
- Add a replay index in stored actions (incremental `seq` field) so the frontend can step through actions deterministically.
- Add tests for the parser using this sample log as a golden file to detect regressions.

---

If you'd like, I can now:
- Generate a JSON file with the full parsed action sequence for `sample-battle-log-2.txt` using the current parser, or
- Implement a small endpoint to resolve `cardName -> cardId/image` using the existing card DB.

Which would you like next? 
