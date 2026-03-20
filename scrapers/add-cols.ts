import { PrismaClient } from "../packages/database/node_modules/.prisma/client";
const prisma = new PrismaClient();
async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE decks ADD COLUMN IF NOT EXISTS "deckCode" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE decks ADD COLUMN IF NOT EXISTS "deckData" JSONB`);
  console.log("OK");
  await prisma.$disconnect();
}
main();
