# PTCG_2026 Database Analysis - Prisma Schema Summary

## Core Tables and Relationships

### **Player and User Data**
- **`User`**
  - Core Fields: `email`, `name`, `collections`, `decks`
  - Relationships: `Collection`, `Deck`

- **`Session`**
  - Fields: `token`, `refreshToken`, `userId`
  - Relationships: Relates to `User`

### **Cards and Card Metadata**
- **`Card` & `PrimaryCard`**
  - Fields: `language`, `types`, `hp`, `abilities`, `attacks`
  - Metadata: `rarity`, `ruleBox`, `evolutionStage`
  - Relationships: Expansions (`primaryExpansion`), Pokémon Species (`pokemonSpecies`)

- **`PokemonSpecies`**
  - Fields: Pokedex Number (`dexNumber`), Name (multiple languages)

### **Card Pricing**
- **`CardPrice`**
  - Pricing fields: `price`, `currency`, `condition`, `inStock`
  - Relationships: Associated with `Card`

- **`PriceHistory`**
  - Historical tracking: Date (`date`), Price (`price`)

### **Decks and Collections**
- **`Deck`**
  - Core: Player decks, archetypes, deck composition (`deckData`)
  - Relationships: Linked cards via `DeckCard`
- **`Collection`**
  - Fields: Collection name, quantity of cards (`CollectionItem`)

### **Competition Data**
- **`Tournament`**
  - Tournament entries: `name`, `type`, `date`, `region`
  - Results linked via `TournamentResult`

- **`TournamentResult`**
  - Fields: `playerName`, `placement`, `deckName`
  - Relationships: Deck association, result-specific battle logs

## Supporting Enums and Fields

### Enums in Use
- **`PokemonType`**: Includes FIRE, WATER, GRASS, etc.
- **`Supertype` & `Subtype`**: TRAINER, ITEM, STADIUM, etc.
- **`Rarity`**: Levels like COMMON, RARE, ULTRA_RARE
- **`TournamentType`**: CHAMPIONSHIP, REGIONAL, STORE_TOURNAMENT

### Additional Tables
- `DeckCardRole`: Assigns card-specific roles in a deck
- `BattleLog`: Logs detailed battle actions and outcomes

---

## Next Steps
To fully integrate this schema with the **Model Context Protocol (MCP)**:
1. Define MCP configuration matching this schema.
2. Connect LLM to the database with proper query capabilities.
3. Focus on user-defined priorities, such as tournament stats or deck analysis.

Specify required focus areas to proceed with MCP configuration and analysis!