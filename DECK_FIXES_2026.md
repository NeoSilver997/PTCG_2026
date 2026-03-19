# Deck Extraction & Card Display Fixes

## Issues Fixed

### 1. Deck Card Counting (Critical Bug)
**Problem:** Deck extraction was counting every card appearance in battle actions, resulting in inflated quantities (e.g., a card played 3 times = quantity 3).

**Root Cause:** The `extractDeckLists()` method was incrementing card counts for every action occurrence instead of tracking unique cards.

**Solution:** Redesigned deck extraction algorithm:
- Track unique cards with `Set<string>` to record action types (draw, play, attach, etc.)
- Estimate quantities based on TCG rules:
  - Basic Energy: 2-4 copies (estimated based on usage frequency)
  - Other cards: 1-3 copies (max 4 per TCG rules)
  - Quantity estimation based on action diversity:
    - Used in 3+ different ways → quantity 3
    - Used in 2 different ways → quantity 2
    - Used once → quantity 1

**Files Modified:**
- `apps/api/src/battles/battle-log-parser.ts`
  - Lines 574-613: `extractDeckLists()` - Now uses Map<string, Set<string>> instead of Map<string, number>
  - Lines 618-654: `buildDeckList()` - Smart quantity estimation logic

**Important Note:** The battle log format does NOT include complete 60-card deck lists. The system now:
- Tracks "Cards Used in Battle" (not full deck)
- Estimates quantities intelligently
- Logs total card counts for transparency

### 2. Card Display Issues ("Break Card")

#### Issue 2a: CardSlot Card Name Overflow
**Problem:** Long card names could overflow the card slot without wrapping or truncation.

**Solution:** Added `line-clamp-3` and `max-w-full` to limit display to 3 lines.

**File:** `apps/web/src/app/battles/[matchId]/components/CardSlot.tsx`
```tsx
// Before
<span className="text-white text-sm font-bold text-center drop-shadow-lg">
  {pokemon.name}
</span>

// After
<span className="text-white text-sm font-bold text-center drop-shadow-lg line-clamp-3 max-w-full">
  {pokemon.name}
</span>
```

#### Issue 2b: ActionLog Card Name Chip Overflow
**Problem:** Card names in action log details could overflow without truncation.

**Solution:** Added `max-w-[200px] truncate inline-block` with `title` tooltip for full name.

**File:** `apps/web/src/app/battles/[matchId]/components/ActionLog.tsx`
```tsx
// Before
<span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-medium">
  {cardName}
</span>

// After
<span 
  className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs font-medium max-w-[200px] truncate inline-block"
  title={cardName}
>
  {cardName}
</span>
```

### 3. DeckViewer UI Updates
**Changes:** Updated terminology to reflect reality of card extraction:
- "Deck" → "Cards Used"
- "total cards" → "estimated total"
- Added explanatory text: "Based on cards seen during battle (quantities estimated)"

**File:** `apps/web/src/app/battles/[matchId]/components/DeckViewer.tsx`
- Button: "Deck (60 cards)" → "Cards (45)"
- Modal title: "{playerName}'s Deck" → "{playerName}'s Cards Used"
- Added disclaimer about estimation

## Testing Recommendations

1. **Deck Extraction:**
   - Import sample battle logs
   - Verify card counts are reasonable (not inflated)
   - Check logs for total card counts
   - Confirm Basic Energy gets higher estimates

2. **Card Display:**
   - Test with long card names (e.g., "Team Rocket's Honchkrow")
   - Verify cards display correctly in:
     - CardSlot (active/bench)
     - ActionLog details
     - DeckViewer modal
     - Hand/Discard modals

3. **UI Verification:**
   - Open battle replay page
   - Click "Cards Used" buttons for both players
   - Verify totals are reasonable (typically 20-40 unique cards)
   - Hover over truncated card names to see full names

## Technical Details

### Deck Extraction Algorithm
```typescript
// For each action, track card name → Set of action types
const cardMap = new Map<string, Set<string>>();

// Example: "Rare Candy" → Set { "DRAW", "PLAY" }
// Quantity estimation: 2 different action types → quantity 2

// Basic Energy detection
const isBasicEnergy = cardName.includes('Basic') && cardName.includes('Energy');
if (isBasicEnergy) {
  quantity = actionTypes.has('attach') ? 4 : 2;
}
```

### Card Name Truncation Strategies
1. **CardSlot:** Line clamp (3 lines max) for multi-line wrapping
2. **ActionLog:** Hard truncate at 200px with tooltip
3. **Modals:** Already handled with `truncate` class

## Files Changed Summary

### Backend
- `apps/api/src/battles/battle-log-parser.ts` - Deck extraction logic redesign

### Frontend
- `apps/web/src/app/battles/[matchId]/components/CardSlot.tsx` - Card name overflow fix
- `apps/web/src/app/battles/[matchId]/components/ActionLog.tsx` - Card chip truncation
- `apps/web/src/app/battles/[matchId]/components/DeckViewer.tsx` - Terminology updates

### Shared Types
- `packages/shared-types/src/index.ts` - Already has DeckCard interface (no changes needed)

## Deployment Notes

1. Rebuild shared-types package: `pnpm --filter @ptcg/shared-types build`
2. Restart API server: Port 4000
3. Restart Web server: Port 3001
4. Clear any TypeScript build caches if needed

## Known Limitations

1. **Incomplete Deck Lists:** Battle logs don't contain full 60-card decks
   - Only cards used during battle are tracked
   - Some deck cards may never be drawn/played
   - Prize cards may not be revealed

2. **Quantity Estimation:** Not 100% accurate
   - Heuristic-based (not parsed from deck list)
   - Works well for frequently-used cards
   - May underestimate cards used only once

3. **Basic Energy Detection:** Simple string matching
   - Relies on "Basic" and "Energy" in card name
   - May not catch all energy types correctly

## Future Enhancements (Optional)

1. Allow users to manually upload full 60-card deck lists
2. Link battle logs to tournament decks (if available)
3. Improve quantity estimation with machine learning
4. Parse opening hand more carefully for better initial counts
5. Add deck legality checker (4-card limit validation)
