# sync-effect-keywords-from-json.ts — Documentation

**Source file:** `scrapers/sync-effect-keywords-from-json.ts`
**Last modified:** `2026-05-13 16:15`
**MD5:** `7394873A6CE886069CFAAB9F7B1FF7DF`
**Summarised by model:** `GPT-5.3-Codex`

## Purpose

Reads a JSON keyword definition file and upserts records into the `effect_keywords` highlight table. This enables controlled keyword tuning from data files without manually editing SQL migrations.

## Usage

```powershell
# default input
npx tsx scrapers/sync-effect-keywords-from-json.ts

# custom input file
npx tsx scrapers/sync-effect-keywords-from-json.ts data/keywords/new-keyword.json
```

## JSON format

`data/keywords/new-keyword.json` must include a `keywords` array. Each keyword supports:

- `id` (string, unique key)
- `pattern` (regex or plain text pattern)
- `isRegex` (boolean, default true)
- `flags` (string, default `g`)
- `colorClass` (Tailwind classes for highlight mark)
- `category` (optional)
- `sortOrder` (optional, default 0)
- `active` (optional, default true)

## Behavior

- If `id` exists in DB: update row.
- If `id` does not exist: create row.
- Prints created/updated counts and active keyword total.

## Related files

- `data/keywords/new-keyword.json`
- `apps/api/src/cards/cards.service.ts` (`getEffectKeywords`)
- `apps/web/src/app/cards/[webCardId]/page.tsx` (UI highlighter)
