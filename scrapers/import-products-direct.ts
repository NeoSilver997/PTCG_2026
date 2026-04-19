/**
 * Direct Product Import Script
 * Imports product data from multiple sources into the database.
 *
 * Sources:
 *   - data/chinese_products.json          — Hong Kong (ZH) products
 *   - PTCG_CardDB/ptcg_products.json      — Japan + Hong Kong (EN) products
 *
 * Features:
 *   - Seeds ProductType table with all known types
 *   - Assigns productTypeId to all products (inferred from name for HK/EN)
 *   - Upserts by unique key: country + code + productName + releaseDate
 *
 * Usage:
 *   npx tsx scrapers/import-products-direct.ts
 */

import { PrismaClient } from '../packages/database/node_modules/.prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ─── Product Type Definitions ─────────────────────────────────────────────────

const PRODUCT_TYPES = [
  { code: 'expansion_pack',    nameJa: '拡張パック',     nameZh: '擴充包系列',  nameEn: 'Expansion Pack' },
  { code: 'enhanced_expansion',nameJa: '強化拡張パック', nameZh: '高級擴充包',  nameEn: 'Enhanced Expansion' },
  { code: 'starter_set',       nameJa: '入門セット',     nameZh: '初階牌組',    nameEn: 'Starter Set' },
  { code: 'constructed_deck',  nameJa: '構築デッキ',     nameZh: '對戰牌組',    nameEn: 'Constructed Deck' },
  { code: 'accessories',       nameJa: '周辺グッズ',     nameZh: '相關商品',    nameEn: 'Accessories' },
  { code: 'special_products',  nameJa: 'その他の商品',   nameZh: '其他商品',    nameEn: 'Special Products' },
  { code: 'deck',              nameJa: 'デッキ',          nameZh: '收藏牌組',    nameEn: 'Deck' },
];

// Japanese product_type field → code
const JP_TYPE_MAP: Record<string, string> = {
  '拡張パック':    'expansion_pack',
  '強化拡張パック':'enhanced_expansion',
  '入門セット':    'starter_set',
  '構築デッキ':    'constructed_deck',
  '周辺グッズ':    'accessories',
  'その他の商品':  'special_products',
  'デッキ':        'deck',
};

/** Infer product type code from HK Chinese product name */
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
  return 'special_products'; // fallback
}

/** Infer product type code from HK English product (based on card_only flag) */
function inferEnTypeCode(name: string, cardOnly: string): string {
  if (cardOnly === 'Yes') return 'expansion_pack';
  return 'special_products';
}

// ─── Seed ProductType table ───────────────────────────────────────────────────

async function seedProductTypes(): Promise<Map<string, string>> {
  console.log('Seeding ProductType table...');
  const codeToId = new Map<string, string>();

  for (const pt of PRODUCT_TYPES) {
    const record = await prisma.productType.upsert({
      where: { code: pt.code },
      update: { nameJa: pt.nameJa, nameZh: pt.nameZh, nameEn: pt.nameEn },
      create: pt,
    });
    codeToId.set(record.code, record.id);
    console.log(`  ✓ ${record.code} (${record.nameZh})`);
  }

  return codeToId;
}

// ─── Upsert one product ───────────────────────────────────────────────────────

