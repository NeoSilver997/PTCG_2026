// Temporary script: dry run migration of product_scraper.py output to product import
// This script will:
// 1. Run product_scraper.py for first 5 pages (simulate or require user to run Python and export JSON)
// 2. Load the scraped products (assume output as JSON: 'ptcg_products_dryrun.json')
// 3. For each product, check if it would be inserted or skipped (no DB writes)
// 4. Print a summary: would-insert, would-skip, and any errors

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Path to dry run JSON (user must export this from product_scraper.py for first 5 pages)
const DRYRUN_PATH = path.join('..', 'PTCG_CardDB', 'ptcg_products_dryrun.json');

async function dryRunImport() {
  if (!fs.existsSync(DRYRUN_PATH)) {
    console.error(`ERROR: ${DRYRUN_PATH} not found. Please export first 5 pages from product_scraper.py as JSON.`);
    process.exit(1);
  }
  const products = JSON.parse(fs.readFileSync(DRYRUN_PATH, 'utf-8'));
  let wouldInsert = 0, wouldSkip = 0, errors = 0;
  for (const p of products) {
    try {
      const existing = await prisma.product.findUnique({
        where: {
          country_code_productName_releaseDate: {
            country: p.country,
            productName: p.product_name,
            code: p.code || '',
            releaseDate: p.release_date || '',
          },
        },
      });
      if (!existing) {
        wouldInsert++;
        console.log(`[INSERT] ${p.country} | ${p.product_name} | ${p.code} | ${p.release_date}`);
      } else {
        wouldSkip++;
        // Optionally print skipped
        // console.log(`[SKIP] ${p.country} | ${p.product_name} | ${p.code} | ${p.release_date}`);
      }
    } catch (e) {
      errors++;
      console.error(`[ERROR] ${p.product_name} — ${(e as any).message}`);
    }
  }
  console.log('============================================================');
  console.log(`Dry run complete. Would insert: ${wouldInsert}, Would skip: ${wouldSkip}, Errors: ${errors}`);
  console.log('============================================================');
  await prisma.$disconnect();
}

dryRunImport();
