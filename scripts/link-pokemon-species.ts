/**
 * Link PrimaryCards to PokemonSpecies
 *
 * Scans all PrimaryCard rows with pokemonSpeciesId = null that have at least
 * one Card with supertype = POKEMON, strips variant suffixes/prefixes from
 * the card name, and links matching PokemonSpecies records.
 *
 * Usage:
 *   npx tsx scripts/link-pokemon-species.ts
 *
 * Options:
 *   --dry-run   Print matches without updating the database
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Name normalization helpers
// ---------------------------------------------------------------------------

/**
 * Strip variant suffixes/prefixes from an English card name and return
 * one or more candidate base names to try against PokemonSpecies.nameEn.
 */
function extractBaseNames(cardName: string): string[] {
  let name = cardName.trim();

  // ── Suffixes ──────────────────────────────────────────────────────────────
  name = name.replace(/[\s-]*(VSTAR|VMAX|V-UNION)\s*$/i, '').trim();
  name = name.replace(/[\s-]+V\s*$/i, '').trim();
  name = name.replace(/[\s-]*(TAG\s+TEAM[\s-]*GX)\s*$/i, '').trim();
  name = name.replace(/[\s-]*(GX)\s*$/i, '').trim();
  name = name.replace(/[\s-]*(EX|ex)\s*$/i, '').trim();
  name = name.replace(/[\s-]*◇\s*$/i, '').trim();
  name = name.replace(/\s+PRISM\s+STAR\s*$/i, '').trim();
  name = name.replace(/\s*\(.*?\)\s*$/, '').trim();

  // ── Prefixes ──────────────────────────────────────────────────────────────
  name = name
    .replace(/^(Mega|Shadow|Dark|Shining|Radiant|Ancient|Future)\s+/i, '')
    .trim();

  // ── Tag Team "Pikachu & Zekrom-GX" → ["Pikachu", "Zekrom"] ──────────────
  if (name.includes(' & ')) {
    return name
      .split(' & ')
      .map(n =>
        n
          .trim()
          .replace(/[\s-]*(GX|EX|ex|VSTAR|VMAX|V)\s*$/i, '')
          .trim(),
      );
  }

  return [name];
}

/**
 * Strip variant suffixes/prefixes from a Japanese card name and return
 * candidate base names to try against PokemonSpecies.nameJa.
 * Japanese variant tokens use Latin text (ex, GX, V, VSTAR, VMAX) and JP prefixes.
 */
function extractBaseNamesJa(cardName: string): string[] {
  let name = cardName.trim();

  // Latin suffixes mixed into Japanese names
  name = name.replace(/(VSTAR|VMAX|V-UNION)\s*$/i, '').trim();
  name = name.replace(/V\s*$/i, '').trim();
  name = name.replace(/(GX)\s*$/i, '').trim();
  name = name.replace(/(EX|ex)\s*$/i, '').trim();
  name = name.replace(/◇\s*$/, '').trim();

  // Japanese prefixes: メガ=Mega, ダーク=Dark, シャイニング=Shining, ラジアント=Radiant
  name = name.replace(/^(メガ|ダーク|シャイニング|ラジアント|いにしえの|みらいの)/, '').trim();

  return [name];
}

/**
 * Strip variant suffixes/prefixes from a Trad/Simp Chinese card name.
 */
