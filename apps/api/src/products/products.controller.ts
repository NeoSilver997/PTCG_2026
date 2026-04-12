import { Controller, Get, Post, Query, HttpCode, HttpStatus, Param, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { GetProductsDto } from './dto/get-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all products with optional filters' })
  @ApiQuery({ name: 'country', required: false, type: String })
  @ApiQuery({ name: 'productType', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  async getProducts(@Query() query: GetProductsDto) {
    return this.productsService.getProducts(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a single product by ID' })
  @ApiParam({ name: 'id', type: String })
  async getProduct(@Param('id') id: string) {
    return this.productsService.getProduct(id);
  }

  @Get(':id/cards-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get card type/rarity/price summary for a product expansion' })
  @ApiParam({ name: 'id', type: String })
  async getCardsSummary(@Param('id') id: string) {
    return this.productsService.getCardsSummary(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a product by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateProductDto })
  async updateProduct(@Param('id') id: string, @Body() updateData: UpdateProductDto) {
    return this.productsService.updateProduct(id, updateData);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-import products from local JSON data files' })
  async importProducts() {
    return this.productsService.importFromFiles();
  }
}
