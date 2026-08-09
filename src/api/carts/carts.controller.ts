import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CartsService } from './carts.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Carts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/carts')
export class CartsController {
  constructor(private readonly cartsService: CartsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user cart' })
  getCart(@CurrentUser('sub') userId: string) {
    return this.cartsService.getCart(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add product item to cart' })
  addItem(
    @CurrentUser('sub') userId: string,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartsService.addItem(userId, dto.product_id, dto.quantity);
  }

  @Patch('items/:product_id')
  @ApiOperation({ summary: 'Update cart item quantity' })
  updateItem(
    @CurrentUser('sub') userId: string,
    @Param('product_id') productId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartsService.updateItemQuantity(userId, productId, dto.quantity);
  }

  @Delete('items/:product_id')
  @ApiOperation({ summary: 'Remove item from cart' })
  removeItem(
    @CurrentUser('sub') userId: string,
    @Param('product_id') productId: string,
  ) {
    return this.cartsService.removeItem(userId, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear entire cart' })
  clearCart(@CurrentUser('sub') userId: string) {
    return this.cartsService.clearCart(userId);
  }
}