function extractBaseNamesZh(cardName: string): string[] {
  let name = cardName.trim();

  // Latin suffixes
  name = name.replace(/(VSTAR|VMAX|V-UNION)\s*$/i, '').trim();
  name = name.replace(/V\s*$/i, '').trim();
  name = name.replace(/(GX)\s*$/i, '').trim();
  name = name.replace(/(EX|ex)\s*$/i, '').trim();
  name = name.replace(/◇\s*$/, '').trim();

  // Chinese prefixes: 超級=Mega, 黑暗=Dark, 閃亮=Shining, 光彩=Radiant, 超级=Mega(Simp)
  name = name.replace(/^(超級|超级|黑暗|閃亮|闪亮|光彩|遠古|未來|未来)/, '').trim();

  return [name];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log(DRY_RUN ? 'DRY RUN – no DB changes will be made' : 'LIVE RUN – DB will be updated');
  console.log('='.repeat(60));

  // 1. Load all species into lookup maps keyed by name (lower-case), base forms preferred
  const allSpecies = await prisma.pokemonSpecies.findMany({
    select: { id: true, dexNumber: true, nameEn: true, nameJa: true, nameZhHant: true, nameZhHans: true, form: true },
  });

  const speciesMap     = new Map<string, (typeof allSpecies)[number]>(); // by nameEn
  const speciesMapJa   = new Map<string, (typeof allSpecies)[number]>(); // by nameJa
  const speciesMapZhHt = new Map<string, (typeof allSpecies)[number]>(); // by nameZhHant
  const speciesMapZhHs = new Map<string, (typeof allSpecies)[number]>(); // by nameZhHans

  // Base forms first so they win over alternate forms for the same name
  for (const s of allSpecies) {
    if (s.form === '') {
      speciesMap.set(s.nameEn.toLowerCase(), s);
      speciesMapJa.set(s.nameJa.toLowerCase(), s);
      speciesMapZhHt.set(s.nameZhHant.toLowerCase(), s);
      speciesMapZhHs.set(s.nameZhHans.toLowerCase(), s);
    }
  }
  for (const s of allSpecies) {
    if (s.form !== '') {
      if (!speciesMap.has(s.nameEn.toLowerCase()))       speciesMap.set(s.nameEn.toLowerCase(), s);
      if (!speciesMapJa.has(s.nameJa.toLowerCase()))     speciesMapJa.set(s.nameJa.toLowerCase(), s);
      if (!speciesMapZhHt.has(s.nameZhHant.toLowerCase())) speciesMapZhHt.set(s.nameZhHant.toLowerCase(), s);
      if (!speciesMapZhHs.has(s.nameZhHans.toLowerCase())) speciesMapZhHs.set(s.nameZhHans.toLowerCase(), s);
    }
  }

  console.log(`Loaded ${allSpecies.length} species (${speciesMap.size} EN / ${speciesMapJa.size} JA / ${speciesMapZhHt.size} ZhHant keys)`);

  // 2. Find all PrimaryCards with null pokemonSpeciesId that have POKEMON cards
  const unlinked = await prisma.primaryCard.findMany({
    where: {
      pokemonSpeciesId: null,
      cards: { some: { supertype: 'POKEMON' } },
    },
    select: { id: true, name: true },
  });

  console.log(`Found ${unlinked.length} unlinked POKEMON PrimaryCards\n`);

  let linked = 0;
  let skipped = 0;
  const unmatched: string[] = [];

  for (const pc of unlinked) {
    // Try English candidates first
    const enCandidates = extractBaseNames(pc.name);
    // Try Japanese candidates
    const jaCandidates = extractBaseNamesJa(pc.name);
    // Try Chinese candidates
    const zhCandidates = extractBaseNamesZh(pc.name);

    let matched: (typeof allSpecies)[number] | undefined;
    let matchLabel = 'MATCH';

    // 1. Exact EN match
    for (const c of enCandidates) {
      matched = speciesMap.get(c.toLowerCase());
      if (matched) break;
    }

    // 2. Exact JA match
    if (!matched) {
      for (const c of jaCandidates) {
        matched = speciesMapJa.get(c.toLowerCase());
        if (matched) { matchLabel = 'MATCH-JA'; break; }
      }
    }

    // 3. Exact ZhHant match
    if (!matched) {
      for (const c of zhCandidates) {
        matched = speciesMapZhHt.get(c.toLowerCase());
        if (matched) { matchLabel = 'MATCH-ZH'; break; }
      }
    }

    // 4. Exact ZhHans match
    if (!matched) {
      for (const c of zhCandidates) {
        matched = speciesMapZhHs.get(c.toLowerCase());
        if (matched) { matchLabel = 'MATCH-ZH'; break; }
      }
    }

    // 5. Fuzzy EN suffix match
    if (!matched) {
      const longest = enCandidates.reduce((a, b) => a.length >= b.length ? a : b);
      const sub = allSpecies.find(
        s => s.form === '' && (
          s.nameEn.toLowerCase() === longest.toLowerCase() ||
          longest.toLowerCase().endsWith(` ${s.nameEn.toLowerCase()}`)
        ),
      );
      if (sub) { matched = sub; matchLabel = 'FUZZY'; }
    }

    if (matched) {
      console.log(
        `  ${matchLabel}  "${pc.name}" → "${matched.nameEn}" (#${matched.dexNumber})`,
      );
      if (!DRY_RUN) {
        await prisma.primaryCard.update({
          where: { id: pc.id },
          data: { pokemonSpeciesId: matched.id },
        });
      }
      linked++;
    } else {
      unmatched.push(pc.name);
      skipped++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total unlinked:  ${unlinked.length}`);
  console.log(`Linked:          ${linked}`);
  console.log(`Unmatched:       ${skipped}`);

  if (unmatched.length > 0) {
    console.log('\nUnmatched card names (need manual mapping or missing species):');
    for (const name of unmatched.sort()) {
      console.log(`  - ${name}`);
    }
  }

  console.log('='.repeat(60));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
