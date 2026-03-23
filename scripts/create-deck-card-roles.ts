import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create enum if not exists
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeckPokemonRole') THEN
        CREATE TYPE "DeckPokemonRole" AS ENUM ('POKEMON_MAIN', 'POKEMON_SUPPORT', 'POKEMON_EVOLUTION');
      END IF;
    END $$;
  `);
  console.log('Enum ready');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS deck_card_roles (
      id TEXT PRIMARY KEY,
      "deckCode" TEXT NOT NULL,
      "canonicalWebCardId" TEXT NOT NULL,
      role "DeckPokemonRole" NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT deck_card_roles_deck_card_unique UNIQUE ("deckCode", "canonicalWebCardId")
    )
  `);
  console.log('Table ready');

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "deck_card_roles_deckCode_idx" ON deck_card_roles("deckCode")
  `);
  console.log('Index ready');
  console.log('SUCCESS');
}

main().catch(console.error).finally(() => prisma.$disconnect());