async function upsertProduct(p: any, productTypeId: string | null) {
  await prisma.product.upsert({
    where: {
      country_code_productName_releaseDate: {
        country: p.country,
        productName: p.product_name,
        code: p.code || '',
        releaseDate: p.release_date || '',
      },
    },
    update: {
      price: p.price || null,
      releaseDate: p.release_date || '',
      link: p.link || null,
      imageUrl: p.image_url || null,
      include: p.include || null,
      cardOnly: p.card_only || null,
      beginnerFlag: p.beginner_flag != null ? Number(p.beginner_flag) : 0,
      storesAvailable: p.stores_available || null,
      linkCardList: p.link_card_list || null,
      linkPokemonCenter: p.link_pokemon_center || null,
      productTypeId: productTypeId,
    },
    create: {
      country: p.country,
      productName: p.product_name,
      price: p.price || null,
      releaseDate: p.release_date || null,
      code: p.code || null,
      link: p.link || null,
      imageUrl: p.image_url || null,
      include: p.include || null,
      cardOnly: p.card_only || null,
      beginnerFlag: p.beginner_flag != null ? Number(p.beginner_flag) : 0,
      storesAvailable: p.stores_available || null,
      linkCardList: p.link_card_list || null,
      linkPokemonCenter: p.link_pokemon_center || null,
      productTypeId: productTypeId,
    },
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Seed product types
  const typeMap = await seedProductTypes();
  console.log('');

  // 2. Import HK Chinese products —— data/chinese_products.json
  const hkZhPath = path.join('data', 'chinese_products.json');
  if (!fs.existsSync(hkZhPath)) {
    console.warn(`WARNING: ${hkZhPath} not found — skipping HK Chinese import`);
  } else {
    const hkZhProducts: any[] = JSON.parse(fs.readFileSync(hkZhPath, 'utf-8'));
    console.log(`Importing ${hkZhProducts.length} HK (ZH) products...`);
    let ok = 0, fail = 0;
    for (const p of hkZhProducts) {
      try {
        const typeCode = inferZhTypeCode(p.product_name);
        const typeId = typeMap.get(typeCode) ?? null;
        await upsertProduct(p, typeId);
        ok++;
      } catch (e: any) {
        console.error(`  [HK-ZH] Error: ${p.product_name} — ${e.message}`);
        fail++;
      }
    }
    console.log(`  → ${ok} OK, ${fail} errors\n`);
  }

  // 3. Import Japan + HK (EN) products —— PTCG_CardDB/ptcg_products.json
  const jpSourcePath = path.join('..', 'PTCG_CardDB', 'ptcg_products.json');
  if (!fs.existsSync(jpSourcePath)) {
    console.warn(`WARNING: ${jpSourcePath} not found — skipping Japan/HK-EN import`);
  } else {
    const allProducts: any[] = JSON.parse(fs.readFileSync(jpSourcePath, 'utf-8'));
    const jpProducts = allProducts.filter((p: any) => p.country === 'Japan');
    const hkEnProducts = allProducts.filter((p: any) => p.country === 'Hong Kong (EN)');

    // Japan
    console.log(`Importing ${jpProducts.length} Japan products...`);
    let okJp = 0, failJp = 0;
    for (const p of jpProducts) {
      try {
        const typeCode = JP_TYPE_MAP[p.product_type] ?? 'special_products';
        const typeId = typeMap.get(typeCode) ?? null;
        await upsertProduct(p, typeId);
        okJp++;
      } catch (e: any) {
        console.error(`  [JP] Error: ${p.product_name} — ${e.message}`);
        failJp++;
      }
    }
    console.log(`  → ${okJp} OK, ${failJp} errors\n`);

    // HK English
    console.log(`Importing ${hkEnProducts.length} HK (EN) products...`);
    let okEn = 0, failEn = 0;
    for (const p of hkEnProducts) {
      try {
        const typeCode = inferEnTypeCode(p.product_name, p.card_only);
        const typeId = typeMap.get(typeCode) ?? null;
        await upsertProduct(p, typeId);
        okEn++;
      } catch (e: any) {
        console.error(`  [HK-EN] Error: ${p.product_name} — ${e.message}`);
        failEn++;
      }
    }
    console.log(`  → ${okEn} OK, ${failEn} errors\n`);
  }

  // Final count
  const total = await prisma.product.count();
  console.log('============================================================');
  console.log('IMPORT COMPLETE');
  console.log('============================================================');
  console.log(`Total products in DB: ${total}`);
  console.log('============================================================');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
