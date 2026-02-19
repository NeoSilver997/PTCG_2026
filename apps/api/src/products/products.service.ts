import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async getProducts(query: GetProductsDto) {
    const { country, productType, search, skip = 0, take = 50 } = query;

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

    // Transform products for frontend
    const transformedProducts = products.map(product => ({
      ...product,
      productType: product.productType?.code || null,
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

    // Transform the data for the frontend
    return {
      ...product,
      productType: product.productType?.code || null,
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

      // Handle productType - if it's provided, find the ProductType by code
      if (updateData.productType) {
        const productTypeRecord = await this.prisma.productType.findUnique({
          where: { code: updateData.productType }
        });
        if (productTypeRecord) {
          dbData.productTypeId = productTypeRecord.id;
          delete dbData.productType; // Remove the code, use the ID
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
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
  }
}
