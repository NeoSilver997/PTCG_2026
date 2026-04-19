import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // Product type groups
  private readonly PRODUCT_TYPE_GROUPS: Record<string, string[]> = {
    expansion_series: ['expansion_pack', 'enhanced_expansion', 'promo'],
    deck_series: ['starter_set', 'deck', 'constructed_deck'],
    other_products: ['accessories', 'special_products']
  };

  async getProducts(query: GetProductsDto) {
    const { country, productType, productTypeGroup, search, expansionCode, skip = 0, take = 50 } = query;

    const where: any = {};

    if (country) {
      where.country = country;
    }

    if (productType) {
      // Find the ProductType by code and filter by productTypeId
      const productTypeRecord = await this.prisma.productType.findUnique({
        where: { code: productType }
      });
      if (productTypeRecord) {
        where.productTypeId = productTypeRecord.id;
      } else {
        // If productType code not found, return empty results
        return {
          data: [],
          pagination: {
            total: 0,
            skip: Number(skip),
            take: Math.min(Number(take), 200),
          },
        };
      }
    } else if (productTypeGroup && this.PRODUCT_TYPE_GROUPS[productTypeGroup]) {
      // Filter by product type group
      const groupCodes = this.PRODUCT_TYPE_GROUPS[productTypeGroup];
      const productTypeRecords = await this.prisma.productType.findMany({
        where: { code: { in: groupCodes } }
      });
      if (productTypeRecords.length > 0) {
        where.productTypeId = { in: productTypeRecords.map(pt => pt.id) };
      } else {
        // If no product types found in group, return empty results
        return {
          data: [],
          pagination: {
            total: 0,
            skip: Number(skip),
            take: Math.min(Number(take), 200),
          },
        };
      }
    }

    if (search) {
      where.productName = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (expansionCode) {
      where.code = {
        contains: expansionCode,
        mode: 'insensitive',
      };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: Number(skip),
        take: Math.min(Number(take), 200),
        orderBy: [
          { releaseDate: 'desc' },
          { productName: 'asc' },
        ],
        include: {
          productType: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const transformedProducts = products.map(product => ({
      ...product,
      productType: product.productType ?? null,
      cardOnly: product.cardOnly === '1' || product.cardOnly === 'true' || product.cardOnly === 'Yes',
      beginnerFlag: product.beginnerFlag === 1,
    }));

    return {
      data: transformedProducts,
      pagination: {
        total,
        skip: Number(skip),
        take: Math.min(Number(take), 200),
      },
    };
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        productType: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return {
      ...product,
      productType: product.productType ?? null,
      cardOnly: product.cardOnly === '1' || product.cardOnly === 'true' || product.cardOnly === 'Yes',
      beginnerFlag: product.beginnerFlag === 1,

    };
  }

  async getCardsSummary(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { code: true, country: true },
    });

    if (!product?.code) {
      return { cardCount: 0, typeCount: {}, rarityCount: {}, totalPrice: 0, priceCount: 0, currency: 'JPY' };
    }

    const COUNTRY_TO_LANGUAGE: Record<string, string> = {
      'Japan': 'JA_JP',
      'Hong Kong (ZH)': 'ZH_TW',
      'Hong Kong (EN)': 'EN_US',
    };
    const language = COUNTRY_TO_LANGUAGE[product.country];

    const where: any = {
      regionalExpansion: {
        code: { equals: product.code, mode: 'insensitive' },
      },
    };
    if (language) where.language = language;

    const cards = await this.prisma.card.findMany({
      where,
      select: {
        supertype: true,
        rarity: true,
        prices: {
          take: 1,
          orderBy: { fetchedAt: 'desc' },
          select: { price: true, currency: true },
        },
      },
    });

    const typeCount: Record<string, number> = {};
    const rarityCount: Record<string, number> = {};
    let totalPrice = 0;
    let priceCount = 0;
    let currency = 'JPY';

    for (const card of cards) {
      const type = card.supertype || 'UNKNOWN';
      typeCount[type] = (typeCount[type] || 0) + 1;
      if (card.rarity) {
        rarityCount[card.rarity] = (rarityCount[card.rarity] || 0) + 1;
      }
      if (card.prices?.length) {
        totalPrice += card.prices[0].price;
        currency = card.prices[0].currency;
        priceCount++;
      }
    }

    return {
      cardCount: cards.length,
      typeCount,
      rarityCount,
      totalPrice: Math.round(totalPrice),
      priceCount,
      currency,
    };
  }

  async updateProduct(id: string, updateData: UpdateProductDto) {
    try {
      // Transform the data for the database
      const dbData: any = { ...updateData };

      if (updateData.cardOnly !== undefined) {
        dbData.cardOnly = updateData.cardOnly ? 'Yes' : null;
      }

      if (updateData.beginnerFlag !== undefined) {
        dbData.beginnerFlag = updateData.beginnerFlag ? 1 : 0;
      }

      // Always remove the productType string from dbData — it's not a DB column (it's a relation)
      delete dbData.productType;

      // Handle productType - if provided, look up by code and set the FK
      if (updateData.productType !== undefined) {
        if (updateData.productType === null) {
          dbData.productTypeId = null;
        } else {
          const productTypeRecord = await this.prisma.productType.findUnique({
            where: { code: updateData.productType }
          });
          if (productTypeRecord) {
            dbData.productTypeId = productTypeRecord.id;
          }
        }
      }

      const product = await this.prisma.product.update({
        where: { id },
        data: dbData,
        include: {
          productType: true,
        },
      });

      // Transform the response for the frontend
      return {
        ...product,
        productType: product.productType?.code || null,
        cardOnly: product.cardOnly === '1' || product.cardOnly === 'true' || product.cardOnly === 'Yes',
        beginnerFlag: product.beginnerFlag === 1,
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      // Prisma record-not-found error code
      if ((error as any)?.code === 'P2025') {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      throw error;
    }
  }

  async importFromFiles(): Promise<{ imported: number; skipped: number; errors: number }> {
    const logger = new Logger('ProductsImport');

    // ── Product type definitions ──────────────────────────────────────────────
    const PRODUCT_TYPES = [
      { code: 'expansion_pack',     nameJa: '拡張パック',     nameZh: '擴充包系列', nameEn: 'Expansion Pack' },
      { code: 'enhanced_expansion', nameJa: '強化拡張パック', nameZh: '高級擴充包', nameEn: 'Enhanced Expansion' },
      { code: 'starter_set',        nameJa: '入門セット',     nameZh: '初階牌組',   nameEn: 'Starter Set' },
      { code: 'constructed_deck',   nameJa: '構築デッキ',     nameZh: '對戰牌組',   nameEn: 'Constructed Deck' },
      { code: 'accessories',        nameJa: '周辺グッズ',     nameZh: '相關商品',   nameEn: 'Accessories' },
      { code: 'special_products',   nameJa: 'その他の商品',   nameZh: '其他商品',   nameEn: 'Special Products' },
      { code: 'deck',               nameJa: 'デッキ',          nameZh: '收藏牌組',   nameEn: 'Deck' },
    ];
    const JP_TYPE_MAP: Record<string, string> = {
      '拡張パック': 'expansion_pack', '強化拡張パック': 'enhanced_expansion',
      '入門セット': 'starter_set', '構築デッキ': 'constructed_deck',
      '周辺グッズ': 'accessories', 'その他の商品': 'special_products', 'デッキ': 'deck',
    };
    const inferZhType = (name: string): string => {
      if (name.includes('高級擴充包') || name.includes('強化擴充包')) return 'enhanced_expansion';
      if (name.includes('擴充包')) return 'expansion_pack';
      if (name.includes('初階牌組') || name.includes('V初階牌組') || name.includes('ex初階牌組') ||
          name.includes('雙ex初階牌組') || name.includes('G超起始牌組') ||
          name.includes('起始組合') || name.includes('V起始牌組')) return 'starter_set';
      if (name.includes('挑戰牌組') || name.includes('戰術牌組') ||
          name.includes('牌組構築BOX') || name.includes('特別牌組組合')) return 'deck';
      if (name.includes('頂級訓練家收藏箱')) return 'accessories';
      return 'special_products';
    };

    // ── Seed product types ────────────────────────────────────────────────────
    const typeMap = new Map<string, string>();
    for (const pt of PRODUCT_TYPES) {
      const record = await this.prisma.productType.upsert({
        where: { code: pt.code },
        update: { nameJa: pt.nameJa, nameZh: pt.nameZh, nameEn: pt.nameEn },
        create: pt,
      });
      typeMap.set(record.code, record.id);
    }

    const upsertProduct = async (p: any, productTypeId: string | null) => {
      await this.prisma.product.upsert({
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
          productTypeId,
        },
        create: {
          country: p.country,
          productName: p.product_name,
          price: p.price || null,
          releaseDate: p.release_date || '',
          code: p.code || null,
          link: p.link || null,
          imageUrl: p.image_url || null,
          include: p.include || null,
          cardOnly: p.card_only || null,
          beginnerFlag: p.beginner_flag != null ? Number(p.beginner_flag) : 0,
          storesAvailable: p.stores_available || null,
          linkCardList: p.link_card_list || null,
          linkPokemonCenter: p.link_pokemon_center || null,
          productTypeId,
        },
      });
    };

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // ── Source 1: HK Chinese ─────────────────────────────────────────────────
    const hkZhPath = path.join(process.cwd(), 'data', 'chinese_products.json');
    if (fs.existsSync(hkZhPath)) {
      const hkProducts: any[] = JSON.parse(fs.readFileSync(hkZhPath, 'utf-8'));
      logger.log(`Importing ${hkProducts.length} HK (ZH) products`);
      for (const p of hkProducts) {
        try {
          const typeId = typeMap.get(inferZhType(p.product_name)) ?? null;
          await upsertProduct(p, typeId);
          imported++;
        } catch (e: any) {
          logger.error(`[HK-ZH] ${p.product_name}: ${e.message}`);
          errors++;
        }
      }
    } else {
      logger.warn(`HK Chinese data not found: ${hkZhPath}`);
    }

    // ── Source 2: Japan + HK (EN) ────────────────────────────────────────────
    const jpPath = path.join(process.cwd(), '..', 'PTCG_CardDB', 'ptcg_products.json');
    if (fs.existsSync(jpPath)) {
      const allProducts: any[] = JSON.parse(fs.readFileSync(jpPath, 'utf-8'));
      const jpProducts = allProducts.filter((p: any) => p.country === 'Japan');
      const hkEnProducts = allProducts.filter((p: any) => p.country === 'Hong Kong (EN)');

      logger.log(`Importing ${jpProducts.length} Japan products`);
      for (const p of jpProducts) {
        try {
          const typeCode = JP_TYPE_MAP[p.product_type] ?? 'special_products';
          await upsertProduct(p, typeMap.get(typeCode) ?? null);
          imported++;
        } catch (e: any) {
          logger.error(`[JP] ${p.product_name}: ${e.message}`);
          errors++;
        }
      }

      logger.log(`Importing ${hkEnProducts.length} HK (EN) products`);
      for (const p of hkEnProducts) {
        try {
          const typeCode = p.card_only === 'Yes' ? 'expansion_pack' : 'special_products';
          await upsertProduct(p, typeMap.get(typeCode) ?? null);
          imported++;
        } catch (e: any) {
          logger.error(`[HK-EN] ${p.product_name}: ${e.message}`);
          errors++;
        }
      }
    } else {
      logger.warn(`Japan/HK-EN data not found: ${jpPath}`);
    }

    logger.log(`Import complete: ${imported} upserted, ${skipped} skipped, ${errors} errors`);
    return { imported, skipped, errors };
  }
}
