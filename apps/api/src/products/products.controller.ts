import { Controller, Get, Query, HttpCode, HttpStatus, Param, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { GetProductsDto } from './dto/get-products.dto';

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

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a product by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: Object })
  async updateProduct(@Param('id') id: string, @Body() updateData: any) {
    return this.productsService.updateProduct(id, updateData);
  }
}
