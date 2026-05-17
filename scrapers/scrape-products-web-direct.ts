/**
 * scrape-products-web-direct.ts
 *
 * Migrated web product scraper logic for this repo.
 *
 * Sources:
 *   - https://asia.pokemon-card.com/hk-en/card-search/?pageNo=N
 *   - https://asia.pokemon-card.com/hk/card-search/?pageNo=N
 *
 * Features:
 *   - Scrape first N pages (default: 5)
 *   - Export JSON snapshot
 *   - Optional direct DB import
 *   - Dry-run mode (no DB write)
 *   - Never overwrites existing products (insert only)
 *
 * Usage:
 *   npx tsx scrapers/scrape-products-web-direct.ts --dry-run --max-pages 5
 *   npx tsx scrapers/scrape-products-web-direct.ts --max-pages 5 --import-db
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const HK_EN_URL = 'https://asia.pokemon-card.com/hk-en/card-search/';
const HK_ZH_URL = 'https://asia.pokemon-card.com/hk/card-search/';

const PRODUCT_TYPES = [
  { code: 'expansion_pack', nameJa: '拡張パック', nameZh: '擴充包系列', nameEn: 'Expansion Pack' },
  { code: 'enhanced_expansion', nameJa: '強化拡張パック', nameZh: '高級擴充包', nameEn: 'Enhanced Expansion' },
  { code: 'starter_set', nameJa: '入門セット', nameZh: '初階牌組', nameEn: 'Starter Set' },
  { code: 'constructed_deck', nameJa: '構築デッキ', nameZh: '對戰牌組', nameEn: 'Constructed Deck' },
  { code: 'accessories', nameJa: '周辺グッズ', nameZh: '相關商品', nameEn: 'Accessories' },
  { code: 'special_products', nameJa: 'その他の商品', nameZh: '其他商品', nameEn: 'Special Products' },
  { code: 'deck', nameJa: 'デッキ', nameZh: '收藏牌組', nameEn: 'Deck' },
];

type ProductRow = {
  country: string;
  product_name: string;
  price: string;
  release_date: string;
  code: string;
  link: string;
  image_url: string;
  include: string;
  card_only: string;
  product_type: string;
  beginner_flag: string;
  stores_available: string;
  link_card_list: string;
  link_pokemon_center: string;
};

type CliOptions = {
  maxPages: number;
  dryRun: boolean;
  importDb: boolean;
  output: string;
};

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return null;
  return value;
}

function parseOptions(): CliOptions {
  const maxPages = Number(getArg('--max-pages') ?? '5');
  const output = getArg('--output') ?? path.join('data', 'products', 'web_products_dryrun.json');
  const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--import-db');
  const importDb = process.argv.includes('--import-db');

  if (!Number.isFinite(maxPages) || maxPages < 1) {
    throw new Error('--max-pages must be a positive number');
  }

  return { maxPages, dryRun, importDb, output };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function toIsoDate(raw: string): string {
  const text = raw.trim();

  const ymd = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) {
    const yyyy = ymd[1];
    const mm = ymd[2].padStart(2, '0');
    const dd = ymd[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  const mdy = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (mdy) {
    const mm = mdy[1].padStart(2, '0');
    const dd = mdy[2].padStart(2, '0');
    const yyyy = mdy[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return text;
}

function parseDateFromText(raw: string): string {
  const text = raw.trim();
  if (!text) return '';

  const en = text.match(/Release\s*Date\s*([0-9\-/.]+)/i);
  if (en) return toIsoDate(en[1]);

  const zh = text.match(/發售日\s*([0-9\-/.]+)/i);
  if (zh) return toIsoDate(zh[1]);

  return '';
}

function cleanProductName(raw: string): string {
  return raw
    .replace(/Release\s*Date\s*[0-9\-/.]+/gi, '')
    .replace(/發售日\s*[0-9\-/.]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCodeFromLink(link: string): string {
  const m = link.match(/[?&]expansionCodes=([^&#]+)/i);
  if (!m) return '';
  return decodeURIComponent(m[1]).trim();
}

function extractImageUrlFromBlock(block: string): string {
  const dataSrc = (block.match(/<img[^>]*data-src=["']([^"']+)["']/i) || [])[1] || '';
  if (dataSrc) return decodeHtml(dataSrc);

  const src = (block.match(/<img[^>]*src=["']([^"']+)["']/i) || [])[1] || '';
  if (src) return decodeHtml(src);

  return '';
}

function inferZhTypeCode(name: string): string {
  if (name.includes('高級擴充包') || name.includes('強化擴充包')) return 'enhanced_expansion';
  if (name.includes('擴充包')) return 'expansion_pack';
  if (
    name.includes('初階牌組') || name.includes('V初階牌組') ||
    name.includes('ex初階牌組') || name.includes('雙ex初階牌組') ||
    name.includes('G超起始牌組') || name.includes('起始組合') ||
    name.includes('V起始牌組')
  ) return 'starter_set';
  if (
    name.includes('挑戰牌組') || name.includes('戰術牌組') ||
    name.includes('牌組構築BOX') || name.includes('特別牌組組合')
  ) return 'deck';
  if (name.includes('頂級訓練家收藏箱')) return 'accessories';
  if (
    name.includes('特典卡') || name.includes('特別組合') ||
    name.includes('V-UNION') || name.includes('家庭組合') ||
    name.includes('收藏箱')
  ) return 'special_products';
  return 'special_products';
}

function inferEnTypeCode(_name: string, cardOnly: string): string {
  if (cardOnly === 'Yes') return 'expansion_pack';
  return 'special_products';
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} at ${url}`);
  }

  return await res.text();
}

function parseProductItemsFromHtml(html: string, country: string): ProductRow[] {
  const rows: ProductRow[] = [];
  const itemRe = /<li[^>]*class=["'][^"']*(?:expansionItem|expansion)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;

  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html)) !== null) {
    const block = m[1];

    const title = stripHtml((block.match(/<h3[^>]*class=["'][^"']*expansionTitle[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || '');
    const series = stripHtml((block.match(/<span[^>]*class=["'][^"']*series[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '');
    const href = decodeHtml((block.match(/<a[^>]*class=["'][^"']*expansionLink[^"']*["'][^>]*href=["']([^"']+)["']/i) || [])[1] || '');
    const img = extractImageUrlFromBlock(block);
    const timeText = stripHtml((block.match(/<time[^>]*>([\s\S]*?)<\/time>/i) || [])[1] || '');

    const productNameRaw = [series, title].filter(Boolean).join(' ').trim() || title || series;
    const productName = cleanProductName(productNameRaw);
    const link = href.startsWith('http') ? href : `https://asia.pokemon-card.com${href}`;
    const imageUrl = img.startsWith('http') ? img : `https://asia.pokemon-card.com${img}`;
    const parsedDateFromName = parseDateFromText(productNameRaw);
    const finalDate = toIsoDate(timeText) || parsedDateFromName;

    if (!productName && !href) {
      continue;
    }

    rows.push({
      country,
      product_name: productName,
      price: '',
      release_date: finalDate,
      code: extractCodeFromLink(link),
      link,
      image_url: imageUrl,
      include: '',
      card_only: 'Yes',
      product_type: '',
      beginner_flag: '',
      stores_available: '',
      link_card_list: '',
      link_pokemon_center: '',
    });
  }

  // Fallback parser for simpler anchor-only layout.
  if (rows.length === 0) {
    const anchorRe = /<a[^>]*href=["']([^"']*card-search\/list\/\?expansionCodes=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let a: RegExpExecArray | null;
    while ((a = anchorRe.exec(html)) !== null) {
      const href = decodeHtml(a[1]);
      const text = stripHtml(a[2]);
      const release = parseDateFromText(text);
      const name = cleanProductName(text);
      const link = href.startsWith('http') ? href : `https://asia.pokemon-card.com${href}`;

      if (!name) continue;

      rows.push({
        country,
        product_name: name,
        price: '',
        release_date: toIsoDate(release),
        code: extractCodeFromLink(link),
        link,
        image_url: '',
        include: '',
        card_only: 'Yes',
        product_type: '',
        beginner_flag: '',
        stores_available: '',
        link_card_list: '',
        link_pokemon_center: '',
      });
    }
  }

  return rows;
}

async function scrapeHongKongPages(baseUrl: string, country: string, maxPages: number): Promise<ProductRow[]> {
  const all: ProductRow[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = `${baseUrl}?pageNo=${page}`;
    const html = await fetchPage(url);
    const items = parseProductItemsFromHtml(html, country);

    if (items.length === 0) {
      console.log(`No items found on ${country} page ${page}, stopping.`);
      break;
    }

    all.push(...items);
    console.log(`${country} page ${page}: ${items.length} products`);
  }

  return all;
}

function dedupeProducts(rows: ProductRow[]): ProductRow[] {
  const seen = new Set<string>();
  const out: ProductRow[] = [];

  for (const p of rows) {
    const key = [p.country, p.product_name, p.code || '', p.release_date || ''].join('||');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out;
}

async function seedProductTypes(): Promise<Map<string, string>> {
  const codeToId = new Map<string, string>();

  for (const pt of PRODUCT_TYPES) {
    const record = await prisma.productType.upsert({
      where: { code: pt.code },
      update: { nameJa: pt.nameJa, nameZh: pt.nameZh, nameEn: pt.nameEn },
      create: pt,
    });
    codeToId.set(record.code, record.id);
  }

  return codeToId;
}

async function insertOnlyProduct(p: ProductRow, productTypeId: string | null, dryRun: boolean): Promise<'insert' | 'skip'> {
  const existingByComposite = await prisma.product.findUnique({
    where: {
      country_code_productName_releaseDate: {
        country: p.country,
        productName: p.product_name,
        code: p.code || '',
        releaseDate: p.release_date || '',
      },
    },
  });

  if (existingByComposite) return 'skip';

  if (p.code) {
    const existingByCode = await prisma.product.findFirst({
      where: {
        country: p.country,
        code: p.code,
      },
      select: { id: true },
    });
    if (existingByCode) return 'skip';
  }

  if (p.link) {
    const existingByLink = await prisma.product.findFirst({
      where: {
        country: p.country,
        link: p.link,
      },
      select: { id: true },
    });
    if (existingByLink) return 'skip';
  }

  const existingByName = await prisma.product.findFirst({
    where: {
      country: p.country,
      productName: p.product_name,
    },
    select: { id: true },
  });
  if (existingByName) return 'skip';

  if (!dryRun) {
    await prisma.product.create({
      data: {
        country: p.country,
        productName: p.product_name,
        price: p.price || null,
        releaseDate: p.release_date || null,
        code: p.code || null,
        link: p.link || null,
        imageUrl: p.image_url || null,
        include: p.include || null,
        cardOnly: p.card_only || null,
        beginnerFlag: p.beginner_flag ? Number(p.beginner_flag) : 0,
        storesAvailable: p.stores_available || null,
        linkCardList: p.link_card_list || null,
        linkPokemonCenter: p.link_pokemon_center || null,
        productTypeId,
      },
    });
  }

  return 'insert';
}

async function main() {
  const opts = parseOptions();
  console.log('============================================================');
  console.log('WEB PRODUCT SCRAPER + IMPORT');
  console.log('============================================================');
  console.log(`max pages: ${opts.maxPages}`);
  console.log(`dry run: ${opts.dryRun ? 'YES' : 'NO'}`);
  console.log(`import DB: ${opts.importDb ? 'YES' : 'NO'}`);
  console.log('============================================================\n');

  const [hkEn, hkZh] = await Promise.all([
    scrapeHongKongPages(HK_EN_URL, 'Hong Kong (EN)', opts.maxPages),
    scrapeHongKongPages(HK_ZH_URL, 'Hong Kong (ZH)', opts.maxPages),
  ]);

  const scraped = dedupeProducts([...hkEn, ...hkZh]);

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(scraped, null, 2), 'utf-8');
  console.log(`Saved ${scraped.length} scraped products to ${opts.output}\n`);

  if (!opts.importDb) {
    console.log('DB import not requested. Done.');
    return;
  }

  const typeMap = await seedProductTypes();

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of scraped) {
    try {
      const typeCode = p.country === 'Hong Kong (EN)'
        ? inferEnTypeCode(p.product_name, p.card_only)
        : inferZhTypeCode(p.product_name);
      const typeId = typeMap.get(typeCode) ?? null;

      const result = await insertOnlyProduct(p, typeId, opts.dryRun);
      if (result === 'insert') inserted++;
      else skipped++;
    } catch (error: any) {
      errors++;
      console.error(`[ERROR] ${p.product_name} - ${error.message}`);
    }
  }

  console.log('\n============================================================');
  console.log(opts.dryRun ? 'DRY RUN SUMMARY' : 'IMPORT SUMMARY');
  console.log('============================================================');
  console.log(`Scraped: ${scraped.length}`);
  console.log(`Would insert: ${inserted}`);
  console.log(`Would skip: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log('============================================================');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
