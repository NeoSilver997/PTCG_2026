import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async getProducts(query: GetProductsDto) {
    const { country, productType, search, expansionCode, skip = 0, take = 50 } = query;

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
            take: Math.min(Number(take), 100),
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
        equals: expansionCode,
        mode: 'insensitive',
      };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: Number(skip),
        take: Math.min(Number(take), 100),
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
        take: Math.min(Number(take), 100),
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
    const dataDir = path.join(__dirname, '..', '..', '..', '..', '..', 'data');
    const filePath = path.join(dataDir, 'chinese_products.json');

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    if (!fs.existsSync(filePath)) {
      logger.warn(`Product data file not found: ${filePath}`);
      return { imported, skipped, errors };
    }

    const products: any[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    logger.log(`Importing ${products.length} products from ${filePath}`);

    for (const p of products) {
      try {
        await this.prisma.product.upsert({
          where: {
            country_code_productName_releaseDate: {
              country: p.country,
              productName: p.product_name,
              code: p.code || '',
              releaseDate: p.release_date || null,
            },
          },
          update: {
            price: p.price || null,
            releaseDate: p.release_date || null,
            link: p.link || null,
            imageUrl: p.image_url || null,
            include: p.include || null,
            cardOnly: p.card_only || null,
            storesAvailable: p.stores_available || null,
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
            storesAvailable: p.stores_available || null,
          },
        });
        imported++;
      } catch (error) {
        logger.error(`Failed to upsert product ${p.product_name}: ${error.message}`);
        errors++;
      }
    }

    logger.log(`Import complete: ${imported} upserted, ${skipped} skipped, ${errors} errors`);
    return { imported, skipped, errors };
  }
}
