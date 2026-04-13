/**
 * find-named-card-synergies.ts
 *
 * Finds Stadium/Supporter/Item Trainer cards (reg H/I/J) whose
 * effect text contains specific Pokémon names (Japanese suffixes like ex, GX, V, VMAX, VSTAR)
 * suggesting they are designed for a named Pokémon synergy.
 *
 * Usage: npx tsx scrapers/find-named-card-synergies.ts
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Search in JA_JP text for cards that reference specific Pokémon names
  // Pattern: card name containing ex/GX/V etc appears in another card's text field
  const rows = await prisma.$queryRaw<Array<{
    web_card_id: string;
    name: string;
    subtypes: string;
    regulation_mark: string;
    text: string;
  }>>`
    SELECT
      c."webCardId"   AS web_card_id,
      c.name,
      c.subtypes::text AS subtypes,
      c."regulationMark" AS regulation_mark,
      c.text
    FROM cards c
    JOIN primary_cards pc ON pc.id = c."primaryCardId"
    WHERE c.language = 'JA_JP'
      AND c."regulationMark" IN ('H','I','J')
      AND c.supertype = 'TRAINER'
      AND c.text IS NOT NULL
      AND length(c.text) > 20
      AND (
        -- Named by a specific Pokémon (ex / ex / GX etc in the card text suggests targeting)
        c.text ~ '[ァ-ヶー々〇〻\u3400-\u9FFF]{2,}(ex|GX|V|VMAX|VSTAR)'
        OR c.text ~ '[ァ-ヶー々〇〻\u3400-\u9FFF]{2,}(ex)'
      )
    ORDER BY c."regulationMark" DESC, c.name
    LIMIT 100
  `;

  console.log(`Found ${rows.length} trainer cards with named-Pokémon references:\n`);
  for (const r of rows) {
    console.log(`[${r.regulation_mark}] ${r.name} (${r.web_card_id})`);
    console.log(`  subtypes: ${r.subtypes}`);
    console.log(`  text: ${r.text.substring(0, 200)}`);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
