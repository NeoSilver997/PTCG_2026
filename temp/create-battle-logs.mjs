import { PrismaClient } from '../packages/database/node_modules/.prisma/client/index.js';

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS battle_logs (
      id TEXT NOT NULL,
      "matchTitle" TEXT NOT NULL,
      "player1Name" TEXT NOT NULL,
      "player2Name" TEXT NOT NULL,
      "player1Deck" JSONB,
      "player2Deck" JSONB,
      "winnerName" TEXT,
      "turnCount" INTEGER NOT NULL,
      "durationSeconds" INTEGER,
      actions JSONB NOT NULL,
      "rawLog" TEXT,
      "tournamentResultId" TEXT UNIQUE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT battle_logs_pkey PRIMARY KEY (id)
    )
  `);
  console.log('battle_logs table created or already exists.');

  // Add indexes
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS battle_logs_player1Name_player2Name_idx
    ON battle_logs ("player1Name", "player2Name")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS battle_logs_createdAt_idx
    ON battle_logs ("createdAt")
  `);
  console.log('Indexes created.');
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await prisma.$disconnect();
}
