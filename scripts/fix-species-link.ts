/**
 * One-off fix: link a specific PrimaryCard to a specific PokemonSpecies.
 * Usage:
 *   npx tsx scripts/fix-species-link.ts <primaryCardId> <pokemonSpeciesId>
 */
import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [primaryCardId, pokemonSpeciesId] = process.argv.slice(2);
  if (!primaryCardId || !pokemonSpeciesId) {
    console.error('Usage: npx tsx scripts/fix-species-link.ts <primaryCardId> <pokemonSpeciesId>');
    process.exit(1);
  }
  const updated = await prisma.primaryCard.update({
    where: { id: primaryCardId },
    data: { pokemonSpeciesId },
    include: { pokemonSpecies: true },
  });
  console.log(`Updated "${updated.name}" → ${updated.pokemonSpecies?.nameEn} (#${updated.pokemonSpecies?.dexNumber})`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
