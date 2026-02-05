import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { GetProductsDto } from './dto/get-products.dto';

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

    return {
      data: products,
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

    return product;
  }

  async updateProduct(id: string, updateData: any) {
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: updateData,
      });
      return product;
    } catch (error) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
  }
}
