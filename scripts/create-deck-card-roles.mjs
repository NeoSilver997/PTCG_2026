import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

// Load .env manually
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../packages/database/.env');
const env = readFileSync(envPath, 'utf8');
const dbUrl = env.match(/DATABASE_URL="?([^"\n]+)"?/)?.[1];
if (!dbUrl) { console.error('DATABASE_URL not found'); process.exit(1); }

const client = new Client({ connectionString: dbUrl });
await client.connect();

try {
  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeckPokemonRole') THEN
        CREATE TYPE "DeckPokemonRole" AS ENUM ('POKEMON_MAIN', 'POKEMON_SUPPORT', 'POKEMON_EVOLUTION');
      END IF;
    END $$;
  `);
  console.log('Enum ready');

  await client.query(`
    CREATE TABLE IF NOT EXISTS deck_card_roles (
      id TEXT PRIMARY KEY,
      "deckCode" TEXT NOT NULL,
      "canonicalWebCardId" TEXT NOT NULL,
      role "DeckPokemonRole" NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT deck_card_roles_deck_card_unique UNIQUE ("deckCode", "canonicalWebCardId")
    );
  `);
  console.log('Table ready');

  await client.query(`
    CREATE INDEX IF NOT EXISTS "deck_card_roles_deckCode_idx" ON deck_card_roles("deckCode");
  `);
  console.log('Index ready');
  console.log('SUCCESS');
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
