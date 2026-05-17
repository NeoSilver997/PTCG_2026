# copy-jp-expansion-to-zh-temp.ts — Documentation

**Source file:** `scrapers/copy-jp-expansion-to-zh-temp.ts`
**Last modified:** `2026-05-17 18:45`
**MD5:** `14E43F4FA4DACC0DBA9AB2622F1EC741`
**Summarised by model:** `GPT-5.3-Codex`

## Purpose

Clone one full Japanese expansion into temporary Chinese cards (`ZH_TW`) while keeping full card structure.

This is useful when you need a complete placeholder Chinese set before final translations are ready.

## Behavior

1. Select JP cards by expansion code (for example `M5`).
2. Build new web IDs from JP numeric suffix:
   - `jp50300` -> `zh50300temp`
3. Copy all core card fields (supertype, types, attacks, abilities, rarity, rules, etc.).
4. Convert Pokemon names by Pokédex mapping first (JA -> ZH Traditional):
   - Source: `pokemon_species` (`nameJa` -> `nameZhHant`).
   - Supports names with suffixes like `ex` and mixed owner-name forms.
5. Build JA->ZH translation memory from existing paired cards in database:
   - Learns card name, text, rules, attack name/effect, and ability name/description mappings.
   - Applies these mappings to new expansion cards when direct old-ZH card is not available.
6. Optional LLM fallback for remaining unmapped JP effect fields:
   - Targets: attack name, attack effect, ability name, ability description.
   - Runs only when `--use-llm-fallback` is provided.
   - Uses local Ollama API (`/api/generate`) with low temperature for deterministic output.
7. Reuse old Chinese data when available for the same `primaryCardId`:
   - Prefers existing `ZH_TW` card values for translated fields.
   - Falls back to translation-memory values and then JP values if no mapping exists.
8. Creates/uses HK regional expansion mapping for the same primary expansion.

## CLI Usage

```bash
# Dry-run by expansion
npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --expansion M5

# Dry-run by source webCardId (can infer expansion if --expansion is omitted)
npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --source-webcard jp50300

# Apply changes to database
npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --expansion M5 --apply

# Overwrite existing zh...temp cards (re-translate and update in place)
npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --expansion M5 --apply --overwrite-existing

# Overwrite and translate remaining unmapped attack/ability fields with local LLM
npx tsx scrapers/copy-jp-expansion-to-zh-temp.ts --expansion M5 --apply --overwrite-existing --use-llm-fallback
```

## Options

- `--expansion <CODE>`: Expansion code (normalized to uppercase).
- `--source-webcard <jpXXXXX>`: Source JP card to infer expansion.
- `--prefix <value>`: Target webCardId prefix (default: `zh`).
- `--suffix <value>`: Target webCardId suffix (default: `temp`).
- `--apply`: Actually writes to DB. Without this flag, script runs dry-run only.
- `--overwrite-existing`: Update existing `zh...temp` cards instead of skipping them.
- `--use-llm-fallback`: Use local LLM for remaining unmapped JP effect fields.
- `--llm-base-url <url>`: Ollama base URL (default: `http://127.0.0.1:11434` or `OLLAMA_BASE_URL`).
- `--llm-model <model>`: Ollama model tag (default: `deepseek-coder-v2:16b` or `OLLAMA_MODEL`).

## Output Summary

The script prints:
- number of JP cards found,
- planned creates,
- planned updates,
- skipped records,
- translation memory dictionary sizes,
- how many cards used old Chinese translation structure,
- how many cards were translated by memory mapping,
- LLM attempts / successful translated fields / failed calls (when enabled),
- preview of first generated cards with effect snippet in dry-run mode.

## Notes

- Script is idempotent for temp IDs: existing `zh...temp` cards are skipped.
- This script does not call external machine translation APIs; it performs database-driven translation-memory mapping from existing JA/ZH pairs.
- For final production text quality, run a follow-up translation/normalization pass after temp cards are created.

## Related Scripts

- `scrapers/map-hk-to-jp.ts`
- `scrapers/map-by-skills.ts`
- `scrapers/import-cards-direct.ts`
